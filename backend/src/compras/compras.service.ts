import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InsumosService } from '../insumos/insumos.service';
import { RecetasService } from '../recetas/recetas.service';
import { TipoMovimiento } from '../common/enums';
import { parseFromDate, parseToDate } from '../common/date-range';
import { convertir, redondearCantidad, redondearDinero } from '../common/unidades';
import { CreateCompraDto } from './dto/compra.dto';

const EPS = 1e-9;

/** Categoria de gasto con la que quedan las compras de insumos en Gastos. */
export const CATEGORIA_GASTO_COMPRAS = 'Compras de insumos';

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly insumos: InsumosService,
    private readonly recetas: RecetasService,
  ) {}

  async findAll(params: { from?: string; to?: string; proveedorId?: string }) {
    const compras = await this.prisma.compra.findMany({
      where: {
        fecha: {
          gte: params.from ? parseFromDate(params.from) : undefined,
          lte: params.to ? parseToDate(params.to) : undefined,
        },
        ...(params.proveedorId ? { proveedorId: params.proveedorId } : {}),
      },
      orderBy: { fecha: 'desc' },
      take: 300,
      include: {
        proveedor: { select: { id: true, nombre: true } },
        user: { select: { nombre: true } },
        _count: { select: { items: true } },
      },
    });
    return compras.map(({ _count, ...c }) => ({
      ...c,
      total: Number(c.total),
      totalLineas: _count.items,
    }));
  }

  async findOne(id: string) {
    const compra = await this.prisma.compra.findUnique({
      where: { id },
      include: {
        proveedor: true,
        user: { select: { nombre: true } },
        items: { include: { insumo: { select: { id: true, nombre: true, unidad: true } } } },
      },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada.');
    return {
      ...compra,
      total: Number(compra.total),
      items: compra.items.map((i) => ({
        ...i,
        cantidad: Number(i.cantidad),
        costoTotal: Number(i.costoTotal),
        costoUnitario: redondearDinero(Number(i.costoTotal) / Number(i.cantidad)),
      })),
    };
  }

  /**
   * Registra una compra: cada linea entra al inventario como un lote (con su
   * vencimiento) y actualiza el costo del insumo por promedio ponderado. Con
   * eso cambian solos el costo de las recetas y de los productos.
   */
  async create(dto: CreateCompraDto, userId: string) {
    const total = redondearDinero(dto.items.reduce((s, i) => s + i.costoTotal, 0));
    const fecha = dto.fecha ? parseFromDate(dto.fecha) : new Date();
    // Una fecha sin hora cae a medianoche; si es hoy, se usa la hora actual
    // para que la compra no quede "antes" de los movimientos del dia.
    if (dto.fecha && fecha.toDateString() === new Date().toDateString()) fecha.setTime(Date.now());

    const compra = await this.prisma.$transaction(async (tx) => {
      const proveedor = dto.proveedorId
        ? await tx.proveedor.findUnique({ where: { id: dto.proveedorId } })
        : null;
      if (dto.proveedorId && !proveedor)
        throw new NotFoundException('El proveedor elegido ya no existe.');

      let expenseId: string | null = null;
      if (dto.registrarGasto !== false && total > 0) {
        const gasto = await tx.expense.create({
          data: {
            fecha,
            categoria: CATEGORIA_GASTO_COMPRAS,
            descripcion:
              `Compra${proveedor ? ` a ${proveedor.nombre}` : ''}` +
              (dto.numeroFactura ? ` (factura ${dto.numeroFactura})` : ''),
            monto: total,
            userId,
          },
        });
        expenseId = gasto.id;
      }

      const creada = await tx.compra.create({
        data: {
          fecha,
          proveedorId: proveedor?.id ?? null,
          numeroFactura: dto.numeroFactura?.trim() || null,
          notas: dto.notas?.trim() || null,
          total,
          expenseId,
          userId,
        },
      });

      for (const item of dto.items) {
        const insumo = await tx.insumo.findUnique({ where: { id: item.insumoId } });
        if (!insumo)
          throw new BadRequestException('Una de las lineas usa un insumo que ya no existe.');
        const cantidad = redondearCantidad(
          convertir(item.cantidad, item.unidad, insumo.unidad, insumo.nombre),
        );
        const costoUnitario = cantidad > 0 ? item.costoTotal / cantidad : 0;

        const linea = await tx.compraItem.create({
          data: {
            compraId: creada.id,
            insumoId: insumo.id,
            cantidad: item.cantidad,
            unidad: item.unidad,
            costoTotal: item.costoTotal,
            fechaVencimiento: item.fechaVencimiento ? parseToDate(item.fechaVencimiento) : null,
          },
        });
        await this.insumos.entrada(tx, insumo.id, cantidad, costoUnitario, {
          fechaVencimiento: linea.fechaVencimiento,
          ref: {
            tipo: TipoMovimiento.COMPRA,
            motivo: proveedor ? `Compra a ${proveedor.nombre}` : 'Compra',
            userId,
            compraId: creada.id,
          },
          actualizarCosto: true,
          compraItemId: linea.id,
        });
        // Si el insumo no tenia proveedor habitual, queda este.
        if (proveedor && !insumo.proveedorId) {
          await tx.insumo.update({ where: { id: insumo.id }, data: { proveedorId: proveedor.id } });
        }
      }
      return creada;
    });

    await this.audit.log('Compra', compra.id, 'CREATE', userId, {
      total,
      lineas: dto.items.length,
    });
    await this.recetas.actualizarCostosProductos();
    return this.findOne(compra.id);
  }

  /**
   * Anula una compra registrada por error. Solo si nada de lo comprado se
   * ha usado todavia (si ya se gasto en una produccion, hay que corregir con
   * un ajuste de inventario). El costo promedio del insumo no se recalcula
   * hacia atras: se puede corregir a mano en el insumo si hiciera falta.
   */
  async remove(id: string, userId?: string) {
    const compra = await this.prisma.compra.findUnique({
      where: { id },
      include: { items: { include: { lotes: true, insumo: true } } },
    });
    if (!compra) throw new NotFoundException('Compra no encontrada.');

    for (const item of compra.items) {
      const usado = item.lotes.some(
        (l) => Number(l.cantidadRestante) + EPS < Number(l.cantidadInicial),
      );
      if (usado) {
        throw new BadRequestException(
          `No se puede anular: ya se uso parte de "${item.insumo.nombre}" de esta compra. ` +
            'Corrige el inventario con un ajuste.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of compra.items) {
        const cantidad = item.lotes.reduce((s, l) => s + Number(l.cantidadInicial), 0);
        const insumo = await tx.insumo.findUniqueOrThrow({ where: { id: item.insumoId } });
        const stockDespues = Math.max(0, redondearCantidad(Number(insumo.stockActual) - cantidad));
        await tx.loteInsumo.deleteMany({ where: { compraItemId: item.id } });
        await tx.insumo.update({
          where: { id: item.insumoId },
          data: { stockActual: stockDespues },
        });
        await tx.movimientoInsumo.create({
          data: {
            insumoId: item.insumoId,
            tipo: TipoMovimiento.AJUSTE,
            cantidad: -cantidad,
            costoUnitario: insumo.costoUnitario,
            stockResultante: stockDespues,
            motivo: 'Anulacion de compra',
            userId: userId ?? null,
          },
        });
      }
      await tx.compra.delete({ where: { id } });
      if (compra.expenseId) await tx.expense.deleteMany({ where: { id: compra.expenseId } });
    });

    await this.audit.log('Compra', id, 'DELETE', userId, { total: Number(compra.total) });
    return { id, anulada: true };
  }
}
