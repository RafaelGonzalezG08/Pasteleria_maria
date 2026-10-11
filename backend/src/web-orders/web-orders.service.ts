import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SalesService } from '../sales/sales.service';
import { SaleItemDto } from '../sales/dto/create-sale.dto';
import { EstadoPedidoWeb } from '../common/enums';
import { parsearPedidoWeb, ItemPedidoWeb } from './parser';
import { CreateWebOrderDto } from './dto/create-web-order.dto';
import { UpdateWebOrderDto } from './dto/update-web-order.dto';
import { AtenderWebOrderDto } from './dto/atender-web-order.dto';
import { DeleteWebOrderDto } from './dto/delete-web-order.dto';

/** Fila de web_orders con `items` ya vuelto a ser un arreglo, listo para la interfaz. */
function conItems<T extends { items: string }>(pedido: T) {
  return { ...pedido, items: JSON.parse(pedido.items) as ItemPedidoWeb[] };
}

@Injectable()
export class WebOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sales: SalesService,
  ) {}

  /**
   * Interpreta el mensaje pegado y crea el pedido.
   *
   * El codigo del mensaje (ej. "PED-K3F7Q2") es el unico hilo entre lo que el
   * cliente escribio por WhatsApp y esta fila, asi que si ya existe uno con
   * ese codigo no se crea de nuevo (pegar el mismo mensaje dos veces no debe
   * duplicar el pedido).
   */
  async create(dto: CreateWebOrderDto, userId?: string) {
    const parseado = parsearPedidoWeb(dto.texto);
    if (!parseado) {
      throw new BadRequestException(
        'No se reconoce ese texto como un pedido del catalogo. Pega el mensaje completo, ' +
          'tal como lo mando el cliente por WhatsApp (con el numero de pedido y el total).',
      );
    }

    const existente = await this.prisma.webOrder.findUnique({ where: { codigo: parseado.codigo } });
    if (existente) {
      throw new ConflictException(`El pedido ${parseado.codigo} ya estaba registrado.`);
    }

    const creado = await this.prisma.webOrder.create({
      data: {
        codigo: parseado.codigo,
        items: JSON.stringify(parseado.items),
        total: parseado.total,
        textoOriginal: dto.texto.trim(),
      },
    });

    await this.audit.log('WebOrder', creado.id, 'CREATE', userId, {
      codigo: creado.codigo,
      total: parseado.total,
      items: parseado.items.length,
    });
    return conItems(creado);
  }

  /**
   * Crea un pedido web a partir de items ya estructurados, sin pasar por el
   * parser de texto. Lo usa el relevo de ventas web (`WebSalesRelayService`)
   * cuando una venta del catalogo no se pudo crear como venta automatica por
   * un error de datos: en vez de perderla, cae aqui como pedido pendiente
   * para que alguien la revise.
   */
  async crearDesdeItems(
    params: { codigo: string; items: ItemPedidoWeb[]; total: number; nota: string },
    userId?: string,
  ) {
    const existente = await this.prisma.webOrder.findUnique({ where: { codigo: params.codigo } });
    if (existente) {
      throw new ConflictException(`El pedido ${params.codigo} ya estaba registrado.`);
    }
    const creado = await this.prisma.webOrder.create({
      data: {
        codigo: params.codigo,
        items: JSON.stringify(params.items),
        total: params.total,
        textoOriginal: params.nota,
      },
    });
    await this.audit.log('WebOrder', creado.id, 'CREATE', userId, {
      codigo: creado.codigo,
      origen: 'venta-web-fallback',
    });
    return conItems(creado);
  }

  async findAll(estado?: EstadoPedidoWeb) {
    const pedidos = await this.prisma.webOrder.findMany({
      where: estado ? { estado } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return pedidos.map(conItems);
  }

  async update(id: string, dto: UpdateWebOrderDto, userId?: string) {
    const pedido = await this.prisma.webOrder.findUnique({ where: { id } });
    if (!pedido) throw new NotFoundException('Pedido web no encontrado.');

    const actualizado = await this.prisma.webOrder.update({
      where: { id },
      data: { estado: dto.estado },
    });

    await this.audit.log('WebOrder', id, 'UPDATE', userId, { estado: dto.estado });
    return conItems(actualizado);
  }

  /**
   * Convierte el pedido web en una venta real (misma factura que sale del
   * punto de venta), y de paso marca el pedido como ATENDIDO enlazado a esa
   * venta. Es lo que "atender" un pedido web significa de verdad: alguien
   * decidio el cliente y el metodo de pago, y ahora hay una factura.
   *
   * Los items se toman TAL COMO el cliente los pidio (mismo precio que vio
   * en la web, no el precio de catalogo de hoy - pudo cambiar desde
   * entonces). Si el SKU todavia existe como producto, la venta queda
   * enlazada a el (descuenta stock, etc); si no (se borro o cambio de SKU),
   * se vende como item suelto con el mismo nombre y precio, sin tocar stock.
   */
  async atender(id: string, dto: AtenderWebOrderDto, userId: string) {
    const pedido = await this.prisma.webOrder.findUnique({ where: { id } });
    if (!pedido) throw new NotFoundException('Pedido web no encontrado.');
    if (pedido.estado !== EstadoPedidoWeb.PENDIENTE) {
      throw new ConflictException('Este pedido ya fue atendido o cancelado.');
    }

    const items = JSON.parse(pedido.items) as ItemPedidoWeb[];
    const skus = [...new Set(items.map((i) => i.sku).filter((s): s is string => Boolean(s)))];
    const productos = skus.length
      ? await this.prisma.product.findMany({ where: { sku: { in: skus } } })
      : [];
    const porSku = new Map(productos.map((p) => [p.sku.toUpperCase(), p]));

    const saleItems: SaleItemDto[] = items.map((item) => {
      const producto = item.sku ? porSku.get(item.sku.toUpperCase()) : undefined;
      return {
        productId: producto?.id,
        descripcion: producto?.nombre ?? item.nombre,
        cantidad: item.cantidad,
        precioUnitario: Math.round((item.total / item.cantidad) * 100) / 100,
      };
    });

    const sale = await this.sales.create(
      {
        clientId: dto.clientId,
        metodoPago: dto.metodoPago,
        fechaVencimiento: dto.fechaVencimiento,
        esPedido: dto.esPedido,
        fechaEntrega: dto.fechaEntrega,
        descuentoPct: dto.descuentoPct,
        items: saleItems,
      },
      userId,
    );

    await this.prisma.webOrder.update({
      where: { id },
      data: { estado: EstadoPedidoWeb.ATENDIDO, saleId: sale.id },
    });

    await this.audit.log('WebOrder', id, 'UPDATE', userId, { accion: 'atendido', saleId: sale.id });
    return sale;
  }

  async remove(id: string, dto: DeleteWebOrderDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) throw new ForbiddenException('Clave incorrecta.');

    const pedido = await this.prisma.webOrder.findUnique({ where: { id } });
    if (!pedido) throw new NotFoundException('Pedido web no encontrado.');

    await this.prisma.webOrder.delete({ where: { id } });
    await this.audit.log('WebOrder', id, 'DELETE', userId, { codigo: pedido.codigo });
    return { id, deleted: true };
  }
}
