import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../invoices/invoices.service';
import { StorageService } from '../invoices/storage.service';
import { SalesService } from '../sales/sales.service';
import { optimizeProductImage } from '../common/image.util';
import { ESTADOS_ENCARGO_ACTIVOS, EstadoEncargo, MetodoPago, TipoEntrega } from '../common/enums';
import { parseFromDate, parseToDate } from '../common/date-range';
import { redondearDinero } from '../common/unidades';
import {
  CambiarEstadoDto,
  CancelarEncargoDto,
  CreateEncargoDto,
  EntregarEncargoDto,
  PagoEncargoDto,
  UpdateEncargoDto,
} from './dto/encargo.dto';

/** Menos de un centavo de diferencia cuenta como saldado. */
const CENTAVO = 0.005;

export type UrgenciaEncargo = 'ATRASADO' | 'HOY' | 'PRONTO' | 'PROGRAMADO' | 'CERRADO';

const INCLUDE_LISTA = {
  client: { select: { id: true, nombre: true, telefono: true } },
  items: true,
} satisfies Prisma.EncargoInclude;

const INCLUDE_DETALLE = {
  client: true,
  items: { include: { product: { select: { id: true, nombre: true, stock: true } } } },
  pagos: { orderBy: { fecha: 'asc' }, include: { user: { select: { nombre: true } } } },
  user: { select: { nombre: true } },
  sale: { select: { id: true, invoice: { select: { numero: true, pngUrl: true } } } },
} satisfies Prisma.EncargoInclude;

@Injectable()
export class EncargosService {
  private readonly logger = new Logger(EncargosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sales: SalesService,
    private readonly invoices: InvoicesService,
    private readonly storage: StorageService,
  ) {}

  // ---------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------

