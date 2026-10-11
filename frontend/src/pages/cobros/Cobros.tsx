import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cobrosApi } from '../../api/cobros.api';
import { formatMoney, formatDate, ESTADO_DEUDA_LABEL } from '../../lib/format';
import { Card, PageHeader, Badge, EmptyState, Skeleton } from '../../components/ui';
import { DebtDetailModal } from '../../components/DebtDetailModal';
import type { ClientDebt, EstadoDeuda } from '../../types';

const ESTADO_TONE: Record<EstadoDeuda, 'neutral' | 'copper' | 'sage' | 'brick' | 'rose'> = {
  PENDIENTE: 'neutral',
  PARCIAL: 'rose',
  PAGADA: 'sage',
  VENCIDA: 'brick',
};

const FILTERS: { value: EstadoDeuda | ''; label: string }[] = [
  { value: '', label: 'Con saldo pendiente' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'PARCIAL', label: 'Con abonos' },
  { value: 'VENCIDA', label: 'Vencidas' },
  { value: 'PAGADA', label: 'Saldadas' },
];

export default function Cobros() {
  const [status, setStatus] = useState<EstadoDeuda | ''>('');
  const [selected, setSelected] = useState<ClientDebt | null>(null);

  const { data: debts = [], isLoading } = useQuery<ClientDebt[]>({
    queryKey: ['client-debts', status],
    queryFn: () => cobrosApi.list(status),
  });

  const totalPendiente = debts.reduce(
    (sum, d) => sum + (Number(d.amountTotal ?? 0) - Number(d.amountPaid ?? 0)),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Cobros"
        subtitle="Clientes que le deben al negocio, con su factura y abonos"
        action={
          totalPendiente > 0 ? (
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total por cobrar</p>
              <p className="font-display text-xl font-bold text-brick-600">{formatMoney(totalPendiente)}</p>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === f.value
                ? 'bg-copper-500 text-white'
                : 'bg-porcelain-200 text-muted hover:bg-porcelain-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : debts.length === 0 ? (
        <EmptyState title="Sin cuentas en esta vista" description="No hay clientes con saldo en este filtro." />
      ) : (
        <>
          {/* Celular: tarjetas. El detalle completo (abonos, factura) vive en DebtDetailModal. */}
          <div className="space-y-2 md:hidden">
            {debts.map((debt) => {
              const total = Number(debt.amountTotal ?? 0);
              const pagado = Number(debt.amountPaid ?? 0);
              const saldo = Math.max(0, total - pagado);
              return (
                <Card
                  key={debt.id}
                  className="cursor-pointer p-3.5 active:shadow-neu-pressed"
                  onClick={() => setSelected(debt)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{debt.client?.nombre ?? 'Cliente'}</p>
                      {debt.client?.telefono && <p className="text-xs text-muted">{debt.client.telefono}</p>}
                    </div>
                    <span className="shrink-0 font-display font-semibold tabular-nums text-ink">
                      {formatMoney(saldo)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge tone={ESTADO_TONE[debt.status]}>{ESTADO_DEUDA_LABEL[debt.status]}</Badge>
                    <span className="text-xs text-muted">
                      {debt.dueDate ? `Vence ${formatDate(debt.dueDate)}` : 'Sin fecha de vencimiento'}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* PC: tabla, sin cambios. */}
          <Card className="hidden overflow-hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-porcelain-100 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Factura</th>
                <th className="px-4 py-2.5">Vence</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Abonado</th>
                <th className="px-4 py-2.5 text-right">Saldo</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-porcelain-200">
              {debts.map((debt) => {
                const total = Number(debt.amountTotal ?? 0);
                const pagado = Number(debt.amountPaid ?? 0);
                const saldo = Math.max(0, total - pagado);
                return (
                  <tr
                    key={debt.id}
                    onClick={() => setSelected(debt)}
                    className="cursor-pointer hover:bg-porcelain-100"
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">{debt.client?.nombre ?? 'Cliente'}</p>
                      {debt.client?.telefono && <p className="text-xs text-muted">{debt.client.telefono}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{debt.sale?.invoice?.numero ?? '-'}</td>
                    <td className="px-4 py-2.5 text-muted">{debt.dueDate ? formatDate(debt.dueDate) : '-'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatMoney(total)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-sage-600">{formatMoney(pagado)}</td>
                    <td className="px-4 py-2.5 text-right font-display font-semibold tabular-nums text-ink">
                      {formatMoney(saldo)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={ESTADO_TONE[debt.status]}>{ESTADO_DEUDA_LABEL[debt.status]}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </Card>
        </>
      )}

      {selected && <DebtDetailModal debt={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

