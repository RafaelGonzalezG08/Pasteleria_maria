import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_USUARIO_VENTAS_WEB } from '../prisma/bootstrap.service';
import { SalesService } from '../sales/sales.service';
import { ClientsService } from '../clients/clients.service';
import { WebOrdersService } from './web-orders.service';
import { SaleItemDto } from '../sales/dto/create-sale.dto';
import { MetodoPago, METODOS_PAGO } from '../common/enums';

interface ItemVentaRelevo {
  sku: string;
  cantidad: number;
  precio: number;
  /** Talla / medida elegida por el cliente en el catalogo (opcional). */
  talla?: string;
}

interface VentaRelevo {
  codigo: string;
  venta: {
    items: ItemVentaRelevo[];
    metodoPago: string;
    descuentoPct?: number;
    cliente?: { nombre?: string; telefono?: string } | null;
  };
  creado: number;
}

/** Cuantas ventas web procesa la app de una sola vez (cada 3 min). */
const MAX_POR_CICLO = 15;
/** Techo de ventas web creadas automaticamente en un dia. */
const MAX_POR_DIA = 60;
const MAX_ITEMS = 30;

/**
 * Igual que `WebOrdersRelayService`, pero para el punto de venta oculto del
 * catalogo: crea VENTAS reales (factura, stock, deuda a credito), no pedidos.
 *
 * Misma filosofia: solo se borra la venta del relevo cuando ya no hace falta
 * volver a verla (se creo, o ya existia). Un error de datos que no se va a
 * arreglar solo cae como pedido pendiente en "Pedidos web"; un error
 * transitorio se deja en el relevo para reintentar.
 */
