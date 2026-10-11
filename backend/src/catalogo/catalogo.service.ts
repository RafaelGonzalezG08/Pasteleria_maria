import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { join, basename, extname, relative, sep } from 'path';
import { hash as blake3Hash, load as blake3Load } from 'blake3-wasm';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR } from '../common/paths';
import { generarHtml, DatosCatalogo, ProductoCatalogo } from './plantilla';
import { MATERIAL_LABEL, Material } from '../common/enums';

/** products.tallas se guarda como texto JSON (SQLite no tiene tipo Json). */
function parsearTallas(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

const MIME_POR_EXTENSION: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};
function mimeDeExtension(extension: string): string {
  return MIME_POR_EXTENSION[extension.toLowerCase()] ?? 'application/octet-stream';
}

export interface ResultadoGenerar {
  ok: boolean;
  carpeta?: string;
  productos?: number;
  /** Piezas que quedaron fuera y por que, para que el negocio pueda completarlas. */
  excluidasSinFoto?: number;
  excluidasSinPrecio?: number;
  error?: string;
  /**
   * Resultado de la publicacion automatica a Cloudflare Pages:
   *  - 'sin-configurar': no hay token/cuenta/proyecto de Cloudflare puestos (se sube a mano).
   *  - 'sin-cambios': Cloudflare configurado pero el catalogo no cambio nada visible.
   *  - 'publicado': se subio a Cloudflare y ya esta en linea.
   *  - 'error': se intento subir y fallo (ver cloudflareError).
   */
  cloudflare?: 'sin-configurar' | 'sin-cambios' | 'publicado' | 'error';
  cloudflareUrl?: string;
  cloudflareError?: string;
}

/**
 * Genera el catalogo publico como un sitio estatico listo para subir.
 *
 * Por que estatico y no un servidor: el negocio no paga hosting ni mantiene
 * nada, el sitio no puede caerse por un fallo del programa, y no hay ninguna
 * base de datos en internet que pueda filtrarse. Los pedidos llegan por
 * WhatsApp, que es el canal que el negocio ya usa a diario.
 *
 * Lo que se publica y lo que no:
 *  - Solo productos ACTIVOS y CON EXISTENCIA. Mostrar piezas agotadas
 *    genera conversaciones de "ya no lo tengo" que desgastan al cliente.
 *  - Nunca el costo de adquisicion ni el margen: son datos internos.
 *  - Nunca clientes, ventas ni deudas.
 */
