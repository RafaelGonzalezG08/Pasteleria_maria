import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, Banknote, MessageCircle, Loader2, Trash2 } from 'lucide-react';
import { cobrosApi } from '../api/cobros.api';
import { salesApi } from '../api/sales.api';
import {
  abrirPestanaRespaldoSiHaceFalta,
  enviarWhatsappDesdeCelular,
  esEnvioDirecto,
} from '../lib/whatsappDirecto';
import { formatMoney, formatDateTime, METODO_PAGO_LABEL } from '../lib/format';
import { Button, Card, Select, ConfirmPasswordModal, Skeleton } from './ui';
import { FacturaImagen } from './FacturaImagen';
import { useAuthStore } from '../store/auth.store';
import type { ClientDebt, MetodoPago, Payment, Sale } from '../types';

/**
 * Detalle completo de una deuda (abonos, factura), con registro/borrado de
 * abonos y recordatorio por WhatsApp. Se usa tanto en Cobros como en las
 * deudas pendientes del historial de un cliente.
 */
export function DebtDetailModal({ debt, onClose }: { debt: ClientDebt; onClose: () => void }) {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  // Igual que en Transacciones: eliminar un abono es una correccion contable,
  // no una tarea de caja. El backend ya lo rechaza para CAJERO; esto solo
  // evita mostrarle un boton que le va a devolver un error 403.
  const puedeEliminarAbonos = role === 'ADMIN' || role === 'CONTABILIDAD';
  const [amount, setAmount] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [imgRefreshKey, setImgRefreshKey] = useState(0);
  const [abonoAEliminar, setAbonoAEliminar] = useState<Payment | null>(null);
  const saleId = debt.sale?.id;

  const { data: sale, isLoading } = useQuery<Sale>({
    queryKey: ['sale', saleId],
    queryFn: () => salesApi.get(saleId!),
    enabled: Boolean(saleId),
  });

  // El total/abonado/saldo se calculan de `sale` (que se refresca al
  // registrar o eliminar un abono), no del `debt` que llego por prop: ese es
  // una foto fija del momento en que se abrio el modal y quedaria mostrando
  // numeros viejos despues de cualquiera de las dos acciones.
  const abonos = [...(sale?.payments ?? [])].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );
  const total = sale ? Number(sale.total) : Number(debt.amountTotal ?? 0);
  const pagado = sale ? abonos.reduce((sum, p) => sum + Number(p.amount), 0) : Number(debt.amountPaid ?? 0);
  const saldo = Math.max(0, total - pagado);

  const registerPayment = useMutation({
    mutationFn: () => cobrosApi.registerPayment(debt.id, Number(amount), metodo),
    onSuccess: () => {
      toast.success('Abono registrado. La factura se actualizo con el nuevo saldo.');
      queryClient.invalidateQueries({ queryKey: ['client-debts'] });
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setAmount('');
      setImgRefreshKey((k) => k + 1);
    },
  });

  const deletePayment = useMutation({
    mutationFn: (password: string) => cobrosApi.deletePayment(abonoAEliminar!.id, password),
    onSuccess: () => {
      toast.success('Abono eliminado. El saldo de la cuenta se actualizo.');
      queryClient.invalidateQueries({ queryKey: ['client-debts'] });
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setAbonoAEliminar(null);
      setImgRefreshKey((k) => k + 1);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo eliminar el abono.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error('Ingresa un monto valido.');
      return;
    }
    if (value > saldo + 0.01) {
      toast.error(`El abono no puede superar el saldo pendiente (${formatMoney(saldo)}).`);
      return;
    }
    registerPayment.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      <Card className="grid max-h-[85vh] w-full max-w-3xl grid-cols-1 overflow-hidden md:grid-cols-2">
        <div className="flex max-h-[85vh] min-w-0 flex-col overflow-y-auto overflow-x-hidden border-b border-porcelain-200 p-5 md:border-b-0 md:border-r">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-ink">{debt.client?.nombre ?? 'Cliente'}</h2>
              {debt.client?.telefono && <p className="text-xs text-muted">{debt.client.telefono}</p>}
            </div>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200 md:hidden">
              <X size={18} />
            </button>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-porcelain-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted">Total</p>
              <p className="font-display font-bold tabular-nums text-ink">{formatMoney(total)}</p>
            </div>
            <div className="rounded-lg bg-sage-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-sage-700">Abonado</p>
              <p className="font-display font-bold tabular-nums text-sage-700">{formatMoney(pagado)}</p>
            </div>
            <div className="rounded-lg bg-brick-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-brick-700">Saldo</p>
              <p className="font-display font-bold tabular-nums text-brick-700">{formatMoney(saldo)}</p>
            </div>
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Productos de la factura</p>
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <div className="mb-4 divide-y divide-porcelain-200 rounded-lg border border-porcelain-200">
              {sale?.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="text-ink">{item.descripcion}</p>
                    <p className="text-xs text-muted">
                      {item.cantidad} x {formatMoney(item.precioUnitario)}
                    </p>
                  </div>
                  <p className="font-display font-semibold tabular-nums text-ink">{formatMoney(item.total)}</p>
                </div>
              ))}
            </div>
          )}

          {abonos.length > 0 && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Historial de abonos</p>
              <div className="mb-4 divide-y divide-porcelain-200 rounded-lg border border-porcelain-200">
                {abonos.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <p className="text-ink">{formatMoney(p.amount)}</p>
                      <p className="text-xs text-muted">
                        {formatDateTime(p.fecha)} &middot; {METODO_PAGO_LABEL[p.metodo]}
                      </p>
                    </div>
                    {puedeEliminarAbonos && (
                      <button
                        onClick={() => setAbonoAEliminar(p)}
                        className="rounded p-1.5 text-muted hover:bg-brick-100 hover:text-brick-600"
                        title="Eliminar abono"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {saldo > 0.01 ? (
            <form onSubmit={handleSubmit} className="mt-auto space-y-2.5 rounded-lg bg-porcelain-100 p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Registrar abono</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`Max. ${formatMoney(saldo)}`}
                  className="min-w-0 flex-1 rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
                />
                <Select
                  value={metodo}
                  onChange={(v) => setMetodo(v as MetodoPago)}
                  options={(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO'] as MetodoPago[]).map((m) => ({
                    value: m,
                    label: METODO_PAGO_LABEL[m],
                  }))}
                  className="w-full shrink-0 sm:w-36"
                />
              </div>
              <Button type="submit" className="w-full" disabled={registerPayment.isPending}>
                <Banknote size={16} />
                {registerPayment.isPending ? 'Registrando...' : 'Registrar abono'}
              </Button>
            </form>
          ) : (
            <div className="mt-auto rounded-lg bg-sage-100 p-3 text-center text-sm font-semibold text-sage-700">
              Cuenta saldada
            </div>
          )}

          {saldo > 0.01 && (
            <div className="mt-2.5 md:hidden">
              <ReminderButton debt={debt} className="" />
            </div>
          )}
        </div>

        <div className="hidden max-h-[85vh] flex-col overflow-y-auto bg-porcelain-100 p-5 md:flex">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Factura</p>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
              <X size={18} />
            </button>
          </div>
          {sale?.fecha && <p className="mb-2 text-xs text-muted">{formatDateTime(sale.fecha)}</p>}
          <div className="flex flex-1 items-center justify-center">
            <FacturaImagen
              pngUrl={sale?.invoice?.pngUrl}
              refreshKey={imgRefreshKey}
              className="max-h-[70vh] shadow-ticket"
            />
          </div>
          {saldo > 0.01 && <ReminderButton debt={debt} className="mt-3" />}
        </div>
      </Card>

      {abonoAEliminar && (
        <ConfirmPasswordModal
          titulo="Eliminar abono"
          mensaje={
            <>
              Se eliminara el abono de {formatMoney(abonoAEliminar.amount)} del{' '}
              {formatDateTime(abonoAEliminar.fecha)}. El saldo pendiente de la cuenta va a subir de nuevo.
            </>
          }
          pendiente={deletePayment.isPending}
          onConfirm={(password) => deletePayment.mutate(password)}
          onClose={() => setAbonoAEliminar(null)}
        />
      )}
    </div>
  );
}

