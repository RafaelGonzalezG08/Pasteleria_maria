import { Sparkles, X, Trash2, Loader2, ArrowRight } from 'lucide-react';
import { Button, Card } from '../../../components/ui';
import { formatMoney } from '../../../lib/format';
import type { VistaPreviaLimpieza } from '../../../api/products.api';

/**
 * Confirmacion antes de dar de baja duplicados y piezas sin foto.
 *
 * Es baja logica (reversible pieza por pieza desde Productos), pero puede
 * afectar muchas piezas de una sola vez, asi que primero se muestra QUE se
 * va a marcar en vez de ejecutarlo directo al pulsar el boton.
 */
export function LimpiarDuplicadosModal({
  vistaPrevia,
  onCancel,
  onConfirm,
  confirmando,
}: {
  vistaPrevia: VistaPreviaLimpieza;
  onCancel: () => void;
  onConfirm: () => void;
  confirmando: boolean;
}) {
  const totalRepetidas = vistaPrevia.grupos.reduce((sum, g) => sum + g.elimina.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
            <Sparkles size={16} /> Limpiar duplicados
          </h3>
          <button type="button" onClick={onCancel} className="rounded p-1 text-muted hover:bg-porcelain-100">
            <X size={16} />
          </button>
        </div>

        {vistaPrevia.totalABaja === 0 ? (
          <p className="text-sm text-muted">
            No se encontraron piezas repetidas ni sin foto. Tu catalogo esta limpio.
          </p>
        ) : (
          <>
            <p className="mb-1 text-sm text-ink">
              Se van a dar de baja <strong>{vistaPrevia.totalABaja}</strong> piezas:{' '}
              {totalRepetidas > 0 && (
                <>
                  <strong>{totalRepetidas}</strong> repetidas (mismo nombre, precio y tamaño de foto)
                  {vistaPrevia.sinFoto.length > 0 && ' y '}
                </>
              )}
              {vistaPrevia.sinFoto.length > 0 && (
                <>
                  <strong>{vistaPrevia.sinFoto.length}</strong> sin foto
                </>
              )}
              .
            </p>
            <p className="mb-3 text-xs text-muted">
              Es baja logica, no un borrado: dejan de venderse y salen del catalogo web, pero se pueden
              reactivar despues, una por una, desde Productos.
            </p>

            {/* overflow-hidden afuera + scroll adentro: Chrome no recorta la
                barra de scroll a las esquinas redondeadas cuando ambos van
                en el mismo elemento. */}
            <div className="flex-1 overflow-hidden rounded-lg border border-porcelain-200">
              <div className="h-full overflow-y-auto">
                {vistaPrevia.grupos.map((g, i) => (
                  <div key={i} className="border-b border-porcelain-100 px-3 py-2 text-xs last:border-b-0">
                    <p className="font-medium text-ink">
                      {g.nombre} · {formatMoney(g.precioUnitario)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-muted">
                      <span className="rounded bg-sage-100 px-1.5 py-0.5 font-mono text-sage-700">
                        {g.mantiene.sku}
                      </span>
                      se conserva
                      {g.elimina.map((p) => (
                        <span key={p.id} className="flex items-center gap-1">
                          <ArrowRight size={10} />
                          <span className="rounded bg-brick-100 px-1.5 py-0.5 font-mono text-brick-600">{p.sku}</span>
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
                {vistaPrevia.sinFoto.length > 0 && (
                  <div className="px-3 py-2 text-xs">
                    <p className="mb-1 font-medium text-ink">Sin foto:</p>
                    <p className="flex flex-wrap gap-1">
                      {vistaPrevia.sinFoto.map((p) => (
                        <span key={p.id} className="rounded bg-brick-100 px-1.5 py-0.5 font-mono text-brick-600">
                          {p.sku}
                        </span>
                      ))}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {vistaPrevia.totalABaja === 0 ? 'Cerrar' : 'Cancelar'}
          </Button>
          {vistaPrevia.totalABaja > 0 && (
            <Button
              size="sm"
              className="!bg-brick-600 hover:!bg-brick-700"
              disabled={confirmando}
              onClick={onConfirm}
            >
              {confirmando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Dar de baja {vistaPrevia.totalABaja} piezas
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
