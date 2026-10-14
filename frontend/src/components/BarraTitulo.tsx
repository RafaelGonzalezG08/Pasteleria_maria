import { useEffect, useState } from 'react';
import insignia from '../assets/insignia-rosa-delicias.png';

/** Mismos valores que ALTO_BARRA_TITULO / COLOR_BARRA_TITULO / COLOR_SIMBOLOS_BARRA en desktop/main.js (y --alto-barra en index.css). */
const ALTO_PX = 36;
const COLOR_BARRA = '#f2bec4';
const COLOR_TEXTO = '#4a5a1e';

interface WindowControlsOverlay {
  visible: boolean;
  addEventListener(tipo: 'geometrychange', fn: () => void): void;
  removeEventListener(tipo: 'geometrychange', fn: () => void): void;
}
type ConWco = Navigator & { windowControlsOverlay?: WindowControlsOverlay };

function barraActiva(): boolean {
  const wco = (navigator as ConWco).windowControlsOverlay;
  if (wco?.visible) return true;
  // Respaldo: Electron en Windows (main.js crea la ventana con titleBarOverlay).
  if (/Electron\//.test(navigator.userAgent) && /Windows/.test(navigator.userAgent)) return true;
  // Solo en desarrollo: ?barra en la URL permite ver la barra desde un navegador.
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has('barra');
}

/**
 * Barra de titulo propia de la app de escritorio. Electron dibuja los botones
 * de minimizar/maximizar/cerrar encima de la esquina derecha (titleBarOverlay,
 * ver desktop/main.js); aqui va el resto: logo y nombre, y toda la barra es
 * zona de arrastre. En un navegador normal (desarrollo) no se muestra.
 */
export function BarraTitulo() {
  const [activa, setActiva] = useState(barraActiva);

  useEffect(() => {
    const wco = (navigator as ConWco).windowControlsOverlay;
    const actualizar = () => setActiva(barraActiva());
    wco?.addEventListener('geometrychange', actualizar);
    return () => wco?.removeEventListener('geometrychange', actualizar);
  }, []);

  // El resto de la interfaz se corre hacia abajo con esta variable (ver index.css).
  useEffect(() => {
    document.documentElement.classList.toggle('con-barra-titulo', activa);
    return () => document.documentElement.classList.remove('con-barra-titulo');
  }, [activa]);

  if (!activa) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex select-none items-center gap-2 px-3"
      // Color fijo, no un token del tema: en modo oscuro copper-600 se aclara y
      // ya no coincidiria con los botones nativos que Windows pinta encima.
      style={{ height: ALTO_PX, backgroundColor: COLOR_BARRA, color: COLOR_TEXTO, WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Circulo crema (el fondo del logo): sin el, la rosa se perdia sobre el rosado de la barra. */}
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#f4f5f0] shadow-sm">
        <img src={insignia} alt="" className="h-6 w-6 object-contain" />
      </span>
      <span className="font-lema text-[14px] font-semibold italic tracking-wide">Rosa Delicias</span>
    </div>
  );
}
