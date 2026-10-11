import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { expensesApi } from '../../api/expenses.api';
import { usePersistedState } from '../../lib/usePersistedState';
import { formatMoney, formatDate } from '../../lib/format';
import { Button, Card, PageHeader, EmptyState, ConfirmPasswordModal, Skeleton } from '../../components/ui';
import type { Expense } from '../../types';

export default function Expenses() {
  const queryClient = useQueryClient();
  // El gasto a medio escribir sobrevive si se sale de la pantalla sin querer.
  const [form, setForm] = usePersistedState('gastos:nuevo', { categoria: '', descripcion: '', monto: '' });
  const [gastoAEliminar, setGastoAEliminar] = useState<Expense | null>(null);

  const { data: expenses = [], isLoading } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: () => expensesApi.list(),
  });

  const createExpense = useMutation({
    mutationFn: () => expensesApi.create({ ...form, monto: Number(form.monto) }),
    onSuccess: () => {
      toast.success('Gasto registrado.');
      setForm({ categoria: '', descripcion: '', monto: '' });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: (password: string) => expensesApi.delete(gastoAEliminar!.id, password),
    onSuccess: () => {
      toast.success('Gasto eliminado.');
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setGastoAEliminar(null);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo eliminar el gasto.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.categoria.trim() || !form.descripcion.trim() || !Number(form.monto)) {
      toast.error('Completa categoria, descripcion y un monto valido.');
      return;
    }
    createExpense.mutate();
  }

  return (
    <div>
      <PageHeader title="Gastos" subtitle="Registro de gastos operativos del negocio" />

      {/* En celular (una sola columna) el orden del DOM es el orden visual:
          el formulario va primero (order-1) para que se pueda registrar un
          gasto sin bajar antes por toda la tabla. En escritorio (lg+) el
          order-2/order-1 lo regresa a tabla-izquierda + form-derecha, como
          ya estaba. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          {isLoading ? (
            <Skeleton />
          ) : expenses.length === 0 ? (
            <EmptyState title="Sin gastos registrados" />
          ) : (
            <Card className="divide-y divide-porcelain-200 overflow-hidden">
              {expenses.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{g.descripcion}</p>
                    <p className="truncate text-xs text-muted">
                      {g.categoria} &middot; {formatDate(g.fecha)} &middot; {g.user?.nombre}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-display font-semibold tabular-nums text-ink">
                      {formatMoney(g.monto)}
                    </p>
                    <button
                      onClick={() => setGastoAEliminar(g)}
                      className="rounded p-1 text-muted hover:bg-brick-100 hover:text-brick-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <Card className="order-1 h-fit p-4 lg:order-2">
          <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
            Nuevo gasto
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Categoria</label>
              <input
                value={form.categoria}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
                placeholder="Suministros, renta, servicios..."
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Descripcion</label>
              <input
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <Button type="submit" disabled={createExpense.isPending} className="w-full">
              <Plus size={16} /> Registrar gasto
            </Button>
          </form>
        </Card>
      </div>

      {gastoAEliminar && (
        <ConfirmPasswordModal
          titulo="Eliminar gasto"
          mensaje={
            <>
              Se eliminara "{gastoAEliminar.descripcion}" por {formatMoney(gastoAEliminar.monto)}.
            </>
          }
          pendiente={deleteExpense.isPending}
          onConfirm={(password) => deleteExpense.mutate(password)}
          onClose={() => setGastoAEliminar(null)}
        />
      )}
    </div>
  );
}
