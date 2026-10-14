import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { Paginacion } from '../lib/usePaginacion';

const BOTON =
  'flex h-9 w-9 items-center justify-center rounded-lg bg-porcelain-100 text-ink shadow-neu-sm transition-all ' +
  'hover:text-copper-600 active:shadow-neu-pressed disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none';

/**
 * Controles de pagina para una lista paginada con usePaginacion. No dibuja
 * nada si todo cabe en una sola pagina.
 */
export function Paginador({ p, etiqueta = 'resultados' }: { p: Paginacion; etiqueta?: string }) {
  if (p.totalPaginas <= 1) return null;

  return (
    <nav
      aria-label="Paginacion"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
    >
      <p className="tabular-nums">
        Mostrando <span className="font-semibold text-ink">{p.desde}–{p.hasta}</span> de{' '}
        <span className="font-semibold text-ink">{p.total}</span> {etiqueta}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={BOTON} onClick={() => p.irA(1)} disabled={p.pagina === 1} aria-label="Primera pagina">
          <ChevronsLeft size={16} />
        </button>
        <button type="button" className={BOTON} onClick={() => p.irA(p.pagina - 1)} disabled={p.pagina === 1} aria-label="Pagina anterior">
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[7rem] px-2 text-center tabular-nums">
          Pagina <span className="font-semibold text-ink">{p.pagina}</span> de {p.totalPaginas}
        </span>
        <button
          type="button"
          className={BOTON}
          onClick={() => p.irA(p.pagina + 1)}
          disabled={p.pagina === p.totalPaginas}
          aria-label="Pagina siguiente"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className={BOTON}
          onClick={() => p.irA(p.totalPaginas)}
          disabled={p.pagina === p.totalPaginas}
          aria-label="Ultima pagina"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </nav>
  );
}
