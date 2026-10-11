import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProveedorDto, UpdateProveedorDto } from './dto/proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(incluirInactivos = false) {
    const proveedores = await this.prisma.proveedor.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        _count: { select: { insumos: true, compras: true } },
        compras: { orderBy: { fecha: 'desc' }, take: 1, select: { fecha: true } },
      },
    });
    return proveedores.map(({ compras, _count, ...p }) => ({
      ...p,
      totalInsumos: _count.insumos,
      totalCompras: _count.compras,
      ultimaCompra: compras[0]?.fecha ?? null,
    }));
  }

  async findOne(id: string) {
    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id },
      include: {
        insumos: { select: { id: true, nombre: true, unidad: true }, orderBy: { nombre: 'asc' } },
        compras: { orderBy: { fecha: 'desc' }, take: 50 },
      },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado.');
    return {
      ...proveedor,
      compras: proveedor.compras.map((c) => ({ ...c, total: Number(c.total) })),
    };
  }

  async create(dto: CreateProveedorDto, userId?: string) {
    const proveedor = await this.prisma.proveedor.create({
      data: { ...dto, nombre: dto.nombre.trim() },
    });
    await this.audit.log('Proveedor', proveedor.id, 'CREATE', userId, { ...dto });
    return proveedor;
  }

  async update(id: string, dto: UpdateProveedorDto, userId?: string) {
    await this.findOne(id);
    const proveedor = await this.prisma.proveedor.update({
      where: { id },
      data: { ...dto, nombre: dto.nombre?.trim() },
    });
    await this.audit.log('Proveedor', id, 'UPDATE', userId, { ...dto });
    return proveedor;
  }

  /** Con compras registradas solo se desactiva, para no perder a quien se le compro. */
  async remove(id: string, userId?: string) {
    const proveedor = await this.prisma.proveedor.findUnique({
      where: { id },
      include: { _count: { select: { compras: true } } },
    });
    if (!proveedor) throw new NotFoundException('Proveedor no encontrado.');
    if (proveedor._count.compras > 0) {
      await this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
      await this.audit.log('Proveedor', id, 'UPDATE', userId, { activo: false });
      return { id, eliminado: false, desactivado: true };
    }
    await this.prisma.proveedor.delete({ where: { id } });
    await this.audit.log('Proveedor', id, 'DELETE', userId, { nombre: proveedor.nombre });
    return { id, eliminado: true };
  }
}
