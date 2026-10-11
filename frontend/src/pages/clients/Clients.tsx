import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Search, Phone, Mail, X, Trash2, Loader2, Check, Download, ChevronRight } from 'lucide-react';
import { clientsApi } from '../../api/clients.api';
import { usePersistedState, limpiarBorrador } from '../../lib/usePersistedState';
import { formatMoney, formatDate, ESTADO_DEUDA_LABEL, METODO_PAGO_LABEL } from '../../lib/format';
import { Button, Card, PageHeader, Badge, EmptyState, Skeleton } from '../../components/ui';
import { DebtDetailModal } from '../../components/DebtDetailModal';
import { SaleDetailModal } from '../../components/SaleDetailModal';
import { useAuthStore } from '../../store/auth.store';
import type { Client, ClientDebt } from '../../types';

export default function Clients() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const esAdmin = user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Seleccion multiple: para borrar varios clientes sin historial de una
  // vez, en lugar de entrar a cada uno por separado.
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  function toggleSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', 'all', search],
    queryFn: () => clientsApi.search(search),
  });

  const bulkEliminar = useMutation({
    mutationFn: () => clientsApi.bulkDelete([...seleccionados]),
    onSuccess: (data) => {
      toast.success(
        data.omitidos.length > 0
          ? `${data.eliminados} eliminados. ${data.omitidos.length} no se pudieron (ya tienen historial).`
          : `${data.eliminados} clientes eliminados.`,
      );
      // Mismo cuidado que en deleteClient: si el detalle de alguno de estos
      // seguia abierto, sacarlo del cache antes de invalidar la lista evita
      // un 404 de fondo para un cliente que ya no existe.
      if (selectedId && seleccionados.has(selectedId)) {
        queryClient.removeQueries({ queryKey: ['clients', selectedId] });
        setSelectedId(null);
      }
      queryClient.invalidateQueries({ queryKey: ['clients', 'all'] });
      setSeleccionados(new Set());
    },
    onError: () => toast.error('No se pudo completar la eliminacion.'),
  });

  const { data: selectedClient } = useQuery<Client>({
    queryKey: ['clients', selectedId],
    queryFn: () => clientsApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });

  const createClient = useMutation({
    mutationFn: (payload: Partial<Client>) => clientsApi.create(payload),
    onSuccess: () => {
      toast.success('Cliente creado.');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      // Ya se guardo de verdad: el borrador deja de tener sentido.
      limpiarBorrador('clientes:nuevo');
      setShowForm(false);
    },
  });

  async function exportarCsv() {
    const blob = await clientsApi.exportXlsx();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clientes.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Historial de compras y deudas por cliente"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportarCsv}>
              <Download size={16} /> Exportar Excel
            </Button>
            {esAdmin && (
              <Button
                variant="secondary"
                onClick={() => {
                  setModoSeleccion((v) => !v);
                  setSeleccionados(new Set());
                }}
              >
                {modoSeleccion ? 'Cancelar seleccion' : 'Seleccionar varios'}
              </Button>
            )}
            <Button onClick={() => setShowForm(true)}>
              <Plus size={16} /> Nuevo cliente
            </Button>
          </div>
        }
      />

      <div className="buscador mb-4">
        <Search size={16} className="shrink-0 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, telefono o correo..."
        />
      </div>

      {modoSeleccion && seleccionados.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-copper-300 bg-copper-50 px-3 py-2">
          <span className="text-sm font-semibold text-copper-700">{seleccionados.size} seleccionados</span>
          <Button
            size="sm"
            className="ml-auto !bg-brick-600 hover:!bg-brick-700"
            disabled={bulkEliminar.isPending}
            onClick={() => bulkEliminar.mutate()}
          >
            {bulkEliminar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Eliminar
          </Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton />
      ) : clients.length === 0 ? (
        <EmptyState title="Sin clientes" description="Registra tu primer cliente para empezar." />
      ) : (
        <Card className="divide-y divide-porcelain-200 overflow-hidden">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => (modoSeleccion ? toggleSeleccion(c.id) : setSelectedId(c.id))}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-porcelain-100"
            >
              <div className="flex items-center gap-3">
                {modoSeleccion && (
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                      seleccionados.has(c.id)
                        ? 'border-copper-600 bg-copper-600 text-white'
                        : 'border-porcelain-400'
                    }`}
                  >
                    {seleccionados.has(c.id) && <Check size={13} strokeWidth={3} />}
                  </span>
                )}
                <div>
                  <p className="text-sm font-medium text-ink">{c.nombre}</p>
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Phone size={11} /> {c.telefono}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {Boolean(c.deudaPendiente) && (
                  <Badge tone="brick">Debe {formatMoney(c.deudaPendiente!)}</Badge>
                )}
                {!modoSeleccion && <ChevronRight size={16} className="shrink-0 text-muted" />}
              </div>
            </button>
          ))}
        </Card>
      )}

      {showForm && (
        <NewClientModal onClose={() => setShowForm(false)} onSubmit={(payload) => createClient.mutate(payload)} />
      )}

      {selectedClient && <ClientDetailModal client={selectedClient} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

/**
 * Todo lo del cliente en un solo panel: datos, deudas pendientes e historial
 * de compras. Tocar una deuda o una venta abre su detalle completo (items,
 * abonos, factura) con los mismos modales que usan Cobros y Ventas.
 */
function ClientDetailModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const esAdmin = user?.role === 'ADMIN';
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<ClientDebt | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  // Borrar un cliente es solo de ADMIN (@Roles(Role.ADMIN) en
  // clients.controller.ts). El backend ademas se niega si el cliente ya tiene
  // ventas o deudas — ese mensaje es el que se muestra tal cual, porque
  // explica exactamente por que no se puede.
  const deleteClient = useMutation({
    mutationFn: () => clientsApi.delete(client.id),
    onSuccess: () => {
      toast.success('Cliente eliminado.');
      // Saca del cache el detalle de ESTE cliente antes de invalidar la
      // lista: si no, mientras el modal seguia montado (onClose recien se
      // llama despues), React Query alcanzaba a repetir el GET de este
      // mismo id -- que ya no existe -- y el interceptor mostraba un 404
      // de "Cliente no encontrado" pisando el toast de exito.
      queryClient.removeQueries({ queryKey: ['clients', client.id] });
      queryClient.invalidateQueries({ queryKey: ['clients', 'all'] });
      onClose();
    },
    onSettled: () => setConfirmandoBorrado(false),
  });

  const pendingDebts = (client.debts ?? []).filter((d) => d.status !== 'PAGADA');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[85vh] w-full max-w-md overflow-hidden">
        <div className="max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-porcelain-200 p-5">
          <div>
            <p className="font-display font-bold text-ink">{client.nombre}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <Phone size={13} /> {client.telefono}
            </p>
            {client.email && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                <Mail size={13} /> {client.email}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {pendingDebts.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Deudas pendientes</h3>
              <div className="divide-y divide-porcelain-200 rounded-lg border border-porcelain-200">
                {pendingDebts.map((d) => {
                  const saldo = Number(d.amountTotal ?? 0) - Number(d.amountPaid ?? 0);
                  return (
                    <button
                      key={d.id}
                      onClick={() =>
                        setSelectedDebt({
                          ...d,
                          client: { id: client.id, nombre: client.nombre, telefono: client.telefono },
                        })
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-porcelain-100"
                    >
                      <div>
                        <Badge tone={d.status === 'VENCIDA' ? 'brick' : 'copper'}>
                          {ESTADO_DEUDA_LABEL[d.status]}
                        </Badge>
                        {d.dueDate && <p className="mt-1 text-xs text-muted">Vence: {formatDate(d.dueDate)}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="font-display font-bold tabular-nums text-ink">
                          {formatMoney(saldo)}
                        </span>
                        <ChevronRight size={16} className="text-muted" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Historial de compras</h3>
            {!client.sales || client.sales.length === 0 ? (
              <p className="text-sm text-muted">Sin compras registradas.</p>
            ) : (
              <div className="divide-y divide-porcelain-200 rounded-lg border border-porcelain-200">
                {client.sales.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSaleId(s.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-porcelain-100"
                  >
                    <div>
                      <p className="text-ink">{formatDate(s.fecha)}</p>
                      <p className="text-xs text-muted">{METODO_PAGO_LABEL[s.metodoPago]}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="font-display font-semibold tabular-nums text-ink">
                        {formatMoney(s.total)}
                      </span>
                      <ChevronRight size={16} className="text-muted" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {esAdmin && (
            <div className="border-t border-porcelain-200 pt-3">
              {confirmandoBorrado ? (
                <>
                  <p className="mb-2 text-sm font-semibold text-ink">Eliminar a {client.nombre}?</p>
                  <p className="mb-3 text-xs text-muted">
                    Esto no se puede deshacer. Si el cliente ya tiene ventas o deudas registradas, el sistema no lo
                    va a dejar borrar (haria desaparecer el rastro de facturas a su nombre).
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setConfirmandoBorrado(false)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="danger"
                      className="flex-1"
                      disabled={deleteClient.isPending}
                      onClick={() => deleteClient.mutate()}
                    >
                      {deleteClient.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      Si, eliminar
                    </Button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmandoBorrado(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium text-brick-500 hover:bg-brick-100"
                >
                  <Trash2 size={15} /> Eliminar cliente
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </Card>

      {selectedDebt && <DebtDetailModal debt={selectedDebt} onClose={() => setSelectedDebt(null)} />}
      {selectedSaleId && <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />}
    </div>
  );
}

function NewClientModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: Partial<Client>) => void;
}) {
  // El cliente a medio escribir sobrevive si se cierra el modal sin querer.
  const [form, setForm] = usePersistedState('clientes:nuevo', {
    nombre: '',
    telefono: '',
    email: '',
    direccion: '',
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.telefono.trim()) {
      toast.error('Nombre y telefono son obligatorios.');
      return;
    }
    // Si el correo o la direccion quedan en blanco no se envian (en vez de
    // mandar "" o "N/A"), asi el backend los trata como realmente opcionales.
    onSubmit({
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim() || undefined,
      direccion: form.direccion.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[90vh] w-full max-w-sm overflow-hidden">
        <div className="max-h-[90vh] overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display font-bold text-ink">Nuevo cliente</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {(['nombre', 'telefono', 'email', 'direccion'] as const).map((field) => (
            <div key={field}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                {field}
                {(field === 'nombre' || field === 'telefono') && ' *'}
              </label>
              <input
                value={form[field]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder={field === 'email' ? 'Opcional' : field === 'direccion' ? 'Opcional' : undefined}
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
          ))}
          <Button type="submit" className="w-full">
            Guardar cliente
          </Button>
        </form>
        </div>
      </Card>
    </div>
  );
}
