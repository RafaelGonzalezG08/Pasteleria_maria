/** Minusculas y sin acentos, para comparar nombres sin que la tilde importe. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita las marcas de acento (á -> a)
    .trim()
    .toLowerCase();
}

/**
 * Primera palabra del nombre, ya normalizada. Es lo que se compara contra el
 * nombre de una categoria para clasificar una pieza sola ("Anillo solitario
 * oro" -> "anillo"). Devuelve '' si el nombre esta vacio.
 */
export function primeraPalabraNormalizada(nombre: string): string {
  return normalizarTexto((nombre ?? '').trim().split(/\s+/)[0] ?? '');
}
