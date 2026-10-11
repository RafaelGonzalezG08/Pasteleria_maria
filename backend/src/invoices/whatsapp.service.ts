import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from '../common/paths';

export interface WhatsappSendResult {
  ok: boolean;
  sid?: string;
  errorMessage?: string;
}

/**
 * Envia facturas por WhatsApp usando WhatsApp Desktop en la PC del negocio,
 * en vez de Twilio (API paga).
 *
 * Como funciona:
 * 1) Este servicio deja un archivo "pedido" (.job) en la carpeta
 *    uploads/whatsapp-queue/ de los datos del usuario.
 * 2) send_whatsapp_agent.ahk (o .exe) corre en la PC como un agente en segundo
 *    plano: revisa esa carpeta cada pocos segundos, y cuando encuentra un .job
 *    saca el PNG de la factura, lo pega en el chat de WhatsApp Desktop del
 *    cliente junto con el texto, y escribe la confirmacion en
 *    uploads/whatsapp-results/.
 * 3) Este servicio espera (poll) esa confirmacion un tiempo maximo y responde.
 *
 * Casi nadie llama a este servicio directamente: WhatsappQueueService lo usa
 * desde la cola en segundo plano, con reintentos.
 *
 * IMPORTANTE: para que esto funcione, el agente debe estar corriendo en la PC
 * donde esta abierto WhatsApp Desktop.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly uploadsDir = UPLOADS_DIR;
  private readonly queueDir = join(this.uploadsDir, 'whatsapp-queue');
  private readonly resultsDir = join(this.uploadsDir, 'whatsapp-results');

  /**
   * Cuanto esperamos a que el agente de WhatsApp confirme el envio.
   * x4 (era 60000): send_whatsapp_agent.ahk tambien cuadruplico sus propios
   * tiempos de espera para PCs menos potentes, asi que este limite tiene que
   * crecer igual - si no, el backend reportaria "timeout" por un envio que
   * en realidad iba a terminar bien, solo que un poco mas tarde.
   */
  private readonly timeoutMs = Number(process.env.WHATSAPP_AGENT_TIMEOUT_MS || 240000);
  /** Cada cuanto revisamos si ya llego la confirmacion. */
  private readonly pollMs = Number(process.env.WHATSAPP_AGENT_POLL_MS || 1500);

  get isConfigured(): boolean {
    // El agente local no requiere credenciales: siempre esta "configurado".
    // Lo unico que puede fallar en tiempo real es que el .ahk no este corriendo,
    // lo cual se refleja como timeout al enviar, no aqui.
    return true;
  }

  /**
   * Encola el envio de una factura. `pngKey` es la ruta relativa dentro de
   * uploads (ej. "invoices/FAC-2026-00010.png"), la misma que arma
   * StorageService al guardar el archivo localmente.
   */
  async sendInvoice(toPhone: string, pngKey: string, message: string): Promise<WhatsappSendResult> {
    const jobId = randomUUID();
    const filename = pngKey.split('/').pop() ?? pngKey;

    try {
      await fs.mkdir(this.queueDir, { recursive: true });
      await fs.mkdir(this.resultsDir, { recursive: true });

      const jobPath = join(this.queueDir, `${jobId}.job`);
      const jobContent = buildJobFile({ phone: normalizePhone(toPhone), filename, message });
      await fs.writeFile(jobPath, jobContent, 'utf-8');

      this.logger.log(`Factura encolada para WhatsApp (job ${jobId}, archivo ${filename}).`);

      const result = await this.waitForResult(jobId);
      return result;
    } catch (error: any) {
      this.logger.error(`Error encolando WhatsApp para ${toPhone}: ${error?.message ?? error}`);
      return { ok: false, errorMessage: error?.message ?? 'Error desconocido encolando el envio.' };
    }
  }

  private async waitForResult(jobId: string): Promise<WhatsappSendResult> {
    const resultPath = join(this.resultsDir, `${jobId}.result`);
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      try {
        const raw = await fs.readFile(resultPath, 'utf-8');
        await fs.unlink(resultPath).catch(() => undefined);
        return parseResultFile(raw, jobId);
      } catch {
        // Todavia no existe el resultado: seguimos esperando.
        await sleep(this.pollMs);
      }
    }

    const msg =
      'El agente de WhatsApp (send_whatsapp_agent.ahk) no confirmo el envio a tiempo. ' +
      'Verifica que el script este corriendo en la PC y que WhatsApp Desktop este abierto.';
    this.logger.warn(`Timeout esperando confirmacion del job ${jobId}.`);
    return { ok: false, sid: jobId, errorMessage: msg };
  }

  /**
   * Barre los archivos viejos de las carpetas de la cola. En condiciones
   * normales cada .job y cada .result se borra al procesarse, pero si un envio
   * caduca (timeout) el .result puede aparecer despues y quedar huerfano, y un
   * .job puede quedar tirado si el agente estaba caido. Sin esto se van
   * acumulando para siempre.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async limpiarArchivosViejos() {
    const limiteMs = 24 * 60 * 60 * 1000; // mas de un dia = huerfano
    let borrados = 0;
    for (const dir of [this.queueDir, this.resultsDir]) {
      let entradas: string[];
      try {
        entradas = await fs.readdir(dir);
      } catch {
        continue; // la carpeta aun no existe
      }
      for (const nombre of entradas) {
        const ruta = join(dir, nombre);
        try {
          const info = await fs.stat(ruta);
          if (Date.now() - info.mtimeMs > limiteMs) {
            await fs.unlink(ruta);
            borrados += 1;
          }
        } catch {
          // se lo llevo el agente entremedio, no pasa nada
        }
      }
    }
    if (borrados > 0) {
      this.logger.log(
        `Limpieza de la cola de WhatsApp: ${borrados} archivo(s) viejo(s) borrado(s).`,
      );
    }
  }
}

function buildJobFile(data: { phone: string; filename: string; message: string }): string {
  // Formato simple linea a linea (clave=valor) para que el .ahk lo pueda leer
  // sin necesitar una libreria de JSON. `message` va siempre en la ultima
  // linea y puede contener "=", por eso se parte solo en el primer "=".
  return [`phone=${data.phone}`, `filename=${data.filename}`, `message=${data.message}`].join('\n');
}

function parseResultFile(raw: string, jobId: string): WhatsappSendResult {
  const firstLine = raw.split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (firstLine.startsWith('OK')) {
    return { ok: true, sid: jobId };
  }
  const errorMessage = firstLine.startsWith('ERROR:')
    ? firstLine.slice('ERROR:'.length).trim() ||
      'El agente de WhatsApp reporto un error sin detalle.'
    : firstLine || 'El agente de WhatsApp reporto un error sin detalle.';
  return { ok: false, sid: jobId, errorMessage };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lleva el telefono a formato E.164 (+codigoPais + numero), que es lo que el
 * agente escribe en la busqueda de WhatsApp Desktop.
 *
 * La mayoria de los clientes son de Republica Dominicana y sus numeros se
 * guardan de mil formas: "809 555 1234", "(829) 555-1234", "18495551234",
 * "+1 809-555-1234". Todos esos son el mismo numero y tienen que terminar como
 * "+18095551234". Los que ya traen un codigo de pais distinto (empiezan con
 * "+") se respetan tal cual.
 */
function normalizePhone(phone: string): string {
  const raw = phone.trim();
  const soloDigitos = raw.replace(/[^0-9]/g, '');

  // Ya viene con "+": se respeta el pais, solo se limpian separadores.
  if (raw.startsWith('+')) return `+${soloDigitos}`;

  // 10 digitos y area dominicana (809/829/849): falta el "1" de pais.
  if (soloDigitos.length === 10 && /^(809|829|849)/.test(soloDigitos)) {
    return `+1${soloDigitos}`;
  }
  // 11 digitos que empiezan por "1" + area dominicana: ya trae el pais.
  if (soloDigitos.length === 11 && /^1(809|829|849)/.test(soloDigitos)) {
    return `+${soloDigitos}`;
  }
  // Cualquier otra cosa: se antepone "+" y que el agente resuelva.
  return `+${soloDigitos}`;
}