@Injectable()
export class CatalogoService {
  private readonly logger = new Logger(CatalogoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Carpeta donde se deja el sitio listo para subir. */
  private carpetaSalida(): string {
    // Documentos del usuario: un lugar que la persona sabe encontrar, y que
    // no desaparece al actualizar el programa.
    const documentos =
      process.env.CATALOGO_DIR ||
      join(process.env.USERPROFILE || process.cwd(), 'Documents', 'Catalogo Cafe Shopping');

    // Red de seguridad: mas abajo se hace `fs.rm(carpeta, { recursive: true })`
    // sobre esto. Si CATALOGO_DIR quedara mal puesto (ej. la carpeta Documentos
    // entera, o "C:\") se borraria algo que no es. Se exige que el ultimo tramo
    // de la ruta nombre al catalogo.
    const ultimoTramo = basename(documentos).toLowerCase();
    if (!ultimoTramo.includes('catalogo') && !ultimoTramo.includes('catálogo')) {
      throw new Error(
        `La carpeta del catalogo (${documentos}) no parece una carpeta del catalogo. ` +
          `Ajusta CATALOGO_DIR: su ultimo tramo debe contener "Catalogo".`,
      );
    }
    return documentos;
  }

  private ejecucionActual: Promise<ResultadoGenerar> | null = null;
  private hayPendiente = false;
  /**
   * Hash del ultimo index.html publicado en Cloudflare. Si una regeneracion
   * produce el mismo HTML (ej. una venta que baja el stock de 5 a 4 no cambia
   * nada visible), no se vuelve a subir. Vive en memoria: tras reiniciar la
   * app se hace una subida de mas, y ya.
   */
  private ultimoHashPublicado: string | null = null;
  /** blake3-wasm necesita cargar su WebAssembly una vez antes de poder hashear. */
  private blake3Listo: Promise<void> | null = null;
  private async asegurarBlake3(): Promise<void> {
    if (!this.blake3Listo) this.blake3Listo = blake3Load();
    await this.blake3Listo;
  }

  /**
   * Punto de entrada publico: serializa las generaciones para que nunca
   * corran dos a la vez.
   *
   * Hace falta porque `generar()` borra la carpeta de salida y la vuelve a
   * escribir completa. Como ahora se dispara solo despues de cada cambio en
   * un producto (ver ProductsService), editar varias piezas seguidas lanzaba
   * varias generaciones en paralelo que se pisaban entre si — una borraba lo
   * que la otra estaba escribiendo a medio camino. Se detecto probando esto
   * mismo: 11 ediciones seguidas dejaron el sitio con 10 piezas y una con el
   * material de la corrida anterior.
   *
   * Si llega una peticion mientras otra esta corriendo, no se lanza una
   * segunda: se marca "pendiente" y, al terminar la actual, se corre UNA vez
   * mas (no una por cada peticion que llego en el medio) para que los
   * cambios que se cruzaron con la corrida en curso queden reflejados
   * igual, sin acumular trabajo de mas.
   */
  async generar(forzarPublicacion = false): Promise<ResultadoGenerar> {
    if (this.ejecucionActual) {
      this.hayPendiente = true;
      return this.ejecucionActual;
    }

    this.ejecucionActual = this.generarInterno(forzarPublicacion);
    try {
      return await this.ejecucionActual;
    } finally {
      this.ejecucionActual = null;
      if (this.hayPendiente) {
        this.hayPendiente = false;
        // La corrida que se acumulo mientras esta trabajaba es automatica
        // (una venta, un cambio de producto): nunca fuerza publicacion.
        void this.generar(false);
      }
    }
  }

  private async generarInterno(forzarPublicacion = false): Promise<ResultadoGenerar> {
    const perfil = await this.prisma.businessProfile.findFirst();

    if (!perfil?.telefonoWhatsapp?.trim()) {
      return {
        ok: false,
        error:
          'Falta el telefono de WhatsApp para pedidos. Ponlo en Configuracion > Datos del negocio ' +
          'antes de publicar: sin el, los clientes no tendrian como enviarte el pedido.',
      };
    }

    const candidatos = await this.prisma.product.findMany({
      where: { activo: true, stock: { gt: 0 } },
      orderBy: { nombre: 'asc' },
      // Se eligen los campos uno a uno para que el costo NUNCA pueda salir
      // publicado por descuido al agregar columnas nuevas al producto.
      select: {
        sku: true,
        nombre: true,
        precioUnitario: true,
        imageUrl: true,
        material: true,
        categoriaId: true,
        tallas: true,
      },
    });

    // categoriaId no es una relacion real de Prisma (ver schema.prisma), asi
    // que se resuelve el nombre aparte, con una sola consulta para todas las
    // piezas en vez de una por cada una.
    const categorias = await this.prisma.category.findMany({ select: { id: true, nombre: true } });
    const nombreCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));

    // Una pieza sin precio saldria como "RD$ 0.00", que parece un error del
    // sitio o una ganga; y una sin foto no aporta nada en un catalogo cuyo
    // proposito es que la gente VEA la joya. Se dejan fuera y se informa
    // cuantas, para que el negocio sepa que le falta por completar.
    const sinPrecio = candidatos.filter((p) => Number(p.precioUnitario) <= 0);
    const conPrecio = candidatos.filter((p) => Number(p.precioUnitario) > 0);
    const sinFoto = conPrecio.filter((p) => !p.imageUrl);
    const productos = conPrecio.filter((p) => p.imageUrl);

