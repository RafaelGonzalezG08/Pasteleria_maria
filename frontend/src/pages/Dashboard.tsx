import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  AlertCircle,
  Wallet,
  ShoppingBag,
  Package,
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  PiggyBank,
  Scale,
} from 'lucide-react';
import { reportsApi } from '../api/reports.api';
import { formatMoney, formatDate, ESTADO_PEDIDO_LABEL } from '../lib/format';
import { Card, PageHeader, Badge, Skeleton } from '../components/ui';
import type { DashboardSummary, OrdersSummary } from '../types';

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
      {/* tracking-[0.14em] (mas ancho que el "widest" de Tailwind) hacia que
          etiquetas de 2 palabras como "Transacciones hoy" llegaran casi al
          borde del panel en celular, donde el contenido tiene poco ancho. */}
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </Card>
  );
}

/**
 * Bloque de pedidos por entregar.
 *
 * Va ARRIBA de los KPIs y no abajo a proposito: son compromisos con clientes
 * que esperan algo, y a diferencia de las cifras del dia, si se pasan por alto
 * hay alguien esperando. Cuando hay atrasados el bloque se pinta en rojo para
 * que salte a la vista sin tener que leerlo.
 */
function PedidosDestacados() {
  const { data } = useQuery<OrdersSummary>({
    queryKey: ['orders', 'summary'],
    queryFn: () => reportsApi.ordersSummary(),
    refetchInterval: 60_000,
  });

  // Sin pedidos vivos no se muestra nada: un bloque vacio permanente solo
  // gasta espacio y entrena al ojo a ignorar esa zona.
  if (!data || data.total === 0) return null;

  const hayAtrasados = data.atrasados > 0;

  return (
    <Card className={`mb-6 p-5 ${hayAtrasados ? 'bg-brick-100/50 ring-1 ring-brick-500/25' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
          {hayAtrasados ? (
            <AlertTriangle size={16} className="text-brick-600" />
          ) : (
            <Package size={16} className="text-copper-600" />
          )}
          Pedidos por entregar
        </h2>
        <Link
          to="/pedidos"
          className="flex items-center gap-1 text-xs font-semibold text-copper-600 hover:text-copper-700"
        >
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
        <Badge tone="sage">{data.empacados} empacado{data.empacados === 1 ? '' : 's'}</Badge>
      </div>

      <div className="divide-y divide-porcelain-200">
        {data.proximos.map((order) => (
          <div key={order.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">
                {order.sale?.client?.nombre ?? 'Consumidor final'}
              </p>
              <p className="truncate text-xs text-muted">
                {order.sale?.items.map((i) => `${i.cantidad} x ${i.descripcion}`).join(', ')}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Badge
                tone={
                  order.urgencia === 'ATRASADO' ? 'brick' : order.urgencia === 'HOY' ? 'copper' : 'neutral'
                }
              >
                {order.fechaEntrega ? formatDate(order.fechaEntrega) : 'Sin fecha'}
              </Badge>
              <p className="mt-0.5 text-[11px] text-muted">{ESTADO_PEDIDO_LABEL[order.estado]}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: () => reportsApi.dashboard(),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Resumen del negocio en tiempo real" />

      <PedidosDestacados />

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Ventas de hoy"
              value={`${formatMoney(data.ventasHoy.total)}`}
              icon={DollarSign}
              tone="copper"
            />
            <KpiCard
              label="Transacciones hoy"
              value={String(data.ventasHoy.cantidad)}
              icon={ShoppingBag}
              tone="rose"
            />
            <KpiCard
              label="Deuda pendiente"
              value={`${formatMoney(data.deudaTotalPendiente)}`}
              icon={AlertCircle}
              tone="amber"
            />
            <KpiCard
              label="Gastos del mes"
              value={`${formatMoney(data.gastosDelMes)}`}
              icon={Wallet}
              tone="copper"
            />
            <KpiCard
              label="Saldo en caja (mes)"
              value={`${formatMoney(data.saldoEnCajaMes)}`}
              icon={PiggyBank}
              tone={data.saldoEnCajaMes < 0 ? 'brick' : 'sage'}
              hint="Contado + abonos − gastos"
            />
            <KpiCard
              label="Balance del mes"
              value={`${formatMoney(data.balanceTotalMes)}`}
              icon={Scale}
              tone={data.balanceTotalMes < 0 ? 'brick' : 'sage'}
              hint="Todas las ventas − gastos"
            />
          </div>

          <Card className="mt-6 p-5">
            <h2 className="mb-4 font-display text-sm font-bold uppercase tracking-wide text-muted">
              Gastos recientes
            </h2>
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
                    <p className="font-display font-semibold tabular-nums text-ink">
                      {formatMoney(g.monto)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
