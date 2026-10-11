import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';

describe('SalesService.calculateTotals', () => {
  it('calcula subtotal, impuestos y total para un solo item', () => {
    const totals = SalesService.calculateTotals([{ cantidad: 2, precioUnitario: 100 }], 0.18);
    expect(totals.subtotal).toBe(200);
    expect(totals.impuestos).toBe(36);
    expect(totals.total).toBe(236);
  });

  it('suma correctamente varios items con cantidades distintas', () => {
    const totals = SalesService.calculateTotals(
      [
        { cantidad: 3, precioUnitario: 120.5 },
        { cantidad: 1, precioUnitario: 45 },
      ],
      0.18,
    );
    // subtotal = 361.5 + 45 = 406.5
    expect(totals.subtotal).toBe(406.5);
    expect(totals.impuestos).toBeCloseTo(73.17, 2);
    expect(totals.total).toBeCloseTo(479.67, 2);
  });

  it('con tasa de impuesto 0 el total es igual al subtotal', () => {
    const totals = SalesService.calculateTotals([{ cantidad: 5, precioUnitario: 10 }], 0);
    expect(totals.subtotal).toBe(50);
    expect(totals.impuestos).toBe(0);
    expect(totals.total).toBe(50);
  });

  it('aplica el descuento antes de calcular el impuesto', () => {
    // bruto 1000, 10% dcto => subtotal 900, impuesto 18% de 900 = 162, total 1062
    const totals = SalesService.calculateTotals([{ cantidad: 1, precioUnitario: 1000 }], 0.18, 10);
    expect(totals.subtotal).toBe(900);
    expect(totals.impuestos).toBe(162);
    expect(totals.total).toBe(1062);
  });

  it('redondea a 2 decimales', () => {
    const totals = SalesService.calculateTotals([{ cantidad: 3, precioUnitario: 33.333 }], 0.18);
    expect(Number.isInteger(totals.subtotal * 100)).toBe(true);
    expect(Number.isInteger(totals.impuestos * 100)).toBe(true);
    expect(Number.isInteger(totals.total * 100)).toBe(true);
  });
});

/** Crea un SalesService con dependencias falsas; se sobrescriben por test. */
function crearService(overrides: { prisma?: any } = {}) {
  const prisma = overrides.prisma ?? {};
  return new SalesService(prisma, {} as any, {} as any, {} as any);
}

describe('SalesService.generateInvoiceNumber', () => {
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;

  function txConNumeros(numeros: string[]) {
    return {
      invoice: { findMany: jest.fn().mockResolvedValue(numeros.map((n) => ({ numero: n }))) },
    };
  }

  it('empieza en 00001 cuando no hay facturas del año', async () => {
    const svc = crearService();
    const n = await (svc as any).generateInvoiceNumber(txConNumeros([]));
    expect(n).toBe(`${prefix}00001`);
  });

  it('toma el máximo + 1', async () => {
    const svc = crearService();
    const n = await (svc as any).generateInvoiceNumber(
      txConNumeros([`${prefix}00001`, `${prefix}00007`, `${prefix}00003`]),
    );
    expect(n).toBe(`${prefix}00008`);
  });

  it('compara como números, no alfabéticamente (relleno de ceros mezclado)', async () => {
    // Alfabéticamente "FAC-2026-9" > "FAC-2026-00012": el código viejo daba 10
    // (ya usado) y la venta se caía. El máximo real es 12.
    const svc = crearService();
    const n = await (svc as any).generateInvoiceNumber(
      txConNumeros([`${prefix}9`, `${prefix}00012`, `${prefix}00010`]),
    );
    expect(n).toBe(`${prefix}00013`);
  });

  it('salta un hueco ya ocupado', async () => {
    const svc = crearService();
    const n = await (svc as any).generateInvoiceNumber(
      txConNumeros([`${prefix}00001`, `${prefix}00002`, `${prefix}00004`]),
    );
    // max = 4 -> 5 (no choca)
    expect(n).toBe(`${prefix}00005`);
  });
});

describe('SalesService.validarReferencias', () => {
  it('acepta una venta sin cliente ni productos (todo manual)', async () => {
    const svc = crearService({
      prisma: { product: { findMany: jest.fn() }, client: { findUnique: jest.fn() } },
    });
    await expect(
      (svc as any).validarReferencias({ items: [{ descripcion: 'Cuadre' }] }),
    ).resolves.toBeUndefined();
  });

  it('rechaza si el cliente ya no existe', async () => {
    const prisma = {
      client: { findUnique: jest.fn().mockResolvedValue(null) },
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = crearService({ prisma });
    await expect(
      (svc as any).validarReferencias({ clientId: 'borrado', items: [{ descripcion: 'x' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza nombrando los productos que ya no están en el inventario', async () => {
    const prisma = {
      client: { findUnique: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'vive' }]) },
    };
    const svc = crearService({ prisma });
    await expect(
      (svc as any).validarReferencias({
        items: [
          { productId: 'vive', descripcion: 'Anillo vivo' },
          { productId: 'muerto', descripcion: 'Anillo borrado' },
        ],
      }),
    ).rejects.toThrow(/Anillo borrado/);
  });

  it('acepta cuando todos los productos existen', async () => {
    const prisma = {
      client: { findUnique: jest.fn().mockResolvedValue({ id: 'c1' }) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]) },
    };
    const svc = crearService({ prisma });
    await expect(
      (svc as any).validarReferencias({
        clientId: 'c1',
        items: [
          { productId: 'p1', descripcion: 'A' },
          { productId: 'p2', descripcion: 'B' },
        ],
      }),
    ).resolves.toBeUndefined();
  });
});
