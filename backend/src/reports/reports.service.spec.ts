import { ReportsService } from './reports.service';

/**
 * `cashflow()` hace 4 agregaciones sobre la base. Aquí se mockea Prisma para
 * comprobar la aritmética de "saldo en caja" (dinero recibido de verdad) vs
 * "balance total" (todas las ventas).
 */
function crearService(datos: {
  ventasTotal: number;
  contadoTotal: number;
  abonosTotal: number;
  gastosTotal: number;
}) {
  const prisma = {
    sale: {
      aggregate: jest.fn(({ where }: any) => {
        // La consulta de contado lleva metodoPago: { in: [...] }.
        const esContado = where?.metodoPago?.in;
        return Promise.resolve({
          _sum: { total: esContado ? datos.contadoTotal : datos.ventasTotal },
        });
      }),
    },
    payment: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: datos.abonosTotal } }),
    },
    expense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { monto: datos.gastosTotal } }),
    },
  };
  return new ReportsService(prisma as any);
}

describe('ReportsService.cashflow', () => {
  it('saldo en caja = contado + abonos - gastos; balance total = todas las ventas - gastos', async () => {
    // Vendido 10.000 (de eso, 6.000 al contado). Cobrado además 1.500 en abonos.
    // Gastos 2.000.
    const svc = crearService({
      ventasTotal: 10000,
      contadoTotal: 6000,
      abonosTotal: 1500,
      gastosTotal: 2000,
    });
    const r = await svc.cashflow();

    expect(r.ingresos).toBe(10000);
    expect(r.egresos).toBe(2000);
    expect(r.balanceTotal).toBe(8000); // 10000 - 2000
    expect(r.cobrado).toBe(7500); // 6000 + 1500
    expect(r.saldoEnCaja).toBe(5500); // 7500 - 2000
    expect(r.neto).toBe(r.balanceTotal); // compatibilidad
  });

  it('sin ventas ni gastos todo queda en cero (no NaN)', async () => {
    const svc = crearService({
      ventasTotal: null as any,
      contadoTotal: null as any,
      abonosTotal: null as any,
      gastosTotal: null as any,
    });
    const r = await svc.cashflow();
    expect(r).toMatchObject({
      ingresos: 0,
      egresos: 0,
      neto: 0,
      cobrado: 0,
      saldoEnCaja: 0,
      balanceTotal: 0,
    });
  });

  it('el saldo en caja puede ser negativo si se gastó más de lo cobrado', async () => {
    const svc = crearService({
      ventasTotal: 5000,
      contadoTotal: 1000,
      abonosTotal: 0,
      gastosTotal: 3000,
    });
    const r = await svc.cashflow();
    expect(r.saldoEnCaja).toBe(-2000); // 1000 - 3000
    expect(r.balanceTotal).toBe(2000); // 5000 - 3000
  });
});

describe('ReportsService.transactions', () => {
  const venta1 = {
    id: 's1',
    fecha: new Date('2026-08-01T10:00:00'),
    total: 1000,
    metodoPago: 'EFECTIVO',
    client: { nombre: 'Ana' },
    user: { nombre: 'Cajero' },
    invoice: { numero: 'FAC-2026-00001', estado: 'GENERADA' },
  };
  const venta2 = {
    id: 's2',
    fecha: new Date('2026-08-03T10:00:00'), // la mas reciente
    total: 2000,
    metodoPago: 'CREDITO',
    client: { nombre: 'Beto' },
    user: { nombre: 'Cajero' },
    invoice: { numero: 'FAC-2026-00002', estado: 'PENDIENTE' },
  };
  const abono1 = {
    id: 'p1',
    fecha: new Date('2026-08-02T10:00:00'),
    amount: 500,
    metodo: 'TRANSFERENCIA',
    saleId: 's2',
    sale: { client: { nombre: 'Beto' }, invoice: { numero: 'FAC-2026-00002' } },
  };
  const gasto1 = {
    id: 'g1',
    fecha: new Date('2026-08-01T08:00:00'),
    monto: 300,
    categoria: 'Insumos',
    descripcion: 'Cajas',
    user: { nombre: 'Admin' },
  };

  function crearServiceTx() {
    const prisma = {
      sale: { findMany: jest.fn().mockResolvedValue([venta1, venta2]) },
      payment: { findMany: jest.fn().mockResolvedValue([abono1]) },
      expense: { findMany: jest.fn().mockResolvedValue([gasto1]) },
    };
    return { svc: new ReportsService(prisma as any), prisma };
  }

  it('mezcla ventas, abonos y gastos ordenados por fecha, la mas reciente primero', async () => {
    const { svc } = crearServiceTx();
    const r = await svc.transactions({});
    expect(r.items).toHaveLength(4);
    expect(r.items.map((t) => t.id)).toEqual(['venta-s2', 'abono-p1', 'venta-s1', 'gasto-g1']);
  });

  it('calcula ingresos (ventas+abonos), egresos (gastos) y el neto', async () => {
    const { svc } = crearServiceTx();
    const r = await svc.transactions({});
    // ingresos = 1000 + 2000 + 500 = 3500 ; egresos = 300
    expect(r.totales).toEqual({ ingresos: 3500, egresos: 300, neto: 3200 });
  });

  it('el tipo GASTO no se pide si se filtra por metodo de pago (los gastos no tienen)', async () => {
    const { svc, prisma } = crearServiceTx();
    await svc.transactions({ metodoPago: 'EFECTIVO' });
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('respeta el filtro de tipo (solo pide lo pedido)', async () => {
    const { svc, prisma } = crearServiceTx();
    await svc.transactions({ tipo: ['GASTO'] });
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.findMany).toHaveBeenCalled();
  });

  it('la busqueda de texto filtra por cliente, referencia o descripcion', async () => {
    const { svc } = crearServiceTx();
    const r = await svc.transactions({ q: 'beto' });
    expect(r.items.map((t) => t.id).sort()).toEqual(['abono-p1', 'venta-s2']);
  });

  it('una venta a credito y su abono aparecen con el mismo cliente y referencia', async () => {
    const { svc } = crearServiceTx();
    const r = await svc.transactions({});
    const abono = r.items.find((t) => t.id === 'abono-p1')!;
    expect(abono.cliente).toBe('Beto');
    expect(abono.referencia).toBe('FAC-2026-00002');
    expect(abono.signo).toBe('INGRESO');
  });
});
