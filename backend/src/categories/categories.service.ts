import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.category.findMany({ orderBy: { nombre: 'asc' } });
  }

  async create(nombre: string, userId?: string) {
    const limpio = nombre.trim();
    if (!limpio) throw new BadRequestException('El nombre de la categoria no puede estar vacio.');

    // Comparacion en codigo, sin importar mayusculas: el indice unico de
    // "nombre" en SQLite es sensible a mayusculas (su colacion por defecto es
    // BINARY), asi que por si solo dejaria crear "Panes" y "PANES" como dos
    // categorias distintas.
    const categorias = await this.prisma.category.findMany({ select: { nombre: true } });
    const yaExiste = categorias.some((c) => c.nombre.toLowerCase() === limpio.toLowerCase());
    if (yaExiste) throw new ConflictException('Ya existe una categoria con ese nombre.');

    const category = await this.prisma.category.create({ data: { nombre: limpio } });
    await this.audit.log('Category', category.id, 'CREATE', userId, { nombre: limpio });
    return category;
  }

  /**
   * Borra la categoria; los productos que la tenian quedan sin categoria.
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
