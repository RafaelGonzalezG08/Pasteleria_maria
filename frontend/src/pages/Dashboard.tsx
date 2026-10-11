import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  AlertCircle,
  Wallet,
  ShoppingBag,
  ClipboardList,
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  PiggyBank,
  Scale,
  Gift,
  Wheat,
} from 'lucide-react';
import { reportsApi } from '../api/reports.api';
import { encargosApi } from '../api/encargos.api';
import { insumosApi } from '../api/inventario.api';
import { clientsApi } from '../api/clients.api';
import { formatMoney, formatDate, formatCantidad, formatTime, ESTADO_ENCARGO_LABEL } from '../lib/format';
import { useAuthStore } from '../store/auth.store';
import { Card, PageHeader, Badge, Skeleton } from '../components/ui';
import type { AlertasInventario, DashboardSummary, ProximaFecha, ResumenEncargos } from '../types';

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  tone: 'copper' | 'brick' | 'sage' | 'rose' | 'amber';
  hint?: string;
}) {
  const toneStyles = {
    copper: 'bg-copper-100 text-copper-700',
    brick: 'bg-brick-100 text-brick-600',
    sage: 'bg-sage-100 text-sage-600',
    rose: 'bg-rose-100 text-rose-600',
    amber: 'bg-amber-100 text-amber-700',
  }[tone];

  return (
    <Card className="p-5">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl shadow-neu-sm ${toneStyles}`}>
        <Icon size={18} />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}

/**
 * Encargos que se entregan pronto (y los atrasados).
 *
 * Va ARRIBA de los KPIs a proposito: son compromisos con clientes que esperan
 * su pastel, y si se pasan por alto hay alguien esperando. Con atrasados el
 * bloque se pinta en rojo para que salte a la vista sin leerlo.
 */
function EncargosProximos() {
  const { data } = useQuery<ResumenEncargos>({
    queryKey: ['encargos', 'resumen'],
    queryFn: () => encargosApi.resumen(),
    refetchInterval: 60_000,
  });

  if (!data || data.total === 0) return null;
  const hayAtrasados = data.atrasados > 0;

  return (
    <Card className={`mb-6 p-5 ${hayAtrasados ? 'bg-brick-100/50 ring-1 ring-brick-500/25' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
          {hayAtrasados ? <AlertTriangle size={16} className="text-brick-600" /> : <ClipboardList size={16} className="text-copper-600" />}
          Encargos por entregar
        </h2>
        <Link to="/encargos" className="flex items-center gap-1 text-xs font-semibold text-copper-600 hover:text-copper-700">
          Ver todos <ChevronRight size={14} />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {data.atrasados > 0 && (
          <Badge tone="brick">
            <AlertTriangle size={11} className="mr-1" />
            {data.atrasados} atrasado{data.atrasados === 1 ? '' : 's'}
          </Badge>
        )}
        {data.paraHoy > 0 && (
          <Badge tone="copper">
            <CalendarClock size={11} className="mr-1" />
            {data.paraHoy} para hoy
          </Badge>
        )}
        <Badge tone="neutral">{data.pendientes} pendiente{data.pendientes === 1 ? '' : 's'}</Badge>
        <Badge tone="copper">{data.enProduccion} en produccion</Badge>
        <Badge tone="sage">{data.listos} listo{data.listos === 1 ? '' : 's'}</Badge>
      </div>

      {data.proximos.length === 0 ? (
        <p className="text-sm text-muted">Nada para entregar en los proximos {data.diasAlerta} dias.</p>
      ) : (
        <div className="divide-y divide-porcelain-200">
          {data.proximos.map((e) => (
            <Link key={e.id} to={`/encargos?id=${e.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{e.client.nombre}</p>
                <p className="truncate text-xs text-muted">{e.items.map((i) => `${i.cantidad} × ${i.descripcion}`).join(', ')}</p>
              </div>
              <div className="shrink-0 text-right">
                <Badge tone={e.urgencia === 'ATRASADO' ? 'brick' : e.urgencia === 'HOY' ? 'copper' : 'sage'}>
                  {e.urgencia === 'HOY' ? `Hoy ${formatTime(e.fechaEntrega)}` : formatDate(e.fechaEntrega)}
                </Badge>
                <p className="mt-0.5 text-[11px] text-muted">{ESTADO_ENCARGO_LABEL[e.estado]}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function AlertasInventarioCard({ puedeVerInventario }: { puedeVerInventario: boolean }) {
  const { data } = useQuery<AlertasInventario>({
    queryKey: ['alertas-inventario'],
    queryFn: () => insumosApi.alertas(),
    refetchInterval: 120_000,
  });
  if (!data || (data.bajos.length === 0 && data.porVencer.length === 0)) return null;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
          <Wheat size={16} className="text-copper-600" /> Inventario
        </h2>
        {puedeVerInventario && (
          <Link to="/inventario" className="flex items-center gap-1 text-xs font-semibold text-copper-600 hover:text-copper-700">
            Ver <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {data.bajos.length > 0 && (
        <>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brick-600">Por agotarse</p>
          <ul className="mb-3 space-y-1 text-sm">
            {data.bajos.slice(0, 6).map((b) => (
              <li key={b.id} className="flex justify-between gap-2">
                <span className="text-ink">{b.nombre}</span>
                <span className="tabular-nums text-brick-600">
                  {formatCantidad(b.stockActual)} / {formatCantidad(b.stockMinimo)} {b.unidad}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {data.porVencer.length > 0 && (
        <>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-copper-700">Por vencer</p>
          <ul className="space-y-1 text-sm">
            {data.porVencer.slice(0, 6).map((l) => (
              <li key={l.loteId} className="flex justify-between gap-2">
                <span className="text-ink">
                  {l.nombre} <span className="text-muted">({formatCantidad(l.cantidad)} {l.unidad})</span>
                </span>
                <span className={l.vencido ? 'font-semibold text-brick-600' : 'text-copper-700'}>
                  {l.vencido ? 'Vencido ' : ''}
                  {formatDate(l.fechaVencimiento)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Cumpleanos() {
  const { data = [] } = useQuery<ProximaFecha[]>({
    queryKey: ['clientes', 'proximas-fechas'],
    queryFn: () => clientsApi.proximasFechas(),
    staleTime: 10 * 60_000,
  });
  if (data.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
        <Gift size={16} className="text-rose-500" /> Cumpleaños y fechas especiales
      </h2>
      <ul className="space-y-2 text-sm">
        {data.slice(0, 8).map((f) => (
          <li key={`${f.clientId}-${f.descripcion}`} className="flex justify-between gap-2">
            <span className="min-w-0">
              <span className="font-medium text-ink">{f.nombre}</span>
              <span className="text-muted"> · {f.descripcion}</span>
              <span className="block text-xs text-muted">{f.telefono}</span>
            </span>
            <Badge tone={f.enDias === 0 ? 'rose' : 'neutral'}>
              {f.enDias === 0 ? '¡Hoy!' : f.enDias === 1 ? 'Mañana' : `En ${f.enDias} dias`}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Dashboard() {
  const role = useAuthStore((s) => s.user?.role);
  const veFinanzas = role === 'ADMIN' || role === 'CAJERO';
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.dashboard(),
    refetchInterval: 60_000,
    enabled: veFinanzas,
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen del dia en la pasteleria" />

      <EncargosProximos />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <AlertasInventarioCard puedeVerInventario={role !== 'CAJERO'} />
        {veFinanzas && <Cumpleanos />}
      </div>

      {veFinanzas &&
        (isLoading || !data ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard label="Ventas de hoy" value={formatMoney(data.ventasHoy.total)} icon={DollarSign} tone="copper" />
              <KpiCard label="Transacciones hoy" value={String(data.ventasHoy.cantidad)} icon={ShoppingBag} tone="rose" />
              <KpiCard label="Por cobrar (credito)" value={formatMoney(data.deudaTotalPendiente)} icon={AlertCircle} tone="amber" />
              <KpiCard label="Gastos del mes" value={formatMoney(data.gastosDelMes)} icon={Wallet} tone="copper" />
              <KpiCard
                label="Saldo en caja (mes)"
                value={formatMoney(data.saldoEnCajaMes)}
                icon={PiggyBank}
                tone={data.saldoEnCajaMes < 0 ? 'brick' : 'sage'}
                hint="Contado + abonos + anticipos − gastos"
              />
              <KpiCard
                label="Balance del mes"
                value={formatMoney(data.balanceTotalMes)}
                icon={Scale}
                tone={data.balanceTotalMes < 0 ? 'brick' : 'sage'}
                hint="Todas las ventas − gastos"
              />
            </div>

            {role === 'ADMIN' && (
              <Card className="mt-6 p-5">
                <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-muted">Gastos recientes</h2>
                {data.gastosRecientes.length === 0 ? (
                  <p className="text-sm text-muted">Aun no hay gastos registrados.</p>
                ) : (
                  <div className="divide-y divide-porcelain-200">
                    {data.gastosRecientes.map((g) => (
                      <div key={g.id} className="flex items-center justify-between py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-ink">{g.descripcion}</p>
                          <p className="text-xs text-muted">
                            {g.categoria} &middot; {formatDate(g.fecha)}
                          </p>
                        </div>
                        <p className="font-display font-semibold tabular-nums text-ink">{formatMoney(g.monto)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </>
        ))}
    </div>
  );
}
