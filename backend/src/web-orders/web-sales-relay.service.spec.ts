import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WebSalesRelayService } from './web-sales-relay.service';

/**
 * El relevo de ventas web crea VENTAS reales desde el punto de venta oculto
 * del catalogo. Misma regla que el de pedidos: solo se borra del relevo lo
 * que ya no hace falta volver a ver. Un error de datos cae como pedido
 * pendiente; uno transitorio se deja para reintentar.
 */

interface Deps {
  salesCreate: jest.Mock;
  clientsCreate: jest.Mock;
  crearDesdePendiente: jest.Mock;
  saleCount: jest.Mock;
  productFindMany: jest.Mock;
  userFindUnique: jest.Mock;
}

function crearService(over: Partial<Deps> = {}) {
  const deps: Deps = {
    salesCreate: jest.fn().mockResolvedValue({ id: 'venta-1' }),
    clientsCreate: jest.fn().mockResolvedValue({ id: 'cli-1' }),
    crearDesdePendiente: jest.fn().mockResolvedValue({ id: 'wo-1' }),
    saleCount: jest.fn().mockResolvedValue(0),
    productFindMany: jest.fn().mockResolvedValue([{ id: 'p-1', sku: 'AN-001', nombre: 'Anillo' }]),
    userFindUnique: jest.fn().mockResolvedValue({ id: 'u-web' }),
    ...over,
  };

  const prisma = {
    businessProfile: {
      findFirst: jest.fn().mockResolvedValue({
        relevoPedidosUrl: 'https://relevo.test',
        relevoPedidosClave: 'clave-secreta',
      }),
    },
    user: { findUnique: deps.userFindUnique },
    sale: { count: deps.saleCount },
    product: { findMany: deps.productFindMany },
    client: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const sales = { create: deps.salesCreate };
  const clients = { create: deps.clientsCreate };
  const webOrders = { crearDesdeItems: deps.crearDesdePendiente };

  const service = new WebSalesRelayService(
    prisma as any,
    sales as any,
    clients as any,
    webOrders as any,
  );
  return { service, deps };
}

function mockFetch(ventas: unknown[]) {
  const deleteCalls: string[] = [];
  (global as any).fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      return { ok: true, json: async () => ventas } as Response;
    }
    if (init.method === 'DELETE') {
      deleteCalls.push(decodeURIComponent(url.split('/pos/ventas/')[1]));
      return { ok: true } as Response;
    }
    throw new Error('fetch inesperado: ' + url);
  });
  return deleteCalls;
}

const ventaBase = (over: Record<string, unknown> = {}) => ({
  codigo: 'VNT-AAAA',
  venta: {
    items: [{ sku: 'AN-001', cantidad: 1, precio: 3000 }],
    metodoPago: 'EFECTIVO',
    descuentoPct: 0,
    cliente: null,
    ...over,
  },
  creado: Date.now(),
});

