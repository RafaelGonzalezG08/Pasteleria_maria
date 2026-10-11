import { ProductsService } from './products.service';

/**
 * Las tallas / medidas de una pieza se guardan como texto JSON (SQLite no
 * tiene tipo Json) y salen al frontend / al catalogo ya como arreglo.
 */
function crearService(over: { productoGuardado?: Record<string, unknown> } = {}) {
  const guardado = {
    id: 'p-1',
    sku: 'AN-0001',
    nombre: 'Anillo solitario',
    tallas: null as string | null,
    ...over.productoGuardado,
  };
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: any) => Promise.resolve({ ...guardado, ...data })),
      update: jest.fn(({ data }: any) => Promise.resolve({ ...guardado, ...data })),
    },
    category: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { log: jest.fn() };
  const storage = {};
  const catalogo = { generar: jest.fn().mockResolvedValue({ ok: true }) };
  const service = new ProductsService(
    prisma as any,
    audit as any,
    storage as any,
    catalogo as any,
  );
  return { service, prisma };
}

describe('ProductsService — tallas', () => {
  it('al crear, serializa las tallas a texto JSON (recortadas y sin repetidas)', async () => {
    const { service, prisma } = crearService();

    await service.create({
      nombre: 'Anillo solitario',
      precioUnitario: 1000,
      stock: 5,
      tallas: [' 6 ', '7', '7', '6'],
    } as any);

    expect(prisma.product.create.mock.calls[0][0].data.tallas).toBe('["6","7"]');
  });

  it('al leer, devuelve las tallas como arreglo', async () => {
    const { service, prisma } = crearService();
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-1',
      sku: 'AN-0001',
      nombre: 'Anillo',
      tallas: '["6","7","8"]',
    });

    const p = await service.findOne('p-1');

    expect(p.tallas).toEqual(['6', '7', '8']);
  });

  it('una pieza sin tallas devuelve arreglo vacio, no null', async () => {
    const { service, prisma } = crearService();
    prisma.product.findUnique.mockResolvedValue({ id: 'p-1', sku: 'AN-0001', nombre: 'Anillo', tallas: null });

    const p = await service.findOne('p-1');

    expect(p.tallas).toEqual([]);
  });

  it('un update que no toca las tallas no las borra', async () => {
    const { service, prisma } = crearService();
    prisma.product.findUnique.mockResolvedValue({
      id: 'p-1',
      sku: 'AN-0001',
      nombre: 'Anillo',
      tallas: '["6"]',
    });

    await service.update('p-1', { stock: 3 } as any);

    expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty('tallas');
  });
});
