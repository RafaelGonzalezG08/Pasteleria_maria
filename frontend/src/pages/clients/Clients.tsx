import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Search, Phone, Mail, X, Trash2, Loader2, Check, Download, ChevronRight, Gift, MapPin, Pencil } from 'lucide-react';
import { clientsApi, type ClientePayload } from '../../api/clients.api';
import { usePersistedState, limpiarBorrador } from '../../lib/usePersistedState';
import { formatMoney, formatDate, ESTADO_DEUDA_LABEL, ESTADO_ENCARGO_LABEL, METODO_PAGO_LABEL } from '../../lib/format';
import { Button, Card, PageHeader, Badge, EmptyState, Field, INPUT, Modal, Skeleton } from '../../components/ui';
import { DebtDetailModal } from '../../components/DebtDetailModal';
import { SaleDetailModal } from '../../components/SaleDetailModal';
import { useAuthStore } from '../../store/auth.store';
import { Link } from 'react-router-dom';
import type { Client, ClientDebt, FechaEspecial } from '../../types';

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
    mutationFn: (payload: ClientePayload) => clientsApi.create(payload),
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
        <ClienteFormModal
          onClose={() => setShowForm(false)}
          onSubmit={(payload) => createClient.mutate(payload)}
          pendiente={createClient.isPending}
        />
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
  const [editando, setEditando] = useState(false);

  const actualizar = useMutation({
    mutationFn: (payload: ClientePayload) => clientsApi.update(client.id, payload),
    onSuccess: () => {
      toast.success('Cliente actualizado.');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setEditando(false);
    },
  });

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

  if (editando) {
    return (
      <ClienteFormModal
        cliente={client}
        onClose={() => setEditando(false)}
        onSubmit={(payload) => actualizar.mutate(payload)}
        pendiente={actualizar.isPending}
      />
    );
  }

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
            {client.direccion && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                <MapPin size={13} /> {client.direccion}
              </p>
            )}
            {client.cumpleanos && (
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                <Gift size={13} /> Cumpleaños:{' '}
                {new Date(client.cumpleanos).toLocaleDateString('es-DO', { day: 'numeric', month: 'long' })}
              </p>
            )}
            {(client.fechasEspeciales ?? []).map((f) => (
              <p key={f.descripcion + f.fecha} className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                <Gift size={13} /> {f.descripcion}:{' '}
                {new Date(`${f.fecha}T12:00:00`).toLocaleDateString('es-DO', { day: 'numeric', month: 'long' })}
              </p>
            ))}
            {client.notas && <p className="mt-1 text-xs text-muted">{client.notas}</p>}
          </div>
          <div className="flex shrink-0 items-start gap-1">
            <button onClick={() => setEditando(true)} className="rounded p-1 text-muted hover:bg-porcelain-200" title="Editar cliente">
              <Pencil size={16} />
            </button>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
              <X size={18} />
            </button>
          </div>
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Encargos</h3>
            {!client.encargos || client.encargos.length === 0 ? (
              <p className="text-sm text-muted">Sin encargos.</p>
            ) : (
              <div className="divide-y divide-porcelain-200 rounded-lg border border-porcelain-200">
                {client.encargos.map((e) => (
                  <Link
                    key={e.id}
                    to={`/encargos?id=${e.id}`}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-porcelain-100"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-ink">
                        {formatDate(e.fechaEntrega)} · {e.items.map((i) => `${i.cantidad} × ${i.descripcion}`).join(', ')}
                      </p>
                      <p className="text-xs text-muted">
                        {e.codigo} · {ESTADO_ENCARGO_LABEL[e.estado]}
                        {e.saldo > 0 && e.estado !== 'CANCELADO' ? ` · saldo ${formatMoney(e.saldo)}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-display font-semibold tabular-nums text-ink">{formatMoney(e.total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

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

/**
 * Alta y edicion de cliente. Ademas de los datos de contacto guarda el
 * cumpleaños y otras fechas especiales: el Dashboard avisa unos dias antes
 * para ofrecerles su pastel a tiempo.
 */
function ClienteFormModal({
  cliente,
  onClose,
  onSubmit,
  pendiente,
}: {
  cliente?: Client;
  onClose: () => void;
  onSubmit: (payload: ClientePayload) => void;
  pendiente: boolean;
}) {
  // El cliente nuevo a medio escribir sobrevive si se cierra el modal sin querer.
  const [form, setForm] = usePersistedState(cliente ? `clientes:editar:${cliente.id}` : 'clientes:nuevo', {
    nombre: cliente?.nombre ?? '',
    telefono: cliente?.telefono ?? '',
    email: cliente?.email ?? '',
    direccion: cliente?.direccion ?? '',
    notas: cliente?.notas ?? '',
    cumpleanos: cliente?.cumpleanos ? cliente.cumpleanos.slice(0, 10) : '',
    fechasEspeciales: (cliente?.fechasEspeciales ?? []) as FechaEspecial[],
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !form.telefono.trim()) {
      toast.error('Nombre y telefono son obligatorios.');
      return;
    }
    // Lo que queda en blanco no se envia (en vez de "" o "N/A"), asi el
    // backend lo trata como realmente opcional.
    onSubmit({
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim() || undefined,
      direccion: form.direccion.trim() || undefined,
      notas: form.notas.trim() || undefined,
      cumpleanos: form.cumpleanos || null,
      fechasEspeciales: form.fechasEspeciales.filter((f) => f.descripcion.trim() && f.fecha),
    });
    if (cliente) limpiarBorrador(`clientes:editar:${cliente.id}`);
  }

  const set = (campo: 'nombre' | 'telefono' | 'email' | 'direccion' | 'notas' | 'cumpleanos') => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <Modal titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose} ancho="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Nombre *">
          <input value={form.nombre} onChange={set('nombre')} className={INPUT} autoFocus />
        </Field>
        <Field label="Telefono *">
          <input value={form.telefono} onChange={set('telefono')} placeholder="+18095551234" className={INPUT} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Correo">
            <input value={form.email} onChange={set('email')} placeholder="Opcional" className={INPUT} />
          </Field>
          <Field label="Cumpleaños" ayuda="Si no sabes el año, usa 2000.">
            <input type="date" value={form.cumpleanos} onChange={set('cumpleanos')} className={INPUT} />
          </Field>
        </div>
        <Field label="Direccion">
          <input value={form.direccion} onChange={set('direccion')} placeholder="Para entregas a domicilio" className={INPUT} />
        </Field>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Fechas especiales</p>
          <div className="space-y-2">
            {form.fechasEspeciales.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_150px_auto] gap-2">
                <input
                  value={f.descripcion}
                  onChange={(e) =>
                    setForm((x) => ({
                      ...x,
                      fechasEspeciales: x.fechasEspeciales.map((y, j) => (j === i ? { ...y, descripcion: e.target.value } : y)),
                    }))
                  }
                  placeholder="Aniversario, cumpleaños de la hija..."
                  className="rounded-lg px-2.5 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={f.fecha}
                  onChange={(e) =>
                    setForm((x) => ({
                      ...x,
                      fechasEspeciales: x.fechasEspeciales.map((y, j) => (j === i ? { ...y, fecha: e.target.value } : y)),
                    }))
                  }
                  className="rounded-lg px-2.5 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setForm((x) => ({ ...x, fechasEspeciales: x.fechasEspeciales.filter((_, j) => j !== i) }))}
                  className="rounded p-1 text-muted hover:text-brick-600"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setForm((x) => ({ ...x, fechasEspeciales: [...x.fechasEspeciales, { descripcion: '', fecha: '' }] }))}
          >
            <Plus size={14} /> Agregar fecha
          </Button>
        </div>
        <Field label="Notas">
          <textarea value={form.notas} onChange={set('notas')} rows={2} placeholder="Gustos, alergias..." className={INPUT} />
        </Field>
        <Button type="submit" className="w-full" disabled={pendiente}>
          {pendiente && <Loader2 size={16} className="animate-spin" />}
          Guardar cliente
        </Button>
      </form>
    </Modal>
  );
}
