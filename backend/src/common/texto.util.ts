/** Minusculas y sin acentos, para comparar nombres sin que la tilde importe. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita las marcas de acento (á -> a)
    .trim()
    .toLowerCase();
}