function ReminderButton({ debt, className }: { debt: ClientDebt; className: string }) {
  const queryClient = useQueryClient();

  const sendReminder = useMutation({
    mutationFn: (_pestanaRespaldo: Window | null) => cobrosApi.remind(debt.id),
    onSuccess: async (resultado, pestanaRespaldo) => {
      if (esEnvioDirecto(resultado)) {
        await enviarWhatsappDesdeCelular(resultado, pestanaRespaldo);
      } else {
        pestanaRespaldo?.close();
        toast.success('Recordatorio en cola. Se enviará por WhatsApp en unos segundos.');
      }
      queryClient.invalidateQueries({ queryKey: ['client-debts'] });
    },
    onError: (error: any, pestanaRespaldo) => {
      pestanaRespaldo?.close();
      const msg = error?.response?.data?.message ?? 'No se pudo poner el recordatorio en cola.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  return (
    <div className={className}>
      <button
        onClick={() => sendReminder.mutate(abrirPestanaRespaldoSiHaceFalta())}
        disabled={sendReminder.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-sage-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sage-600 disabled:cursor-not-allowed disabled:bg-porcelain-300 disabled:text-muted"
      >
        {sendReminder.isPending ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
        {sendReminder.isPending ? 'Encolando...' : 'Recordatorio por WhatsApp'}
      </button>
    </div>
  );
}
