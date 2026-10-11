import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CatalogoService } from './catalogo.service';

/**
 * Publicacion automatica del catalogo a Cloudflare Pages. Solo se sube si
 * estan puestos el token, el account id y el proyecto, y solo si el
 * contenido visible cambio (una venta que baja el stock de 5 a 4 no cambia
 * nada -> no se sube). Un fallo de Cloudflare NUNCA rompe la generacion.
 */
function crearService(perfilExtra: Record<string, unknown> = {}) {
  const prisma = {
    businessProfile: {
      findFirst: jest.fn().mockResolvedValue({
        nombre: 'Cafe Shopping',
        telefonoWhatsapp: '18095551234',
        logoUrl: null,
        descripcionWeb: '',
        direccion: '',
        relevoPedidosUrl: null,
        cloudflareApiToken: null,
        cloudflareAccountId: null,
        cloudflarePagesProject: null,
        ...perfilExtra,
      }),
    },
    product: {
      findMany: jest.fn().mockResolvedValue([
        {
          sku: 'AN-001',
          nombre: 'Anillo',
          precioUnitario: 1000,
          imageUrl: 'https://ejemplo.test/anillo.jpg',
          material: 'PLATA',
          categoriaId: null,
          tallas: null,
        },
      ]),
    },
    category: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return new CatalogoService(prisma as any);
}

/** Simula las 5 llamadas de la API de Cloudflare Pages, en el orden que sea. */
function mockFetchCloudflare(
  opts: {
    jwtStatus?: number;
    checkMissingStatus?: number;
    uploadStatus?: number;
    deployStatus?: number;
    deployUrl?: string;
  } = {},
) {
  const llamadas: string[] = [];
  const fn = jest.fn(async (url: string, init?: RequestInit) => {
    llamadas.push(url);
    const errorJson = async () => ({ errors: [{ message: 'fallo de prueba' }] });

    if (url.includes('/upload-token')) {
      if (opts.jwtStatus) return { ok: false, status: opts.jwtStatus, json: errorJson } as Response;
      return { ok: true, json: async () => ({ result: { jwt: 'jwt-de-prueba' } }) } as Response;
    }
    if (url.endsWith('/pages/assets/check-missing')) {
      if (opts.checkMissingStatus) {
        return { ok: false, status: opts.checkMissingStatus, json: errorJson } as Response;
      }
      const body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ result: body.hashes }) } as Response;
    }
    if (url.endsWith('/pages/assets/upload')) {
      if (opts.uploadStatus) return { ok: false, status: opts.uploadStatus, json: errorJson } as Response;
      return { ok: true, json: async () => ({ result: null }) } as Response;
    }
    if (url.endsWith('/pages/assets/upsert-hashes')) {
      return { ok: true, json: async () => ({ result: null }) } as Response;
    }
    if (url.endsWith('/deployments')) {
      if (opts.deployStatus) return { ok: false, status: opts.deployStatus, json: errorJson } as Response;
      return {
        ok: true,
        json: async () => ({ result: { url: opts.deployUrl ?? 'https://mi-catalogo.pages.dev' } }),
      } as Response;
    }
    throw new Error('fetch inesperado en el test: ' + url);
  });
  return { fn, llamadas };
}