describe('WebSalesRelayService.revisar', () => {
  afterEach(() => jest.restoreAllMocks());

  it('crea la venta y la borra del relevo', async () => {
    const { service, deps } = crearService();
    const del = mockFetch([ventaBase()]);

    await service.revisar();

    expect(deps.salesCreate).toHaveBeenCalledTimes(1);
    expect(deps.salesCreate.mock.calls[0][0]).toMatchObject({
      metodoPago: 'EFECTIVO',
      webCodigo: 'VNT-AAAA',
    });
    expect(deps.salesCreate.mock.calls[0][1]).toBe('u-web');
    expect(del).toEqual(['VNT-AAAA']);
  });

  it('el size elegido en el catalogo va en la descripcion del item', async () => {
    const { service, deps } = crearService();
    mockFetch([ventaBase({ items: [{ sku: 'AN-001', cantidad: 1, precio: 3000, talla: '7' }] })]);

    await service.revisar();

    const items = deps.salesCreate.mock.calls[0][0].items;
    expect(items[0].descripcion).toBe('Anillo (Size 7)');
  });

  it('rechaza un size no-string o muy largo (cae como pedido pendiente)', async () => {
    const { service, deps } = crearService();
    mockFetch([ventaBase({ items: [{ sku: 'AN-001', cantidad: 1, precio: 3000, talla: 'x'.repeat(30) }] })]);

    await service.revisar();

    expect(deps.salesCreate).not.toHaveBeenCalled();
    expect(deps.crearDesdePendiente).toHaveBeenCalledTimes(1);
  });

  it('venta a credito sin cliente -> pedido pendiente y se borra del relevo', async () => {
    const { service, deps } = crearService();
    const del = mockFetch([ventaBase({ metodoPago: 'CREDITO', cliente: null })]);

    await service.revisar();

    expect(deps.salesCreate).not.toHaveBeenCalled();
    expect(deps.crearDesdePendiente).toHaveBeenCalledTimes(1);
    expect(del).toEqual(['VNT-AAAA']);
  });

  it('venta con mas de 30 productos -> pedido pendiente', async () => {
    const items = Array.from({ length: 31 }, (_, i) => ({
      sku: 'X-' + i,
      cantidad: 1,
      precio: 10,
    }));
    const { service, deps } = crearService();
    const del = mockFetch([ventaBase({ items })]);

    await service.revisar();

    expect(deps.salesCreate).not.toHaveBeenCalled();
    expect(deps.crearDesdePendiente).toHaveBeenCalledTimes(1);
    expect(del).toEqual(['VNT-AAAA']);
  });

  it('webCodigo duplicado (P2002) -> se salta y se borra del relevo', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const { service, deps } = crearService({ salesCreate: jest.fn().mockRejectedValue(p2002) });
    const del = mockFetch([ventaBase()]);

    await service.revisar();

    expect(deps.crearDesdePendiente).not.toHaveBeenCalled();
    expect(del).toEqual(['VNT-AAAA']);
  });

  it('error transitorio (create lanza Error) -> NO se borra del relevo', async () => {
    const { service, deps } = crearService({
      salesCreate: jest.fn().mockRejectedValue(new Error('DB no responde')),
    });
    const del = mockFetch([ventaBase()]);

    await service.revisar();

    expect(deps.crearDesdePendiente).not.toHaveBeenCalled();
    expect(del).toEqual([]);
  });

  it('sin stock (BadRequest de sales.create) -> pedido pendiente', async () => {
    const { service, deps } = crearService({
      salesCreate: jest.fn().mockRejectedValue(new BadRequestException('No hay stock suficiente.')),
    });
    const del = mockFetch([ventaBase()]);

    await service.revisar();

    expect(deps.crearDesdePendiente).toHaveBeenCalledTimes(1);
    expect(del).toEqual(['VNT-AAAA']);
  });

  it('tope diario alcanzado -> no procesa ninguna, no borra', async () => {
    const { service, deps } = crearService({ saleCount: jest.fn().mockResolvedValue(60) });
    const del = mockFetch([ventaBase(), ventaBase({}), ventaBase({})]);

    await service.revisar();

    expect(deps.salesCreate).not.toHaveBeenCalled();
    expect(del).toEqual([]);
  });

  it('mas de 15 ventas en un ciclo -> procesa 15', async () => {
    const muchas = Array.from({ length: 20 }, (_, i) => ({
      codigo: 'VNT-' + String(i).padStart(4, '0'),
      venta: { items: [{ sku: 'AN-001', cantidad: 1, precio: 3000 }], metodoPago: 'EFECTIVO' },
      creado: Date.now(),
    }));
    const { service, deps } = crearService();
    mockFetch(muchas);

    await service.revisar();

    expect(deps.salesCreate).toHaveBeenCalledTimes(15);
  });

  it('no hace nada si el relevo no esta configurado', async () => {
    const { service, deps } = crearService();
    (service as any).prisma.businessProfile.findFirst = jest.fn().mockResolvedValue({});
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    await service.revisar();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.salesCreate).not.toHaveBeenCalled();
  });
});
