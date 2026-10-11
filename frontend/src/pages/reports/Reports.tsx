import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Download } from 'lucide-react';
import { reportsApi, type SalesPeriod, type ExpensesReport, type Cashflow } from '../../api/reports.api';
import { usePersistedState } from '../../lib/usePersistedState';
import { useTheme } from '../../lib/useTheme';
import { formatMoney, formatDate, ESTADO_DEUDA_LABEL } from '../../lib/format';
import { Button, Card, PageHeader, Badge, EmptyState } from '../../components/ui';
import type { ClientDebt } from '../../types';

/** yyyy-mm-dd en hora LOCAL (no toISOString: eso pasa a UTC y en RD -4 puede
 * adelantar la fecha un dia). Los <input type="date"> esperan este formato. */
function fechaLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hoyISO(): string {
  return fechaLocalISO(new Date());
}
function inicioDePeriodo(grupo: 'day' | 'week' | 'month' | 'year'): string {
  const hoy = new Date();
  switch (grupo) {
    case 'day':
      return fechaLocalISO(hoy);
    case 'week': {
      const dia = hoy.getDay(); // 0=domingo..6=sabado
      const desdeLunes = dia === 0 ? -6 : 1 - dia;
      const lunes = new Date(hoy);
      lunes.setDate(hoy.getDate() + desdeLunes);
      return fechaLocalISO(lunes);
    }
    case 'month':
      return fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    case 'year':
      return fechaLocalISO(new Date(hoy.getFullYear(), 0, 1));
  }
}

type RangoPreset = 'day' | 'week' | 'month' | 'year' | 'all' | 'custom';