    if (productos.length === 0) {
      return {
        ok: false,
        error:
          `Ninguna pieza esta lista para publicar. Del inventario activo con existencia, ` +
          `${sinFoto.length} no tienen foto y ${sinPrecio.length} no tienen precio. ` +
          `El catalogo necesita al menos una pieza con foto y precio.`,
      };
    }

    const carpeta = this.carpetaSalida();
    const carpetaFotos = join(carpeta, 'fotos');
    await fs.rm(carpeta, { recursive: true, force: true });
    await fs.mkdir(carpetaFotos, { recursive: true });

    const items: ProductoCatalogo[] = [];
    for (const p of productos) {
      items.push({
        sku: p.sku,
        nombre: p.nombre,
        precio: Number(p.precioUnitario),
        imagen: await this.copiarFoto(p.imageUrl, carpetaFotos),
        // Se manda ya traducido ("Plata" en vez de "PLATA"): la pagina no
        // conoce las constantes del backend, solo lo que va a mostrar.
        material: MATERIAL_LABEL[(p.material as Material) ?? 'OTRO'] ?? MATERIAL_LABEL.OTRO,
        categoria: p.categoriaId ? (nombreCategoria.get(p.categoriaId) ?? null) : null,
        tallas: parsearTallas(p.tallas),
      });
    }

    const logo = await this.copiarFoto(perfil.logoUrl, carpetaFotos);

    const datos: DatosCatalogo = {
      negocio: perfil.nombre,
      descripcion: perfil.descripcionWeb ?? '',
      direccion: perfil.direccion ?? '',
      telefonoWhatsapp: perfil.telefonoWhatsapp,
      logo,
      productos: items,
      generado: new Date().toLocaleDateString('es-DO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      relevoUrl: perfil.relevoPedidosUrl?.trim() || undefined,
    };

    const html = generarHtml(datos);
    await fs.writeFile(join(carpeta, 'index.html'), html, 'utf8');

    this.logger.log(
      `Catalogo generado con ${items.length} piezas en ${carpeta} ` +
        `(${sinFoto.length} sin foto y ${sinPrecio.length} sin precio quedaron fuera)`,
    );

    const resultado: ResultadoGenerar = {
      ok: true,
      carpeta,
      productos: items.length,
      excluidasSinFoto: sinFoto.length,
      excluidasSinPrecio: sinPrecio.length,
    };

    // Publicacion automatica a Cloudflare Pages (si esta configurada). Nunca
    // tumba la generacion: si falla, el folder queda listo para subir a mano.
    const token = perfil.cloudflareApiToken?.trim();
    const accountId = perfil.cloudflareAccountId?.trim();
    const proyecto = perfil.cloudflarePagesProject?.trim();
    if (!token || !accountId || !proyecto) {
      resultado.cloudflare = 'sin-configurar';
    } else {
      const hash = createHash('sha1').update(html).digest('hex');
      if (!forzarPublicacion && hash === this.ultimoHashPublicado) {
        resultado.cloudflare = 'sin-cambios';
      } else {
        const pub = await this.publicarEnCloudflarePages(carpeta, token, accountId, proyecto);
        if (pub.ok) {
          this.ultimoHashPublicado = hash;
          resultado.cloudflare = 'publicado';
          resultado.cloudflareUrl = pub.url;
          this.logger.log(`Catalogo publicado en Cloudflare Pages: ${pub.url ?? '(sin URL)'}`);
        } else {
          resultado.cloudflare = 'error';
          resultado.cloudflareError = pub.error;
          this.logger.warn(`No se pudo publicar el catalogo en Cloudflare Pages: ${pub.error}`);
        }
      }
    }

    return resultado;
  }

