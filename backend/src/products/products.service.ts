import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../invoices/storage.service';
import { optimizeProductImage } from '../common/image.util';
import { UPLOADS_DIR } from '../common/paths';
import { parseFromDate, parseToDate } from '../common/date-range';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MermaProductoDto } from './dto/merma-producto.dto';

/** Lo que la interfaz necesita de cada producto (categoria, receta y venta por porcion). */
const INCLUDE_PRODUCTO = {
  categoria: { select: { id: true, nombre: true } },
  receta: { select: { id: true, nombre: true } },
  porcionDe: { select: { id: true, nombre: true, stock: true } },
  porciones: { select: { id: true, nombre: true, porcionesPorUnidad: true } },
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Filas para exportar el catalogo a Excel. Sin fotos: son binario, no
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
      Codigo: p.sku,
      Nombre: p.nombre,
      Categoria: p.categoria?.nombre ?? '',
      Precio: Number(p.precioUnitario),
      ...(incluirCosto ? { Costo: Number(p.costoUnitario) } : {}),
      Existencia: p.stock,
      Estado: p.activo ? 'Activo' : 'Dado de baja',
    }));
  }

  async findAll(onlyActive = true) {
    return this.prisma.product.findMany({
      where: onlyActive ? { activo: true } : undefined,
      orderBy: { nombre: 'asc' },
      include: INCLUDE_PRODUCTO,
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: INCLUDE_PRODUCTO,
    });
    if (!product) throw new NotFoundException('Producto no encontrado.');
    return product;
  }

  async create(dto: CreateProductDto, userId?: string) {
    const sku = dto.sku?.trim() || (await this.generateSku(dto.nombre));

    const existing = await this.prisma.product.findUnique({ where: { sku } });
    if (existing) throw new ConflictException('Ya existe un producto con ese codigo.');
    const porcion = await this.datosPorcion(dto);

    const product = await this.prisma.product.create({
      data: { ...dto, ...porcion, categoriaId: dto.categoriaId || null, sku },
    });
    await this.audit.log('Product', product.id, 'CREATE', userId, { ...dto, sku } as any);
    return this.findOne(product.id);
  }

  /**
   * Genera un codigo tipo "PA-0001": las 2 primeras letras del nombre (sin
   * acentos, en mayusculas) mas un consecutivo de 4 digitos, calculado a
   * partir del mayor numero entre los codigos existentes con ese prefijo.
   *
   * Se calcula en codigo sobre TODOS los del prefijo, no con
   * `orderBy: sku desc` + tomar el primero: eso compara como texto, y un
   * codigo de 3 digitos ("PA-002") ordena DESPUES que uno de 4 ("PA-0003")
   * porque '2' > '0' como caracter; el consecutivo salia repetido.
   */
  async generateSku(nombre: string): Promise<string> {
    const soloLetras = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos (á -> a)
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
    const porcion = await this.datosPorcion(dto, id);
    if (dto.sku !== undefined) {
      const sku = dto.sku.trim();
      const otro = await this.prisma.product.findUnique({ where: { sku } });
      if (otro && otro.id !== id)
        throw new ConflictException('Ya existe un producto con ese codigo.');
      dto.sku = sku;
    }
    await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        ...porcion,
        ...(dto.categoriaId !== undefined ? { categoriaId: dto.categoriaId || null } : {}),
      },
    });
    await this.audit.log('Product', id, 'UPDATE', userId, dto as any);
    return this.findOne(id);
  }

  /**
   * Valida y normaliza la configuracion de "venta por porcion". Solo se toca
   * si el formulario la manda (undefined = no cambiar). Una porcion no puede
   * ser porcion de si misma ni de otra porcion (cortar una porcion en
   * porciones no tiene sentido y abriria cadenas raras de existencia).
   */
  private async datosPorcion(
    dto: { porcionDeId?: string | null; porcionesPorUnidad?: number | null },
    id?: string,
  ): Promise<{
    porcionDeId?: string | null;
    porcionesPorUnidad?: number | null;
    costoUnitario?: number;
  }> {
    if (dto.porcionDeId === undefined) {
      delete dto.porcionesPorUnidad;
      return {};
    }
    const porcionDeId = dto.porcionDeId || null;
    delete dto.porcionDeId;
    const porciones = dto.porcionesPorUnidad ?? null;
    delete dto.porcionesPorUnidad;
    if (!porcionDeId) return { porcionDeId: null, porcionesPorUnidad: null };

    if (porcionDeId === id) {
      throw new BadRequestException('Un producto no puede ser porcion de si mismo.');
    }
    const entero = await this.prisma.product.findUnique({ where: { id: porcionDeId } });
    if (!entero) throw new NotFoundException('El producto entero elegido ya no existe.');
    if (entero.porcionDeId) {
      throw new BadRequestException(
        `"${entero.nombre}" ya es una porcion; elige el producto entero.`,
      );
    }
    if (id && (await this.prisma.product.count({ where: { porcionDeId: id } })) > 0) {
      throw new BadRequestException(
        'Este producto ya se vende por porciones (otro producto es porcion de el); no puede ser porcion a su vez.',
      );
    }
    if (!porciones || porciones < 2) {
      throw new BadRequestException('Indica cuantas porciones salen de cada entero (al menos 2).');
    }
    // El costo de la porcion sale del entero (no del formulario): asi la
    // ganancia por pedazo es real desde la primera venta.
    return {
      porcionDeId,
      porcionesPorUnidad: porciones,
      costoUnitario: Math.round((Number(entero.costoUnitario) / porciones) * 100) / 100,
    };
  }

  /**
   * Corta `enteros` unidades del producto entero en porciones: baja la
   * existencia del entero y sube la de la porcion. La porcion toma como costo
   * el del entero dividido entre las porciones, para que la ganancia de cada
   * porcion vendida sea la real.
   */
  async cortar(porcionId: string, enteros: number, userId?: string) {
    const porcion = await this.findOne(porcionId);
    if (!porcion.porcionDeId || !porcion.porcionesPorUnidad) {
      throw new BadRequestException(
        `"${porcion.nombre}" no esta configurado como porcion de otro producto.`,
      );
    }
    const porciones = porcion.porcionesPorUnidad;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.product.updateMany({
        where: { id: porcion.porcionDeId as string, stock: { gte: enteros } },
        data: { stock: { decrement: enteros } },
      });
      if (count === 0) {
        const entero = await tx.product.findUnique({
          where: { id: porcion.porcionDeId as string },
        });
        throw new BadRequestException(
          `Solo hay ${entero?.stock ?? 0} "${entero?.nombre ?? 'entero'}" en existencia; no se pueden cortar ${enteros}.`,
        );
      }
      const entero = await tx.product.findUniqueOrThrow({
        where: { id: porcion.porcionDeId as string },
      });
      await tx.product.update({
        where: { id: porcionId },
        data: {
          stock: { increment: enteros * porciones },
          costoUnitario: Math.round((Number(entero.costoUnitario) / porciones) * 100) / 100,
        },
      });
    });
    await this.audit.log('Product', porcionId, 'UPDATE', userId, {
      accion: 'cortar-en-porciones',
      enteroId: porcion.porcionDeId,
      enteros,
      porciones: enteros * porciones,
    });
    return this.findOne(porcionId);
  }

  async remove(id: string, userId?: string) {
    await this.findOne(id);
    // Baja logica en lugar de borrado fisico para no romper ventas historicas.
    await this.prisma.product.update({ where: { id }, data: { activo: false } });
    await this.audit.log('Product', id, 'DELETE', userId);
    return this.findOne(id);
  }

  /** Dar de baja varios productos de una vez (seleccion multiple). */
  async bulkDarDeBaja(ids: string[], userId?: string): Promise<{ actualizados: number }> {
    const { count } = await this.prisma.product.updateMany({
      where: { id: { in: ids }, activo: true },
      data: { activo: false },
    });
    if (count > 0)
      await this.audit.log('Product', 'baja-lote', 'DELETE', userId, { cantidad: count });
    return { actualizados: count };
  }

  /** Reactivar varios productos de una vez. */
  async bulkReactivar(ids: string[], userId?: string): Promise<{ actualizados: number }> {
    const { count } = await this.prisma.product.updateMany({
      where: { id: { in: ids }, activo: false },
      data: { activo: true },
    });
    if (count > 0)
      await this.audit.log('Product', 'reactivar-lote', 'UPDATE', userId, { cantidad: count });
    return { actualizados: count };
  }

  /**
   * Eliminar de verdad varios productos ya dados de baja. Nunca borra uno
   * que tenga ventas, encargos o producciones encima (romperia el
   * historial), y libera su foto del disco si tenia.
   */
  async bulkEliminar(
    ids: string[],
    userId?: string,
  ): Promise<{ eliminados: number; omitidosPorVentas: number }> {
    const productos = await this.prisma.product.findMany({
      where: { id: { in: ids }, activo: false },
      select: {
        id: true,
        imageUrl: true,
        _count: { select: { saleItems: true, encargoItems: true, producciones: true } },
      },
    });
    const conHistorial = productos.filter(
      (p) => p._count.saleItems + p._count.encargoItems + p._count.producciones > 0,
    );
    const aEliminar = productos.filter((p) => !conHistorial.includes(p));

    if (aEliminar.length > 0) {
      await this.prisma.$transaction([
        this.prisma.receta.updateMany({
          where: { productoId: { in: aEliminar.map((p) => p.id) } },
          data: { productoId: null },
        }),
        this.prisma.product.deleteMany({ where: { id: { in: aEliminar.map((p) => p.id) } } }),
      ]);
      await this.audit.log('Product', 'eliminar-lote', 'DELETE', userId, {
        eliminados: aEliminar.length,
        omitidosPorVentas: conHistorial.length,
      });
      for (const p of aEliminar) {
        if (p.imageUrl) await fs.unlink(this.rutaFoto(p.imageUrl)).catch(() => undefined);
      }
    }

    return { eliminados: aEliminar.length, omitidosPorVentas: conHistorial.length };
  }

  async updatePhoto(id: string, buffer: Buffer, mimetype: string, userId?: string) {
    await this.findOne(id);
    // Se reduce a 800x800 y se comprime antes de guardar (ver image.util.ts).
    const optimized = await optimizeProductImage(buffer, mimetype);
    const key = `products/${id}-${Date.now()}.${optimized.ext}`;
    const imageUrl = await this.storage.upload(optimized.buffer, key);
    await this.prisma.product.update({ where: { id }, data: { imageUrl } });
    await this.audit.log('Product', id, 'UPDATE', userId, { imageUrl });
    return this.findOne(id);
  }

  async quitarFoto(id: string, userId?: string) {
    const product = await this.findOne(id);
    if (product.imageUrl) await fs.unlink(this.rutaFoto(product.imageUrl)).catch(() => undefined);
    await this.prisma.product.update({ where: { id }, data: { imageUrl: null } });
    await this.audit.log('Product', id, 'UPDATE', userId, { imageUrl: null });
    return this.findOne(id);
  }

  /**
   * Producto terminado que se bota (se vencio, se daño, se cayo). Sale del
   * inventario y queda registrado con su costo para el reporte de mermas.
   */
  async registrarMerma(id: string, dto: MermaProductoDto, userId?: string) {
    const product = await this.findOne(id);
    const { count } = await this.prisma.product.updateMany({
      where: { id, stock: { gte: dto.cantidad } },
      data: { stock: { decrement: dto.cantidad } },
    });
    if (count === 0) {
      throw new BadRequestException(
        `Solo hay ${product.stock} de "${product.nombre}" en existencia; no se pueden dar de baja ${dto.cantidad}.`,
      );
    }
    await this.prisma.mermaProducto.create({
      data: {
        productId: id,
        cantidad: dto.cantidad,
        costoUnitario: product.costoUnitario,
        motivo: dto.motivo?.trim() || null,
        userId,
      },
    });
    await this.audit.log('Product', id, 'UPDATE', userId, {
      merma: dto.cantidad,
      motivo: dto.motivo,
    });
    return this.findOne(id);
  }

  async mermas(params: { from?: string; to?: string }) {
    const mermas = await this.prisma.mermaProducto.findMany({
      where: {
        fecha: {
          gte: params.from ? parseFromDate(params.from) : undefined,
          lte: params.to ? parseToDate(params.to) : undefined,
        },
      },
      orderBy: { fecha: 'desc' },
      take: 500,
      include: {
        product: { select: { id: true, nombre: true } },
        user: { select: { nombre: true } },
      },
    });
    return mermas.map((m) => ({ ...m, costoUnitario: Number(m.costoUnitario) }));
  }

  /** Ruta en disco de la foto de un producto, a partir de su imageUrl (relativo o con host). */
  private rutaFoto(imageUrl: string): string {
    const marca = '/uploads/';
    const idx = imageUrl.indexOf(marca);
    const key = idx === -1 ? imageUrl : imageUrl.slice(idx + marca.length);
    return join(UPLOADS_DIR, key);
  }
}