export default function Reports() {
  // Los filtros se recuerdan: al volver de revisar otra pantalla, el reporte
  // sigue en el mismo periodo en vez de resetearse a los ultimos 30 dias.
  const [group, setGroup] = usePersistedState<'day' | 'week' | 'month' | 'year'>('reportes:agrupar', 'day');
  const [from, setFrom] = usePersistedState('reportes:desde', '');
  const [to, setTo] = usePersistedState('reportes:hasta', '');
  // Que boton se ve "encendido": los de Dia/Semana/Mes/Año ponen ademas el
  // rango de fechas (de lo contrario solo cambiaban el agrupado del grafico
  // de ventas, sin afectar Ingresos/Egresos/Saldo/Balance de arriba, que
  // dependen del rango). "Todo" limpia el rango (historial completo) y
  // "custom" es cuando el usuario toca las fechas a mano.
  const [preset, setPreset] = usePersistedState<RangoPreset>('reportes:preset', 'all');

  function elegirPeriodo(g: 'day' | 'week' | 'month' | 'year') {
    setGroup(g);
    setPreset(g);
    setFrom(inicioDePeriodo(g));
    setTo(hoyISO());
  }

  function elegirTodo() {
    setPreset('all');
    setFrom('');
    setTo('');
  }

  // Recharts pinta con atributos SVG, no con clases: los colores del grafico
  // se pasan a mano segun el tema.
  const { esOscuro } = useTheme();
  const chart = esOscuro
    ? { grid: '#68504F', eje: '#CDA3A5', barra: '#E57D90', tipBg: '#4A3739', tipBorde: '#68504F', tipTexto: '#F5EBEC' }
    : { grid: '#E3CED4', eje: '#9A828A', barra: '#E57D90', tipBg: '#FFFFFF', tipBorde: '#E3CED4', tipTexto: '#33232A' };

  const params = { from: from || undefined, to: to || undefined };

  const { data: salesReport = [] } = useQuery<SalesPeriod[]>({
    queryKey: ['reports', 'sales', group, from, to],
    queryFn: () => reportsApi.sales({ ...params, group }),
  });

  const { data: debts = [] } = useQuery<ClientDebt[]>({
    queryKey: ['reports', 'debts'],
    queryFn: () => reportsApi.debts(),
  });

  const { data: expensesReport } = useQuery<ExpensesReport>({
    queryKey: ['reports', 'expenses', from, to],
    queryFn: () => reportsApi.expenses(params),
  });

  const { data: cashflow } = useQuery<Cashflow>({
    queryKey: ['reports', 'cashflow', from, to],
    queryFn: () => reportsApi.cashflow(params),
  });

  async function exportCsv() {
    const blob = await reportsApi.exportSalesCsv({ ...params, group });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reporte-ventas.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Ventas, deudas, gastos y flujo de caja"
        action={
          <Button variant="secondary" onClick={exportCsv}>
            <Download size={16} /> Exportar CSV
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPreset('custom');
          }}
          className="rounded-lg border border-porcelain-300 px-2.5 py-1.5 text-sm outline-none focus:border-copper-500"
        />
        <span className="text-sm text-muted">a</span>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPreset('custom');
          }}
          className="rounded-lg border border-porcelain-300 px-2.5 py-1.5 text-sm outline-none focus:border-copper-500"
        />
        <div className="ml-2 flex flex-wrap gap-1">
          {(['day', 'week', 'month', 'year'] as const).map((g) => (
            <button
              key={g}
              onClick={() => elegirPeriodo(g)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                preset === g ? 'bg-copper-500 text-white' : 'bg-porcelain-200 text-muted'
              }`}
            >
              {{ day: 'Dia', week: 'Semana', month: 'Mensual', year: 'Anual' }[g]}
            </button>
          ))}
          <button
            onClick={elegirTodo}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              preset === 'all' ? 'bg-copper-500 text-white' : 'bg-porcelain-200 text-muted'
            }`}
            title="Todo el historial, de principio a fin"
          >
            Todo
          </button>
        </div>
      </div>

      <p className="mb-5 -mt-3 text-xs text-muted">
        {from || to ? 'Usando el rango de fechas de arriba.' : 'Mostrando todo el historial.'}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Ingresos</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-sage-600">
            {formatMoney(cashflow?.ingresos ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">Todas las ventas del periodo</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Egresos</p>
          <p className="mt-1 font-display text-xl font-bold tabular-nums text-brick-500">
            {formatMoney(cashflow?.egresos ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">Gastos del periodo</p>
        </Card>
        <Card className="p-4 ring-1 ring-copper-400">
          <p className="text-xs font-medium uppercase text-copper-600">Saldo en caja</p>
          <p
            className={`mt-1 font-display text-xl font-bold tabular-nums ${
              (cashflow?.saldoEnCaja ?? 0) < 0 ? 'text-brick-500' : 'text-ink'
            }`}
          >
            {formatMoney(cashflow?.saldoEnCaja ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">Contado + abonos cobrados &minus; gastos</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase text-muted">Balance total</p>
          <p
            className={`mt-1 font-display text-xl font-bold tabular-nums ${
              (cashflow?.balanceTotal ?? 0) < 0 ? 'text-brick-500' : 'text-ink'
            }`}
          >
            {formatMoney(cashflow?.balanceTotal ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">Todas las ventas &minus; gastos</p>
        </Card>
      </div>

      <Card className="mb-6 p-4">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
          Ventas por periodo
        </h2>
        {salesReport.length === 0 ? (
          <EmptyState title="Sin ventas en este rango" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesReport}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis dataKey="periodo" tick={{ fontSize: 11, fill: chart.eje }} />
                <YAxis tick={{ fontSize: 11, fill: chart.eje }} />
                <Tooltip
                  formatter={(value: number) => `${formatMoney(value)}`}
                  cursor={{ fill: chart.grid, opacity: 0.3 }}
                  contentStyle={{
                    borderRadius: 8,
                    background: chart.tipBg,
                    borderColor: chart.tipBorde,
                    color: chart.tipTexto,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="total" fill={chart.barra} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
            Clientes con deudas
          </h2>
          {debts.length === 0 ? (
            <p className="text-sm text-muted">No hay deudas pendientes.</p>
          ) : (
            <div className="max-h-80 divide-y divide-porcelain-200 overflow-y-auto pr-1">
              {debts.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="text-ink">{d.cliente}</p>
                    {d.vencimiento && <p className="text-xs text-muted">Vence: {formatDate(d.vencimiento)}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-display font-semibold tabular-nums text-ink">
                      {formatMoney(d.saldo ?? 0)}
                    </p>
                    <Badge tone={d.status === 'VENCIDA' ? 'brick' : 'copper'}>
                      {ESTADO_DEUDA_LABEL[d.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
            Gastos por categoria
          </h2>
          {!expensesReport || expensesReport.categorias.length === 0 ? (
            <p className="text-sm text-muted">Sin gastos en este rango.</p>
          ) : (
            <div className="max-h-80 divide-y divide-porcelain-200 overflow-y-auto pr-1">
              {expensesReport.categorias.map((c) => (
                <div key={c.categoria} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{c.categoria}</span>
                  <span className="font-display font-semibold tabular-nums text-ink">
                    {formatMoney(c.monto)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