  /** Todos los archivos del sitio generado, con su ruta absoluta. */
  private async listarArchivos(carpeta: string): Promise<string[]> {
    const resultado: string[] = [];
    const recorrer = async (dir: string): Promise<void> => {
      const entradas = await fs.readdir(dir, { withFileTypes: true });
      for (const entrada of entradas) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) await recorrer(ruta);
        else resultado.push(ruta);
      }
    };
    await recorrer(carpeta);
    return resultado;
  }

  /**
   * Sube el folder del catalogo a Cloudflare Pages por su API de "direct
   * upload" (lo mismo que hace `wrangler pages deploy`, pero sin instalar
   * wrangler: el catalogo es chico, unos pocos archivos, asi que se hace a
   * mano con fetch en un solo paso en vez del sistema de baldes/reintentos
   * que usa wrangler para sitios grandes).
   *
   * Son 5 llamadas encadenadas (asi funciona la API de Cloudflare):
   *  1. Pedir un token de subida (con el token de la cuenta).
   *  2. Preguntar cuales fotos ya estan subidas de una vez anterior (por su
   *     hash) para no volver a mandarlas si no cambiaron.
   *  3. Subir las que faltan.
   *  4. Confirmar los hashes subidos (mejor esfuerzo).
   *  5. Crear el despliegue, indicando que archivo (ruta) es cada hash.
   */
  private async publicarEnCloudflarePages(
    carpeta: string,
    apiToken: string,
    accountId: string,
    proyecto: string,
  ): Promise<{ ok: boolean; url?: string; error?: string }> {
    const base = 'https://api.cloudflare.com/client/v4';
    const headersCuenta = { Authorization: `Bearer ${apiToken}` };

    const leerError = async (respuesta: Response): Promise<string> => {
      try {
        const cuerpo = (await respuesta.json()) as { errors?: { message?: string }[] };
        return cuerpo.errors?.[0]?.message || `respondio ${respuesta.status}`;
      } catch {
        return `respondio ${respuesta.status}`;
      }
    };

    try {
      await this.asegurarBlake3();

      const rutas = await this.listarArchivos(carpeta);
      const archivos = await Promise.all(
        rutas.map(async (ruta) => {
          const contenido = await fs.readFile(ruta);
          const base64 = contenido.toString('base64');
          // El hash de Cloudflare Pages es blake3(base64Contenido + extension),
          // igual que hace wrangler — hay que replicarlo exacto o el manifest
          // no coincide con lo subido.
          const extension = extname(ruta).slice(1);
          const hash = blake3Hash(base64 + extension).toString('hex').slice(0, 32);
          const relativa = '/' + relative(carpeta, ruta).split(sep).join('/');
          return { relativa, hash, base64, contentType: mimeDeExtension(extension) };
        }),
      );

      if (archivos.length === 0) {
        return { ok: false, error: 'El catalogo no tiene archivos que publicar.' };
      }

      // 1) Token de subida (JWT de corta duracion, distinto del token de la cuenta).
      const respJwt = await fetch(
        `${base}/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(proyecto)}/upload-token`,
        { headers: headersCuenta, signal: AbortSignal.timeout(30_000) },
      );
      if (!respJwt.ok) {
        if (respJwt.status === 401 || respJwt.status === 403) {
          return { ok: false, error: 'El token de Cloudflare no es valido o no tiene permiso sobre Pages.' };
        }
        if (respJwt.status === 404) {
          return {
            ok: false,
            error: 'No se encontro ese proyecto de Cloudflare Pages (revisa el nombre y el Account ID).',
          };
        }
        return { ok: false, error: `Cloudflare no dio el token de subida (${await leerError(respJwt)}).` };
      }
      const jwt = ((await respJwt.json()) as { result?: { jwt?: string } }).result?.jwt;
      if (!jwt) return { ok: false, error: 'Cloudflare no devolvio un token de subida valido.' };

      const headersSubida = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

      // 2) Cuales fotos ya estan (no volver a mandar las que no cambiaron).
      const respFaltan = await fetch(`${base}/pages/assets/check-missing`, {
        method: 'POST',
        headers: headersSubida,
        body: JSON.stringify({ hashes: archivos.map((a) => a.hash) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!respFaltan.ok) {
        return { ok: false, error: `Cloudflare no pudo revisar los archivos (${await leerError(respFaltan)}).` };
      }
      const faltantes = ((await respFaltan.json()) as { result?: string[] }).result ?? [];

      // 3) Subir lo que falta. El catalogo es chico (una pagina + unas
      // fotos): todo en una sola tanda, sin el sistema de baldes de wrangler.
      const porSubir = archivos.filter((a) => faltantes.includes(a.hash));
      if (porSubir.length > 0) {
        const respSubida = await fetch(`${base}/pages/assets/upload`, {
          method: 'POST',
          headers: headersSubida,
          body: JSON.stringify(
            porSubir.map((a) => ({
              key: a.hash,
              value: a.base64,
              metadata: { contentType: a.contentType },
              base64: true,
            })),
          ),
          signal: AbortSignal.timeout(120_000),
        });
        if (!respSubida.ok) {
          return { ok: false, error: `Cloudflare no acepto los archivos (${await leerError(respSubida)}).` };
        }
      }

      // 4) Confirmar los hashes (mejor esfuerzo: si falla, la proxima
      // publicacion simplemente vuelve a subir de mas, nada se rompe).
      await fetch(`${base}/pages/assets/upsert-hashes`, {
        method: 'POST',
        headers: headersSubida,
        body: JSON.stringify({ hashes: archivos.map((a) => a.hash) }),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => {});

      // 5) Crear el despliegue: un manifest de "ruta -> hash", con el token
      // de la cuenta (no el jwt de subida).
      const manifest: Record<string, string> = {};
      for (const a of archivos) manifest[a.relativa] = a.hash;

      const formulario = new FormData();
      formulario.append('manifest', JSON.stringify(manifest));

      const respDeploy = await fetch(
        `${base}/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(proyecto)}/deployments`,
        { method: 'POST', headers: headersCuenta, body: formulario, signal: AbortSignal.timeout(60_000) },
      );
      if (!respDeploy.ok) {
        return { ok: false, error: `Cloudflare no acepto el despliegue (${await leerError(respDeploy)}).` };
      }
      const cuerpoDeploy = (await respDeploy.json()) as { result?: { url?: string; aliases?: string[] } };
      const url = cuerpoDeploy.result?.url || cuerpoDeploy.result?.aliases?.[0] || `https://${proyecto}.pages.dev`;

      return { ok: true, url };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `No se pudo contactar a Cloudflare (${msg}).` };
    }
  }

  /**
   * Copia una foto al sitio y devuelve su ruta relativa.
   *
   * Las fotos viven en la carpeta de datos del programa, que no es publica.
   * El sitio necesita su propia copia al lado del HTML para poder subirse
   * como un bloque a cualquier hosting.
   */
  private async copiarFoto(url: string | null, destino: string): Promise<string | null> {
    if (!url) return null;

    // Si ya es una direccion de internet (almacenamiento en la nube), se usa
    // tal cual: no hay nada que copiar.
    if (/^https?:\/\//i.test(url)) return url;

    const relativa = url.replace(/^\/uploads\//, '');
    const origen = join(UPLOADS_DIR, relativa);
    const nombre = basename(relativa);

    try {
      await fs.copyFile(origen, join(destino, nombre));
      return `fotos/${nombre}`;
    } catch {
      // Foto perdida (borrada a mano, respaldo incompleto): la pieza sale sin
      // imagen en vez de romper la generacion completa.
      this.logger.warn(`No se encontro la foto ${origen}; la pieza saldra sin imagen.`);
      return null;
    }
  }
}
