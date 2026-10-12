/**
 * Busqueda por palabras sueltas, sin importar el orden: "pastel fresa"
 * encuentra "Pastel de chocolate y fresa" aunque "fresa" no vaya pegado a "pastel".
 * Antes se buscaba la frase completa tal cual ("pastel fresa" como texto
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
