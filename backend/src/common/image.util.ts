import { Logger } from '@nestjs/common';
import sharp from 'sharp';

const logger = new Logger('ImageUtil');

/**
 * Lado del cuadrado al que se reducen las fotos de producto.
 *
 * 1200 y no 800: en joyeria los detalles finos (eslabones de una cadena, el
 * pave de circonias) son justo lo que el cliente quiere mirar de cerca, y a
 * 800 px se notaban blandos al ampliarlos en pantallas de alta densidad. A
 * 1200 con calidad 90 las fotos siguen pesando ~60-90 KB — nada al lado de
 * los 2-3 MB que salen del celular — asi que no hay razon para apretar mas.
 */
const PRODUCT_SIZE = 1200;
/** Lado maximo del logo del negocio (se muestra a 42px en la factura y 36px en el menu). */
const LOGO_SIZE = 256;

/**
 * Limite de tamaño ANTES de comprimir, para el interceptor de subida.
 *
 * La foto se reduce y convierte a WebP en el servidor (ver
 * optimizeProductImage), asi que este numero no es "cuanto pesa la foto
 * final" - es solo un techo razonable para lo que sube el celular. Los
 * celulares modernos (48+ MP) sacan fotos de 10-20 MB sin comprimir; 5 MB
 * rechazaba fotos reales de joyeria antes de que el servidor llegara a
 * comprimirlas.
 */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

export interface OptimizedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/**
 * Reduce y comprime la foto de un producto.
 *
 * Las fotos salen del celular pesando varios MB (una llego a 2.9 MB), pero se
 * muestran a 144px en el catalogo y 96px en el POS. Como el POS carga TODAS
 * las fotos del catalogo de golpe, guardarlas al tamaño original hacia la
 * pantalla de venta cada vez mas lenta segun crecia el inventario, y ademas
 * inflaba los respaldos automaticos (que incluyen la carpeta uploads).
 *
 * Se recorta a cuadrado a proposito: la interfaz ya muestra las fotos dentro
 * de un recuadro cuadrado con `object-cover`, asi que el recorte iba a ocurrir
 * de todos modos — mejor hacerlo una vez al guardar (centrado en la pieza)
 * que en cada carga.
 *
 * WebP en vez de JPEG porque pesa bastante menos con la misma calidad visual y
 * conserva la transparencia (util para fotos de joyas recortadas del fondo).
 */
export async function optimizeProductImage(
  buffer: Buffer,
  mimetype: string,
): Promise<OptimizedImage> {
  try {
    const optimized = await sharp(buffer)
      .rotate() // respeta la orientacion EXIF del celular (si no, salen acostadas)
      .resize(PRODUCT_SIZE, PRODUCT_SIZE, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true,
      })
      .webp({ quality: 90 })
      .toBuffer();

    return { buffer: optimized, contentType: 'image/webp', ext: 'webp' };
  } catch (error) {
    // Si el archivo no se puede procesar (formato raro o corrupto), se guarda
    // tal cual en vez de rechazar la subida: es preferible una foto pesada a
    // que el usuario no pueda registrar su producto.
    logger.warn(`No se pudo optimizar la imagen, se guarda sin procesar: ${error}`);
    return { buffer, ...originalFormat(mimetype) };
  }
}

/** Formato real del archivo subido, para no mal-etiquetarlo si falla la optimizacion. */
function originalFormat(mimetype: string): { contentType: string; ext: string } {
  if (mimetype === 'image/png') return { contentType: mimetype, ext: 'png' };
  if (mimetype === 'image/webp') return { contentType: mimetype, ext: 'webp' };
  if (mimetype === 'image/svg+xml') return { contentType: mimetype, ext: 'svg' };
  return { contentType: 'image/jpeg', ext: 'jpg' };
}

/**
 * Reduce y comprime el logo del negocio, conservando la transparencia y sin
 * recortar (`fit: inside`): un logo recortado a cuadrado perderia parte del
 * diseño, a diferencia de la foto de una pieza.
 *
 * Los SVG se dejan intactos: rasterizarlos los volveria una imagen fija y
 * perderian la nitidez a cualquier tamaño, que es justo su ventaja.
 */
export async function optimizeLogo(buffer: Buffer, mimetype: string): Promise<OptimizedImage> {
  if (mimetype === 'image/svg+xml') {
    return { buffer, contentType: mimetype, ext: 'svg' };
  }

  try {
    const optimized = await sharp(buffer)
      .rotate()
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();

    return { buffer: optimized, contentType: 'image/webp', ext: 'webp' };
  } catch (error) {
    logger.warn(`No se pudo optimizar el logo, se guarda sin procesar: ${error}`);
    return { buffer, ...originalFormat(mimetype) };
  }
}
