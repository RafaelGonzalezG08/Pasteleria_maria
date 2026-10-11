/**
 * Busqueda por palabras sueltas, sin importar el orden: "anillo verde"
 * encuentra "Anillo Piedra Verde" aunque "verde" no vaya pegado a "anillo".
 * Antes se buscaba la frase completa tal cual ("anillo verde" como texto
 * seguido), asi que cualquier palabra de mas entre medio hacia fallar la
 * busqueda.
 *
 * Cada palabra de la consulta tiene que aparecer en ALGUNA PARTE del texto
 * (no necesariamente todas en el mismo orden ni pegadas).
 */
export function coincideBusqueda(texto: string, consulta: string): boolean {
  const palabras = consulta.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const textoNormalizado = texto.toLowerCase();
  return palabras.every((palabra) => textoNormalizado.includes(palabra));
}
