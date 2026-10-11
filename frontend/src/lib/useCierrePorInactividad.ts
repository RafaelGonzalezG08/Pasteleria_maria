import { useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import { actividadVencida, avisarSesionExpirada, marcarActividad } from './sesion';

const REVISAR_CADA_MS = 15_000;
const NO_REGISTRAR_MAS_SEGUIDO_QUE_MS = 5_000;

// Solo gestos deliberados: el movimiento del mouse y las consultas que la app
// hace sola cada minuto NO cuentan como actividad.
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * Cierra la sesion tras 30 minutos sin que el usuario toque nada, aunque la
 * app siga abierta. El borrador del POS y de los formularios ya se guarda
 * solo (usePersistedState), asi que no se pierde lo que se estaba haciendo.
 */
export function useCierrePorInactividad() {
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    let ultimoRegistro = 0;

    function cerrarSiVencio(): boolean {
      if (!actividadVencida()) return false;
      avisarSesionExpirada();
      logout();
      return true;
    }

    function alActividad() {
      // Si ya vencio, un clic tardio no debe "revivir" la sesion antes de que
      // la revision periodica llegue a cerrarla.
      if (cerrarSiVencio()) return;
      const ahora = Date.now();
      if (ahora - ultimoRegistro < NO_REGISTRAR_MAS_SEGUIDO_QUE_MS) return;
      ultimoRegistro = ahora;
      marcarActividad(ahora);
    }

    // scroll no burbujea: se escucha en captura (el area que scrollea es <main>).
    for (const e of EVENTOS) window.addEventListener(e, alActividad, { passive: true, capture: true });
    const revisar = () => void cerrarSiVencio();
    document.addEventListener('visibilitychange', revisar);
    window.addEventListener('focus', revisar);
    const id = setInterval(revisar, REVISAR_CADA_MS);

    return () => {
      for (const e of EVENTOS) window.removeEventListener(e, alActividad, { capture: true });
      document.removeEventListener('visibilitychange', revisar);
      window.removeEventListener('focus', revisar);
      clearInterval(id);
    };
  }, [logout]);
}