@Injectable()
export class WebSalesRelayService {
  private readonly logger = new Logger(WebSalesRelayService.name);
  private revisando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly clients: ClientsService,
    private readonly webOrders: WebOrdersService,
  ) {}

  @Interval(3 * 60 * 1000)
  async revisar() {
    const perfil = await this.prisma.businessProfile.findFirst();
    const url = perfil?.relevoPedidosUrl?.trim();
    const clave = perfil?.relevoPedidosClave?.trim();
    if (!url || !clave) return;
    if (this.revisando) return;
    this.revisando = true;

    try {
      const respuesta = await fetch(`${url.replace(/\/$/, '')}/pos/ventas`, {
        headers: { Authorization: `Bearer ${clave}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!respuesta.ok) {
        this.logger.warn(
          `El relevo de ventas respondio ${respuesta.status}; se reintenta en el proximo ciclo.`,
        );
        return;
      }

      const ventas = (await respuesta.json()) as VentaRelevo[];
      if (ventas.length === 0) return;

      const usuarioId = await this.usuarioVentasWebId();
      if (!usuarioId) {
        this.logger.error(
          'No existe el usuario "Ventas web": no se pueden crear ventas del catalogo. ' +
            '(La migracion 20260905120100_usuario_ventas_web deberia haberlo creado.)',
        );
        return;
      }

      const hechasHoy = await this.ventasWebDeHoy();
      const cupoDia = Math.max(0, MAX_POR_DIA - hechasHoy);
      if (cupoDia === 0) {
        this.logger.warn(
          `Tope diario de ventas web (${MAX_POR_DIA}) alcanzado. ${ventas.length} venta(s) ` +
            `quedan en el relevo para revisar a mano.`,
        );
        return;
      }

      let creadas = 0;
      for (const v of ventas.slice(0, Math.min(MAX_POR_CICLO, cupoDia))) {
        const r = await this.procesarVenta(v, url, clave, usuarioId);
        if (r === 'creada') creadas += 1;
      }
      if (creadas > 0) {
        this.logger.log(`${creadas} venta(s) web creada(s) automaticamente desde el relevo.`);
      }
    } catch (error) {
      this.logger.warn(`No se pudo revisar el relevo de ventas: ${error}`);
    } finally {
      this.revisando = false;
    }
  }

  private async usuarioVentasWebId(): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { email: EMAIL_USUARIO_VENTAS_WEB },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  private async ventasWebDeHoy(): Promise<number> {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    return this.prisma.sale.count({
      where: { webCodigo: { not: null }, fecha: { gte: inicio } },
    });
  }

  private async procesarVenta(
    v: VentaRelevo,
    url: string,
    clave: string,
    usuarioId: string,
  ): Promise<'creada' | 'pendiente' | 'error'> {
    let resultado: 'creada' | 'pendiente';
    try {
      await this.crearVenta(v, usuarioId);
      resultado = 'creada';
    } catch (error) {
      // Ya existe una venta con este codigo (un ciclo anterior la creo pero
      // fallo al borrarla del relevo): no es un error, se borra y ya.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        resultado = 'creada';
      } else if (error instanceof BadRequestException || error instanceof ConflictException) {
        // Error de datos que no se arregla solo (SKU invalido, credito sin
        // cliente...): cae como pedido pendiente para que alguien lo revise.
        try {
          await this.crearComoPendiente(v, usuarioId, (error as Error).message);
          resultado = 'pendiente';
        } catch (segundo) {
          if (segundo instanceof ConflictException) {
            resultado = 'pendiente';
          } else {
            this.logger.warn(
              `Venta ${v.codigo}: no se pudo crear ni como pendiente (se reintentara): ${segundo}`,
            );
            return 'error';
          }
        }
      } else {
        // Transitorio (sin stock, DB no responde): se deja en el relevo.
        this.logger.warn(
          `Venta ${v.codigo} del relevo no se pudo crear (se reintentara): ${error}`,
        );
        return 'error';
      }
    }

    try {
      await fetch(`${url.replace(/\/$/, '')}/pos/ventas/${encodeURIComponent(v.codigo)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${clave}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo quitar la venta ${v.codigo} del relevo (se reintentara): ${error}`,
      );
    }
    return resultado;
  }

  /** Crea la venta real. Lanza `BadRequestException` si los datos no sirven. */
  private async crearVenta(v: VentaRelevo, usuarioId: string): Promise<void> {
    const items = this.validarItems(v);
    const metodoPago = this.validarMetodo(v);
    const { saleItems, faltantes } = await this.resolverItems(items);
    const clientId = await this.resolverCliente(v, metodoPago);

    await this.sales.create(
      {
        clientId,
        metodoPago,
        descuentoPct: this.descuento(v),
        items: saleItems,
        webCodigo: v.codigo,
      },
      usuarioId,
    );

    if (faltantes.length > 0) {
      this.logger.warn(
        `Venta ${v.codigo} creada, pero con SKU no encontrados (van como item suelto): ${faltantes.join(', ')}`,
      );
    }
  }

  private validarItems(v: VentaRelevo): ItemVentaRelevo[] {
    const items = v.venta?.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
      throw new BadRequestException(`La venta web tiene 0 o mas de ${MAX_ITEMS} productos.`);
    }
    for (const it of items) {
      const cantidad = Number(it?.cantidad);
      const precio = Number(it?.precio);
      if (
        !it ||
        typeof it.sku !== 'string' ||
        !Number.isInteger(cantidad) ||
        cantidad < 1 ||
        cantidad > 999 ||
        !(precio > 0) ||
        (it.talla != null && (typeof it.talla !== 'string' || it.talla.length > 20))
      ) {
        throw new BadRequestException('Un producto de la venta web tiene datos invalidos.');
      }
    }
    return items;
  }

  private validarMetodo(v: VentaRelevo): MetodoPago {
    const m = String(v.venta?.metodoPago || '').toUpperCase();
    if (!(METODOS_PAGO as readonly string[]).includes(m)) {
      throw new BadRequestException(`Metodo de pago desconocido en la venta web: ${m}`);
    }
    return m as MetodoPago;
  }

  private descuento(v: VentaRelevo): number {
    const d = Number(v.venta?.descuentoPct) || 0;
    return Math.max(0, Math.min(100, d));
  }

  private async resolverItems(
    items: ItemVentaRelevo[],
  ): Promise<{ saleItems: SaleItemDto[]; faltantes: string[] }> {
    const skus = [...new Set(items.map((i) => i.sku.toUpperCase()))];
    const productos = await this.prisma.product.findMany({ where: { sku: { in: skus } } });
    const porSku = new Map(productos.map((p) => [p.sku.toUpperCase(), p]));
    const faltantes: string[] = [];

    const saleItems: SaleItemDto[] = items.map((it) => {
      const p = porSku.get(it.sku.toUpperCase());
      if (!p) faltantes.push(it.sku);
      const base = p?.nombre ?? `${it.sku} (no encontrado)`;
      const talla = it.talla?.trim();
      return {
        productId: p?.id,
        descripcion: talla ? `${base} (Size ${talla})` : base,
        cantidad: it.cantidad,
        precioUnitario: Math.round(Number(it.precio) * 100) / 100,
      };
    });
    return { saleItems, faltantes };
  }

  private async resolverCliente(
    v: VentaRelevo,
    metodoPago: MetodoPago,
  ): Promise<string | undefined> {
    const nombre = v.venta?.cliente?.nombre?.trim();
    const telefono = v.venta?.cliente?.telefono?.trim();
    const soloDigitos = (telefono ?? '').replace(/\D/g, '');

    if (soloDigitos.length < 7) {
      if (metodoPago === 'CREDITO') {
        throw new BadRequestException('Una venta web a credito necesita el telefono del cliente.');
      }
      return undefined;
    }

    // Busca por los ultimos 8 digitos: asi "809-555-1234" y "+1 809 555 1234"
    // se reconocen como el mismo cliente aunque el prefijo se escriba distinto.
    const cola = soloDigitos.slice(-8);
    const candidatos = await this.prisma.client.findMany({
      where: { telefono: { contains: cola } },
    });
    const existente = candidatos.find((c) => c.telefono.replace(/\D/g, '').slice(-8) === cola);
    if (existente) return existente.id;

    const creado = await this.clients.create({
      nombre: nombre || `Cliente web ${cola}`,
      telefono: telefono ?? soloDigitos,
    });
    return creado.id;
  }

  private async crearComoPendiente(
    v: VentaRelevo,
    usuarioId: string,
    motivo: string,
  ): Promise<void> {
    const items = (v.venta?.items ?? []).map((it) => {
      const cantidad = Number(it?.cantidad) || 1;
      const precio = Number(it?.precio) || 0;
      const talla = typeof it?.talla === 'string' ? it.talla.trim() : '';
      const base = String(it?.sku ?? 'articulo');
      return {
        cantidad,
        nombre: talla ? `${base} (Size ${talla})` : base,
        sku: it?.sku ?? null,
        total: Math.round(precio * cantidad * 100) / 100,
      };
    });
    const total = items.reduce((s, i) => s + i.total, 0);
    await this.webOrders.crearDesdeItems(
      {
        codigo: v.codigo,
        items,
        total,
        nota: `Venta web ${v.codigo} - no se pudo crear como venta automatica: ${motivo}`,
      },
      usuarioId,
    );
  }
}
