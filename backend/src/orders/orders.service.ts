import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EstadoPedido } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { parseFromDate } from '../common/date-range';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

/** Datos de la venta que el listado de pedidos necesita mostrar. */
const SALE_PREVIEW = {
  select: {
    id: true,
    fecha: true,
    total: true,
    metodoPago: true,
    client: { select: { id: true, nombre: true, telefono: true } },
    items: { select: { id: true, descripcion: true, cantidad: true } },
    invoice: { select: { numero: true, pngUrl: true, estado: true } },
  },
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Pedidos vivos, ordenados por urgencia: primero los que tienen fecha de
   * entrega mas proxima (y los atrasados arriba del todo), y al final los que
   * no tienen fecha comprometida.
   */
  async findAll(estado?: EstadoPedido) {
    const orders = await this.prisma.order.findMany({
      where: estado ? { estado } : undefined,
      include: { sale: SALE_PREVIEW },
      orderBy: [{ fechaEntrega: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });

    return orders.map((order) => this.conUrgencia(order));
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { sale: SALE_PREVIEW },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado.');
    return this.conUrgencia(order);
  }

  async create(dto: CreateOrderDto, userId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id: dto.saleId } });
    if (!sale) throw new NotFoundException('La venta indicada no existe.');

    const existing = await this.prisma.order.findUnique({ where: { saleId: dto.saleId } });
    if (existing) {
      throw new ConflictException('Esa venta ya tiene un pedido registrado.');
    }

    const order = await this.prisma.order.create({
      data: {
        saleId: dto.saleId,
        fechaEntrega: dto.fechaEntrega ? parseFromDate(dto.fechaEntrega) : null,
        notas: dto.notas?.trim() || null,
      },
      include: { sale: SALE_PREVIEW },
    });

    await this.audit.log('Order', order.id, 'CREATE', userId, {
      saleId: dto.saleId,
      fechaEntrega: dto.fechaEntrega,
    });
    return this.conUrgencia(order);
  }

  /**
   * Actualiza estado, fecha o notas.
   *
   * Marcar ENTREGADO no guarda ese estado: borra el pedido. Es lo pedido
   * explicitamente — el pedido solo existe mientras la pieza no ha llegado a
   * manos del cliente, y una vez entregada la factura ya es el registro de
   * la venta. Devolvemos {entregado: true} para que la interfaz sepa que la
   * fila desaparecio en vez de haber cambiado de estado.
   */
  async update(id: string, dto: UpdateOrderDto, userId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido no encontrado.');

    if (dto.estado === EstadoPedido.ENTREGADO) {
      return this.marcarEntregado(id, order.saleId, userId);
    }

    const data: Prisma.OrderUpdateInput = {};
    if (dto.estado !== undefined) data.estado = dto.estado;
    if (dto.notas !== undefined) data.notas = dto.notas.trim() || null;
    if (dto.fechaEntrega !== undefined) {
      data.fechaEntrega = dto.fechaEntrega ? parseFromDate(dto.fechaEntrega) : null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No hay nada que actualizar en el pedido.');
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: { sale: SALE_PREVIEW },
    });

    await this.audit.log('Order', id, 'UPDATE', userId, data as Record<string, unknown>);
    return this.conUrgencia(updated);
  }

  /** Entrega: se borra el pedido y la factura queda como registro. */
  private async marcarEntregado(id: string, saleId: string, userId?: string) {
    await this.prisma.order.delete({ where: { id } });
    await this.audit.log('Order', id, 'DELETE', userId, {
      motivo: 'entregado al cliente',
      saleId,
    });
    return { id, entregado: true, saleId };
  }

  /** Cancela un pedido sin haberlo entregado (la venta y su factura no se tocan). */
  async remove(id: string, userId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Pedido no encontrado.');

    await this.prisma.order.delete({ where: { id } });
    await this.audit.log('Order', id, 'DELETE', userId, {
      motivo: 'cancelado',
      saleId: order.saleId,
    });
    return { id, deleted: true };
  }

  /** Resumen para el Dashboard: cuantos hay por estado y cuantos van atrasados. */
  async summary() {
    const orders = await this.prisma.order.findMany({
      include: { sale: SALE_PREVIEW },
      orderBy: [{ fechaEntrega: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });

    const conUrgencia = orders.map((o) => this.conUrgencia(o));
    return {
      total: conUrgencia.length,
      pendientes: conUrgencia.filter((o) => o.estado === EstadoPedido.PENDIENTE).length,
      empacados: conUrgencia.filter((o) => o.estado === EstadoPedido.EMPACADO).length,
      atrasados: conUrgencia.filter((o) => o.urgencia === 'ATRASADO').length,
      paraHoy: conUrgencia.filter((o) => o.urgencia === 'HOY').length,
      // Los mas urgentes primero: es lo que se muestra destacado en el Dashboard.
      proximos: conUrgencia.slice(0, 5),
    };
  }

  /**
   * Clasifica el pedido segun su fecha de entrega, para que la interfaz pueda
   * darle color sin repetir esta logica (y sin depender del reloj del
   * navegador, que puede estar en otra zona horaria que el negocio).
   */
  private conUrgencia<T extends { fechaEntrega: Date | null }>(order: T) {
    const urgencia = this.calcularUrgencia(order.fechaEntrega);
    return { ...order, urgencia };
  }

  private calcularUrgencia(
    fechaEntrega: Date | null,
  ): 'ATRASADO' | 'HOY' | 'PROXIMO' | 'SIN_FECHA' {
    if (!fechaEntrega) return 'SIN_FECHA';

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const entrega = new Date(fechaEntrega);
    entrega.setHours(0, 0, 0, 0);

    if (entrega < hoy) return 'ATRASADO';
    if (entrega.getTime() === hoy.getTime()) return 'HOY';
    return 'PROXIMO';
  }
}
