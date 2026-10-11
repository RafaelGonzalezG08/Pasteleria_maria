import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { EstadoFactura, MetodoPago } from '../common/enums';
import { UPLOADS_DIR } from '../common/paths';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RenderService } from './render.service';
import { StorageService } from './storage.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappQueueService } from './whatsapp-queue.service';
import { renderInvoiceHtml } from './invoice.template';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly render: RenderService,
    private readonly storage: StorageService,
    private readonly whatsapp: WhatsappService,
    private readonly cola: WhatsappQueueService,
  ) {}

  /** Renderiza el PNG (y PDF) de la factura de una venta y sube los archivos. */
  async generateForSale(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        client: true,
        user: { select: { nombre: true } },
        invoice: true,
        payments: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    if (!sale.invoice) throw new NotFoundException('La venta no tiene una factura asociada.');

    const business = await this.getBusinessProfile();
    // El render corre en una pagina "data:text/html" (ver nativo.js ->
    // renderizarParaBackend): no tiene origen ni carpeta propia, asi que una
    // ruta relativa como "/uploads/logo/x.webp" nunca puede cargar - el logo
    // simplemente no aparecia. Se incrusta como base64 para que no dependa
    // de resolver ninguna ruta.
    const logoParaFactura = await this.resolverLogoParaFactura(business.logoUrl);
    const html = renderInvoiceHtml(sale as any, sale.invoice.numero, {
      ...business,
      logoUrl: logoParaFactura,
    });

    try {
      // PNG y PDF se generan UNO DESPUES DEL OTRO, no en paralelo. Cada uno se
      // dibuja en una ventana oculta de Chromium en la app de escritorio (ver
      // nativo.js -> renderizarParaBackend); pedir las dos a la vez abre dos
      // ventanas que cargan un data:URL grande al mismo tiempo, y Chromium
      // falla esa segunda carga de forma intermitente (ERR_FAILED -2). El
      // sintoma era una factura que "no se pudo renderizar" sin causa clara, y
      // un 500 al intentar enviarla por WhatsApp. En serie tarda un pelin mas
      // pero no compite consigo misma.
      const pngBuffer = await this.render.htmlToPng(html);
      const pdfBuffer = await this.render.htmlToPdf(html);

      const keyBase = `invoices/${sale.invoice.numero}`;
      const [pngUrl, pdfUrl] = await Promise.all([
        this.storage.upload(pngBuffer, `${keyBase}.png`),
        this.storage.upload(pdfBuffer, `${keyBase}.pdf`),
      ]);

      const updated = await this.prisma.invoice.update({
        where: { saleId },
        data: { pngUrl, pdfUrl, estado: EstadoFactura.GENERADA, ultimoError: null },
      });

      return updated;
    } catch (error: any) {
      this.logger.error(`Error generando factura para venta ${saleId}: ${error?.message ?? error}`);
      await this.prisma.invoice.update({
        where: { saleId },
        data: { estado: EstadoFactura.ERROR, ultimoError: String(error?.message ?? error) },
      });
      throw error;
    }
  }

  /**
   * Pone la factura de una venta en la cola de envio por WhatsApp y responde
   * al instante. El envio real lo hace WhatsappQueueService en segundo plano,
   * con reintentos. El frontend consulta `whatsappEstado` de la factura para
   * mostrar "en cola" / "enviada" / "error".
   *
   * Si la peticion NO vino de la propia PC (`esPc` en false, ver
   * common/network.util.ts -> esConexionLocal), no se encola para el agente:
   * ese agente pega el mensaje en el WhatsApp Desktop DE LA PC, no tiene
   * ningun sentido si quien pidio el envio esta en su propio celular. En ese
   * caso se devuelve el texto y la imagen para que el propio navegador del
   * celular lo mande (ver respuestaEnvioDirecto).
   */
  async sendWhatsapp(saleId: string, userId: string | undefined, esPc: boolean) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { client: true, invoice: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    if (!sale.client?.telefono) {
      throw new BadRequestException('La venta no tiene un cliente con telefono asociado.');
    }

    let invoice = sale.invoice;
    if (!invoice?.pngUrl) {
      invoice = await this.generarPngParaEnvio(saleId);
    }
    if (!invoice.pngUrl) {
      throw new BadRequestException('No se pudo generar el PNG de la factura.');
    }

    const business = await this.getBusinessProfile();
    // Siempre de "usted" (nunca "tu"): se ve mas profesional. Al contado el
    // mensaje es breve, sin el monto (ya va en la imagen adjunta) y dando
    // las gracias. A credito se deja el mensaje con el monto: ahi si
    // importa que el cliente vea de una cuanto quedo debiendo.
    const firma = `${business.nombre}\n_un placer al comprar_`;
    const mensaje =
      sale.metodoPago === MetodoPago.CREDITO
        ? `Hola ${sale.client.nombre}, gracias por su compra en ${business.nombre}. Adjuntamos su factura ${invoice.numero} por un total de ${Number(sale.total).toFixed(2)}.`
        : `¡Hola ${sale.client.nombre}! Gracias por su compra. Aquí tiene su factura ${invoice.numero}.\n\n${firma}`;

    if (!esPc) {
      return this.respuestaEnvioDirecto(mensaje, invoice.pngUrl, sale.client.telefono);
    }
    return this.cola.encolar(saleId, mensaje, userId);
  }

  async findBySaleId(saleId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { saleId } });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');
    return invoice;
  }

  /**
   * Envia un recordatorio de saldo pendiente por WhatsApp (usado por Cobros).
   * Reusa el mismo agente .ahk que el envio normal de facturas: adjunta el
   * PNG de la factura de la venta (generandolo si hiciera falta) junto con
   * el texto del recordatorio, en vez del link manual wa.me de antes.
   */
  async sendDebtReminder(saleId: string, saldo: number, userId: string | undefined, esPc: boolean) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { client: true, invoice: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    if (!sale.client?.telefono) {
      throw new BadRequestException('El cliente no tiene un telefono registrado.');
    }

    let invoice = sale.invoice;
    if (!invoice?.pngUrl) {
      invoice = await this.generarPngParaEnvio(saleId);
    }
    if (!invoice.pngUrl) {
      throw new BadRequestException('No se pudo generar el PNG de la factura.');
    }

    const business = await this.getBusinessProfile();
    // De "usted", igual que el mensaje de venta: se ve mas profesional.
    const mensaje =
      `Hola ${sale.client.nombre}, le saludamos de ${business.nombre}. ` +
      `Le recordamos su saldo pendiente de RD$ ${saldo.toFixed(2)} (factura ${invoice.numero}). ` +
      `Cualquier duda, con gusto le ayudamos. ¡Gracias!`;

    if (!esPc) {
      return this.respuestaEnvioDirecto(mensaje, invoice.pngUrl, sale.client.telefono);
    }
    await this.cola.encolar(saleId, mensaje, userId);
    return { ok: true, whatsappEstado: 'EN_COLA' as const };
  }

  /**
   * Cuando quien pide el envio no esta en la propia PC, no tiene sentido
   * encolar para el agente de AutoHotkey (ver comentario en sendWhatsapp):
   * se le devuelve el mensaje y la imagen al frontend para que el navegador
   * del celular lo mande el mismo (Web Share API con el PNG adjunto, o el
   * link wa.me de solo texto como respaldo si el navegador no soporta
   * compartir archivos).
   */
  private respuestaEnvioDirecto(mensaje: string, imagenUrl: string, telefono: string) {
    return { modo: 'directo' as const, mensaje, imagenUrl, telefono };
  }

  /**
   * Convierte el logo (guardado como ruta relativa "/uploads/logo/x.webp")
   * en un data URI base64, para que se vea en la factura. Si ya es una URL
   * absoluta (BACKEND_PUBLIC_URL configurado) se deja tal cual, porque esa
   * si carga bien desde cualquier pagina. Si el archivo no se puede leer, la
   * factura sigue generandose igual, solo que sin logo.
   */
  private async resolverLogoParaFactura(
    logoUrl: string | null | undefined,
  ): Promise<string | null> {
    if (!logoUrl) return null;
    if (/^https?:\/\//i.test(logoUrl)) return logoUrl;

    const relativa = logoUrl.replace(/^\/uploads\//, '');
    const ruta = join(UPLOADS_DIR, relativa);
    try {
      const buffer = await fs.readFile(ruta);
      const ext = extname(ruta).slice(1).toLowerCase() || 'png';
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      return `data:image/${mime};base64,${buffer.toString('base64')}`;
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el logo (${ruta}) para incrustarlo en la factura: ${error}`,
      );
      return null;
    }
  }

  /**
   * Genera el PNG/PDF de una factura justo antes de mandarla por WhatsApp,
   * convirtiendo cualquier fallo del renderizador en un error 400 con un
   * mensaje util para el cajero.
   *
   * Sin esto, si el render fallaba (la app de escritorio no respondio, un
   * problema puntual del navegador interno, etc.) la peticion reventaba con un
   * 500 crudo: el cajero veia "Ocurrio un error inesperado en el servidor" sin
   * ninguna pista de que hacer. El resto del flujo (crear la venta) ya tolera
   * este fallo; el envio por WhatsApp era el unico punto donde escalaba.
   */
  private async generarPngParaEnvio(saleId: string) {
    try {
      return await this.generateForSale(saleId);
    } catch (error) {
      this.logger.error(`No se pudo generar la factura ${saleId} para enviarla: ${error}`);
      throw new BadRequestException(
        'No se pudo generar la imagen de la factura para enviarla. Reintenta en unos segundos; ' +
          'si el problema sigue, abre la factura desde Ventas y vuelve a intentarlo.',
      );
    }
  }

  private async getBusinessProfile() {
    const profile = await this.prisma.businessProfile.findFirst();
    return (
      profile ?? {
        nombre: 'Cafe Shopping',
        logoUrl: null,
        direccion: null,
        identifFiscal: null,
      }
    );
  }

  get integrationsStatus() {
    return {
      whatsapp: this.whatsapp.isConfigured,
    };
  }
}
