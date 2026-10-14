import { create } from 'zustand';

/**
 * Modo claro / oscuro. Store global (un solo estado para toda la app). El tema
 * se guarda en localStorage y se refleja como la clase "dark" en <html>
 * (Tailwind darkMode: 'class'). index.html ya aplica la clase antes de pintar
 * para que no haya parpadeo; aqui solo se alterna.
 */
const CLAVE = 'pasteleria-maria-tema';
export type Tema = 'claro' | 'oscuro';

function leerInicial(): Tema {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado === 'claro' || guardado === 'oscuro') return guardado;
  } catch {
    /* localStorage bloqueado: se usa el claro */
  }
  // Sin preferencia guardada arranca en claro aunque Windows este en oscuro:
  // la paleta de Rosa Delicias (rosa pastel y pistacho) esta pensada clara.
  // La misma logica vive duplicada en index.html (se aplica antes de que
  // cargue este modulo) -- tocar las dos.
  return 'claro';
}

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  // Apaga las transiciones un instante: sin esto, cambiar de tema hace que
  // TODA la pantalla haga un cross-fade de colores (se ve descuidado).
  raiz.classList.add('cambiando-tema');
  raiz.classList.toggle('dark', tema === 'oscuro');
  window.setTimeout(() => raiz.classList.remove('cambiando-tema'), 120);
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    /* sin persistencia, pero el tema igual se aplica en esta sesion */
  }
}

interface EstadoTema {
  tema: Tema;
  esOscuro: boolean;
  alternar: () => void;
}

const inicial = leerInicial();

export const useTheme = create<EstadoTema>((set, get) => ({
  tema: inicial,
  esOscuro: inicial === 'oscuro',
  alternar: () => {
    const nuevo: Tema = get().tema === 'oscuro' ? 'claro' : 'oscuro';
    aplicar(nuevo);
    set({ tema: nuevo, esOscuro: nuevo === 'oscuro' });
  },
}));
