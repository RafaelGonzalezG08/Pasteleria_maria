import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../invoices/storage.service';
import { optimizeProductImage } from '../common/image.util';
import { CatalogoService } from '../catalogo/catalogo.service';
import { UPLOADS_DIR } from '../common/paths';
import { MATERIAL_LABEL, Material } from '../common/enums';
import { normalizarTexto, primeraPalabraNormalizada } from '../common/texto.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

export interface GrupoDuplicado {
  nombre: string;
  precioUnitario: number;
  tamanoFotoBytes: number;
  mantiene: { id: string; sku: string };
  elimina: { id: string; sku: string }[];
}

export interface VistaPreviaLimpieza {
  grupos: GrupoDuplicado[];
  sinFoto: { id: string; sku: string; nombre: string }[];
  totalABaja: number;
}

export interface VistaPreviaEliminarDuplicados {
  grupos: GrupoDuplicado[];
  totalEliminables: number;
  omitidosPorVentas: { id: string; sku: string; nombre: string }[];
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly catalogo: CatalogoService,
  ) {}

  /**
   * Vuelve a generar el sitio del catalogo despues de un cambio en el
   * inventario (precio, foto, stock, alta o baja), para que quien lo suba a
   * Netlify siempre tenga la version mas reciente sin tener que acordarse de
   * pulsar "Publicar catalogo" cada vez.
   *
   * Sin `await` en quien la llama: regenerar no debe demorar la respuesta al
   * cajero que esta guardando una pieza, y el propio metodo atrapa cualquier
   * error para que un fallo aqui (por ejemplo, si aun no se configuro el
   * telefono de WhatsApp del catalogo) nunca tumbe el guardado del producto.
   */
  private async regenerarCatalogo(): Promise<void> {
    try {
      const resultado = await this.catalogo.generar();
      if (!resultado.ok) {
        this.logger.warn(`No se pudo actualizar el catalogo web: ${resultado.error}`);
      }
    } catch (error) {
      this.logger.warn(`No se pudo actualizar el catalogo web: ${error}`);
    }
  }

  /**
   * Filas para exportar el inventario a Excel. Sin fotos: son binario, no
   * tienen sentido en una hoja de calculo. El costo solo se incluye para
   * ADMIN, igual que en la lista normal (stripCostForNonAdmin en el
   * controller) - es el margen del negocio.
   */
  async filasParaExportar(onlyActive: boolean, incluirCosto: boolean) {
    const productos = await this.prisma.product.findMany({
      where: onlyActive ? { activo: true } : undefined,
      orderBy: { nombre: 'asc' },
      include: { categoria: { select: { nombre: true } } },
    });

    return productos.map((p) => ({
      SKU: p.sku,
      Nombre: p.nombre,
      Categoria: p.categoria?.nombre ?? '',
      Material: MATERIAL_LABEL[p.material as Material] ?? p.material,
      Precio: Number(p.precioUnitario),
      ...(incluirCosto ? { Costo: Number(p.costoUnitario) } : {}),
      Stock: p.stock,
      Sizes: this.tallasDeTexto(p.tallas).join(', '),
      Estado: p.activo ? 'Activo' : 'Dado de baja',
    }));
  }

  /**
   * Deja las tallas listas para guardar: recorta espacios, quita repetidas
   * (sin importar mayusculas), respeta el orden en que las escribio el negocio
   * y corta en 40. Se guarda como texto JSON (SQLite no tiene tipo Json).
   */
  private normalizarTallas(tallas: string[]): string[] {
    const vistas = new Set<string>();
    const limpias: string[] = [];
    for (const t of tallas) {
      const v = String(t ?? '').trim();
      const clave = v.toLowerCase();
      if (v && !vistas.has(clave)) {
        vistas.add(clave);
        limpias.push(v);
      }
    }
    return limpias.slice(0, 40);
  }

  private tallasDeTexto(raw: string | null): string[] {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }

  /** Producto tal como lo espera el frontend: `tallas` como arreglo, no texto. */
  private conTallas<P extends { tallas: string | null }>(p: P): Omit<P, 'tallas'> & { tallas: string[] } {
    return { ...p, tallas: this.tallasDeTexto(p.tallas) };
  }

  /** Datos para Prisma: si el dto trae `tallas`, se serializa a texto JSON. */
  private datosConTallas<T extends { tallas?: string[] }>(dto: T): Omit<T, 'tallas'> & { tallas?: string } {
    const { tallas, ...resto } = dto;
    if (tallas === undefined) return resto as Omit<T, 'tallas'> & { tallas?: string };
    return { ...resto, tallas: JSON.stringify(this.normalizarTallas(tallas)) } as Omit<T, 'tallas'> & {
      tallas?: string;
    };
  }

  async findAll(onlyActive = true) {
    const productos = await this.prisma.product.findMany({
      where: onlyActive ? { activo: true } : undefined,
      orderBy: { nombre: 'asc' },
    });
    return productos.map((p) => this.conTallas(p));
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return this.conTallas(product);
  }

  async create(dto: CreateProductDto, userId?: string) {
    const sku = dto.sku?.trim() || (await this.generateSku(dto.nombre));

    const existing = await this.prisma.product.findUnique({ where: { sku } });
    if (existing) throw new ConflictException('Ya existe un producto con ese SKU.');

    const categoriaId = await this.clasificarCategoria(dto.nombre);
    const product = await this.prisma.product.create({
      data: { ...this.datosConTallas(dto), sku, categoriaId },
    });
    await this.audit.log('Product', product.id, 'CREATE', userId, { ...dto, sku } as any);
    void this.regenerarCatalogo();
    return this.conTallas(product);
  }

  /**
   * Clasifica automaticamente una pieza segun la primera palabra de su
   * nombre: si coincide EXACTO (sin importar mayusculas ni acentos) con
   * alguna categoria ya creada, esa es su categoria. Si no coincide con
   * ninguna, queda sin categoria — nunca se inventa una nueva sola.
   */
  private async clasificarCategoria(nombre: string): Promise<string | null> {
    const palabra = primeraPalabraNormalizada(nombre);
    if (!palabra) return null;

    const categorias = await this.prisma.category.findMany({ select: { id: true, nombre: true } });
    const encontrada = categorias.find((c) => normalizarTexto(c.nombre) === palabra);
    return encontrada?.id ?? null;
  }

  /**
   * Al crear una categoria nueva: mete en ella todas las piezas cuya primera
   * palabra coincida (misma regla que clasificarCategoria). Sirve cuando el
   * inventario ya existia antes de crear la categoria. Devuelve cuantas
   * piezas se movieron.
   */
  async clasificarExistentesEn(categoriaId: string, nombreCategoria: string): Promise<number> {
    const objetivo = normalizarTexto(nombreCategoria);
    if (!objetivo) return 0;

    const productos = await this.prisma.product.findMany({ select: { id: true, nombre: true } });
    const ids = productos
      .filter((p) => primeraPalabraNormalizada(p.nombre) === objetivo)
      .map((p) => p.id);
    if (ids.length === 0) return 0;

    await this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { categoriaId },
    });
    void this.regenerarCatalogo();
    return ids.length;
  }

  /**
   * Genera un SKU tipo "AN-0001": las 2 primeras letras del nombre (sin
   * acentos, en mayusculas) mas un consecutivo de 4 digitos, calculado a
   * partir del mayor numero entre los SKU existentes con ese mismo prefijo.
   *
   * Se calcula en codigo sobre TODOS los del prefijo, no con
   * `orderBy: sku desc` + tomar el primero: eso compara como texto, y un SKU
   * de 3 digitos (ej. "AN-002", de datos viejos o importados de otra
   * computadora) ordena DESPUES que uno de 4 (ej. "AN-0003") porque '2' > '0'
   * como caracter. El siguiente consecutivo salia repetido y la creacion
   * fallaba por SKU duplicado.
   */
  async generateSku(nombre: string): Promise<string> {
    const soloLetras = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // quita acentos (á -> a)
      .replace(/[^a-zA-Z]/g, '');
    const prefix = (soloLetras.slice(0, 2) || 'PR').toUpperCase();

    const candidatos = await this.prisma.product.findMany({
      where: { sku: { startsWith: `${prefix}-` } },
      select: { sku: true },
    });

    let nextNumber = 1;
    for (const c of candidatos) {
      const match = c.sku.match(/-(\d+)$/);
      if (match) nextNumber = Math.max(nextNumber, parseInt(match[1], 10) + 1);
    }

    return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
  }

  async update(id: string, dto: UpdateProductDto, userId?: string) {
    await this.findOne(id);
    // Solo se recalcula la categoria si el nombre cambia: recalcularla en
    // cualquier edicion (ej. solo tocar el stock) podria reclasificar la
    // pieza sola por casualidad (si alguien creo una categoria nueva
    // despues), sin que quien edito el stock lo haya pedido ni lo espere.
    const categoriaId = dto.nombre ? await this.clasificarCategoria(dto.nombre) : undefined;
    const datos = this.datosConTallas(dto);
    const product = await this.prisma.product.update({
      where: { id },
      data: categoriaId !== undefined ? { ...datos, categoriaId } : datos,
    });
    await this.audit.log('Product', id, 'UPDATE', userId, dto as any);
    void this.regenerarCatalogo();
    return this.conTallas(product);
  }

  async remove(id: string, userId?: string) {
    await this.findOne(id);
    // Baja logica en lugar de borrado fisico para no romper ventas historicas.
    const product = await this.prisma.product.update({
      where: { id },
      data: { activo: false },
    });
    await this.audit.log('Product', id, 'DELETE', userId);
    // La pieza dada de baja tiene que desaparecer del sitio publico tambien.
    void this.regenerarCatalogo();
    return this.conTallas(product);
  }

  /** Dar de baja varias piezas de una vez (seleccion multiple en Productos). */
  async bulkDarDeBaja(ids: string[], userId?: string): Promise<{ actualizados: number }> {
    const { count } = await this.prisma.product.updateMany({
      where: { id: { in: ids }, activo: true },
      data: { activo: false },
    });
    if (count > 0) {
      await this.audit.log('Product', 'baja-lote', 'DELETE', userId, { cantidad: count });
      void this.regenerarCatalogo();
    }
    return { actualizados: count };
  }

  /** Reactivar varias piezas de una vez. */
  async bulkReactivar(ids: string[], userId?: string): Promise<{ actualizados: number }> {
    const { count } = await this.prisma.product.updateMany({
      where: { id: { in: ids }, activo: false },
      data: { activo: true },
    });
    if (count > 0) {
      await this.audit.log('Product', 'reactivar-lote', 'UPDATE', userId, { cantidad: count });
      void this.regenerarCatalogo();
    }
    return { actualizados: count };
  }

  /**
   * Eliminar de verdad varias piezas ya dadas de baja (seleccion multiple).
   * Misma regla que eliminarDuplicados(): nunca borra una que tenga una
   * venta encima, y libera su foto del disco si tenia.
   */
  async bulkEliminar(
    ids: string[],
    userId?: string,
  ): Promise<{ eliminados: number; omitidosPorVentas: number }> {
    const productos = await this.prisma.product.findMany({
      where: { id: { in: ids }, activo: false },
      select: { id: true, imageUrl: true },
    });
    const conVentas = await this.idsConVentas(productos.map((p) => p.id));
    const aEliminar = productos.filter((p) => !conVentas.has(p.id));

    if (aEliminar.length > 0) {
      await this.prisma.product.deleteMany({ where: { id: { in: aEliminar.map((p) => p.id) } } });
      await this.audit.log('Product', 'eliminar-lote', 'DELETE', userId, {
        eliminados: aEliminar.length,
        omitidosPorVentas: conVentas.size,
      });
      for (const p of aEliminar) {
        if (p.imageUrl) await fs.unlink(this.rutaFoto(p.imageUrl)).catch(() => undefined);
      }
    }

    return { eliminados: aEliminar.length, omitidosPorVentas: conVentas.size };
  }

  async updatePhoto(id: string, buffer: Buffer, mimetype: string, userId?: string) {
    await this.findOne(id);
    // Se reduce a 800x800 y se comprime antes de guardar (ver image.util.ts):
    // las fotos vienen del celular pesando megabytes y se muestran a 144px.
    const optimized = await optimizeProductImage(buffer, mimetype);
    const key = `products/${id}-${Date.now()}.${optimized.ext}`;
    const imageUrl = await this.storage.upload(optimized.buffer, key);
    const product = await this.prisma.product.update({ where: { id }, data: { imageUrl } });
    await this.audit.log('Product', id, 'UPDATE', userId, { imageUrl });
    void this.regenerarCatalogo();
    return this.conTallas(product);
  }

  /** Ruta en disco de la foto de un producto, a partir de su imageUrl (relativo o con host). */
  private rutaFoto(imageUrl: string): string {
    const marca = '/uploads/';
    const idx = imageUrl.indexOf(marca);
    const key = idx === -1 ? imageUrl : imageUrl.slice(idx + marca.length);
    return join(UPLOADS_DIR, key);
  }

  /**
   * Calcula que piezas se darian de baja al "limpiar duplicados": las que no
   * tienen foto, y las que SI tienen foto pero son practicamente la misma
   * pieza repetida (mismo nombre, mismo precio y el archivo de foto pesa
   * exactamente lo mismo en bytes). De cada grupo de repetidas se conserva
   * la mas antigua y se marcan las demas.
   *
   * `incluirSinFotoEnGrupos` es para "Eliminar duplicados" (piezas ya dadas
   * de baja): ahi tambien hay que detectar repetidas SIN foto (mismo nombre
   * y precio, ninguna de las dos con foto que comparar) — se agrupan entre
   * si con un valor sentinela en vez de saltarselas, pero nunca se mezclan
   * con las que si tienen foto. En "Limpiar duplicados" (piezas activas) esto
   * se deja apagado porque ahi las sin foto YA se marcan todas por separado
   * (`sinFoto`/`idsSinFoto`); agruparlas tambien las contaria dos veces.
   *
   * Se aisla en un metodo aparte para que la vista previa y la limpieza real
   * calculen EXACTAMENTE lo mismo — si calcularan cada una por su lado
   * podrian desincronizarse y la vista previa mentiria sobre lo que en
   * realidad se va a borrar.
   */
  private async calcularLimpieza(
    activo: boolean,
    incluirSinFotoEnGrupos = false,
  ): Promise<{
    grupos: GrupoDuplicado[];
    sinFoto: { id: string; sku: string; nombre: string }[];
    idsDuplicados: string[];
    idsSinFoto: string[];
  }> {
    const productos = await this.prisma.product.findMany({
      where: { activo },
      select: { id: true, sku: true, nombre: true, precioUnitario: true, imageUrl: true },
      orderBy: { createdAt: 'asc' },
    });

    const sinFoto = productos.filter((p) => !p.imageUrl);
    const conFoto = productos.filter((p) => p.imageUrl);

    const tamanos = new Map<string, number>();
    await Promise.all(
      conFoto.map(async (p) => {
        const size = await fs
          .stat(this.rutaFoto(p.imageUrl as string))
          .then((s) => s.size)
          .catch(() => null);
        if (size != null) tamanos.set(p.id, size);
      }),
    );

    // Sentinela para "sin foto": nunca coincide con un tamaño real en bytes,
    // asi que una pieza sin foto jamas se agrupa con una que si tiene.
    const SIN_FOTO = -1;
    const candidatos = incluirSinFotoEnGrupos ? productos : conFoto;

    // Agrupa por nombre + precio + tamaño de foto en bytes (o el sentinela,
    // si no tiene). El orden dentro de cada grupo ya viene de mas viejo a
    // mas nuevo (orderBy arriba).
    const grupos = new Map<string, typeof productos>();
    for (const p of candidatos) {
      const tamano = p.imageUrl ? tamanos.get(p.id) : SIN_FOTO;
      if (tamano == null) continue; // tenia foto pero no se pudo leer el archivo: no se compara
      const clave = `${p.nombre.trim().toLowerCase()}|${Number(p.precioUnitario)}|${tamano}`;
      const lista = grupos.get(clave);
      if (lista) lista.push(p);
      else grupos.set(clave, [p]);
    }

    const gruposDuplicados: GrupoDuplicado[] = [];
    const idsDuplicados: string[] = [];
    for (const lista of grupos.values()) {
      if (lista.length < 2) continue;
      const [mantiene, ...resto] = lista;
      gruposDuplicados.push({
        nombre: mantiene.nombre,
        precioUnitario: Number(mantiene.precioUnitario),
        tamanoFotoBytes: mantiene.imageUrl ? (tamanos.get(mantiene.id) as number) : SIN_FOTO,
        mantiene: { id: mantiene.id, sku: mantiene.sku },
        elimina: resto.map((p) => ({ id: p.id, sku: p.sku })),
      });
      idsDuplicados.push(...resto.map((p) => p.id));
    }

    return {
      grupos: gruposDuplicados,
      sinFoto: sinFoto.map((p) => ({ id: p.id, sku: p.sku, nombre: p.nombre })),
      idsDuplicados,
      idsSinFoto: sinFoto.map((p) => p.id),
    };
  }

  async vistaPreviaLimpieza(): Promise<VistaPreviaLimpieza> {
    const { grupos, sinFoto, idsDuplicados, idsSinFoto } = await this.calcularLimpieza(true);
    return { grupos, sinFoto, totalABaja: idsDuplicados.length + idsSinFoto.length };
  }

  /**
   * Da de baja (no borra) las piezas duplicadas y las que no tienen foto.
   * Baja logica, igual que remove(): las facturas viejas que ya las mencionan
   * no se ven afectadas, y cualquiera se puede reactivar despues a mano.
   */
  async limpiarDuplicados(
    userId?: string,
  ): Promise<{ bajaDuplicados: number; bajaSinFoto: number }> {
    const { idsDuplicados, idsSinFoto } = await this.calcularLimpieza(true);
    const idsTotal = [...idsDuplicados, ...idsSinFoto];

    if (idsTotal.length > 0) {
      await this.prisma.product.updateMany({
        where: { id: { in: idsTotal } },
        data: { activo: false },
      });
      await this.audit.log('Product', 'limpieza-duplicados', 'DELETE', userId, {
        bajaDuplicados: idsDuplicados.length,
        bajaSinFoto: idsSinFoto.length,
      });
      void this.regenerarCatalogo();
    }

    return { bajaDuplicados: idsDuplicados.length, bajaSinFoto: idsSinFoto.length };
  }

  /** IDs de esta lista que aparecen en alguna venta (nunca se pueden borrar de verdad). */
  private async idsConVentas(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const items = await this.prisma.saleItem.findMany({
      where: { productId: { in: ids } },
      select: { productId: true },
      distinct: ['productId'],
    });
    return new Set(items.map((i) => i.productId as string));
  }

  /**
   * Vista previa de "Eliminar duplicados" en la pestaña de dados de baja:
   * a diferencia de limpiarDuplicados() (que solo los marca inactivos), esto
   * los borra de verdad para recuperar espacio — pero solo los duplicados
   * que NUNCA se vendieron. Los que si tienen una venta encima se dejan tal
   * cual (borrarlos rompería el historial de esa factura) y se listan aparte
   * para que quede claro por que no desaparecieron.
   */
  async vistaPreviaEliminarDuplicados(): Promise<VistaPreviaEliminarDuplicados> {
    const { grupos, idsDuplicados } = await this.calcularLimpieza(false, true);
    const conVentas = await this.idsConVentas(idsDuplicados);

    const omitidosPorVentas: { id: string; sku: string; nombre: string }[] = [];
    let totalEliminables = 0;
    for (const grupo of grupos) {
      for (const p of grupo.elimina) {
        if (conVentas.has(p.id))
          omitidosPorVentas.push({ id: p.id, sku: p.sku, nombre: grupo.nombre });
        else totalEliminables++;
      }
    }

    return { grupos, totalEliminables, omitidosPorVentas };
  }

  /** Ejecuta lo que vistaPreviaEliminarDuplicados() calculo: borra de verdad y libera las fotos del disco. */
  async eliminarDuplicados(
    userId?: string,
  ): Promise<{ eliminados: number; omitidosPorVentas: number }> {
    const { idsDuplicados } = await this.calcularLimpieza(false, true);
    const conVentas = await this.idsConVentas(idsDuplicados);
    const aEliminar = idsDuplicados.filter((id) => !conVentas.has(id));

    if (aEliminar.length > 0) {
      const productos = await this.prisma.product.findMany({
        where: { id: { in: aEliminar } },
        select: { id: true, imageUrl: true },
      });
      await this.prisma.product.deleteMany({ where: { id: { in: aEliminar } } });
      await this.audit.log('Product', 'eliminar-duplicados', 'DELETE', userId, {
        eliminados: aEliminar.length,
        omitidosPorVentas: conVentas.size,
      });
      for (const p of productos) {
        if (p.imageUrl) await fs.unlink(this.rutaFoto(p.imageUrl)).catch(() => undefined);
      }
    }

    return { eliminados: aEliminar.length, omitidosPorVentas: conVentas.size };
  }
}
