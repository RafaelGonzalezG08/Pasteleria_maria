import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  convertir,
  familiaDe,
  redondearCantidad,
  redondearDinero,
  UNIDADES,
} from '../common/unidades';
import { CreateRecetaDto } from './dto/receta.dto';

type PrismaLike = PrismaService | Prisma.TransactionClient;

interface InsumoFoto {
  id: string;
  nombre: string;
  unidad: string;
  costoUnitario: number;
  stockActual: number;
}

interface LineaFoto {
  id: string;
  insumoId: string | null;
  subrecetaId: string | null;
  cantidad: number;
  unidad: string;
  orden: number;
}

interface RecetaFoto {
  id: string;
  nombre: string;
  esSubreceta: boolean;
  rendimiento: number;
  unidadRendimiento: string;
  porciones: number | null;
  margenPct: number | null;
  productoId: string | null;
  lineas: LineaFoto[];
}

export interface LineaCosteada {
  id: string;
  tipo: 'INSUMO' | 'SUBRECETA';
  refId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costo: number;
}

export interface Costeo {
  costoTotal: number;
  /** Costo por cada unidad de rendimiento (por pastel, por pan, por gramo de crema...). */
  costoPorUnidad: number;
  costoPorPorcion: number;
  margenPct: number;
  /** Precio sugerido por unidad de rendimiento y por porcion: costo + margen. */
  precioSugeridoUnidad: number;
  precioSugeridoPorcion: number;
  lineas: LineaCosteada[];
}

/**
 * Foto en memoria de todas las recetas e insumos. Un negocio tiene decenas de
 * recetas, no miles: cargar todo una vez y costear en memoria es mas simple y
 * mas rapido que ir a la base por cada subreceta anidada.
 */
class Recetario {
  private readonly costos = new Map<string, number>();

  constructor(
    readonly recetas: Map<string, RecetaFoto>,
    readonly insumos: Map<string, InsumoFoto>,
  ) {}

  receta(id: string): RecetaFoto {
    const r = this.recetas.get(id);
    if (!r) throw new NotFoundException('Receta no encontrada.');
    return r;
  }

  /** Fraccion de una tanda de `sub` que representa `cantidad unidad` de ella. */
  fraccionDeSubreceta(sub: RecetaFoto, cantidad: number, unidad: string): number {
    return (
      convertir(cantidad, unidad, sub.unidadRendimiento, `subreceta "${sub.nombre}"`) /
      sub.rendimiento
    );
  }

  costoLinea(linea: LineaFoto, pila: string[]): { nombre: string; costo: number } {
    if (linea.insumoId) {
      const insumo = this.insumos.get(linea.insumoId);
      if (!insumo) throw new BadRequestException('Una receta usa un insumo que ya no existe.');
      const cantidad = convertir(linea.cantidad, linea.unidad, insumo.unidad, insumo.nombre);
      return { nombre: insumo.nombre, costo: cantidad * insumo.costoUnitario };
    }
    const sub = this.receta(linea.subrecetaId as string);
    const fraccion = this.fraccionDeSubreceta(sub, linea.cantidad, linea.unidad);
    return { nombre: sub.nombre, costo: fraccion * this.costoTanda(sub.id, pila) };
  }

  /** Costo de una tanda completa de la receta, a precio actual de los insumos. */
  costoTanda(recetaId: string, pila: string[] = []): number {
    const cacheado = this.costos.get(recetaId);
    if (cacheado !== undefined) return cacheado;
    if (pila.includes(recetaId)) {
      const nombres = [...pila, recetaId].map((id) => this.recetas.get(id)?.nombre ?? '?');
      throw new BadRequestException(`Las subrecetas forman un ciclo: ${nombres.join(' → ')}.`);
    }
    const receta = this.receta(recetaId);
    const total = receta.lineas.reduce(
      (s, l) => s + this.costoLinea(l, [...pila, recetaId]).costo,
      0,
    );
    this.costos.set(recetaId, total);
    return total;
  }

