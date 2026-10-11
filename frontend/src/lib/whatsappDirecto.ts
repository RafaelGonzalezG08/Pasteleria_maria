import { apiUrl, urlConToken } from './api';

/**
 * Lo que devuelve el backend cuando "Enviar por WhatsApp" (o el recordatorio
 * de deuda) NO viene de la propia PC (ver backend/src/common/network.util.ts
 * -> esConexionLocal): en vez de encolar para el agente de AutoHotkey (que
 * pega el mensaje en el WhatsApp Desktop de la PC, no tiene sentido si quien
 * pidio el envio esta en su celular), el backend arma el mensaje y la imagen
 * y le toca al propio navegador mandarlo.
 */
export interface EnvioWhatsappDirecto {
  modo: 'directo';
  mensaje: string;
  imagenUrl: string;
  telefono: string;
}

export function esEnvioDirecto(resultado: unknown): resultado is EnvioWhatsappDirecto {
  return Boolean(resultado) && typeof resultado === 'object' && (resultado as any).modo === 'directo';
}

/**
 * true si el navegador puede compartir un archivo (imagen) via la hoja de
 * compartir nativa del sistema (navigator.share). No hace falta red para
 * comprobarlo: un File vacio del tipo correcto alcanza para que
 * canShare({files}) responda si ese tipo de contenido es compartible aqui.
 */
export function tieneSoporteCompartirArchivos(): boolean {
  try {
    const nav = navigator as Navigator & {
      share?: (data: ShareData) => Promise<void>;
      canShare?: (data: ShareData) => boolean;
    };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    const archivoDePrueba = new File([], 'factura.png', { type: 'image/png' });
    return nav.canShare({ files: [archivoDePrueba] });
  } catch {
    return false;
  }
}

/**
 * Llamar SINCRONICAMENTE dentro del onClick, antes de cualquier `await`.
 *
 * Si el navegador no puede compartir archivos, vamos a terminar necesitando
 * abrir wa.me (solo texto) despues de esperar la respuesta del backend --
 * eso ya queda fuera del gesto de click original, y Safari/Chrome en el
 * celular lo tratarian como una ventana emergente no pedida y la bloquean
 * (mismo problema que ya resuelve el catalogo web, ver
 * backend/src/catalogo/plantilla.ts). Por eso la pestaña se abre en blanco
 * YA, dentro del click, y despues solo se le cambia la direccion.
 *
 * Cuando si hay soporte para compartir archivos no hace falta nada de esto:
 * navigator.share no abre una pestaña, asi que no hay bloqueo de popups que
 * evitar.
 */
export function abrirPestanaRespaldoSiHaceFalta(): Window | null {
  if (tieneSoporteCompartirArchivos()) return null;
  return window.open('about:blank', '_blank');
}

/**
 * Manda el WhatsApp desde el propio celular: intenta compartir la imagen +
 * el texto via la hoja nativa (el usuario elige WhatsApp y el contacto ahi
 * mismo, el navegador no puede elegirlo por el). Si el navegador no soporta
 * compartir archivos, o algo falla al bajar la imagen, cae al link de solo
 * texto de toda la vida (wa.me) -- ya con el numero correcto precargado,
 * aunque sin la imagen adjunta (una pagina web no puede meterle un archivo a
 * WhatsApp por un link, esa parte requeriria abrir la app nativa).
 */
export async function enviarWhatsappDesdeCelular(
  resultado: EnvioWhatsappDirecto,
  pestanaRespaldo: Window | null,
): Promise<void> {
  const telefono = resultado.telefono.replace(/[^0-9]/g, '');
  const linkSoloTexto = `https://wa.me/${telefono}?text=${encodeURIComponent(resultado.mensaje)}`;

  if (!pestanaRespaldo) {
    // abrirPestanaRespaldoSiHaceFalta() ya confirmo que hay soporte antes de
    // llamar al backend.
    try {
      const url = urlConToken(
        resultado.imagenUrl.startsWith('http') ? resultado.imagenUrl : apiUrl(resultado.imagenUrl),
      );
      const respuesta = await fetch(url);
      const blob = await respuesta.blob();
      const archivo = new File([blob], 'factura.png', { type: blob.type || 'image/png' });
      const nav = navigator as Navigator & { share: (data: ShareData) => Promise<void> };
      await nav.share({ files: [archivo], text: resultado.mensaje });
      return;
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return; // el usuario cerro la hoja de compartir
      window.open(linkSoloTexto, '_blank');
      return;
    }
  }

  pestanaRespaldo.location.href = linkSoloTexto;
}
