import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * `useState` que ademas guarda el valor en el navegador, para que el trabajo a
 * medias no se pierda si el usuario sale de la pagina por accidente.
 *
 * Por que localStorage y no sessionStorage: la app de escritorio (Electron)
 * cierra la "sesion" del navegador al cerrarse. Con localStorage, una venta a
 * medio armar sobrevive incluso si se cierra la app sin querer o se va la luz.
 *
 * Los borradores caducan a las 12 horas (BORRADOR_TTL_MS): sin eso, el carrito
 * de anteayer reaparecia al abrir el punto de venta, que confunde mas de lo que
 * ayuda. Al guardar con exito, cada pantalla limpia su propio borrador.
 *
 * OJO: nunca guardar aqui contraseñas ni datos sensibles — esto queda escrito
 * en el disco de la PC en texto plano.
 */

const PREFIJO = 'cafe-shopping:borrador:';
const BORRADOR_TTL_MS = 12 * 60 * 60 * 1000;

interface Guardado<T> {
  guardadoEn: number;
  valor: T;
}

function leer<T>(storageKey: string, valorInicial: T): T {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return valorInicial;

    const parsed = JSON.parse(raw) as Guardado<T>;
    if (typeof parsed?.guardadoEn !== 'number' || Date.now() - parsed.guardadoEn > BORRADOR_TTL_MS) {
      localStorage.removeItem(storageKey);
      return valorInicial;
    }
    return parsed.valor;
  } catch {
    // Borrador corrupto o localStorage bloqueado: se arranca limpio en vez de
    // romper la pantalla.
    return valorInicial;
  }
}

export function usePersistedState<T>(clave: string, valorInicial: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = PREFIJO + clave;
  const [valor, setValor] = useState<T>(() => leer(storageKey, valorInicial));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ guardadoEn: Date.now(), valor }));
    } catch {
      // Sin espacio o modo privado: el borrador simplemente no se guarda.
    }
  }, [storageKey, valor]);

  return [valor, setValor];
}

/** Borra un borrador concreto (se usa al guardar con exito). */
export function limpiarBorrador(clave: string) {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch {
    // Nada que hacer si el navegador no deja tocar localStorage.
  }
}