describe('CatalogoService — publicacion a Cloudflare Pages', () => {
  let carpeta: string;

  beforeEach(async () => {
    carpeta = join(tmpdir(), `catalogo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.CATALOGO_DIR = carpeta;
  });

  afterEach(async () => {
    delete process.env.CATALOGO_DIR;
    await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
    jest.restoreAllMocks();
  });

  it('sin token/cuenta/proyecto: no llama a Cloudflare', async () => {
    const { fn } = mockFetchCloudflare();
    (global as any).fetch = fn;
    const service = crearService();

    const r = await service.generar();

    expect(r.ok).toBe(true);
    expect(r.cloudflare).toBe('sin-configurar');
    expect(fn).not.toHaveBeenCalled();
  });

  it('con credenciales y contenido nuevo: hace las 5 llamadas y marca "publicado"', async () => {
    const { fn, llamadas } = mockFetchCloudflare();
    (global as any).fetch = fn;
    const service = crearService({
      cloudflareApiToken: 'token-cuenta',
      cloudflareAccountId: 'cuenta-1',
      cloudflarePagesProject: 'mi-catalogo',
    });

    const r = await service.generar();

    expect(r.cloudflare).toBe('publicado');
    expect(r.cloudflareUrl).toBe('https://mi-catalogo.pages.dev');
    expect(llamadas.some((u) => u.includes('/upload-token'))).toBe(true);
    expect(llamadas.some((u) => u.endsWith('/pages/assets/check-missing'))).toBe(true);
    expect(llamadas.some((u) => u.endsWith('/pages/assets/upload'))).toBe(true);
    expect(llamadas.some((u) => u.endsWith('/deployments'))).toBe(true);

    // El upload-token y el deployment van con el token de la cuenta.
    const llamadaJwt = fn.mock.calls.find(([u]) => String(u).includes('/upload-token'))!;
    expect((llamadaJwt[1] as any).headers.Authorization).toBe('Bearer token-cuenta');
    const llamadaDeploy = fn.mock.calls.find(([u]) => String(u).endsWith('/deployments'))!;
    expect((llamadaDeploy[1] as any).headers.Authorization).toBe('Bearer token-cuenta');
  });

  it('segunda generacion sin cambios: no vuelve a llamar a Cloudflare', async () => {
    const { fn } = mockFetchCloudflare();
    (global as any).fetch = fn;
    const service = crearService({
      cloudflareApiToken: 'token-cuenta',
      cloudflareAccountId: 'cuenta-1',
      cloudflarePagesProject: 'mi-catalogo',
    });

    await service.generar();
    const llamadasTrasPrimeraVez = fn.mock.calls.length;
    const r2 = await service.generar();

    expect(r2.cloudflare).toBe('sin-cambios');
    expect(fn.mock.calls.length).toBe(llamadasTrasPrimeraVez);
  });

  it('forzarPublicacion sube aunque no haya cambios (boton manual)', async () => {
    const { fn } = mockFetchCloudflare();
    (global as any).fetch = fn;
    const service = crearService({
      cloudflareApiToken: 'token-cuenta',
      cloudflareAccountId: 'cuenta-1',
      cloudflarePagesProject: 'mi-catalogo',
    });

    await service.generar();
    const llamadasTrasPrimeraVez = fn.mock.calls.length;
    const r2 = await service.generar(true);

    expect(r2.cloudflare).toBe('publicado');
    expect(fn.mock.calls.length).toBeGreaterThan(llamadasTrasPrimeraVez);
  });

  it('Cloudflare responde 401 al pedir el token de subida: marca "error" pero la generacion sigue OK', async () => {
    const { fn } = mockFetchCloudflare({ jwtStatus: 401 });
    (global as any).fetch = fn;
    const service = crearService({
      cloudflareApiToken: 'token-malo',
      cloudflareAccountId: 'cuenta-1',
      cloudflarePagesProject: 'mi-catalogo',
    });

    const r = await service.generar();

    expect(r.ok).toBe(true);
    expect(r.cloudflare).toBe('error');
    expect(r.cloudflareError).toContain('token');
  });

  it('Cloudflare responde 500 al crear el despliegue: marca "error" con el detalle', async () => {
    const { fn } = mockFetchCloudflare({ deployStatus: 500 });
    (global as any).fetch = fn;
    const service = crearService({
      cloudflareApiToken: 'token-cuenta',
      cloudflareAccountId: 'cuenta-1',
      cloudflarePagesProject: 'mi-catalogo',
    });

    const r = await service.generar();

    expect(r.cloudflare).toBe('error');
    expect(r.cloudflareError).toContain('despliegue');
  });
});
