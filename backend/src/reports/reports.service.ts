import { Injectable } from '@nestjs/common';
import { ESTADOS_DEUDA_CON_SALDO, MetodoPago, METODOS_PAGO } from '../common/enums';

// Metodos de pago que dejan el dinero en la caja al momento de la venta (todos
// menos el credito, que se cobra despues con abonos). Se enumeran en positivo
// en vez de usar `{ not: CREDITO }` por lo mismo que ESTADOS_DEUDA_CON_SALDO:
// Prisma no puede partir en lotes una consulta con negacion en SQLite.
const METODOS_CONTADO = METODOS_PAGO.filter((m) => m !== MetodoPago.CREDITO);
import { PrismaService } from '../prisma/prisma.service';
import { localDateKey, parseFromDate, parseToDate } from '../common/date-range';

export type GroupBy = 'day' | 'week' | 'month' | 'year';

export type TipoTransaccion = 'VENTA' | 'ABONO' | 'GASTO';

export interface Transaccion {
  id: string;
  tipo: TipoTransaccion;
  fecha: Date;
  monto: number;
  signo: 'INGRESO' | 'EGRESO';
  descripcion: string;
  metodoPago: string | null;
  cliente: string | null;
  usuario: string | null;
  /** Numero de factura (venta/abono) o categoria (gasto). */
  referencia: string | null;
  /** Estado de la factura (solo VENTA). */
  estado: string | null;
  saleId: string | null;
  /** Imagen de la factura (venta/abono), para verla desde Transacciones. */
  facturaPngUrl: string | null;
}

interface PeriodBucket {
  periodo: string;
  ventas: number;
  subtotal: number;
  impuestos: number;
  total: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private defaultRange(from?: string, to?: string) {
    // parseToDate lleva "hasta" al final del dia (23:59:59.999 local), asi el
    // rango incluye las ventas del propio dia elegido. Ver common/date-range.ts.
    const toDate = to ? parseToDate(to) : new Date();
    if (from) {
      return { fromDate: parseFromDate(from), toDate };
    }
    // Sin fecha de inicio: todo el historial. Antes eran "los ultimos 30
    // dias" (o 12 semanas / 1 año / 5 años segun el agrupado), pero el
    // negocio prefiere ver todo de entrada y acotar el rango si quiere.
    return { fromDate: new Date('2000-01-01T00:00:00'), toDate };
  }

