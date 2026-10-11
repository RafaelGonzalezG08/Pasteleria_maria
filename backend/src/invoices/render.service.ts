import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

/** Cuanto se espera a que la app de escritorio devuelva la factura renderizada. */
const RENDER_TIMEOUT_MS = 30000;

/**
 * Convierte el HTML de la factura en PNG o PDF.
 *
 * Hay dos caminos, y se elige solo:
 *
 * 1) App de escritorio (produccion): se le pide el render al proceso padre de
 *    Electron, que ya ES Chromium. Se comunica por el canal IPC que abre
 *    `fork()` (ver nativo.js). Asi la app NO necesita Puppeteer: su Chromium
 *    pesa ~300 MB y, peor, Puppeteer lo descarga al instalar las dependencias
 *    — en la PC de un cliente esa descarga nunca ocurre y la generacion de
 *    facturas fallaria. Aqui simplemente no hace falta un segundo navegador.
 *
 * 2) Sin proceso padre (desarrollo, o el contenedor de Docker): se usa
 *    Puppeteer como siempre, reutilizando una sola instancia de Chromium
 *    entre llamadas.
 */
@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

  /** true cuando corremos como proceso hijo de la app de escritorio. */
  private get tieneRenderizadorPadre(): boolean {
    // En los tests (jest) process.send TAMBIEN es una funcion (IPC del worker),
    // pero del otro lado no hay nadie que renderice: quedaria esperando 30s por
    // cada factura y jest no cerraria. Se trata como "sin renderizador".
    if (process.env.NODE_ENV === 'test') return false;
    return typeof process.send === 'function';
  }

  /**
   * Pide al proceso padre (Electron) que renderice el HTML y devuelva el
   * resultado. Cada peticion lleva un id propio porque el canal es compartido:
   * sin el, dos facturas generadas a la vez podrian quedarse con la respuesta
   * de la otra.
   */
  private pedirRenderAlPadre(
    tipo: 'png' | 'pdf',
    html: string,
    width: number,
    scale: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();

      const limpiar = () => {
        clearTimeout(temporizador);
        process.off('message', alRecibir);
      };

      const temporizador = setTimeout(() => {
        limpiar();
        reject(new Error('La app de escritorio no devolvio la factura a tiempo.'));
      }, RENDER_TIMEOUT_MS);

      const alRecibir = (mensaje: any) => {
        if (mensaje?.tipo !== 'render-resultado' || mensaje.id !== id) return;
        limpiar();
        if (mensaje.error) reject(new Error(String(mensaje.error)));
        else resolve(Buffer.from(mensaje.datosBase64, 'base64'));
      };

      process.on('message', alRecibir);
      process.send!({ tipo: 'render', formato: tipo, id, html, width, scale });
    });
  }

  /** Mensaje unico cuando se intenta renderizar fuera de la app de escritorio. */
  private sinRenderizador(): never {
    throw new Error(
      'La generacion de facturas requiere la app de escritorio: es la que aporta el navegador ' +
        'que dibuja el ticket. Arranca Cafe Shopping en vez de ejecutar el backend suelto.',
    );
  }

  async htmlToPng(html: string, viewportWidth = 420, scale = 3): Promise<Buffer> {
    if (this.tieneRenderizadorPadre) {
      const png = await this.pedirRenderAlPadre('png', html, viewportWidth, scale);
      return this.compressPng(png);
    }

    return this.sinRenderizador();
  }

  /**
   * Reduce el peso del PNG de la factura sin cambiar formato ni resolucion.
   *
   * Sigue siendo PNG a proposito: el agente de WhatsApp lo pega usando
   * `Set-Clipboard -Path` + Ctrl+V en WhatsApp Desktop (ver
   * send_whatsapp_agent.ahk), y ahi el formato importa — WhatsApp trata los
   * .webp como STICKERS, asi que convertirlo, aunque pesara menos, mandaria
   * la factura como sticker en vez de como imagen.
   *
   * Tampoco se baja la resolucion: se mantiene el render 3x para que el
   * cliente pueda hacer zoom sin que se vea pixelada.
   *
   * Lo que si se hace es reducir la paleta a 256 colores. Una factura es
   * texto plano sobre fondo claro con unos pocos tonos de marca, asi que
   * entra de sobra en 256 colores y el resultado es visualmente identico,
   * pero pesa ~60% menos (medido sobre facturas reales: 191 KB -> 73 KB).
   */
  private async compressPng(png: Buffer): Promise<Buffer> {
    try {
      const compressed = await sharp(png)
        .png({ palette: true, colours: 256, compressionLevel: 9, effort: 10 })
        .toBuffer();

      // Si por lo que sea la version con paleta saliera mas pesada, se queda
      // la original: el objetivo es que pese menos, no aplicar el filtro porque si.
      return compressed.length < png.length ? compressed : png;
    } catch (error) {
      this.logger.warn(
        `No se pudo comprimir el PNG de la factura, se envia sin comprimir: ${error}`,
      );
      return png;
    }
  }

  async htmlToPdf(html: string): Promise<Buffer> {
    if (this.tieneRenderizadorPadre) {
      return this.pedirRenderAlPadre('pdf', html, 794, 1);
    }

    return this.sinRenderizador();
  }
}
