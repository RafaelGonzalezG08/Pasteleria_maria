import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TipoMovimiento } from '../common/enums';
import { parseToDate } from '../common/date-range';
import { convertir, redondearCantidad, redondearDinero, UNIDADES } from '../common/unidades';
import { CreateInsumoConStockDto, MovimientoInsumoDto, UpdateInsumoDto } from './dto/insumo.dto';

/** Diferencia por debajo de la cual dos cantidades se consideran iguales (errores de coma flotante). */
const EPS = 1e-9;

/** Datos que acompañan a un movimiento para poder rastrearlo despues. */
export interface ReferenciaMovimiento {
  tipo: TipoMovimiento;
  motivo?: string | null;
  userId?: string | null;
  produccionId?: string;
  compraId?: string;
}

@Injectable()
export class InsumosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------

  async findAll(incluirInactivos = false) {
    const profile = await this.prisma.businessProfile.findFirst();
    const diasVencimiento = profile?.diasAlertaVencimiento ?? 7;
    const limite = this.limiteVencimiento(diasVencimiento);

    const insumos = await this.prisma.insumo.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        lotes: {
          where: { cantidadRestante: { gt: 0 }, fechaVencimiento: { not: null } },
          orderBy: { fechaVencimiento: 'asc' },
          take: 1,
          select: { fechaVencimiento: true },
        },
      },
    });

    return insumos.map(({ lotes, ...i }) => {
      const proximoVencimiento = lotes[0]?.fechaVencimiento ?? null;
      return {
        ...this.aNumeros(i),
        proximoVencimiento,
        bajoMinimo: Number(i.stockMinimo) > 0 && Number(i.stockActual) <= Number(i.stockMinimo),
        porVencer: Boolean(proximoVencimiento && proximoVencimiento <= limite),
        vencido: Boolean(proximoVencimiento && proximoVencimiento < new Date()),
      };
    });
  }

  async findOne(id: string) {
    const insumo = await this.prisma.insumo.findUnique({
      where: { id },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        lotes: {
          where: { cantidadRestante: { gt: 0 } },
          orderBy: [{ fechaVencimiento: { sort: 'asc', nulls: 'last' } }, { fechaEntrada: 'asc' }],
        },
        movimientos: {
          orderBy: { fecha: 'desc' },
          take: 200,
          include: { user: { select: { nombre: true } } },
        },
        ingredientes: { select: { receta: { select: { id: true, nombre: true } } } },
      },
    });
    if (!insumo) throw new NotFoundException('Insumo no encontrado.');

    const { lotes, movimientos, ingredientes, ...resto } = insumo;
    return {
      ...this.aNumeros(resto),
      lotes: lotes.map((l) => ({
        ...l,
        cantidadInicial: Number(l.cantidadInicial),
        cantidadRestante: Number(l.cantidadRestante),
        costoUnitario: Number(l.costoUnitario),
      })),
      movimientos: movimientos.map((m) => ({
        ...m,
        cantidad: Number(m.cantidad),
        costoUnitario: Number(m.costoUnitario),
        stockResultante: Number(m.stockResultante),
      })),
      usadoEnRecetas: [...new Map(ingredientes.map((x) => [x.receta.id, x.receta])).values()],
    };
  }

  /** Historial de movimientos de todos los insumos (para Inventario > Historial y el reporte de mermas). */
  async movimientos(params: { from?: Date; to?: Date; tipo?: string; insumoId?: string }) {
    const movimientos = await this.prisma.movimientoInsumo.findMany({
      where: {
        fecha: { gte: params.from, lte: params.to },
        ...(params.tipo ? { tipo: params.tipo } : {}),
        ...(params.insumoId ? { insumoId: params.insumoId } : {}),
      },
      orderBy: { fecha: 'desc' },
      take: 500,
      include: {
        insumo: { select: { id: true, nombre: true, unidad: true } },
        user: { select: { nombre: true } },
      },
    });
    return movimientos.map((m) => ({
      ...m,
      cantidad: Number(m.cantidad),
      costoUnitario: Number(m.costoUnitario),
      stockResultante: Number(m.stockResultante),
    }));
  }

  /** Insumos bajo el minimo, lotes por vencer y lotes ya vencidos. Lo usan Dashboard y Reportes. */
  async alertas() {
    const profile = await this.prisma.businessProfile.findFirst();
    const limite = this.limiteVencimiento(profile?.diasAlertaVencimiento ?? 7);
    const ahora = new Date();

    const [insumos, lotes] = await Promise.all([
      this.prisma.insumo.findMany({
        where: { activo: true, stockMinimo: { gt: 0 } },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.loteInsumo.findMany({
        where: {
          cantidadRestante: { gt: 0 },
          fechaVencimiento: { lte: limite },
          insumo: { activo: true },
        },
        orderBy: { fechaVencimiento: 'asc' },
        include: { insumo: { select: { id: true, nombre: true, unidad: true } } },
      }),
    ]);

    const bajos = insumos
      .filter((i) => Number(i.stockActual) <= Number(i.stockMinimo))
      .map((i) => ({
        id: i.id,
        nombre: i.nombre,
        unidad: i.unidad,
        stockActual: Number(i.stockActual),
        stockMinimo: Number(i.stockMinimo),
        faltante: redondearCantidad(Number(i.stockMinimo) - Number(i.stockActual)),
      }));

    const porVencer = lotes.map((l) => ({
      loteId: l.id,
      insumoId: l.insumo.id,
      nombre: l.insumo.nombre,
      unidad: l.insumo.unidad,
      cantidad: Number(l.cantidadRestante),
      fechaVencimiento: l.fechaVencimiento,
      vencido: (l.fechaVencimiento as Date) < ahora,
    }));

    return { bajos, porVencer };
  }

  // ---------------------------------------------------------------------
  // Altas y cambios
  // ---------------------------------------------------------------------

  async create(dto: CreateInsumoConStockDto, userId?: string) {
    const nombre = dto.nombre.trim();
    await this.verificarNombreLibre(nombre);

    const { stockInicial, fechaVencimiento, ...datos } = dto;
    const insumo = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.insumo.create({
        data: {
          ...datos,
          nombre,
          proveedorId: datos.proveedorId || null,
          costoUnitario: datos.costoUnitario ?? 0,
          stockMinimo: datos.stockMinimo ?? 0,
        },
      });
      if (stockInicial && stockInicial > 0) {
        await this.entrada(
          tx,
          creado.id,
          stockInicial,
          creado.costoUnitario ? Number(creado.costoUnitario) : 0,
          {
            fechaVencimiento: fechaVencimiento ? parseToDate(fechaVencimiento) : null,
            ref: { tipo: TipoMovimiento.ENTRADA, motivo: 'Stock inicial', userId },
            actualizarCosto: false,
          },
        );
      }
      return creado;
    });

    await this.audit.log('Insumo', insumo.id, 'CREATE', userId, { ...dto, nombre });
    return this.findOne(insumo.id);
  }

  async update(id: string, dto: UpdateInsumoDto, userId?: string) {
    const actual = await this.prisma.insumo.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Insumo no encontrado.');

    const datos: Prisma.InsumoUpdateInput = {};
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (nombre.toLowerCase() !== actual.nombre.toLowerCase())
        await this.verificarNombreLibre(nombre, id);
      datos.nombre = nombre;
    }
    if (dto.unidad !== undefined && dto.unidad !== actual.unidad) {
      // Cambiar la unidad de un insumo con historial dejaria el stock, los
      // lotes y el costo expresados en la unidad vieja (2 "kg" pasarian a ser
      // 2 "g"). Solo se permite mientras el insumo este en cero y sin uso.
      const enUso = await this.prisma.movimientoInsumo.count({ where: { insumoId: id } });
      if (enUso > 0 || Number(actual.stockActual) !== 0) {
        throw new BadRequestException(
          'No se puede cambiar la unidad de un insumo que ya tiene movimientos. ' +
            'Crea un insumo nuevo con la unidad correcta.',
        );
      }
      datos.unidad = dto.unidad;
    }
    if (dto.tipo !== undefined) datos.tipo = dto.tipo;
    if (dto.stockMinimo !== undefined) datos.stockMinimo = dto.stockMinimo;
    if (dto.costoUnitario !== undefined) datos.costoUnitario = dto.costoUnitario;
    if (dto.notas !== undefined) datos.notas = dto.notas || null;
    if (dto.activo !== undefined) datos.activo = dto.activo;
    if (dto.proveedorId !== undefined) {
      datos.proveedor = dto.proveedorId
        ? { connect: { id: dto.proveedorId } }
        : { disconnect: true };
    }

    await this.prisma.insumo.update({ where: { id }, data: datos });
    await this.audit.log('Insumo', id, 'UPDATE', userId, dto as Record<string, unknown>);
    return this.findOne(id);
  }

  /**
   * Borra el insumo si nunca se uso; si ya tiene historial o esta en una
   * receta, solo lo desactiva (borrarlo romperia el historial y las recetas).
   */
  async remove(id: string, userId?: string) {
    const insumo = await this.prisma.insumo.findUnique({ where: { id } });
    if (!insumo) throw new NotFoundException('Insumo no encontrado.');

    const [movimientos, recetas, compras] = await Promise.all([
      this.prisma.movimientoInsumo.count({ where: { insumoId: id } }),
      this.prisma.recetaIngrediente.count({ where: { insumoId: id } }),
      this.prisma.compraItem.count({ where: { insumoId: id } }),
    ]);

    if (movimientos + recetas + compras === 0) {
      await this.prisma.insumo.delete({ where: { id } });
      await this.audit.log('Insumo', id, 'DELETE', userId, { nombre: insumo.nombre });
      return { id, eliminado: true };
    }

    if (recetas > 0) {
      throw new BadRequestException(
        `"${insumo.nombre}" se usa en ${recetas} linea(s) de receta. Quitalo de esas recetas antes de eliminarlo.`,
      );
    }
    await this.prisma.insumo.update({ where: { id }, data: { activo: false } });
    await this.audit.log('Insumo', id, 'UPDATE', userId, { activo: false });
    return { id, eliminado: false, desactivado: true };
  }

  /** Entrada, salida, merma o ajuste manual desde la pantalla de Inventario. */
  async registrarMovimiento(id: string, dto: MovimientoInsumoDto, userId?: string) {
    const insumo = await this.prisma.insumo.findUnique({ where: { id } });
    if (!insumo) throw new NotFoundException('Insumo no encontrado.');

    const cantidad = redondearCantidad(
      convertir(dto.cantidad, dto.unidad ?? insumo.unidad, insumo.unidad, insumo.nombre),
    );
    const motivo = dto.motivo?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      if (dto.tipo === 'ENTRADA') {
        if (cantidad <= 0) throw new BadRequestException('La cantidad debe ser mayor a cero.');
        // El costo se da por unidad de la cantidad escrita; se pasa a la unidad del insumo.
        const costo =
          dto.costoUnitario !== undefined
            ? dto.costoUnitario / convertir(1, dto.unidad ?? insumo.unidad, insumo.unidad)
            : Number(insumo.costoUnitario);
        await this.entrada(tx, id, cantidad, costo, {
          fechaVencimiento: dto.fechaVencimiento ? parseToDate(dto.fechaVencimiento) : null,
          ref: { tipo: TipoMovimiento.ENTRADA, motivo, userId },
          actualizarCosto: dto.costoUnitario !== undefined,
        });
        return;
      }

      if (dto.tipo === 'SALIDA' || dto.tipo === 'MERMA') {
        if (cantidad <= 0) throw new BadRequestException('La cantidad debe ser mayor a cero.');
        await this.consumir(tx, id, cantidad, { tipo: dto.tipo, motivo, userId });
        return;
      }

      // AJUSTE: la cantidad es el conteo real.
      const diferencia = redondearCantidad(cantidad - Number(insumo.stockActual));
      if (Math.abs(diferencia) < EPS) {
        throw new BadRequestException(
          'El conteo coincide con el stock actual: no hay nada que ajustar.',
        );
      }
      const ref = { tipo: TipoMovimiento.AJUSTE, motivo: motivo ?? 'Conteo fisico', userId };
      if (diferencia > 0) {
        await this.entrada(tx, id, diferencia, Number(insumo.costoUnitario), {
          fechaVencimiento: null,
          ref,
          actualizarCosto: false,
        });
      } else {
        await this.consumir(tx, id, -diferencia, ref);
      }
    });

    await this.audit.log('Insumo', id, 'UPDATE', userId, {
      movimiento: dto.tipo,
      cantidad,
      motivo,
    });
    return this.findOne(id);
  }

  // ---------------------------------------------------------------------
  // Operaciones de inventario (las usan tambien Compras y Produccion, dentro
  // de su propia transaccion)
  // ---------------------------------------------------------------------

  /**
   * Suma `cantidad` (en la unidad del insumo) como un lote nuevo. Con
   * `actualizarCosto`, el costo del insumo pasa a ser el promedio ponderado
   * entre lo que habia y lo que entra: asi una compra mas cara sube el costo
   * de las recetas en proporcion a cuanto se compro, sin saltos bruscos.
   */
  async entrada(
    tx: Prisma.TransactionClient,
    insumoId: string,
    cantidad: number,
    costoUnitario: number,
    opciones: {
      fechaVencimiento: Date | null;
      ref: ReferenciaMovimiento;
      actualizarCosto: boolean;
      compraItemId?: string;
    },
  ) {
    const insumo = await tx.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    const stockAntes = Number(insumo.stockActual);
    const stockDespues = redondearCantidad(stockAntes + cantidad);

    let nuevoCosto = Number(insumo.costoUnitario);
    if (opciones.actualizarCosto) {
      nuevoCosto =
        stockAntes > EPS
          ? (stockAntes * Number(insumo.costoUnitario) + cantidad * costoUnitario) / stockDespues
          : costoUnitario;
    }

    await tx.loteInsumo.create({
      data: {
        insumoId,
        cantidadInicial: cantidad,
        cantidadRestante: cantidad,
        costoUnitario,
        fechaVencimiento: opciones.fechaVencimiento,
        compraItemId: opciones.compraItemId,
      },
    });
    await tx.insumo.update({
      where: { id: insumoId },
      data: { stockActual: stockDespues, costoUnitario: Math.round(nuevoCosto * 10000) / 10000 },
    });
    await tx.movimientoInsumo.create({
      data: {
        insumoId,
        tipo: opciones.ref.tipo,
        cantidad,
        costoUnitario,
        stockResultante: stockDespues,
        motivo: opciones.ref.motivo ?? null,
        userId: opciones.ref.userId ?? null,
        produccionId: opciones.ref.produccionId,
        compraId: opciones.ref.compraId,
      },
    });
  }

  /**
   * Descuenta `cantidad` (en la unidad del insumo) gastando primero el lote
   * que vence antes y, entre los que no vencen, el mas viejo. Falla con un
   * mensaje claro si no alcanza. Devuelve el costo unitario usado (el costo
   * promedio actual del insumo, que es el que usan las recetas).
   */
  async consumir(
    tx: Prisma.TransactionClient,
    insumoId: string,
    cantidad: number,
    ref: ReferenciaMovimiento,
  ): Promise<number> {
    const insumo = await tx.insumo.findUniqueOrThrow({ where: { id: insumoId } });
    const stockAntes = Number(insumo.stockActual);
    if (cantidad > stockAntes + EPS) {
      throw new BadRequestException(
        `No hay suficiente "${insumo.nombre}": hay ${redondearCantidad(stockAntes)} ${insumo.unidad} ` +
          `y se necesitan ${redondearCantidad(cantidad)} ${insumo.unidad}.`,
      );
    }

    const lotes = await tx.loteInsumo.findMany({
      where: { insumoId, cantidadRestante: { gt: 0 } },
      orderBy: [{ fechaVencimiento: { sort: 'asc', nulls: 'last' } }, { fechaEntrada: 'asc' }],
    });

    let pendiente = cantidad;
    for (const lote of lotes) {
      if (pendiente <= EPS) break;
      const disponible = Number(lote.cantidadRestante);
      const usa = Math.min(disponible, pendiente);
      await tx.loteInsumo.update({
        where: { id: lote.id },
        data: { cantidadRestante: redondearCantidad(disponible - usa) },
      });
      pendiente -= usa;
    }

    const stockDespues = Math.max(0, redondearCantidad(stockAntes - cantidad));
    const costo = Number(insumo.costoUnitario);
    await tx.insumo.update({ where: { id: insumoId }, data: { stockActual: stockDespues } });
    await tx.movimientoInsumo.create({
      data: {
        insumoId,
        tipo: ref.tipo,
        cantidad: -cantidad,
        costoUnitario: costo,
        stockResultante: stockDespues,
        motivo: ref.motivo ?? null,
        userId: ref.userId ?? null,
        produccionId: ref.produccionId,
        compraId: ref.compraId,
      },
    });
    return costo;
  }

  // ---------------------------------------------------------------------

  private async verificarNombreLibre(nombre: string, exceptoId?: string) {
    const todos = await this.prisma.insumo.findMany({ select: { id: true, nombre: true } });
    const choca = todos.find(
      (i) => i.id !== exceptoId && i.nombre.toLowerCase() === nombre.toLowerCase(),
    );
    if (choca) throw new ConflictException(`Ya existe un insumo llamado "${choca.nombre}".`);
  }

  private limiteVencimiento(dias: number): Date {
    const limite = new Date();
    limite.setHours(23, 59, 59, 999);
    limite.setDate(limite.getDate() + dias);
    return limite;
  }

  private aNumeros<
    T extends {
      stockActual: Prisma.Decimal;
      stockMinimo: Prisma.Decimal;
      costoUnitario: Prisma.Decimal;
      unidad: string;
    },
  >(i: T) {
    return {
      ...i,
      stockActual: Number(i.stockActual),
      stockMinimo: Number(i.stockMinimo),
      costoUnitario: Number(i.costoUnitario),
      valorStock: redondearDinero(Number(i.stockActual) * Number(i.costoUnitario)),
      unidadNombre: UNIDADES[i.unidad]?.nombre ?? i.unidad,
    };
  }
}
