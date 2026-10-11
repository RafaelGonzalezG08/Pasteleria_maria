import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { apiUrl, urlConToken } from '../lib/api';

/** URL final de la imagen (absoluta o servida por el backend), con cache-buster opcional. */
function resolverSrc(pngUrl: string, refreshKey?: number | string) {
  const base = pngUrl.startsWith('http') ? pngUrl : apiUrl(pngUrl);
  const conCacheBuster =
    refreshKey == null ? base : `${base}${base.includes('?') ? '&' : '?'}v=${refreshKey}`;
  return urlConToken(conCacheBuster);
}

/**
 * Visor a pantalla completa de la factura. Clic fuera o Escape para cerrar.
 * Se usa suelto en pantallas que ya tienen su propia miniatura (Transacciones).
 */
export function FacturaLightbox({
  pngUrl,
  refreshKey,
  onClose,
}: {
  pngUrl: string;
  refreshKey?: number | string;
  onClose: () => void;
}) {
  useEffect(() => {
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', alEscape);
    return () => document.removeEventListener('keydown', alEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-espresso-950/80 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-ink shadow-lg transition-colors hover:bg-white"
        aria-label="Cerrar"
      >
        <X size={20} />
      </button>
      <img
        src={resolverSrc(pngUrl, refreshKey)}
        alt="Factura"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-full rounded-lg bg-white shadow-2xl"
      />
    </div>
  );
}

/**
 * Miniatura de la factura. Al hacer clic se abre a pantalla completa para
 * leerla bien. Si aun no hay imagen, muestra un aviso en su lugar.
 */
export function FacturaImagen({
  pngUrl,
  refreshKey,
  className = '',
}: {
  pngUrl?: string | null;
  refreshKey?: number | string;
  className?: string;
}) {
  const [ampliada, setAmpliada] = useState(false);

  if (!pngUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-porcelain-300 py-10 text-center text-muted">
        <p className="text-xs">La factura aun no se genero o no se pudo dibujar.</p>
      </div>
    );
  }

  return (
    <>
      <img
        src={resolverSrc(pngUrl, refreshKey)}
        alt="Factura"
        onClick={() => setAmpliada(true)}
        className={`cursor-zoom-in rounded-lg border border-porcelain-200 transition-opacity hover:opacity-90 ${className}`}
      />
      {ampliada && (
        <FacturaLightbox pngUrl={pngUrl} refreshKey={refreshKey} onClose={() => setAmpliada(false)} />
      )}
    </>
  );
}
