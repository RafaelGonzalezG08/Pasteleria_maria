import { useState } from 'react';

/** Filas por pagina en todas las listas largas de la app. */
export const TAMANO_PAGINA = 50;

/**
 * Aritmetica de la paginacion, aparte del hook para poder probarla sin React.
 * `pagina` se acota al rango valido: si la lista se encogio (se elimino algo)
 * la pagina pedida puede haber quedado fuera.
 */
export function calcularPagina(total: number, pagina: number, tamano: number = TAMANO_PAGINA) {
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const actual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (actual - 1) * tamano;
  return {
    pagina: actual,
    totalPaginas,
    inicio,
    fin: Math.min(inicio + tamano, total),
    desde: total === 0 ? 0 : inicio + 1,
  };
}

/**
 * Pagina una lista que ya esta en memoria. El servidor devuelve todo de una
 * vez (unos cientos de KB aun con miles de clientes); lo que de verdad tarda
 * es DIBUJAR cientos de filas y fotos, y eso es lo que esto recorta.
 *
 * @param reiniciarCon valores (busqueda, pestaña, filtros...) que al cambiar
 *   devuelven a la pagina 1: sin esto, filtrar desde la pagina 8 dejaba una
 *   pagina vacia.
 */
export function usePaginacion<T>(items: T[], reiniciarCon: unknown[] = [], tamano = TAMANO_PAGINA) {
  const [pagina, setPagina] = useState(1);
  const clave = JSON.stringify(reiniciarCon);
  const [claveVista, setClaveVista] = useState(clave);
  if (clave !== claveVista) {
    // Estado derivado durante el render (patron permitido por React): evita
    // pintar un frame con la pagina vieja antes de reiniciarla.
    setClaveVista(clave);
    setPagina(1);
  }

  const total = items.length;
  const p = calcularPagina(total, pagina, tamano);

  function irA(nueva: number) {
    setPagina(calcularPagina(total, nueva, tamano).pagina);
    // El que scrollea es <main> (ver Layout), no la ventana.
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return {
    visibles: items.slice(p.inicio, p.fin),
    pagina: p.pagina,
    totalPaginas: p.totalPaginas,
    total,
    desde: p.desde,
    hasta: p.fin,
    irA,
  };
}

export type Paginacion = ReturnType<typeof usePaginacion>;