  /**
   * Insumos (en su propia unidad) que hacen falta para `factor` tandas,
   * abriendo las subrecetas hasta llegar a los ingredientes de verdad: al
   * producir un pastel tambien se gastan la harina y la mantequilla del relleno.
   */
  explotar(
    recetaId: string,
    factor: number,
    acumulado = new Map<string, number>(),
    pila: string[] = [],
  ) {
    if (pila.includes(recetaId)) throw new BadRequestException('Las subrecetas forman un ciclo.');
    const receta = this.receta(recetaId);
    for (const linea of receta.lineas) {
      if (linea.insumoId) {
        const insumo = this.insumos.get(linea.insumoId);
        if (!insumo) throw new BadRequestException('Una receta usa un insumo que ya no existe.');
        const cantidad =
          convertir(linea.cantidad, linea.unidad, insumo.unidad, insumo.nombre) * factor;
        acumulado.set(insumo.id, (acumulado.get(insumo.id) ?? 0) + cantidad);
      } else {
        const sub = this.receta(linea.subrecetaId as string);
        const fraccion = this.fraccionDeSubreceta(sub, linea.cantidad, linea.unidad);
        this.explotar(sub.id, factor * fraccion, acumulado, [...pila, recetaId]);
      }
    }
    return acumulado;
  }
}

