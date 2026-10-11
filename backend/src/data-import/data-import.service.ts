import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { promises as fs, createReadStream, createWriteStream } from 'fs';
import { createGunzip } from 'zlib';
import { pipeline as pipelineCb } from 'stream';
import { promisify } from 'util';
import { exec } from 'child_process';
import { tmpdir } from 'os';
import { join, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { normalizarTexto } from '../common/texto.util';
import { ProductsService } from '../products/products.service';
import { AuditService } from '../audit/audit.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { StorageService } from '../invoices/storage.service';

const pipeline = promisify(pipelineCb);
const execAsync = promisify(exec);

export interface ProductoRenumerado {
  nombre: string;
  skuOriginal: string;
  skuNuevo: string;
}

export interface ResumenImportacion {
  total: number;
  agregados: number;
  renumerados: ProductoRenumerado[];
  omitidos: number;
  conFoto: number;
}

/**
 * Une el inventario de OTRA computadora (ej. la de mama) con el de esta,
 * a partir de un respaldo .sqlite.gz generado por Configuracion > Respaldos.
 *
 * Solo toca productos: clientes, ventas y facturas se quedan cada uno en su
 * propia computadora, tal como el negocio los usa hoy (no hay una sola caja
 * compartida entre ambas).
 *
 * Regla de oro, pedida explicitamente: esto NUNCA modifica una fila que ya
 * existia en la base de datos ACTUAL. Solo se insertan filas nuevas — las
 * que vienen del archivo importado, con su SKU tal cual si esta libre, o con
 * uno nuevo (siguiendo la secuencia de ESTA base) si ya estaba en uso.
 */
@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
    private readonly catalogo: CatalogoService,
    private readonly storage: StorageService,
  ) {}

  async importarProductos(
    buffer: Buffer,
    fotosBuffer: Buffer | undefined,
    userId?: string,
  ): Promise<ResumenImportacion> {
    const carpetaTemp = await fs.mkdtemp(join(tmpdir(), 'cafe-shopping-import-'));
    const rutaSqlite = join(carpetaTemp, 'origen.sqlite');
    let origen: PrismaClient | null = null;

    try {
      await this.prepararArchivo(buffer, rutaSqlite);
      const carpetaFotos = fotosBuffer ? await this.extraerFotos(carpetaTemp, fotosBuffer) : null;

      origen = new PrismaClient({ datasources: { db: { url: `file:${rutaSqlite}` } } });

      let productosOrigen: Array<{
        sku: string;
        nombre: string;
        precioUnitario: unknown;
        costoUnitario: unknown;
        material: string;
        stock: number;
        imageUrl: string | null;
      }>;
      try {
        productosOrigen = await origen.product.findMany({
          where: { activo: true },
          select: {
            sku: true,
            nombre: true,
            precioUnitario: true,
            costoUnitario: true,
            material: true,
            stock: true,
            imageUrl: true,
          },
        });
      } catch (error) {
        this.logger.warn(`No se pudo leer productos del archivo importado: ${error}`);
        throw new BadRequestException(
          'Ese archivo no parece un respaldo valido de Cafe Shopping (no se pudo leer su inventario).',
        );
      }

      // Categoria (la "etiqueta" de cada pieza) y tallas: se leen aparte para
      // que un respaldo de una version vieja, sin esas columnas, siga
      // importando el resto tal como antes en vez de rechazarse completo.
      const extrasPorSku = await this.leerCategoriasYTallas(origen);
      const categoriaPorNombre = new Map<string, string>();
      for (const c of await this.prisma.category.findMany({ select: { id: true, nombre: true } })) {
        categoriaPorNombre.set(normalizarTexto(c.nombre), c.id);
      }
      let categoriasCreadas = 0;

      const renumerados: ProductoRenumerado[] = [];
      let agregados = 0;
      let omitidos = 0;
      let conFoto = 0;

      // Secuencial (no Promise.all): generateSku calcula el siguiente
      // consecutivo mirando el ultimo SKU de ESTA base, y si dos inserciones
      // corrieran a la vez podrian calcular el mismo numero y chocar.
      for (const p of productosOrigen) {
        if (!p.sku?.trim() || !p.nombre?.trim()) {
          omitidos++;
          continue;
        }

        const existente = await this.prisma.product.findUnique({ where: { sku: p.sku } });
        const skuFinal = existente ? await this.products.generateSku(p.nombre) : p.sku;

        // La categoria viaja por NOMBRE, no por id (el id era de la otra
        // base). Si aqui ya existe una con ese nombre se reusa; si no, se
        // crea -- es una fila nueva, no toca nada de lo que ya habia.
        const extras = extrasPorSku.get(p.sku);
        let categoriaId: string | null = null;
        if (extras?.categoria) {
          const clave = normalizarTexto(extras.categoria);
          categoriaId = categoriaPorNombre.get(clave) ?? null;
          if (!categoriaId) {
            const nueva = await this.prisma.category.create({ data: { nombre: extras.categoria.trim() } });
            categoriaPorNombre.set(clave, nueva.id);
            categoriaId = nueva.id;
            categoriasCreadas++;
          }
        }

        const creado = await this.prisma.product.create({
          data: {
            sku: skuFinal,
            nombre: p.nombre,
            precioUnitario: p.precioUnitario as any,
            costoUnitario: p.costoUnitario as any,
            material: p.material,
            stock: p.stock,
            tallas: extras?.tallas ?? null,
            categoriaId,
            imageUrl: null,
            activo: true,
          },
        });

        if (carpetaFotos && p.imageUrl) {
          const imageUrl = await this.copiarFoto(carpetaFotos, p.imageUrl, creado.id);
          if (imageUrl) {
            await this.prisma.product.update({ where: { id: creado.id }, data: { imageUrl } });
            conFoto++;
          }
        }

        if (existente) {
          renumerados.push({ nombre: p.nombre, skuOriginal: p.sku, skuNuevo: skuFinal });
        } else {
          agregados++;
        }
      }

      await this.audit.log('Product', 'import', 'CREATE', userId, {
        total: productosOrigen.length,
        agregados,
        renumerados: renumerados.length,
        omitidos,
        conFoto,
        categoriasCreadas,
      });

      if (agregados + renumerados.length > 0) {
        try {
          await this.catalogo.generar();
        } catch (error) {
          this.logger.warn(`No se pudo actualizar el catalogo web tras la importacion: ${error}`);
        }
      }

      return { total: productosOrigen.length, agregados, renumerados, omitidos, conFoto };
    } finally {
      await origen?.$disconnect().catch(() => undefined);
      await fs.rm(carpetaTemp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Categoria (por nombre) y tallas de cada producto del archivo, indexadas
   * por SKU. Si el respaldo viene de una version vieja que no tenia esas
   * columnas/tabla, devuelve vacio: los productos se importan igual, sin
   * categoria ni tallas.
   */
  private async leerCategoriasYTallas(
    origen: PrismaClient,
  ): Promise<Map<string, { categoria: string | null; tallas: string | null }>> {
    const resultado = new Map<string, { categoria: string | null; tallas: string | null }>();
    try {
      const categorias = await origen.category.findMany({ select: { id: true, nombre: true } });
      const nombrePorId = new Map(categorias.map((c) => [c.id, c.nombre]));
      const productos = await origen.product.findMany({
        where: { activo: true },
        select: { sku: true, categoriaId: true, tallas: true },
      });
      for (const p of productos) {
        resultado.set(p.sku, {
          categoria: p.categoriaId ? (nombrePorId.get(p.categoriaId) ?? null) : null,
          tallas: p.tallas,
        });
      }
    } catch (error) {
      this.logger.warn(`El archivo importado no trae categorias/tallas legibles: ${error}`);
    }
    return resultado;
  }

  /**
   * Descomprime si hace falta (los respaldos de Configuracion salen en
   * .sqlite.gz) y valida que de verdad sea una base SQLite antes de abrirla,
   * igual que hace la restauracion de respaldos.
   */
  private async prepararArchivo(buffer: Buffer, destino: string): Promise<void> {
    const esGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

    if (esGzip) {
      const comprimido = join(destino, '..', 'origen.sqlite.gz');
      await fs.writeFile(comprimido, buffer);
      try {
        await pipeline(createReadStream(comprimido), createGunzip(), createWriteStream(destino));
      } catch (error) {
        throw new BadRequestException(
          'El archivo esta corrupto o no es un respaldo valido (no se pudo descomprimir).',
        );
      }
    } else {
      await fs.writeFile(destino, buffer);
    }

    const stat = await fs.stat(destino).catch(() => null);
    if (!stat || stat.size < 200) {
      throw new BadRequestException('El archivo esta vacio o corrupto.');
    }
    const cabecera = await fs
      .readFile(destino, { encoding: 'latin1', flag: 'r' })
      .then((c) => c.slice(0, 15));
    if (cabecera !== 'SQLite format 3') {
      throw new BadRequestException(
        'Ese archivo no parece un respaldo de base de datos. Sube el archivo .sqlite.gz que genera Configuracion > Respaldos automaticos en la otra computadora.',
      );
    }
  }

  /**
   * Extrae el .tar.gz de uploads de la otra computadora (el mismo que genera
   * Configuracion > Respaldos automaticos, junto al de la base de datos, con
   * el mismo sufijo de fecha) a una carpeta temporal, para poder buscar ahi
   * las fotos de los productos que se esten importando.
   *
   * Si algo falla (archivo corrupto, no es un .tar.gz, no hay "tar" en el
   * sistema) no se detiene la importacion completa: los productos se agregan
   * igual, simplemente sin foto, como si no se hubiera subido este archivo.
   */
  private async extraerFotos(carpetaTemp: string, buffer: Buffer): Promise<string | null> {
    const esGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    if (!esGzip) {
      this.logger.warn('El archivo de fotos no es un .tar.gz valido; se importa sin fotos.');
      return null;
    }

    const archivoTar = join(carpetaTemp, 'fotos.tar.gz');
    const carpetaExtraida = join(carpetaTemp, 'fotos-extraidas');
    await fs.writeFile(archivoTar, buffer);
    await fs.mkdir(carpetaExtraida, { recursive: true });

    try {
      await execAsync(`tar -xzf "${archivoTar}" -C "${carpetaExtraida}"`);
    } catch (error) {
      this.logger.warn(
        `No se pudo descomprimir el archivo de fotos; se importa sin fotos: ${error}`,
      );
      return null;
    }

    // El .tar.gz trae la carpeta de uploads como unico elemento de primer
    // nivel (se llame como se llame); hay que entrar ahi para llegar a las
    // subcarpetas tipo "products/...".
    const entradas = await fs.readdir(carpetaExtraida).catch(() => [] as string[]);
    return entradas.length === 1 ? join(carpetaExtraida, entradas[0]) : carpetaExtraida;
  }

  /**
   * Busca la foto de un producto importado dentro de la carpeta de uploads ya
   * extraida (con la misma ruta relativa que tenia su imageUrl alla) y la
   * vuelve a subir aqui bajo el id del producto NUEVO — el id original era de
   * la otra base de datos y no significa nada en esta.
   */
  private async copiarFoto(
    carpetaFotos: string,
    imageUrl: string,
    nuevoId: string,
  ): Promise<string | null> {
    const marca = '/uploads/';
    const idx = imageUrl.indexOf(marca);
    if (idx === -1) return null;
    const key = imageUrl.slice(idx + marca.length);

    const buffer = await fs.readFile(join(carpetaFotos, key)).catch(() => null);
    if (!buffer) return null;

    const ext = extname(key).replace('.', '') || 'webp';
    try {
      return await this.storage.upload(buffer, `products/${nuevoId}-${Date.now()}.${ext}`);
    } catch (error) {
      this.logger.warn(`No se pudo copiar la foto de un producto importado: ${error}`);
      return null;
    }
  }
}
