import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../products/products.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
  ) {}

  findAll() {
    return this.prisma.category.findMany({ orderBy: { nombre: 'asc' } });
  }

  async create(nombre: string, userId?: string) {
    const limpio = nombre.trim();
    if (!limpio) throw new BadRequestException('El nombre de la categoria no puede estar vacio.');

    // Comparacion en codigo, sin importar mayusculas: el indice unico de
    // "nombre" en SQLite es sensible a mayusculas (su colacion por defecto es
    // BINARY), asi que por si solo dejaria crear "Anillo" y "ANILLO" como dos
    // categorias distintas.
    const categorias = await this.prisma.category.findMany({ select: { nombre: true } });
    const yaExiste = categorias.some((c) => c.nombre.toLowerCase() === limpio.toLowerCase());
    if (yaExiste) throw new ConflictException('Ya existe una categoria con ese nombre.');

    const category = await this.prisma.category.create({ data: { nombre: limpio } });

    // Mete en la categoria nueva las piezas del inventario cuya primera
    // palabra coincida: si no, una categoria creada despues de cargar el
    // inventario se quedaba vacia hasta re-guardar cada pieza a mano.
    const clasificadas = await this.products.clasificarExistentesEn(category.id, limpio);

    await this.audit.log('Category', category.id, 'CREATE', userId, {
      nombre: limpio,
      clasificadas,
    });
    return { ...category, clasificadas };
  }

  /**
   * Borra la categoria y desclasifica (categoriaId = null) los productos que
   * la tenian asignada. No es una llave foranea real (ver schema.prisma), asi
   * que sin este paso esos productos quedarian apuntando a un id que ya no
   * existe.
   */
  async remove(id: string, userId?: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Categoria no encontrada.');

    await this.prisma.product.updateMany({
      where: { categoriaId: id },
      data: { categoriaId: null },
    });
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log('Category', id, 'DELETE', userId, { nombre: category.nombre });
    return { id, deleted: true };
  }
}
