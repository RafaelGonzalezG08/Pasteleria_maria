import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EstadoFactura, EstadoWhatsapp } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WhatsappService } from './whatsapp.service';

/**
 * Cola de envio de facturas por WhatsApp.
 *
 * El "Enviar por WhatsApp" ya no espera al agente dentro de la peticion HTTP
 * (que podia tardar hasta 4 minutos y dejar al cajero mirando un spinner). En
 * su lugar:
 *
 *   1) `encolar()` marca la factura como EN_COLA y responde al instante.
 *   2) `procesar()` corre cada pocos segundos, toma UNA factura de la cola, se
 *      la pasa al agente y espera su confirmacion. Si sale bien -> ENVIADA. Si
 *      falla, reintenta con espera creciente (backoff) hasta MAX_INTENTOS; ahi
 *      queda en ERROR y el cajero puede reintentar a mano desde Ventas.
 *
 * Se procesa de a una para no abrir varias ventanas de render / varias
 * automatizaciones de WhatsApp Desktop a la vez.
 */
@Injectable()
export class WhatsappQueueService {
  private readonly logger = new Logger(WhatsappQueueService.name);
  private procesando = false;

  private readonly MAX_INTENTOS = 5;
  /** Espera antes del reintento n (segundos): 30s, 1m, 3m, 10m, 30m. */
  private readonly BACKOFF_SEG = [30, 60, 180, 600, 1800];

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Pone una factura en la cola de envio. El PNG ya tiene que existir (lo
   * asegura InvoicesService antes de llamar aqui).
   */
  async encolar(saleId: string, mensaje: string, userId?: string) {
    const invoice = await this.prisma.invoice.update({
      where: { saleId },
      data: {
        whatsappEstado: EstadoWhatsapp.EN_COLA,
        whatsappMensaje: mensaje,
        whatsappIntentos: 0,
        whatsappProximoIntento: new Date(),
        ultimoError: null,
      },
    });
    await this.audit.log('Invoice', invoice.id, 'UPDATE', userId, { accion: 'whatsapp-encolar' });
    // Un empujon para no esperar al proximo tick si la cola estaba vacia.
    void this.procesar();
    return invoice;
  }

  @Interval(12000)
  async procesar() {
    if (this.procesando) return;
    this.procesando = true;
    try {
      await this.procesarUna();
    } catch (error) {
      this.logger.error(`Error procesando la cola de WhatsApp: ${error}`);
    } finally {
      this.procesando = false;
    }
  }

  private async procesarUna() {
    const ahora = new Date();
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        whatsappEstado: EstadoWhatsapp.EN_COLA,
        OR: [{ whatsappProximoIntento: null }, { whatsappProximoIntento: { lte: ahora } }],
      },
      orderBy: { whatsappProximoIntento: 'asc' },
      include: { sale: { include: { client: true } } },
    });
    if (!invoice) return;

    const telefono = invoice.sale.client?.telefono;
    if (!telefono) {
      await this.marcarError(invoice.id, 'El cliente ya no tiene un telefono registrado.');
      return;
    }
    if (!invoice.pngUrl) {
      await this.marcarError(
        invoice.id,
        'La factura no tiene imagen generada. Abrela desde Ventas para regenerarla y reintenta.',
      );
      return;
    }

    const pngKey = `invoices/${invoice.numero}.png`;
    const mensaje = invoice.whatsappMensaje ?? `Adjuntamos su factura ${invoice.numero}.`;
    const result = await this.whatsapp.sendInvoice(telefono, pngKey, mensaje);

    if (result.ok) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          whatsappEstado: EstadoWhatsapp.ENVIADA,
          estado: EstadoFactura.ENVIADA,
          sentWhatsappAt: new Date(),
          ultimoError: null,
          whatsappProximoIntento: null,
        },
      });
      await this.audit.log('Invoice', invoice.id, 'UPDATE', undefined, {
        accion: 'whatsapp-enviada',
      });
      this.logger.log(`Factura ${invoice.numero} enviada por WhatsApp.`);
      return;
    }

    const intentos = invoice.whatsappIntentos + 1;
    if (intentos >= this.MAX_INTENTOS) {
      await this.marcarError(
        invoice.id,
        `No se pudo enviar tras ${intentos} intentos: ${result.errorMessage ?? 'sin detalle'}.`,
        intentos,
      );
      return;
    }

    const esperaSeg = this.BACKOFF_SEG[Math.min(intentos - 1, this.BACKOFF_SEG.length - 1)];
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        whatsappIntentos: intentos,
        whatsappProximoIntento: new Date(Date.now() + esperaSeg * 1000),
        ultimoError: result.errorMessage ?? null,
      },
    });
    this.logger.warn(
      `Fallo el envio de ${invoice.numero} (intento ${intentos}/${this.MAX_INTENTOS}). Reintento en ${esperaSeg}s.`,
    );
  }

  private async marcarError(invoiceId: string, mensaje: string, intentos?: number) {
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        whatsappEstado: EstadoWhatsapp.ERROR,
        ultimoError: mensaje,
        whatsappProximoIntento: null,
        ...(intentos !== undefined ? { whatsappIntentos: intentos } : {}),
      },
    });
    await this.audit.log('Invoice', invoiceId, 'UPDATE', undefined, {
      accion: 'whatsapp-error',
      mensaje,
    });
  }
}
