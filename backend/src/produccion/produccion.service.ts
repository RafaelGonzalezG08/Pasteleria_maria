import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InsumosService } from '../insumos/insumos.service';
import { RecetasService } from '../recetas/recetas.service';
import { ESTADOS_ENCARGO_ACTIVOS, TipoMovimiento } from '../common/enums';
import { localDateKey, parseFromDate, parseToDate } from '../common/date-range';
import { redondearCantidad, redondearDinero } from '../common/unidades';
import { RegistrarProduccionDto } from './dto/produccion.dto';

const EPS = 1e-9;

@Injectable()
export class ProduccionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly insumos: InsumosService,
    private readonly recetas: RecetasService,
  ) {}

  async findAll(params: { from?: string; to?: string }) {
    const producciones = await this.prisma.produccion.findMany({
      where: {
        fecha: {
          gte: params.from ? parseFromDate(params.from) : undefined,
          lte: params.to ? parseToDate(params.to) : undefined,
        },
      },
      orderBy: { fecha: 'desc' },
      take: 300,
      include: {
        receta: { select: { id: true, nombre: true, unidadRendimiento: true } },
        producto: { select: { id: true, nombre: true } },
        user: { select: { nombre: true } },
      },
    });
    return producciones.map((p) => ({
      ...p,
      tandas: Number(p.tandas),
      costoTotal: Number(p.costoTotal),
    }));
  }

  async findOne(id: string) {
    const p = await this.prisma.produccion.findUnique({
      where: { id },
      include: {
        receta: { select: { id: true, nombre: true, rendimiento: true, unidadRendimiento: true } },
        producto: { select: { id: true, nombre: true } },
        user: { select: { nombre: true } },
        consumos: { include: { insumo: { select: { id: true, nombre: true, unidad: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Produccion no encontrada.');
    return {
      ...p,
      tandas: Number(p.tandas),
      costoTotal: Number(p.costoTotal),
      receta: { ...p.receta, rendimiento: Number(p.receta.rendimiento) },
      consumos: p.consumos.map((c) => ({
        ...c,
        cantidad: Number(c.cantidad),
        costoUnitario: Number(c.costoUnitario),
        costo: redondearDinero(Number(c.cantidad) * Number(c.costoUnitario)),
      })),
    };
  }

  /**
   * Registra lo que se produjo: descuenta del inventario todos los insumos
   * de la receta (abriendo las subrecetas: el relleno tambien gasta harina y
   * azucar) y suma las unidades al producto terminado. Todo en una sola
   * transaccion: si falta un insumo no se descuenta nada.
   */
  async registrar(dto: RegistrarProduccionDto, userId?: string) {
    const produccion = await this.prisma.$transaction(async (tx) => {
      const receta = await tx.receta.findUnique({
        where: { id: dto.recetaId },
        include: { producto: true },
      });
      if (!receta) throw new NotFoundException('Receta no encontrada.');
      if (!receta.activo) throw new BadRequestException('Esa receta esta desactivada.');

      const recetario = await this.recetas.cargarRecetario(tx);
      const necesarios = recetario.explotar(receta.id, dto.tandas);

      // Se revisa TODO antes de descontar, para decir de una vez todo lo que
      // falta en vez de un insumo a la vez.
      const faltantes: string[] = [];
      for (const [insumoId, cantidad] of necesarios) {
        const insumo = recetario.insumos.get(insumoId)!;
        if (cantidad > insumo.stockActual + EPS) {
          faltantes.push(
            `${insumo.nombre}: faltan ${redondearCantidad(cantidad - insumo.stockActual)} ${insumo.unidad}`,
          );
        }
      }
      if (faltantes.length > 0) {
        throw new BadRequestException(
          `No hay suficiente inventario para esta produccion. ${faltantes.join('; ')}.`,
        );
      }

      let unidades = 0;
      if (receta.productoId) {
        const porTanda = this.recetas.unidadesPorTanda(
          Number(receta.rendimiento),
          receta.unidadRendimiento,
        );
        unidades = Math.floor((porTanda ?? 0) * dto.tandas + 1e-6);
        if (unidades < 1) {
          throw new BadRequestException(
            'Con esas tandas no sale ni una unidad completa del producto. Aumenta las tandas.',
          );
        }
      }

      const creada = await tx.produccion.create({
        data: {
          fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
          recetaId: receta.id,
          tandas: dto.tandas,
          unidadesProducidas: unidades,
          productoId: receta.productoId,
          notas: dto.notas?.trim() || null,
          userId,
        },
      });

      let costoTotal = 0;
      for (const [insumoId, cantidad] of necesarios) {
        const cant = redondearCantidad(cantidad);
        if (cant <= 0) continue;
        const costo = await this.insumos.consumir(tx, insumoId, cant, {
          tipo: TipoMovimiento.PRODUCCION,
          motivo: `Produccion: ${receta.nombre}`,
          userId,
          produccionId: creada.id,
        });
        costoTotal += cant * costo;
        await tx.produccionConsumo.create({
          data: { produccionId: creada.id, insumoId, cantidad: cant, costoUnitario: costo },
        });
      }

      await tx.produccion.update({
        where: { id: creada.id },
        data: { costoTotal: redondearDinero(costoTotal) },
      });

      if (receta.productoId && unidades > 0) {
        await tx.product.update({
          where: { id: receta.productoId },
          data: {
            stock: { increment: unidades },
            // El costo real de esta tanda pasa a ser el costo del producto: es
            // el que se copia en cada venta para calcular la ganancia.
            costoUnitario: redondearDinero(costoTotal / unidades),
          },
        });
      }

      return creada;
    });

    await this.audit.log('Produccion', produccion.id, 'CREATE', userId, {
      recetaId: dto.recetaId,
      tandas: dto.tandas,
    });
    return this.findOne(produccion.id);
  }

  /**
   * Deshace una produccion registrada por error: devuelve los insumos al
   * inventario y quita las unidades del producto. Si parte de lo producido
   * ya se vendio, no se puede (habria stock negativo).
   */
  async anular(id: string, userId?: string) {
    const p = await this.prisma.produccion.findUnique({
      where: { id },
      include: { consumos: true, receta: { select: { nombre: true } } },
    });
    if (!p) throw new NotFoundException('Produccion no encontrada.');

    await this.prisma.$transaction(async (tx) => {
      if (p.productoId && p.unidadesProducidas > 0) {
        const { count } = await tx.product.updateMany({
          where: { id: p.productoId, stock: { gte: p.unidadesProducidas } },
          data: { stock: { decrement: p.unidadesProducidas } },
        });
        if (count === 0) {
          throw new BadRequestException(
            'No se puede anular: parte de lo producido ya se vendio o se dio de baja.',
          );
        }
      }
      for (const c of p.consumos) {
        await this.insumos.entrada(tx, c.insumoId, Number(c.cantidad), Number(c.costoUnitario), {
          fechaVencimiento: null,
          ref: {
            tipo: TipoMovimiento.AJUSTE,
            motivo: `Anulacion de produccion: ${p.receta.nombre}`,
            userId,
          },
          actualizarCosto: false,
        });
      }
      await tx.produccion.delete({ where: { id } });
    });

    await this.audit.log('Produccion', id, 'DELETE', userId, { receta: p.receta.nombre });
    return { id, anulada: true };
  }

  // ---------------------------------------------------------------------
  // Planificacion a partir de los encargos
  // ---------------------------------------------------------------------

  private async encargosEntre(desde: Date, hasta: Date) {
    return this.prisma.encargo.findMany({
      where: {
        estado: { in: [...ESTADOS_ENCARGO_ACTIVOS] },
        fechaEntrega: { gte: desde, lte: hasta },
      },
      orderBy: { fechaEntrega: 'asc' },
      include: {
        client: { select: { id: true, nombre: true, telefono: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                nombre: true,
                stock: true,
                receta: {
                  select: { id: true, nombre: true, rendimiento: true, unidadRendimiento: true },
                },
              },
            },
          },
        },
      },
    });
  }

  /** Productos con receta que hacen falta para los encargos, contra lo que ya hay hecho. */
  private agruparPorProducto(encargos: Awaited<ReturnType<ProduccionService['encargosEntre']>>) {
    const porProducto = new Map<
      string,
      {
        productId: string;
        nombre: string;
        cantidad: number;
        stock: number;
        receta: { id: string; nombre: string; unidadesPorTanda: number | null } | null;
      }
    >();
    for (const e of encargos) {
      for (const item of e.items) {
        if (!item.product) continue;
        const actual = porProducto.get(item.product.id) ?? {
          productId: item.product.id,
          nombre: item.product.nombre,
          cantidad: 0,
          stock: item.product.stock,
          receta: item.product.receta
            ? {
                id: item.product.receta.id,
                nombre: item.product.receta.nombre,
                unidadesPorTanda: this.recetas.unidadesPorTanda(
                  Number(item.product.receta.rendimiento),
                  item.product.receta.unidadRendimiento,
                ),
              }
            : null,
        };
        actual.cantidad += item.cantidad;
        porProducto.set(item.product.id, actual);
      }
    }
    return [...porProducto.values()].map((p) => {
      const faltante = Math.max(0, p.cantidad - p.stock);
      const tandasSugeridas =
        p.receta?.unidadesPorTanda && faltante > 0
          ? Math.ceil(faltante / p.receta.unidadesPorTanda)
          : 0;
      return { ...p, faltante, tandasSugeridas };
    });
  }

  /**
   * Hoja de produccion de un dia: que encargos se entregan, con todos los
   * detalles del pastel, y cuantas tandas de cada receta hay que hacer
   * descontando lo que ya esta hecho en vitrina.
   */
  async hojaDelDia(fecha?: string) {
    const dia = fecha || localDateKey(new Date());
    const encargos = await this.encargosEntre(parseFromDate(dia), parseToDate(dia));
    return {
      fecha: dia,
      productos: this.agruparPorProducto(encargos),
      encargos: encargos.map((e) => ({
        id: e.id,
        codigo: e.codigo,
        estado: e.estado,
        fechaEntrega: e.fechaEntrega,
        tipoEntrega: e.tipoEntrega,
        cliente: e.client,
        notas: e.notas,
        items: e.items.map((i) => ({
          id: i.id,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
          tamano: i.tamano,
          sabor: i.sabor,
          relleno: i.relleno,
          decoracion: i.decoracion,
          mensaje: i.mensaje,
          fotoReferenciaUrl: i.fotoReferenciaUrl,
          productId: i.productId,
        })),
      })),
    };
  }

  /**
   * Lista de compras: insumos que hay que comprar para cubrir los encargos
   * de los proximos `dias` dias (lo que falta producir, abierto en sus
   * insumos) y para volver a tener el stock minimo de cada insumo.
   */
  async listaCompras(dias = 3) {
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    const hasta = new Date(desde);
    hasta.setDate(hasta.getDate() + Math.max(0, dias));
    hasta.setHours(23, 59, 59, 999);

    const [encargos, recetario, insumos] = await Promise.all([
      this.encargosEntre(desde, hasta),
      this.recetas.cargarRecetario(),
      this.prisma.insumo.findMany({
        where: { activo: true },
        include: { proveedor: { select: { id: true, nombre: true, telefono: true } } },
      }),
    ]);

    const productos = this.agruparPorProducto(encargos);
    const necesarios = new Map<string, number>();
    const sinReceta: string[] = [];
    for (const p of productos) {
      if (p.faltante <= 0) continue;
      if (!p.receta?.unidadesPorTanda) {
        sinReceta.push(p.nombre);
        continue;
      }
      recetario.explotar(p.receta.id, p.faltante / p.receta.unidadesPorTanda, necesarios);
    }

    const lista = insumos
      .map((i) => {
        const necesario = necesarios.get(i.id) ?? 0;
        const disponible = Number(i.stockActual);
        const minimo = Number(i.stockMinimo);
        const aComprar = Math.max(0, necesario + minimo - disponible);
        return {
          insumoId: i.id,
          nombre: i.nombre,
          unidad: i.unidad,
          necesarioEncargos: redondearCantidad(necesario),
          disponible: redondearCantidad(disponible),
          stockMinimo: minimo,
          aComprar: redondearCantidad(aComprar),
          costoEstimado: redondearDinero(aComprar * Number(i.costoUnitario)),
          proveedor: i.proveedor,
          motivo:
            necesario > disponible + EPS
              ? 'ENCARGOS'
              : disponible - necesario < minimo - EPS
                ? 'MINIMO'
                : null,
        };
      })
      .filter((x) => x.aComprar > EPS)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return {
      dias,
      desde: localDateKey(desde),
      hasta: localDateKey(hasta),
      encargosConsiderados: encargos.length,
      productos,
      productosSinReceta: sinReceta,
      insumos: lista,
      costoEstimadoTotal: redondearDinero(lista.reduce((s, x) => s + x.costoEstimado, 0)),
    };
  }
}
