/**
 * Interpreta el mensaje de WhatsApp que genera el catalogo web (ver
 * catalogo/plantilla.ts, boton "Pedir por WhatsApp") para poder crear el
 * pedido en la app pegando ese mismo texto — sin pedirle nada mas a quien
 * atiende.
 *
 * El mensaje siempre tiene esta forma (los asteriscos de negrita puede que
 * sobrevivan o no al copiar desde WhatsApp Desktop, por eso son opcionales
 * en el patron):
 *
 *   Hola! Quiero hacer este pedido *#PED-K3F7Q2*:
 *
 *   2 x Anillo oro 18k (AN-0001) - RD$ 3,000.00
 *   1 x Cadena plata (CA-0002) - RD$ 900.00
 *
 *   Total: RD$ 3,900.00
 */

export interface ItemPedidoWeb {
  cantidad: number;
  nombre: string;
  sku: string | null;
  /** Precio de la LINEA completa (cantidad x unitario), tal como lo manda el mensaje. */
  total: number;
}

export interface PedidoWebParseado {
  codigo: string;
  items: ItemPedidoWeb[];
  total: number;
}

const PATRON_CODIGO = /#\s*\*{0,2}(PED-[A-Z0-9]{4,12})\*{0,2}/i;
const PATRON_ITEM = /^\s*(\d+)\s*x\s*(.+?)\s*\(([^()]+)\)\s*-\s*RD\$\s*([\d.,]+)\s*$/im;
const PATRON_TOTAL = /Total:?\s*RD\$\s*([\d.,]+)/i;

/** "1,234.56" o "1234.56" -> 1234.56. Nunca lanza: si no puede leerlo, devuelve NaN. */
function aNumero(texto: string): number {
  return Number(texto.replace(/,/g, ''));
}

/**
 * Devuelve el pedido interpretado, o `null` si el texto no tiene la forma
 * esperada (para que quien lo pega reciba "no reconozco este texto" en vez
 * de un pedido a medias o con numeros inventados).
 */
export function parsearPedidoWeb(textoOriginal: string): PedidoWebParseado | null {
  const texto = textoOriginal.trim();
  if (!texto) return null;

  const matchCodigo = texto.match(PATRON_CODIGO);
  const matchTotal = texto.match(PATRON_TOTAL);
  if (!matchCodigo || !matchTotal) return null;

  const items: ItemPedidoWeb[] = [];
  for (const linea of texto.split('\n')) {
    const m = linea.match(PATRON_ITEM);
    if (!m) continue;
    const total = aNumero(m[4]);
    if (!Number.isFinite(total)) continue;
    items.push({
      cantidad: Number(m[1]),
      nombre: m[2].trim(),
      sku: m[3].trim() || null,
      total,
    });
  }

  if (items.length === 0) return null;

  const total = aNumero(matchTotal[1]);
  if (!Number.isFinite(total)) return null;

  return { codigo: matchCodigo[1].toUpperCase(), items, total };
}