@Injectable()
export class RecetasService {
  private readonly logger = new Logger(RecetasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Carga la foto de recetas e insumos (opcionalmente dentro de una transaccion). */
  async cargarRecetario(db: PrismaLike = this.prisma): Promise<Recetario> {
    const [recetas, insumos] = await Promise.all([
      db.receta.findMany({ include: { ingredientes: { orderBy: { orden: 'asc' } } } }),
      db.insumo.findMany(),
    ]);
    return new Recetario(
      new Map(
        recetas.map((r) => [
          r.id,
          {
            id: r.id,
            nombre: r.nombre,
            esSubreceta: r.esSubreceta,
            rendimiento: Number(r.rendimiento),
            unidadRendimiento: r.unidadRendimiento,
            porciones: r.porciones,
            margenPct: r.margenPct === null ? null : Number(r.margenPct),
            productoId: r.productoId,
            lineas: r.ingredientes.map((l) => ({
              id: l.id,
              insumoId: l.insumoId,
              subrecetaId: l.subrecetaId,
              cantidad: Number(l.cantidad),
              unidad: l.unidad,
              orden: l.orden,
            })),
          },
        ]),
      ),
      new Map(
        insumos.map((i) => [
          i.id,
          {
            id: i.id,
            nombre: i.nombre,
            unidad: i.unidad,
            costoUnitario: Number(i.costoUnitario),
            stockActual: Number(i.stockActual),
          },
        ]),
      ),
    );
  }

  private async margenDelNegocio(): Promise<number> {
    const profile = await this.prisma.businessProfile.findFirst();
    return profile ? Number(profile.margenGananciaPct) : 60;
  }

  costear(recetario: Recetario, recetaId: string, margenNegocio: number): Costeo {
    const receta = recetario.receta(recetaId);
    const lineas: LineaCosteada[] = receta.lineas.map((l) => {
      const { nombre, costo } = recetario.costoLinea(l, [recetaId]);
      return {
        id: l.id,
        tipo: l.insumoId ? 'INSUMO' : 'SUBRECETA',
        refId: (l.insumoId ?? l.subrecetaId) as string,
        nombre,
        cantidad: l.cantidad,
        unidad: l.unidad,
        costo: redondearDinero(costo),
      };
    });
    const costoTotal = recetario.costoTanda(recetaId);
    const costoPorUnidad = costoTotal / receta.rendimiento;
    const costoPorPorcion = receta.porciones ? costoTotal / receta.porciones : costoPorUnidad;
    const margenPct = receta.margenPct ?? margenNegocio;
    const factorPrecio = 1 + margenPct / 100;
    return {
      costoTotal: redondearDinero(costoTotal),
      costoPorUnidad: redondearDinero(costoPorUnidad),
      costoPorPorcion: redondearDinero(costoPorPorcion),
      margenPct,
      precioSugeridoUnidad: redondearDinero(costoPorUnidad * factorPrecio),
      precioSugeridoPorcion: redondearDinero(costoPorPorcion * factorPrecio),
      lineas,
    };
  }

  /**
   * Unidades de producto terminado que salen de una tanda (solo recetas cuyo
   * rendimiento se cuenta: unidad, docena, porcion). null si se mide en peso o
   * volumen (una crema no se "cuenta" como producto de vitrina).
   */
  unidadesPorTanda(rendimiento: number, unidadRendimiento: string): number | null {
    if (familiaDe(unidadRendimiento) !== 'CONTEO') return null;
    return convertir(rendimiento, unidadRendimiento, 'unidad');
  }

  // ---------------------------------------------------------------------

  async findAll() {
    const [recetas, recetario, margen] = await Promise.all([
      this.prisma.receta.findMany({
        orderBy: [{ esSubreceta: 'asc' }, { nombre: 'asc' }],
        include: {
          producto: { select: { id: true, nombre: true, precioUnitario: true, stock: true } },
          _count: { select: { ingredientes: true, usadaEn: true } },
        },
      }),
      this.cargarRecetario(),
      this.margenDelNegocio(),
    ]);

    return recetas.map((r) => {
      let costeo: Costeo | null = null;
      let errorCosto: string | null = null;
      try {
        costeo = this.costear(recetario, r.id, margen);
      } catch (error: any) {
        errorCosto = error?.message ?? String(error);
      }
      return {
        ...this.aNumeros(r),
        producto: r.producto
          ? { ...r.producto, precioUnitario: Number(r.producto.precioUnitario) }
          : null,
        totalIngredientes: r._count.ingredientes,
        usadaEnRecetas: r._count.usadaEn,
        costoTotal: costeo?.costoTotal ?? null,
        costoPorUnidad: costeo?.costoPorUnidad ?? null,
        costoPorPorcion: costeo?.costoPorPorcion ?? null,
        precioSugeridoUnidad: costeo?.precioSugeridoUnidad ?? null,
        errorCosto,
      };
    });
  }

  async findOne(id: string) {
    const receta = await this.prisma.receta.findUnique({
      where: { id },
      include: {
        producto: { select: { id: true, nombre: true, precioUnitario: true, stock: true } },
        ingredientes: {
          orderBy: { orden: 'asc' },
          include: {
            insumo: { select: { id: true, nombre: true, unidad: true, stockActual: true } },
            subreceta: { select: { id: true, nombre: true, unidadRendimiento: true } },
          },
        },
        usadaEn: { select: { receta: { select: { id: true, nombre: true } } } },
      },
    });
    if (!receta) throw new NotFoundException('Receta no encontrada.');

    const [recetario, margen] = await Promise.all([
      this.cargarRecetario(),
      this.margenDelNegocio(),
    ]);
    const costeo = this.costear(recetario, id, margen);
    const costoPorLinea = new Map(costeo.lineas.map((l) => [l.id, l.costo]));

    return {
      ...this.aNumeros(receta),
      producto: receta.producto
        ? { ...receta.producto, precioUnitario: Number(receta.producto.precioUnitario) }
        : null,
      unidadesPorTanda: this.unidadesPorTanda(Number(receta.rendimiento), receta.unidadRendimiento),
      ingredientes: receta.ingredientes.map((l) => ({
        id: l.id,
        insumoId: l.insumoId,
        subrecetaId: l.subrecetaId,
        cantidad: Number(l.cantidad),
        unidad: l.unidad,
        orden: l.orden,
        insumo: l.insumo ? { ...l.insumo, stockActual: Number(l.insumo.stockActual) } : null,
        subreceta: l.subreceta,
        costo: costoPorLinea.get(l.id) ?? 0,
      })),
      usadaEn: [...new Map(receta.usadaEn.map((u) => [u.receta.id, u.receta])).values()],
      costeo: { ...costeo, lineas: undefined },
    };
  }

  /**
   * Receta escalada: cantidades de cada linea multiplicadas por `factor`, mas
   * los insumos de verdad que hacen falta (abriendo subrecetas) contra lo
   * que hay en inventario, para saber antes de empezar si alcanza.
   */
  async escalar(id: string, factor: number) {
    if (!(factor > 0)) throw new BadRequestException('El factor de escala debe ser mayor a cero.');
    const [recetario, margen] = await Promise.all([
      this.cargarRecetario(),
      this.margenDelNegocio(),
    ]);
    const receta = recetario.receta(id);
    const costeo = this.costear(recetario, id, margen);
    const necesarios = recetario.explotar(id, factor);

    return {
      factor,
      rendimiento: redondearCantidad(receta.rendimiento * factor),
      unidadRendimiento: receta.unidadRendimiento,
      porciones: receta.porciones ? Math.round(receta.porciones * factor) : null,
      costoTotal: redondearDinero(costeo.costoTotal * factor),
      lineas: costeo.lineas.map((l) => ({
        ...l,
        cantidad: redondearCantidad(l.cantidad * factor),
        costo: redondearDinero(l.costo * factor),
      })),
      insumos: [...necesarios.entries()]
        .map(([insumoId, cantidad]) => {
          const insumo = recetario.insumos.get(insumoId) as InsumoFoto;
          return {
            insumoId,
            nombre: insumo.nombre,
            unidad: insumo.unidad,
            necesario: redondearCantidad(cantidad),
            disponible: redondearCantidad(insumo.stockActual),
            faltante: redondearCantidad(Math.max(0, cantidad - insumo.stockActual)),
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  }

  async create(dto: CreateRecetaDto, userId?: string) {
    await this.validar(dto);
    const receta = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.receta.create({
        data: { ...this.datos(dto), ingredientes: { create: this.lineas(dto) } },
      });
      await this.comprobarCosteable(tx, creada.id);
      return creada;
    });
    await this.audit.log('Receta', receta.id, 'CREATE', userId, { nombre: receta.nombre });
    await this.actualizarCostosProductos();
    return this.findOne(receta.id);
  }

  async update(id: string, dto: CreateRecetaDto, userId?: string) {
    const actual = await this.prisma.receta.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException('Receta no encontrada.');
    await this.validar(dto, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.recetaIngrediente.deleteMany({ where: { recetaId: id } });
      await tx.receta.update({
        where: { id },
        data: { ...this.datos(dto), ingredientes: { create: this.lineas(dto) } },
      });
      // Detecta ciclos (A usa B que usa A) y unidades incompatibles en toda
      // la cadena, no solo en esta receta: si falla, la transaccion revierte.
      await this.comprobarCosteable(tx, id);
    });

    await this.audit.log('Receta', id, 'UPDATE', userId, { nombre: dto.nombre });
    await this.actualizarCostosProductos();
    return this.findOne(id);
  }

  async remove(id: string, userId?: string) {
    const receta = await this.prisma.receta.findUnique({
      where: { id },
      include: { _count: { select: { usadaEn: true, producciones: true } } },
    });
    if (!receta) throw new NotFoundException('Receta no encontrada.');
    if (receta._count.usadaEn > 0) {
      throw new BadRequestException(
        `"${receta.nombre}" se usa como subreceta en otras recetas. Quitala de ellas antes de eliminarla.`,
      );
    }
    if (receta._count.producciones > 0) {
      // Con producciones registradas se desactiva en vez de borrar: el
      // historial de produccion tiene que seguir diciendo que receta se uso.
      await this.prisma.receta.update({ where: { id }, data: { activo: false } });
      await this.audit.log('Receta', id, 'UPDATE', userId, { activo: false });
      return { id, eliminado: false, desactivado: true };
    }
    await this.prisma.receta.delete({ where: { id } });
    await this.audit.log('Receta', id, 'DELETE', userId, { nombre: receta.nombre });
    return { id, eliminado: true };
  }

  /**
   * Pone en cada producto con receta el costo por unidad segun el precio
   * actual de los insumos. Se llama al guardar recetas y al registrar
   * compras (que cambian el costo de los insumos), para que el margen que se
   * copia en cada venta refleje el costo real del momento.
   */
  async actualizarCostosProductos(db: PrismaLike = this.prisma): Promise<void> {
    try {
      const recetario = await this.cargarRecetario(db);
      for (const receta of recetario.recetas.values()) {
        if (!receta.productoId) continue;
        const unidades = this.unidadesPorTanda(receta.rendimiento, receta.unidadRendimiento);
        if (!unidades) continue;
        const costo = recetario.costoTanda(receta.id) / unidades;
        await db.product.update({
          where: { id: receta.productoId },
          data: { costoUnitario: redondearDinero(costo) },
        });
      }
      // Las porciones (venta por pedazo) cuestan lo que el entero entre sus porciones.
      const porciones = await db.product.findMany({
        where: { porcionDeId: { not: null }, porcionesPorUnidad: { gt: 0 } },
        include: { porcionDe: { select: { costoUnitario: true } } },
      });
      for (const p of porciones) {
        if (!p.porcionDe || !p.porcionesPorUnidad) continue;
        await db.product.update({
          where: { id: p.id },
          data: {
            costoUnitario: redondearDinero(
              Number(p.porcionDe.costoUnitario) / p.porcionesPorUnidad,
            ),
          },
        });
      }
    } catch (error) {
      // Nunca tumba la operacion que lo disparo (una compra, guardar otra receta).
      this.logger.warn(`No se pudo actualizar el costo de los productos: ${error}`);
    }
  }

  // ---------------------------------------------------------------------

  private async validar(dto: CreateRecetaDto, id?: string) {
    const nombre = dto.nombre.trim();
    const existente = await this.prisma.receta.findFirst({ where: { nombre } });
    if (existente && existente.id !== id) {
      throw new ConflictException(`Ya existe una receta llamada "${nombre}".`);
    }

    for (const l of dto.ingredientes) {
      if (Boolean(l.insumoId) === Boolean(l.subrecetaId)) {
        throw new BadRequestException(
          'Cada ingrediente debe ser un insumo o una subreceta (uno solo).',
        );
      }
      if (id && l.subrecetaId === id) {
        throw new BadRequestException('Una receta no puede usarse a si misma como subreceta.');
      }
    }

    if (dto.productoId) {
      if (dto.esSubreceta) {
        throw new BadRequestException(
          'Una subreceta no produce un producto de venta; quita el producto o desmarca "subreceta".',
        );
      }
      if (familiaDe(dto.unidadRendimiento) !== 'CONTEO') {
        throw new BadRequestException(
          'Para producir un producto de venta, el rendimiento tiene que contarse (unidad, docena o porcion), no pesarse.',
        );
      }
      const producto = await this.prisma.product.findUnique({
        where: { id: dto.productoId },
        include: { receta: { select: { id: true, nombre: true } } },
      });
      if (!producto) throw new NotFoundException('El producto elegido ya no existe.');
      if (producto.receta && producto.receta.id !== id) {
        throw new ConflictException(
          `"${producto.nombre}" ya se produce con la receta "${producto.receta.nombre}".`,
        );
      }
    }
  }

  private async comprobarCosteable(tx: Prisma.TransactionClient, id: string) {
    const recetario = await this.cargarRecetario(tx);
    recetario.costoTanda(id);
    // Tambien las recetas que la usan: si ahora rinde en "unidad" y ellas la
    // piden en gramos, el costo de ellas ya no se puede calcular.
    for (const r of recetario.recetas.values()) {
      if (r.lineas.some((l) => l.subrecetaId === id)) recetario.costoTanda(r.id);
    }
  }

  private datos(dto: CreateRecetaDto) {
    return {
      nombre: dto.nombre.trim(),
      esSubreceta: dto.esSubreceta ?? false,
      rendimiento: dto.rendimiento,
      unidadRendimiento: dto.unidadRendimiento,
      porciones: dto.porciones ?? null,
      tiempoPreparacionMin: dto.tiempoPreparacionMin ?? null,
      pasos: dto.pasos?.trim() || null,
      // undefined = no tocarlo: el repostero no ve el margen (ver sinCostos)
      // y al guardar una receta no debe borrar el que puso el administrador.
      margenPct: dto.margenPct === undefined ? undefined : dto.margenPct,
      productoId: dto.esSubreceta ? null : dto.productoId || null,
      activo: dto.activo ?? true,
    };
  }

  private lineas(dto: CreateRecetaDto) {
    return dto.ingredientes.map((l, orden) => ({
      insumoId: l.insumoId || null,
      subrecetaId: l.subrecetaId || null,
      cantidad: l.cantidad,
      unidad: l.unidad,
      orden,
    }));
  }

  private aNumeros<
    T extends {
      rendimiento: Prisma.Decimal;
      margenPct: Prisma.Decimal | null;
      unidadRendimiento: string;
    },
  >(r: T) {
    return {
      ...r,
      rendimiento: Number(r.rendimiento),
      margenPct: r.margenPct === null ? null : Number(r.margenPct),
      unidadRendimientoNombre: UNIDADES[r.unidadRendimiento]?.nombre ?? r.unidadRendimiento,
    };
  }
}
