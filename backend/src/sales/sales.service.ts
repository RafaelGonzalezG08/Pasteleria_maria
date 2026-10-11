import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EstadoFactura, MetodoPago } from '../common/enums';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../invoices/invoices.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { parseFromDate, parseToDate } from '../common/date-range';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { DeleteSaleDto } from './dto/delete-sale.dto';

export interface SaleTotals {
  subtotal: number;
  impuestos: number;
  total: number;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

const DEFAULT_TAX_RATE = Number(process.env.DEFAULT_TAX_RATE ?? 0.18);

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly invoicesService: InvoicesService,
    private readonly catalogo: CatalogoService,
  ) {}

  /**
   * Toda venta que descuenta o devuelve stock de un producto del catalogo
   * puede sacar o volver a meter una pieza del sitio publico (que solo
   * muestra piezas con existencia). Nunca tumba la venta si falla: es el
   * mismo motivo que en ProductsService.
   */
  private async regenerarCatalogo(): Promise<void> {
    try {
      const resultado = await this.catalogo.generar();
      if (!resultado.ok) {
        this.logger.warn(`No se pudo actualizar el catalogo web: ${resultado.error}`);
      }
    } catch (error) {
      this.logger.warn(`No se pudo actualizar el catalogo web: ${error}`);
    }
  }

  /**
   * Calcula subtotal/impuestos/total. Expuesto tambien para pruebas unitarias.
   *
   * `descuentoPct` (0-100) se resta del bruto ANTES de sacar el impuesto: es
   * como se factura normalmente (el impuesto se calcula sobre lo que el
   * cliente de verdad paga, no sobre el precio de lista).
   */
  static calculateTotals(
    items: { cantidad: number; precioUnitario: number }[],
    tasaImpuesto: number,
    descuentoPct = 0,
  ): SaleTotals {
    const bruto = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
    const subtotal = redondear(bruto * (1 - descuentoPct / 100));
    const impuestos = redondear(subtotal * tasaImpuesto);
    const total = redondear(subtotal + impuestos);
    return { subtotal, impuestos, total };
  }

  async create(dto: CreateSaleDto, userId: string) {
    // Normaliza referencias "vacias". El carrito guardado en el navegador (o
    // una version vieja de la app) puede mandar `clientId` o `productId` como
    // cadena vacia en vez de omitirlos. Prisma trata "" como un id real y
    // `sale.create` se cae con un choque de llave foranea que el cajero ve
    // como "hace referencia a un registro que ya no existe". Aqui "" pasa a
    // undefined = "sin cliente / articulo manual".
    dto = {
      ...dto,
      clientId: dto.clientId || undefined,
      items: dto.items.map((i) => ({ ...i, productId: i.productId || undefined })),
    };

    if (dto.metodoPago === MetodoPago.CREDITO && !dto.clientId) {
      throw new BadRequestException('Una venta a credito requiere seleccionar un cliente.');
    }

    // El carrito del POS se guarda en el navegador (localStorage). Si mientras
    // tanto se borro el cliente o alguno de esos productos (limpieza de
    // duplicados, importacion de inventario, restauracion de un respaldo...),
    // los IDs guardados quedan apuntando a nada y `sale.create` reventaba con
    // un choque de llave foranea que llegaba como "error inesperado". Aqui se
    // revisa ANTES y se dice exactamente que quitar del carrito.
    await this.validarReferencias(dto);

    const tasaImpuesto = dto.tasaImpuesto ?? (await this.getTasaImpuestoDefault());
    const descuentoPct = dto.descuentoPct ?? 0;
    const totals = SalesService.calculateTotals(dto.items, tasaImpuesto, descuentoPct);
    const costByProductId = await this.getCostByProductId(dto.items);

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          fecha: new Date(),
          subtotal: totals.subtotal,
          impuestos: totals.impuestos,
          total: totals.total,
          descuentoPct,
          metodoPago: dto.metodoPago,
          userId,
          clientId: dto.clientId,
          webCodigo: dto.webCodigo,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              // Copiado del catalogo al momento de vender (nunca del cliente) para
              // que el margen reportado en Costos no cambie si luego se edita el
              // costo del producto.
              costoUnitario: item.productId ? (costByProductId.get(item.productId) ?? 0) : 0,
              total: Math.round(item.cantidad * item.precioUnitario * 100) / 100,
            })),
          },
        },
        include: { items: true },
      });

      // Descuenta stock de productos del catalogo (ignora items manuales, que
      // no tienen productId). El `where` con `stock >= cantidad` hace que el
      // descuento sea atomico; si no alcanza, updateMany afecta 0 filas y hay
      // que AVISAR: antes se ignoraba en silencio y la venta se registraba
      // igual, dejando el inventario desfasado sin que nadie se enterara.
      await this.descontarStock(tx, dto.items);

      if (dto.metodoPago === MetodoPago.CREDITO && dto.clientId) {
        await tx.clientDebt.create({
          data: {
            clientId: dto.clientId,
            saleId: created.id,
            amountTotal: totals.total,
            dueDate: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : undefined,
          },
        });
      }

      const numero = await this.generateInvoiceNumber(tx);
      await tx.invoice.create({
        data: {
          saleId: created.id,
          numero,
          estado: EstadoFactura.PENDIENTE,
        },
      });

      // Pedido por entregar: queda en el registro de Pedidos hasta que se
      // marque como entregado (ahi se borra y la factura pasa a ser el
      // registro de la venta). Ver orders.service.ts.
      if (dto.esPedido) {
        await tx.order.create({
          data: {
            saleId: created.id,
            fechaEntrega: dto.fechaEntrega ? parseFromDate(dto.fechaEntrega) : null,
          },
        });
      }

      return created;
    });

    await this.audit.log('Sale', sale.id, 'CREATE', userId, {
      total: totals.total,
      metodoPago: dto.metodoPago,
    });
    void this.regenerarCatalogo();

    if (dto.generarFactura !== false) {
      try {
        await this.invoicesService.generateForSale(sale.id);
      } catch (error) {
        // No tumbamos la venta si falla la generacion del PNG: la venta ya quedo
        // registrada y la factura puede regenerarse/reenviarse despues.
        this.logger.error(`Fallo al generar factura para venta ${sale.id}: ${error}`);
      }
    }

    return this.findOne(sale.id);
  }

  /**
   * Edita los items de una venta ya creada (correccion de un error de
   * facturacion: cantidad o precio mal digitado, etc.).
   *
   * Tambien permite corregir A QUIEN esta facturada (`dto.clientId`): el caso
   * tipico es que en el apuro de cobrar se eligio al cliente equivocado o no
   * se eligio ninguno, y la factura ya salio con el nombre errado.
   *
   * Requiere que quien llama sea ADMIN (verificado por el guard en el
   * controller) Y que vuelva a escribir SU PROPIA clave en `dto.adminPassword`
   * como confirmacion extra — aunque ya este loggeado, editar una factura ya
   * emitida es sensible (afecta reportes, inventario y posiblemente una
   * deuda de cliente), asi que no basta con tener la sesion abierta.
   */
  async update(id: string, dto: UpdateSaleDto, userId: string) {
    // Mismo saneo que en create(): productId "" -> undefined (articulo manual).
    dto = { ...dto, items: dto.items.map((i) => ({ ...i, productId: i.productId || undefined })) };

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const passwordOk = await bcrypt.compare(dto.adminPassword, user.passwordHash);
    if (!passwordOk) {
      throw new ForbiddenException('Clave de administrador incorrecta.');
    }

    const existing = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Venta no encontrada.');
    const existingDebt = await this.prisma.clientDebt.findFirst({ where: { saleId: id } });

    // Cliente de la factura. Si el dto no trae `clientId` se deja el actual
    // (asi las correcciones que solo tocan lineas siguen funcionando igual).
    const nuevoClientId = dto.clientId === undefined ? existing.clientId : dto.clientId || null;
    const cambiaCliente = nuevoClientId !== existing.clientId;
    if (cambiaCliente) {
      if (nuevoClientId) {
        const cliente = await this.prisma.client.findUnique({ where: { id: nuevoClientId } });
        if (!cliente) throw new NotFoundException('El cliente seleccionado ya no existe.');
      } else if (existing.metodoPago === MetodoPago.CREDITO) {
        // Sin cliente no hay a quien cobrarle: la deuda quedaria huerfana.
        throw new BadRequestException(
          'Una venta a credito tiene que quedar a nombre de un cliente: es quien debe el dinero. ' +
            'Elige otro cliente en vez de quitarlo.',
        );
      }
    }

    // Igual que al crear: si algun producto de las lineas corregidas ya no
    // existe, decirlo claro en vez de reventar con un error de base de datos.
    await this.validarReferencias({ items: dto.items });

    const tasaImpuesto = existing.subtotal.gt(0)
      ? Number(existing.impuestos) / Number(existing.subtotal)
      : await this.getTasaImpuestoDefault();
    // El descuento de la factura original se mantiene: corregir un item no
    // deberia hacer desaparecer un descuento que ya se le habia dado al cliente.
    const totals = SalesService.calculateTotals(
      dto.items,
      tasaImpuesto,
      Number(existing.descuentoPct),
    );
    const costByProductId = await this.getCostByProductId(dto.items);

    if (existingDebt && totals.total < Number(existingDebt.amountPaid)) {
      throw new BadRequestException(
        `No se puede bajar el total a RD$ ${totals.total.toFixed(2)}: el cliente ya abono RD$ ${Number(
          existingDebt.amountPaid,
        ).toFixed(2)} de esta cuenta. Revisa los abonos antes de corregir la factura.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Devuelve al inventario lo que esta venta habia descontado.
      for (const item of existing.items) {
        if (item.productId) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { stock: { increment: item.cantidad } },
          });
        }
      }

      await tx.saleItem.deleteMany({ where: { saleId: id } });

      await tx.sale.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          impuestos: totals.impuestos,
          total: totals.total,
          clientId: nuevoClientId,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              costoUnitario: item.productId ? (costByProductId.get(item.productId) ?? 0) : 0,
              total: Math.round(item.cantidad * item.precioUnitario * 100) / 100,
            })),
          },
        },
      });

      // Descuenta el inventario segun los items corregidos (misma validacion
      // que al crear: si no alcanza el stock, la correccion se rechaza entera
      // y la transaccion revierte la devolucion de arriba).
      await this.descontarStock(tx, dto.items);

      if (existingDebt) {
        await tx.clientDebt.update({
          where: { id: existingDebt.id },
          data: {
            amountTotal: totals.total,
            // La deuda tiene que seguir a la factura: si el cliente cambia y
            // la cuenta se queda con el anterior, en Cobros le seguiria
            // apareciendo el saldo a alguien que ya no aparece en la factura.
            // (nuevoClientId no puede ser null aqui: arriba se rechaza quitar
            // el cliente de una venta a credito, que es la unica que genera
            // deuda.)
            ...(nuevoClientId ? { clientId: nuevoClientId } : {}),
          },
        });
      }
    });

    await this.audit.log('Sale', id, 'UPDATE', userId, {
      accion: 'correccion-factura',
      totalAnterior: Number(existing.total),
      totalNuevo: totals.total,
      ...(cambiaCliente ? { clienteAnterior: existing.clientId, clienteNuevo: nuevoClientId } : {}),
    });
    void this.regenerarCatalogo();

    // Vuelve a generar el PNG/PDF de la factura para que refleje la correccion.
    try {
      await this.invoicesService.generateForSale(id);
    } catch (error) {
      this.logger.error(`Fallo al regenerar factura tras editar venta ${id}: ${error}`);
    }

    return this.findOne(id);
  }

  /**
   * Elimina una venta y su factura, devolviendo las piezas al inventario.
   *
   * Requiere ADMIN (guard en el controller) y ademas la clave del propio
   * admin, igual que corregir una factura: borrar una venta mueve reportes,
   * inventario y posiblemente una deuda de cliente.
   *
   * Lo que hay que borrar a mano (no cae por cascada):
   *  - `invoices` y `payments` tienen llave foranea hacia `sales` sin
   *    onDelete, asi que Postgres rechazaria el borrado.
   *  - `client_debts.sale_id` ni siquiera es una llave foranea (es una
   *    columna suelta), asi que la deuda quedaria apuntando a una venta que
   *    ya no existe — un cobro fantasma imposible de rastrear.
   * `sale_items` y `orders` si estan en cascada.
   */
  async remove(id: string, dto: DeleteSaleDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const passwordOk = await bcrypt.compare(dto.adminPassword, user.passwordHash);
    if (!passwordOk) {
      throw new ForbiddenException('Clave de administrador incorrecta.');
    }

    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true, invoice: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');

    const debt = await this.prisma.clientDebt.findFirst({ where: { saleId: id } });
    if (debt && Number(debt.amountPaid) > 0) {
      // Borrarla eliminaria el rastro de dinero que el cliente ya entrego.
      // Se avisa en vez de destruirlo en silencio.
      throw new BadRequestException(
        `No se puede eliminar esta factura: el cliente ya abono RD$ ${Number(debt.amountPaid).toFixed(2)} ` +
          `a esta cuenta. Borrarla haria desaparecer el registro de ese dinero. Corrige la factura en vez de eliminarla.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Devuelve al inventario lo que esta venta habia descontado.
      for (const item of sale.items) {
        if (item.productId) {
          await tx.product.updateMany({
            where: { id: item.productId },
            data: { stock: { increment: item.cantidad } },
          });
        }
      }

      await tx.payment.deleteMany({ where: { saleId: id } });
      if (debt) await tx.clientDebt.delete({ where: { id: debt.id } });
      await tx.invoice.deleteMany({ where: { saleId: id } });
      await tx.sale.delete({ where: { id } });
    });

    await this.audit.log('Sale', id, 'DELETE', userId, {
      numeroFactura: sale.invoice?.numero,
      total: Number(sale.total),
      piezasDevueltas: sale.items
        .filter((i) => i.productId)
        .map((i) => ({ productId: i.productId, cantidad: i.cantidad })),
    });
    void this.regenerarCatalogo();

    return { id, deleted: true, numeroFactura: sale.invoice?.numero ?? null };
  }

  findAll(params: { from?: string; to?: string; clientId?: string }) {
    const where: Prisma.SaleWhereInput = {};
    if (params.from || params.to) {
      // "hasta" incluye el dia completo (hasta las 23:59:59.999 local); antes
      // se tomaba como medianoche UTC y las ventas del propio dia elegido no
      // aparecian en el listado. Ver common/date-range.ts.
      where.fecha = {
        gte: params.from ? parseFromDate(params.from) : undefined,
        lte: params.to ? parseToDate(params.to) : undefined,
      };
    }
    if (params.clientId) where.clientId = params.clientId;

    return this.prisma.sale.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 200,
      include: {
        client: { select: { id: true, nombre: true, telefono: true } },
        invoice: true,
        items: true,
      },
    });
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        client: true,
        user: { select: { id: true, nombre: true } },
        items: true,
        invoice: true,
        payments: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    return sale;
  }

  /**
   * Descuenta el stock de los items que vienen del catalogo, fallando de
   * forma ruidosa si alguno no tiene existencias suficientes.
   *
   * El descuento va con `where: { stock: { gte: cantidad } }` para que la
   * verificacion y el descuento ocurran en la MISMA operacion atomica (si se
   * consultara el stock antes y se descontara despues, dos cajas vendiendo la
   * ultima pieza a la vez podrian pasar ambas la verificacion). Cuando
   * `updateMany` reporta 0 filas afectadas es justamente porque el stock no
   * alcanzaba, y ahi se lanza el error que antes faltaba.
   */
  private async descontarStock(
    tx: Prisma.TransactionClient,
    items: { productId?: string; cantidad: number; descripcion: string }[],
  ) {
    for (const item of items) {
      if (!item.productId) continue;

      const { count } = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.cantidad } },
        data: { stock: { decrement: item.cantidad } },
      });

      if (count === 0) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { nombre: true, stock: true },
        });
        const nombre = product?.nombre ?? item.descripcion;
        throw new BadRequestException(
          `No hay stock suficiente de "${nombre}": quedan ${product?.stock ?? 0} y se intentaron vender ${item.cantidad}.`,
        );
      }
    }
  }

  /**
   * Verifica que el cliente y los productos referidos por la venta todavia
   * existan. Lanza un 400 con un mensaje que dice que quitar, en vez de dejar
   * que la creacion se caiga con un error de base de datos.
   */
  private async validarReferencias(dto: {
    clientId?: string;
    items: { productId?: string; descripcion: string }[];
  }) {
    if (dto.clientId) {
      const cliente = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
        select: { id: true },
      });
      if (!cliente) {
        throw new BadRequestException(
          'El cliente seleccionado ya no existe (se pudo haber borrado). Busca al cliente otra vez o quitalo de la venta.',
        );
      }
    }

    const productIds = [
      ...new Set(dto.items.map((i) => i.productId).filter((id): id is string => Boolean(id))),
    ];
    if (productIds.length === 0) return;

    const existentes = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    const existentesSet = new Set(existentes.map((p) => p.id));
    const faltantes = dto.items
      .filter((i) => i.productId && !existentesSet.has(i.productId))
      .map((i) => i.descripcion);

    if (faltantes.length > 0) {
      const lista = [...new Set(faltantes)].map((n) => `"${n}"`).join(', ');
      throw new BadRequestException(
        `Ya no estan en el inventario: ${lista}. Quitalos del carrito y, si siguen a la venta, vuelve a agregarlos o ponlos como articulo manual.`,
      );
    }
  }

  /** Trae el costo actual del catalogo para los items que vienen de un producto (ignora items manuales). */
  private async getCostByProductId(items: { productId?: string }[]): Promise<Map<string, number>> {
    const productIds = [
      ...new Set(items.map((i) => i.productId).filter((id): id is string => Boolean(id))),
    ];
    if (productIds.length === 0) return new Map();
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, costoUnitario: true },
    });
    return new Map(products.map((p) => [p.id, Number(p.costoUnitario)]));
  }

  private async getTasaImpuestoDefault(): Promise<number> {
    const profile = await this.prisma.businessProfile.findFirst();
    return profile ? Number(profile.tasaImpuesto) : DEFAULT_TAX_RATE;
  }

  /**
   * Numero consecutivo de factura para el año en curso (FAC-2026-00007).
   *
   * Se toma del MAXIMO numero existente + 1, no de un `count()`: con count,
   * si alguna vez se borra una factura (o se restaura un respaldo mas viejo),
   * el conteo baja y se vuelve a emitir un numero ya usado — chocando con el
   * indice unico de `numero` y tumbando la venta.
   *
   * Sobre la concurrencia: la version con Postgres tomaba un advisory lock
   * (`pg_advisory_xact_lock`) para que dos cajeros cobrando a la vez no
   * leyeran el mismo maximo. SQLite no tiene esos locks, pero tampoco hacen
   * falta: la base es un archivo servido por un unico proceso backend, y
   * SQLite serializa las escrituras. El `await` de este metodo se resuelve
   * dentro de una transaccion, asi que dos ventas simultaneas no pueden
   * intercalar su lectura del maximo con la escritura de la otra. Si alguna
   * vez esto volviera a ser multi-proceso, habria que reintroducir un
   * bloqueo explicito aqui.
   */
  private async generateInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `FAC-${year}-`;

    // Se traen TODOS los numeros del año y se calcula el maximo A MANO (no con
    // `orderBy: numero desc`). Motivo: si el negocio trae datos de la version
    // vieja o de un respaldo, puede haber numeros con distinto relleno de ceros
    // ("FAC-2026-7" y "FAC-2026-00012" a la vez). El orden alfabetico pone
    // "FAC-2026-7" por encima de "FAC-2026-00012", asi que el "+1" salia 8 —
    // un numero ya usado — y la venta entera se caia con un choque del indice
    // unico ("Ocurrio un error inesperado en el servidor"). Comparando como
    // numeros eso no pasa. Ademas se guarda el conjunto de numeros ya usados
    // para saltar cualquier hueco ocupado.
    const existentes = await tx.invoice.findMany({
      where: { numero: { startsWith: prefix } },
      select: { numero: true },
    });

    const usados = new Set<number>();
    let max = 0;
    for (const { numero } of existentes) {
      const n = parseInt(numero.slice(prefix.length), 10);
      if (Number.isFinite(n)) {
        usados.add(n);
        if (n > max) max = n;
      }
    }

    let siguiente = max + 1;
    while (usados.has(siguiente)) siguiente += 1;
    return `${prefix}${String(siguiente).padStart(5, '0')}`;
  }
}