  async findAll(params: {
    estado?: string;
    from?: string;
    to?: string;
    clientId?: string;
    q?: string;
  }) {
    const where: Prisma.EncargoWhereInput = {};
    if (params.estado === 'ACTIVOS') where.estado = { in: [...ESTADOS_ENCARGO_ACTIVOS] };
    else if (params.estado) where.estado = params.estado;
    if (params.from || params.to) {
      where.fechaEntrega = {
        gte: params.from ? parseFromDate(params.from) : undefined,
        lte: params.to ? parseToDate(params.to) : undefined,
      };
    }
    if (params.clientId) where.clientId = params.clientId;
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { codigo: { contains: q } },
        { client: { nombre: { contains: q } } },
        { client: { telefono: { contains: q } } },
      ];
    }

    const [encargos, dias] = await Promise.all([
      this.prisma.encargo.findMany({
        where,
        include: INCLUDE_LISTA,
        orderBy: [{ fechaEntrega: 'asc' }],
        take: 500,
      }),
      this.diasAlerta(),
    ]);
    return encargos.map((e) => this.presentar(e, dias));
  }

  async findOne(id: string) {
    const [encargo, dias] = await Promise.all([
      this.prisma.encargo.findUnique({ where: { id }, include: INCLUDE_DETALLE }),
      this.diasAlerta(),
    ]);
    if (!encargo) throw new NotFoundException('Encargo no encontrado.');
    return {
      ...this.presentar(encargo, dias),
      pagos: encargo.pagos.map((p) => ({ ...p, monto: Number(p.monto) })),
    };
  }

  /** Resumen para el Dashboard: cuantos hay por estado, atrasados y los que se entregan pronto. */
  async resumen() {
    const dias = await this.diasAlerta();
    const activos = await this.prisma.encargo.findMany({
      where: { estado: { in: [...ESTADOS_ENCARGO_ACTIVOS] } },
      include: INCLUDE_LISTA,
      orderBy: { fechaEntrega: 'asc' },
    });
    const lista = activos.map((e) => this.presentar(e, dias));
    return {
      total: lista.length,
      pendientes: lista.filter((e) => e.estado === EstadoEncargo.PENDIENTE).length,
      enProduccion: lista.filter((e) => e.estado === EstadoEncargo.EN_PRODUCCION).length,
      listos: lista.filter((e) => e.estado === EstadoEncargo.LISTO).length,
      atrasados: lista.filter((e) => e.urgencia === 'ATRASADO').length,
      paraHoy: lista.filter((e) => e.urgencia === 'HOY').length,
      diasAlerta: dias,
      saldoPorCobrar: redondearDinero(lista.reduce((s, e) => s + e.saldo, 0)),
      // Atrasados, de hoy y los de los proximos dias de alerta.
      proximos: lista.filter((e) => e.urgencia !== 'PROGRAMADO').slice(0, 10),
    };
  }

  // ---------------------------------------------------------------------
  // Alta y edicion
  // ---------------------------------------------------------------------

  async create(dto: CreateEncargoDto, userId: string) {
    await this.validar(dto);
    const totales = await this.calcularTotales(dto);
    if (dto.anticipo && dto.anticipo.monto > totales.total + CENTAVO) {
      throw new BadRequestException('El anticipo no puede ser mayor que el total del encargo.');
    }

    const encargo = await this.prisma.$transaction(async (tx) => {
      const codigo = await this.generarCodigo(tx);
      const creado = await tx.encargo.create({
        data: {
          codigo,
          clientId: dto.clientId,
          ...this.datosGenerales(dto),
          ...totales,
          abonado: dto.anticipo?.monto ?? 0,
          userId,
          items: { create: this.datosItems(dto) },
        },
      });
      if (dto.anticipo) {
        await tx.encargoPago.create({
          data: {
            encargoId: creado.id,
            monto: dto.anticipo.monto,
            metodo: dto.anticipo.metodo,
            nota: dto.anticipo.nota?.trim() || 'Anticipo',
            userId,
          },
        });
      }
      return creado;
    });

    await this.audit.log('Encargo', encargo.id, 'CREATE', userId, {
      codigo: encargo.codigo,
      total: totales.total,
      anticipo: dto.anticipo?.monto ?? 0,
    });
    return this.findOne(encargo.id);
  }

  async update(id: string, dto: UpdateEncargoDto, userId: string) {
    const actual = await this.encargoActivo(id);
    await this.validar(dto);
    const totales = await this.calcularTotales(dto);
    if (totales.total + CENTAVO < Number(actual.abonado)) {
      throw new BadRequestException(
        `El nuevo total (${totales.total.toFixed(2)}) quedaria por debajo de lo que el cliente ya abono ` +
          `(${Number(actual.abonado).toFixed(2)}).`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.encargoItem.deleteMany({ where: { encargoId: id } });
      await tx.encargo.update({
        where: { id },
        data: {
          clientId: dto.clientId,
          ...this.datosGenerales(dto),
          ...totales,
          items: { create: this.datosItems(dto) },
        },
      });
    });

    await this.audit.log('Encargo', id, 'UPDATE', userId, { total: totales.total });
    return this.findOne(id);
  }

  /** Avanza o retrocede entre pendiente, en produccion y listo. */
  async cambiarEstado(id: string, dto: CambiarEstadoDto, userId: string) {
    await this.encargoActivo(id);
    await this.prisma.encargo.update({ where: { id }, data: { estado: dto.estado } });
    await this.audit.log('Encargo', id, 'UPDATE', userId, { estado: dto.estado });
    return this.findOne(id);
  }

  async cancelar(id: string, dto: CancelarEncargoDto, userId: string) {
    await this.encargoActivo(id);
    await this.prisma.encargo.update({
      where: { id },
      data: { estado: EstadoEncargo.CANCELADO, motivoCancelacion: dto.motivo?.trim() || null },
    });
    await this.audit.log('Encargo', id, 'UPDATE', userId, {
      estado: 'CANCELADO',
      motivo: dto.motivo,
    });
    return this.findOne(id);
  }

  // ---------------------------------------------------------------------
  // Pagos
  // ---------------------------------------------------------------------

  async registrarPago(id: string, dto: PagoEncargoDto, userId: string) {
    const encargo = await this.encargoActivo(id);
    const saldo = Number(encargo.total) - Number(encargo.abonado);
    if (dto.monto > saldo + CENTAVO) {
      throw new BadRequestException(
        `El abono (${dto.monto.toFixed(2)}) es mayor que el saldo pendiente (${saldo.toFixed(2)}).`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.encargoPago.create({
        data: {
          encargoId: id,
          monto: dto.monto,
          metodo: dto.metodo,
          nota: dto.nota?.trim() || null,
          userId,
        },
      });
      await tx.encargo.update({ where: { id }, data: { abonado: { increment: dto.monto } } });
    });
    await this.audit.log('Encargo', id, 'UPDATE', userId, { abono: dto.monto, metodo: dto.metodo });
    return this.findOne(id);
  }

  /** Borra un abono registrado por error (solo mientras el encargo no se haya entregado). */
  async eliminarPago(pagoId: string, userId: string) {
    const pago = await this.prisma.encargoPago.findUnique({ where: { id: pagoId } });
    if (!pago) throw new NotFoundException('Pago no encontrado.');
    await this.encargoActivo(pago.encargoId);
    await this.prisma.$transaction(async (tx) => {
      await tx.encargoPago.delete({ where: { id: pagoId } });
      await tx.encargo.update({
        where: { id: pago.encargoId },
        data: { abonado: { decrement: Number(pago.monto) } },
      });
    });
    await this.audit.log('Encargo', pago.encargoId, 'UPDATE', userId, {
      pagoEliminado: Number(pago.monto),
    });
    return this.findOne(pago.encargoId);
  }

  // ---------------------------------------------------------------------
  // Entrega: el encargo se convierte en venta
  // ---------------------------------------------------------------------

  /**
   * Entrega el encargo: registra el pago final (si lo hay) y crea la venta
   * con su factura, igual que una venta del punto de venta. Lo que el
   * cliente ya pago va como anticipos del encargo; si se entrega con saldo
   * pendiente (y se autoriza), ese saldo pasa a Cobros como cuenta por cobrar.
   */
  async entregar(id: string, dto: EntregarEncargoDto, userId: string) {
    const encargo = await this.encargoActivo(id);
    const pagoFinal = dto.pagoFinal?.monto ?? 0;
    const saldoAntes = Number(encargo.total) - Number(encargo.abonado);
    if (pagoFinal > saldoAntes + CENTAVO) {
      throw new BadRequestException(
        `El pago (${pagoFinal.toFixed(2)}) es mayor que el saldo pendiente (${saldoAntes.toFixed(2)}).`,
      );
    }
    const saldoRestante = redondearDinero(Math.max(0, saldoAntes - pagoFinal));
    if (saldoRestante > CENTAVO && !dto.dejarSaldoACredito) {
      throw new BadRequestException(
        `Queda un saldo de ${saldoRestante.toFixed(2)}. Cobralo completo o marca "dejar el saldo a credito".`,
      );
    }

    const saleId = await this.prisma.$transaction(async (tx) => {
      if (dto.pagoFinal) {
        await tx.encargoPago.create({
          data: {
            encargoId: id,
            monto: dto.pagoFinal.monto,
            metodo: dto.pagoFinal.metodo,
            nota: dto.pagoFinal.nota?.trim() || 'Pago al entregar',
            userId,
          },
        });
      }

      const pagos = await tx.encargoPago.findMany({
        where: { encargoId: id },
        orderBy: { fecha: 'desc' },
      });
      const metodoPago =
        saldoRestante > CENTAVO
          ? MetodoPago.CREDITO
          : ((pagos[0]?.metodo as MetodoPago) ?? MetodoPago.EFECTIVO);

      const items = encargo.items.map((i) => ({
        productId: i.productId ?? undefined,
        descripcion: this.descripcionVenta(i),
        cantidad: i.cantidad,
        precioUnitario: Number(i.precioUnitario),
      }));
      if (Number(encargo.costoEnvio) > 0) {
        items.push({
          productId: undefined,
          descripcion: 'Envio a domicilio',
          cantidad: 1,
          precioUnitario: Number(encargo.costoEnvio),
        });
      }

      const venta = await this.sales.crearVentaDeEncargo(tx, {
        userId,
        clientId: encargo.clientId,
        metodoPago,
        items,
        subtotal: Number(encargo.subtotal),
        impuestos: Number(encargo.impuestos),
        total: Number(encargo.total),
        saldoACredito: saldoRestante > CENTAVO ? saldoRestante : 0,
        fechaVencimiento: dto.fechaVencimiento ? parseToDate(dto.fechaVencimiento) : undefined,
      });

      await tx.encargo.update({
        where: { id },
        data: {
          estado: EstadoEncargo.ENTREGADO,
          entregadoAt: new Date(),
          saleId: venta.id,
          abonado: { increment: pagoFinal },
        },
      });
      return venta.id;
    });

    await this.audit.log('Sale', saleId, 'CREATE', userId, { origen: 'encargo', encargoId: id });
    await this.audit.log('Encargo', id, 'UPDATE', userId, {
      estado: 'ENTREGADO',
      saleId,
      pagoFinal,
      saldoACredito: saldoRestante,
    });

    // La factura se dibuja en segundo plano: la entrega ya quedo registrada y
    // no tiene por que esperar al render (si falla, se regenera desde Ventas).
    void this.invoices.generateForSale(saleId).catch((error) => {
      this.logger.error(`No se pudo generar la factura del encargo ${encargo.codigo}: ${error}`);
    });
    return this.findOne(id);
  }

  /** Sube la foto de referencia de un pastel; devuelve la URL para guardarla en el item. */
  async subirFotoReferencia(buffer: Buffer, mimetype: string) {
    const optimizada = await optimizeProductImage(buffer, mimetype);
    const url = await this.storage.upload(
      optimizada.buffer,
      `encargos/ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${optimizada.ext}`,
    );
    return { url };
  }

  // ---------------------------------------------------------------------

  private async encargoActivo(id: string) {
    const encargo = await this.prisma.encargo.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!encargo) throw new NotFoundException('Encargo no encontrado.');
    if (!(ESTADOS_ENCARGO_ACTIVOS as readonly string[]).includes(encargo.estado)) {
      throw new BadRequestException(
        encargo.estado === EstadoEncargo.ENTREGADO
          ? 'Este encargo ya se entrego; los cambios se hacen sobre su venta en Ventas.'
          : 'Este encargo esta cancelado.',
      );
    }
    return encargo;
  }

  private async validar(dto: CreateEncargoDto) {
    const cliente = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!cliente) throw new NotFoundException('El cliente elegido ya no existe.');
    if (
      dto.tipoEntrega === TipoEntrega.DOMICILIO &&
      !dto.direccionEntrega?.trim() &&
      !cliente.direccion
    ) {
      throw new BadRequestException(
        'Indica la direccion de entrega (el cliente no tiene una guardada).',
      );
    }
    const ids = [
      ...new Set(dto.items.map((i) => i.productId).filter((x): x is string => Boolean(x))),
    ];
    if (ids.length > 0) {
      const existentes = await this.prisma.product.count({ where: { id: { in: ids } } });
      if (existentes !== ids.length) {
        throw new BadRequestException(
          'Uno de los productos del encargo ya no existe. Quitalo y vuelve a agregarlo.',
        );
      }
    }
    for (const i of dto.items) {
      if (
        i.fotoReferenciaUrl &&
        !/^\/uploads\/encargos\//.test(i.fotoReferenciaUrl) &&
        !/^https?:\/\//.test(i.fotoReferenciaUrl)
      ) {
        throw new BadRequestException('La foto de referencia no es valida.');
      }
    }
  }

  private async calcularTotales(dto: CreateEncargoDto) {
    const profile = await this.prisma.businessProfile.findFirst();
    const tasaImpuesto = profile ? Number(profile.tasaImpuesto) : 0.18;
    const costoEnvio = dto.tipoEntrega === TipoEntrega.DOMICILIO ? (dto.costoEnvio ?? 0) : 0;
    const lineas = [
      ...dto.items.map((i) => ({ cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
      ...(costoEnvio > 0 ? [{ cantidad: 1, precioUnitario: costoEnvio }] : []),
    ];
    const { subtotal, impuestos, total } = SalesService.calculateTotals(lineas, tasaImpuesto);
    return { subtotal, impuestos, total, tasaImpuesto, costoEnvio };
  }

  private datosGenerales(dto: CreateEncargoDto) {
    return {
      fechaEntrega: new Date(dto.fechaEntrega),
      tipoEntrega: dto.tipoEntrega,
      direccionEntrega:
        dto.tipoEntrega === TipoEntrega.DOMICILIO ? dto.direccionEntrega?.trim() || null : null,
      notas: dto.notas?.trim() || null,
    };
  }

  private datosItems(dto: CreateEncargoDto) {
    const limpio = (v?: string) => v?.trim() || null;
    return dto.items.map((i) => ({
      productId: i.productId || null,
      descripcion: i.descripcion.trim(),
      cantidad: i.cantidad,
      precioUnitario: i.precioUnitario,
      total: redondearDinero(i.cantidad * i.precioUnitario),
      tamano: limpio(i.tamano),
      sabor: limpio(i.sabor),
      relleno: limpio(i.relleno),
      decoracion: limpio(i.decoracion),
      mensaje: limpio(i.mensaje),
      fotoReferenciaUrl: limpio(i.fotoReferenciaUrl),
    }));
  }

  /** "Pastel de chocolate (10", relleno dulce de leche)" para la linea de la factura. */
  private descripcionVenta(i: {
    descripcion: string;
    tamano: string | null;
    sabor: string | null;
    relleno: string | null;
  }) {
    const detalles = [i.tamano, i.sabor, i.relleno && `relleno ${i.relleno}`].filter(Boolean);
    return detalles.length > 0 ? `${i.descripcion} (${detalles.join(', ')})` : i.descripcion;
  }

  /** ENC-2026-00001: maximo del año + 1 (mismo criterio que el numero de factura). */
  private async generarCodigo(tx: Prisma.TransactionClient): Promise<string> {
    const prefijo = `ENC-${new Date().getFullYear()}-`;
    const existentes = await tx.encargo.findMany({
      where: { codigo: { startsWith: prefijo } },
      select: { codigo: true },
    });
    let max = 0;
    for (const { codigo } of existentes) {
      const n = parseInt(codigo.slice(prefijo.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return `${prefijo}${String(max + 1).padStart(5, '0')}`;
  }

  private async diasAlerta(): Promise<number> {
    const profile = await this.prisma.businessProfile.findFirst();
    return profile?.diasAlertaEncargos ?? 2;
  }

  /**
   * Agrega numeros (no Decimal), saldo y urgencia. La urgencia la calcula el
   * backend para no depender del reloj ni de la zona horaria del navegador.
   */
  private presentar<
    T extends {
      estado: string;
      fechaEntrega: Date;
      total: Prisma.Decimal;
      abonado: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      impuestos: Prisma.Decimal;
      costoEnvio: Prisma.Decimal;
      tasaImpuesto: Prisma.Decimal;
      items: { precioUnitario: Prisma.Decimal; total: Prisma.Decimal }[];
    },
  >(e: T, diasAlerta: number) {
    const total = Number(e.total);
    const abonado = Number(e.abonado);
    return {
      ...e,
      subtotal: Number(e.subtotal),
      impuestos: Number(e.impuestos),
      costoEnvio: Number(e.costoEnvio),
      tasaImpuesto: Number(e.tasaImpuesto),
      total,
      abonado,
      saldo: redondearDinero(Math.max(0, total - abonado)),
      items: e.items.map((i) => ({
        ...i,
        precioUnitario: Number(i.precioUnitario),
        total: Number(i.total),
      })),
      urgencia: this.urgencia(e.estado, e.fechaEntrega, diasAlerta),
    };
  }

  private urgencia(estado: string, fechaEntrega: Date, diasAlerta: number): UrgenciaEncargo {
    if (!(ESTADOS_ENCARGO_ACTIVOS as readonly string[]).includes(estado)) return 'CERRADO';
    const ahora = new Date();
    if (fechaEntrega < ahora) return 'ATRASADO';
    const finDeHoy = new Date();
    finDeHoy.setHours(23, 59, 59, 999);
    if (fechaEntrega <= finDeHoy) return 'HOY';
    const limite = new Date(finDeHoy);
    limite.setDate(limite.getDate() + diasAlerta);
    return fechaEntrega <= limite ? 'PRONTO' : 'PROGRAMADO';
  }
}