  async salesByPeriod(from: string | undefined, to: string | undefined, group: GroupBy = 'day') {
    const { fromDate, toDate } = this.defaultRange(from, to);
    const sales = await this.prisma.sale.findMany({
      where: { fecha: { gte: fromDate, lte: toDate } },
      select: { fecha: true, total: true, subtotal: true, impuestos: true },
    });

    const buckets = new Map<string, PeriodBucket>();
    for (const sale of sales) {
      const key = bucketKey(sale.fecha, group);
      const entry = buckets.get(key) ?? {
        periodo: key,
        ventas: 0,
        subtotal: 0,
        impuestos: 0,
        total: 0,
      };
      entry.ventas += 1;
      entry.subtotal += Number(sale.subtotal);
      entry.impuestos += Number(sale.impuestos);
      entry.total += Number(sale.total);
      buckets.set(key, entry);
    }

    return Array.from(buckets.values())
      .map((b) => ({
        ...b,
        subtotal: round(b.subtotal),
        impuestos: round(b.impuestos),
        total: round(b.total),
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }

  /**
   * Costo/margen por producto en un periodo, a partir de lo realmente vendido
   * (usa el costo copiado en cada SaleItem al momento de la venta, no el
   * costo actual del catalogo, para que ediciones posteriores del costo no
   * distorsionen el margen historico). Solo lo consume el apartado de
   * Costos, restringido a ADMIN en el controller.
   */
  async productMargins(from?: string, to?: string) {
    const { fromDate, toDate } = this.defaultRange(from, to);
    const items = await this.prisma.saleItem.findMany({
      where: { sale: { fecha: { gte: fromDate, lte: toDate } } },
      select: {
        productId: true,
        descripcion: true,
        cantidad: true,
        precioUnitario: true,
        costoUnitario: true,
        total: true,
        product: { select: { sku: true } },
      },
    });

    interface ProductBucket {
      productId: string | null;
      nombre: string;
      sku: string | null;
      unidades: number;
      ingresos: number;
      costo: number;
    }

    const buckets = new Map<string, ProductBucket>();
    for (const item of items) {
      const key = item.productId ?? `manual:${item.descripcion}`;
      const entry = buckets.get(key) ?? {
        productId: item.productId,
        nombre: item.descripcion,
        sku: item.product?.sku ?? null,
        unidades: 0,
        ingresos: 0,
        costo: 0,
      };
      entry.unidades += item.cantidad;
      entry.ingresos += Number(item.total);
      entry.costo += item.cantidad * Number(item.costoUnitario);
      buckets.set(key, entry);
    }

    const productos = Array.from(buckets.values())
      .map((b) => {
        const utilidad = b.ingresos - b.costo;
        return {
          productId: b.productId,
          nombre: b.nombre,
          sku: b.sku,
          unidades: b.unidades,
          ingresos: round(b.ingresos),
          costo: round(b.costo),
          utilidad: round(utilidad),
          margenPct: b.ingresos > 0 ? round((utilidad / b.ingresos) * 100) : 0,
        };
      })
      .sort((a, b) => b.utilidad - a.utilidad);

    const ingresos = productos.reduce((sum, p) => sum + p.ingresos, 0);
    const costo = productos.reduce((sum, p) => sum + p.costo, 0);
    const utilidad = ingresos - costo;

    return {
      totales: {
        ingresos: round(ingresos),
        costo: round(costo),
        utilidad: round(utilidad),
        margenPct: ingresos > 0 ? round((utilidad / ingresos) * 100) : 0,
      },
      productos,
    };
  }

  async clientDebts() {
    const debts = await this.prisma.clientDebt.findMany({
      where: { status: { in: [...ESTADOS_DEUDA_CON_SALDO] } },
      include: { client: { select: { id: true, nombre: true, telefono: true } } },
      orderBy: { dueDate: 'asc' },
    });

    return debts.map((d) => ({
      id: d.id,
      cliente: d.client.nombre,
      telefono: d.client.telefono,
      montoTotal: Number(d.amountTotal),
      montoPagado: Number(d.amountPaid),
      saldo: round(Number(d.amountTotal) - Number(d.amountPaid)),
      vencimiento: d.dueDate,
      status: d.status,
    }));
  }

  async expensesByCategory(from?: string, to?: string) {
    const { fromDate, toDate } = this.defaultRange(from, to);
    const expenses = await this.prisma.expense.findMany({
      where: { fecha: { gte: fromDate, lte: toDate } },
      select: { categoria: true, monto: true },
    });

    const byCategory = new Map<string, number>();
    let total = 0;
    for (const expense of expenses) {
      const monto = Number(expense.monto);
      byCategory.set(expense.categoria, (byCategory.get(expense.categoria) ?? 0) + monto);
      total += monto;
    }

    return {
      total: round(total),
      categorias: Array.from(byCategory.entries()).map(([categoria, monto]) => ({
        categoria,
        monto: round(monto),
      })),
    };
  }

  /**
   * Dos maneras de mirar el mismo periodo:
   *
   *  - `saldoEnCaja`  = dinero que de verdad entro (ventas de contado + abonos
   *    cobrados en el periodo) menos los gastos. Una venta a credito NO cuenta
   *    hasta que el cliente paga. Es lo que el negocio tiene en la mano.
   *
   *  - `balanceTotal` = todas las ventas del periodo (contado y credito, aunque
   *    el credito no se haya cobrado) menos los gastos. Es la foto contable:
   *    cuanto se vendio, no cuanto se cobro.
   *
   * `ingresos` / `egresos` / `neto` se mantienen con el mismo significado de
   * antes para no romper nada que ya los consuma; `neto` === `balanceTotal`.
   */
  async cashflow(from?: string, to?: string) {
    const { fromDate, toDate } = this.defaultRange(from, to);
    const rango = { gte: fromDate, lte: toDate };
    const [ventas, contado, abonos, gastos] = await Promise.all([
      this.prisma.sale.aggregate({ where: { fecha: rango }, _sum: { total: true } }),
      this.prisma.sale.aggregate({
        where: { fecha: rango, metodoPago: { in: [...METODOS_CONTADO] } },
        _sum: { total: true },
      }),
      this.prisma.payment.aggregate({ where: { fecha: rango }, _sum: { amount: true } }),
      this.prisma.expense.aggregate({ where: { fecha: rango }, _sum: { monto: true } }),
    ]);

    const ingresos = Number(ventas._sum.total ?? 0);
    const egresos = Number(gastos._sum.monto ?? 0);
    const cobrado = Number(contado._sum.total ?? 0) + Number(abonos._sum.amount ?? 0);
    return {
      ingresos: round(ingresos),
      egresos: round(egresos),
      neto: round(ingresos - egresos),
      cobrado: round(cobrado),
      saldoEnCaja: round(cobrado - egresos),
      balanceTotal: round(ingresos - egresos),
    };
  }

  /**
   * Libro de transacciones: une ventas, abonos y gastos en una sola lista
   * ordenada por fecha (la mas reciente primero), para ver todo lo que se
   * movio en el negocio sin tener que abrir Ventas, Cobros y Gastos por
   * separado. SQLite/Prisma no hacen UNION facil entre tablas con columnas
   * distintas, asi que se trae cada una por su lado y se mezcla en memoria —
   * a la escala de un solo negocio (cientos de filas, no millones) esto es
   * instantaneo.
   */
  async transactions(params: {
    from?: string;
    to?: string;
    tipo?: TipoTransaccion[];
    metodoPago?: string;
    userId?: string;
    q?: string;
  }) {
    const { fromDate, toDate } = this.defaultRange(params.from, params.to);
    const rango = { gte: fromDate, lte: toDate };
    const tipos =
      params.tipo && params.tipo.length > 0 ? params.tipo : (['VENTA', 'ABONO', 'GASTO'] as const);
    // Los gastos no tienen metodo de pago propio: si se filtra por metodo, no
    // pueden aparecer (en vez de mostrarlos igual, que confundiria el filtro).
    const incluirGastos = tipos.includes('GASTO') && !params.metodoPago;

    const [ventas, abonos, gastos] = await Promise.all([
      tipos.includes('VENTA')
        ? this.prisma.sale.findMany({
            where: {
              fecha: rango,
              ...(params.metodoPago ? { metodoPago: params.metodoPago } : {}),
              ...(params.userId ? { userId: params.userId } : {}),
            },
            include: {
              client: { select: { nombre: true } },
              user: { select: { nombre: true } },
              invoice: { select: { numero: true, estado: true, pngUrl: true } },
            },
          })
        : Promise.resolve([]),
      tipos.includes('ABONO')
        ? this.prisma.payment.findMany({
            where: { fecha: rango, ...(params.metodoPago ? { metodo: params.metodoPago } : {}) },
            include: {
              sale: {
                include: {
                  client: { select: { nombre: true } },
                  invoice: { select: { numero: true, pngUrl: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      incluirGastos
        ? this.prisma.expense.findMany({
            where: { fecha: rango, ...(params.userId ? { userId: params.userId } : {}) },
            include: { user: { select: { nombre: true } } },
          })
        : Promise.resolve([]),
    ]);

    let items: Transaccion[] = [
      ...ventas.map((s): Transaccion => ({
        id: `venta-${s.id}`,
        tipo: 'VENTA',
        fecha: s.fecha,
        monto: round(Number(s.total)),
        signo: 'INGRESO',
        descripcion: s.metodoPago === 'CREDITO' ? 'Venta a credito' : 'Venta de contado',
        metodoPago: s.metodoPago,
        cliente: s.client?.nombre ?? null,
        usuario: s.user?.nombre ?? null,
        referencia: s.invoice?.numero ?? null,
        estado: s.invoice?.estado ?? null,
        saleId: s.id,
        facturaPngUrl: s.invoice?.pngUrl ?? null,
      })),
      ...abonos.map((p): Transaccion => ({
        id: `abono-${p.id}`,
        tipo: 'ABONO',
        fecha: p.fecha,
        monto: round(Number(p.amount)),
        signo: 'INGRESO',
        descripcion: 'Abono a cuenta',
        metodoPago: p.metodo,
        cliente: p.sale?.client?.nombre ?? null,
        usuario: null,
        referencia: p.sale?.invoice?.numero ?? null,
        estado: null,
        saleId: p.saleId,
        facturaPngUrl: p.sale?.invoice?.pngUrl ?? null,
      })),
      ...gastos.map((g): Transaccion => ({
        id: `gasto-${g.id}`,
        tipo: 'GASTO',
        fecha: g.fecha,
        monto: round(Number(g.monto)),
        signo: 'EGRESO',
        descripcion: g.descripcion,
        metodoPago: null,
        cliente: null,
        usuario: g.user?.nombre ?? null,
        referencia: g.categoria,
        estado: null,
        saleId: null,
        facturaPngUrl: null,
      })),
    ];

    if (params.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      items = items.filter((t) =>
        [t.descripcion, t.cliente, t.usuario, t.referencia].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      );
    }

    items.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    const totales = items.reduce(
      (acc, t) => {
        if (t.signo === 'INGRESO') acc.ingresos += t.monto;
        else acc.egresos += t.monto;
        return acc;
      },
      { ingresos: 0, egresos: 0 },
    );

    return {
      items,
      totales: {
        ingresos: round(totales.ingresos),
        egresos: round(totales.egresos),
        neto: round(totales.ingresos - totales.egresos),
      },
    };
  }

  /** Resumen usado por el Dashboard: ventas de hoy, deudas totales y gastos recientes. */
  async dashboardSummary() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const mes = { gte: inicioMes };

    const [ventasHoy, deudas, gastosRecientes, gastosMes, ventasMes, contadoMes, abonosMes] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { fecha: { gte: startOfDay } },
          _sum: { total: true },
          _count: true,
        }),
        this.prisma.clientDebt.aggregate({
          where: { status: { in: [...ESTADOS_DEUDA_CON_SALDO] } },
          _sum: { amountTotal: true, amountPaid: true },
        }),
        this.prisma.expense.findMany({ orderBy: { fecha: 'desc' }, take: 5 }),
        this.prisma.expense.aggregate({ where: { fecha: mes }, _sum: { monto: true } }),
        this.prisma.sale.aggregate({ where: { fecha: mes }, _sum: { total: true } }),
        this.prisma.sale.aggregate({
          where: { fecha: mes, metodoPago: { in: [...METODOS_CONTADO] } },
          _sum: { total: true },
        }),
        this.prisma.payment.aggregate({ where: { fecha: mes }, _sum: { amount: true } }),
      ]);

    const deudaTotal = Number(deudas._sum.amountTotal ?? 0) - Number(deudas._sum.amountPaid ?? 0);
    const gastosDelMes = Number(gastosMes._sum.monto ?? 0);
    const cobradoMes = Number(contadoMes._sum.total ?? 0) + Number(abonosMes._sum.amount ?? 0);

    return {
      ventasHoy: { total: round(Number(ventasHoy._sum.total ?? 0)), cantidad: ventasHoy._count },
      deudaTotalPendiente: round(deudaTotal),
      gastosDelMes: round(gastosDelMes),
      // Mismos dos numeros que en Reportes, pero fijos al mes en curso (el
      // Dashboard no tiene filtro de fechas). Ver cashflow() para que es cada uno.
      saldoEnCajaMes: round(cobradoMes - gastosDelMes),
      balanceTotalMes: round(Number(ventasMes._sum.total ?? 0) - gastosDelMes),
      gastosRecientes,
    };
  }

  toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (value: unknown) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const lines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
    ];
    return lines.join('\n');
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Agrupa siempre en hora LOCAL del negocio, no en UTC: agrupando en UTC, una
// venta hecha a las 9:00 PM en RD (UTC-4) caia en el dia siguiente y el
// reporte diario no cuadraba con lo que el negocio vendio ese dia.
function bucketKey(date: Date, group: GroupBy): string {
  const d = new Date(date);
  if (group === 'day') {
    return localDateKey(d);
  }
  if (group === 'year') {
    return String(d.getFullYear());
  }
  if (group === 'month') {
    return localDateKey(d).slice(0, 7);
  }
  // week: YYYY-Www (semana ISO)
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
