import { Trash2, X, Loader2, ArrowRight } from 'lucide-react';
import { Button, Card } from '../../../components/ui';
import { formatMoney } from '../../../lib/format';
import type { VistaPreviaEliminarDuplicados } from '../../../api/products.api';

/**
 * Confirmacion antes de ELIMINAR de verdad (no baja logica) los duplicados
 * que ya estaban dados de baja. Solo aparece en esa pestaña: es para
 * recuperar el espacio que ocupan, no para retirarlas de la venta (eso ya
 * paso). El backend nunca borra una pieza que tenga una venta encima —
 * esas se listan aparte para que quede claro por que no se pudieron quitar.
 */
export function EliminarDuplicadosModal({
  vistaPrevia,
  onCancel,
  onConfirm,
  confirmando,
}: {
  vistaPrevia: VistaPreviaEliminarDuplicados;
  onCancel: () => void;
  onConfirm: () => void;
  confirmando: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
            <Trash2 size={16} /> Eliminar duplicados
          </h3>
          <button type="button" onClick={onCancel} className="rounded p-1 text-muted hover:bg-porcelain-100">
            <X size={16} />
          </button>
        </div>

        {vistaPrevia.totalEliminables === 0 && vistaPrevia.omitidosPorVentas.length === 0 ? (
          <p className="text-sm text-muted">No se encontraron piezas duplicadas entre las dadas de baja.</p>
        ) : (
          <>
            {vistaPrevia.totalEliminables > 0 && (
              <p className="mb-1 text-sm text-ink">
                Se van a <strong>eliminar de verdad</strong> <strong>{vistaPrevia.totalEliminables}</strong> piezas
                repetidas (mismo nombre y precio, y la misma foto o ninguna de las dos con foto).
              </p>
            )}
            <p className="mb-3 text-xs text-brick-600">
              Esto NO se puede deshacer, a diferencia de "dar de baja". Solo se borran piezas que nunca se
              vendieron.
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
                {vistaPrevia.omitidosPorVentas.length > 0 && (
                  <div className="px-3 py-2 text-xs">
                    <p className="mb-1 font-medium text-ink">
                      No se pueden eliminar (ya tienen una venta registrada):
                    </p>
                    <p className="flex flex-wrap gap-1">
                      {vistaPrevia.omitidosPorVentas.map((p) => (
                        <span key={p.id} className="rounded bg-porcelain-200 px-1.5 py-0.5 font-mono text-muted">
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
            {vistaPrevia.totalEliminables === 0 ? 'Cerrar' : 'Cancelar'}
          </Button>
          {vistaPrevia.totalEliminables > 0 && (
            <Button
              size="sm"
              className="!bg-brick-600 hover:!bg-brick-700"
              disabled={confirmando}
              onClick={onConfirm}
            >
              {confirmando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Eliminar {vistaPrevia.totalEliminables} piezas
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
