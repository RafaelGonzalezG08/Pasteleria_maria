import { BadRequestException, ConflictException } from '@nestjs/common';
import { WebOrdersRelayService } from './web-orders-relay.service';

/**
 * Antes, un pedido que fallara al crearse por CUALQUIER motivo (no solo por
 * ya existir) se borraba igual del relevo en Cloudflare: si el texto no se
 * podia interpretar (ej. la pagina del catalogo publicada quedo
 * desactualizada respecto al parser de este backend), el pedido desaparecia
 * para siempre sin dejar rastro. Esto fija que solo se borre cuando ya no
 * hace falta volver a verlo: se creo, o ya existia.
 */
function crearService(
  webOrdersCreate: jest.Mock,
  relevo = { relevoPedidosUrl: 'https://relevo.test', relevoPedidosClave: 'clave-secreta' },
) {
  const prisma = {
    businessProfile: { findFirst: jest.fn().mockResolvedValue(relevo) },
  };
  const webOrders = { create: webOrdersCreate };
  return new WebOrdersRelayService(prisma as any, webOrders as any);
}

function mockFetchConPedidos(pedidos: { codigo: string; texto: string; creado: number }[]) {
  const deleteCalls: string[] = [];
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      // GET /pedidos
      return { ok: true, json: async () => pedidos } as Response;
    }
    if (init.method === 'DELETE') {
      const codigo = decodeURIComponent(url.split('/pedidos/')[1]);
      deleteCalls.push(codigo);
      return { ok: true } as Response;
    }
    throw new Error(`fetch inesperado: ${url}`);
  });
  (global as any).fetch = fetchMock;
  return deleteCalls;
}

describe('WebOrdersRelayService.revisar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('borra del relevo un pedido creado con exito', async () => {
    const create = jest.fn().mockResolvedValue({ id: '1' });
    const deleteCalls = mockFetchConPedidos([
      { codigo: 'PED-AAAA', texto: 'x', creado: Date.now() },
    ]);
    const service = crearService(create);

    await service.revisar();

    expect(deleteCalls).toEqual(['PED-AAAA']);
  });

  it('borra del relevo un pedido duplicado (ya existia)', async () => {
    const create = jest.fn().mockRejectedValue(new ConflictException('ya existia'));
    const deleteCalls = mockFetchConPedidos([
      { codigo: 'PED-BBBB', texto: 'x', creado: Date.now() },
    ]);
    const service = crearService(create);

    await service.revisar();

    expect(deleteCalls).toEqual(['PED-BBBB']);
  });

  it('NO borra del relevo un pedido que no se pudo interpretar, para poder reintentarlo', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(
        new BadRequestException('No se reconoce ese texto como un pedido del catalogo.'),
      );
    const deleteCalls = mockFetchConPedidos([
      { codigo: 'PED-CCCC', texto: 'texto raro', creado: Date.now() },
    ]);
    const service = crearService(create);

    await service.revisar();

    expect(deleteCalls).toEqual([]);
  });

  it('NO borra del relevo ante un error inesperado (ej. base de datos caida)', async () => {
    const create = jest.fn().mockRejectedValue(new Error('DB no responde'));
    const deleteCalls = mockFetchConPedidos([
      { codigo: 'PED-DDDD', texto: 'x', creado: Date.now() },
    ]);
    const service = crearService(create);

    await service.revisar();

    expect(deleteCalls).toEqual([]);
  });

  it('no hace nada si el relevo no esta configurado', async () => {
    const create = jest.fn();
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    const service = crearService(create, { relevoPedidosUrl: '', relevoPedidosClave: '' } as any);

    await service.revisar();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
