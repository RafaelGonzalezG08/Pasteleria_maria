import { useQuery } from '@tanstack/react-query';
import { Gem } from 'lucide-react';
import { reportsApi } from '../../api/reports.api';
import { usePersistedState } from '../../lib/usePersistedState';
import { formatMoney } from '../../lib/format';
import { Card, PageHeader, Badge, EmptyState, Skeleton } from '../../components/ui';
import type { CostsReport } from '../../types';

export default function Costs() {
  // Igual que en Reportes: el periodo consultado se recuerda al navegar.
  const [from, setFrom] = usePersistedState('costos:desde', '');
  const [to, setTo] = usePersistedState('costos:hasta', '');
  const params = { from: from || undefined, to: to || undefined };

  const { data, isLoading } = useQuery<CostsReport>({
    queryKey: ['reports', 'costs', from, to],
    queryFn: () => reportsApi.costs(params),
  });

  const totales = data?.totales;
  const productos = data?.productos ?? [];

  return (
    <div>
      <PageHeader
        title="Costos"
        subtitle="Costo, utilidad y margen por pieza vendida - visible solo para administradores"
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-porcelain-300 px-2.5 py-1.5 text-sm outline-none focus:border-copper-500"
        />
        <span className="text-sm text-muted">a</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-porcelain-300 px-2.5 py-1.5 text-sm outline-none focus:border-copper-500"
        />
      </div>
      <p className="mb-5 -mt-3 text-xs text-muted">
        {from || to ? 'Usando el rango de fechas de arriba.' : 'Mostrando los ultimos 30 dias.'}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Ingresos</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-ink">
            {formatMoney(totales?.ingresos ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Costo</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-brick-500">
            {formatMoney(totales?.costo ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Utilidad</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-sage-600">
            {formatMoney(totales?.utilidad ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Margen</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-copper-600">
            {(totales?.margenPct ?? 0).toFixed(1)}%
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
          Margen por producto
        </h2>
        {isLoading ? (
          <Skeleton />
        ) : productos.length === 0 ? (
          <EmptyState
            title="Sin ventas en este rango"
            description="El margen se calcula sobre piezas vendidas; asigna un costo a tus productos en Productos para verlo aqui."
          />
        ) : (
          <>
            {/* Celular: tarjetas, con todos los numeros -- es un reporte de solo lectura, no hace falta un panel aparte. */}
            <div className="space-y-2 md:hidden">
              {productos.map((p) => (
                <div key={p.productId ?? p.nombre} className="rounded-lg border border-porcelain-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Gem size={14} className="shrink-0 text-copper-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{p.nombre}</p>
                        {p.sku && <p className="font-mono text-[11px] text-muted">{p.sku}</p>}
                      </div>
                    </div>
                    <Badge tone={p.margenPct < 20 ? 'brick' : p.margenPct < 40 ? 'copper' : 'sage'}>
                      {p.margenPct.toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted">Unidades: </span>
                      <span className="tabular-nums text-ink">{p.unidades}</span>
                    </div>
                    <div>
                      <span className="text-muted">Ingresos: </span>
                      <span className="tabular-nums text-ink">{formatMoney(p.ingresos)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Costo: </span>
                      <span className="tabular-nums text-muted">{formatMoney(p.costo)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Utilidad: </span>
                      <span className="tabular-nums font-semibold text-sage-600">{formatMoney(p.utilidad)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* PC: tabla, sin cambios. */}
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-porcelain-200 text-xs uppercase text-muted">
                  <th className="py-2 pr-3 font-semibold">Producto</th>
                  <th className="py-2 pr-3 font-semibold">Unidades</th>
                  <th className="py-2 pr-3 font-semibold">Ingresos</th>
                  <th className="py-2 pr-3 font-semibold">Costo</th>
                  <th className="py-2 pr-3 font-semibold">Utilidad</th>
                  <th className="py-2 pr-3 font-semibold">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-porcelain-200">
                {productos.map((p) => (
                  <tr key={p.productId ?? p.nombre}>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Gem size={14} className="shrink-0 text-copper-500" />
                        <div className="min-w-0">
                          <p className="truncate text-ink">{p.nombre}</p>
                          {p.sku && <p className="font-mono text-[11px] text-muted">{p.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-ink">{p.unidades}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-ink">{formatMoney(p.ingresos)}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted">{formatMoney(p.costo)}</td>
                    <td className="py-2.5 pr-3 tabular-nums font-semibold text-sage-600">
                      {formatMoney(p.utilidad)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={p.margenPct < 20 ? 'brick' : p.margenPct < 40 ? 'copper' : 'sage'}>
                        {p.margenPct.toFixed(1)}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
