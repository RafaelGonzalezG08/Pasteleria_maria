import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Pencil, Phone, Plus, Trash2, Truck, X } from 'lucide-react';
import { comprasApi, insumosApi, proveedoresApi, type CompraPayload } from '../../api/inventario.api';
import { fechaLocal, formatCantidad, formatDate, formatMoney } from '../../lib/format';
import { opcionesCompatibles, OPCIONES_UNIDAD } from '../../lib/unidades';
import { Button, Card, EmptyState, Field, INPUT, Modal, PageHeader, Select, Skeleton, Tabs } from '../../components/ui';
import { usePaginacion } from '../../lib/usePaginacion';
import { Paginador } from '../../components/Paginador';
import type { Compra, Insumo, Proveedor } from '../../types';

type Pestana = 'COMPRAS' | 'PROVEEDORES';

export default function Compras() {
  const [pestana, setPestana] = useState<Pestana>('COMPRAS');
  const [nuevaCompra, setNuevaCompra] = useState(false);
  const [proveedorForm, setProveedorForm] = useState<Proveedor | 'nuevo' | null>(null);

  return (
    <div>
      <PageHeader
        title="Compras y proveedores"
        subtitle="Cada compra suma al inventario y actualiza el costo de los insumos"
        action={
          pestana === 'COMPRAS' ? (
            <Button size="sm" onClick={() => setNuevaCompra(true)}>
              <Plus size={16} /> Registrar compra
            </Button>
          ) : (
            <Button size="sm" onClick={() => setProveedorForm('nuevo')}>
              <Plus size={16} /> Nuevo proveedor
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Tabs
          value={pestana}
          onChange={setPestana}
          opciones={[
            { valor: 'COMPRAS', texto: 'Compras' },
            { valor: 'PROVEEDORES', texto: 'Proveedores' },
          ]}
        />
      </div>

      {pestana === 'COMPRAS' ? <ListaCompras /> : <ListaProveedores onEditar={setProveedorForm} />}
      {nuevaCompra && <CompraForm onClose={() => setNuevaCompra(false)} />}
      {proveedorForm && (
        <ProveedorForm proveedor={proveedorForm === 'nuevo' ? undefined : proveedorForm} onClose={() => setProveedorForm(null)} />
      )}
    </div>
  );
}

function ListaCompras() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const { data: compras = [], isLoading } = useQuery<Compra[]>({
    queryKey: ['compras', from, to],
    queryFn: () => comprasApi.list({ from: from || undefined, to: to || undefined }),
  });
  const pag = usePaginacion(compras, [from, to]);
  const { data: detalle } = useQuery<Compra>({
    queryKey: ['compra', abierta],
    queryFn: () => comprasApi.get(abierta!),
    enabled: Boolean(abierta),
  });
  const anular = useMutation({
    mutationFn: (id: string) => comprasApi.delete(id),
    onSuccess: () => {
      toast.success('Compra anulada: se quito del inventario y de gastos.');
      setAbierta(null);
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
  const total = compras.reduce((s, c) => s + c.total, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Hasta">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT} />
        </Field>
        <p className="ml-auto text-sm text-muted">
          Total: <span className="font-display font-bold text-ink">{formatMoney(total)}</span>
        </p>
      </div>
      {isLoading ? (
        <Skeleton />
      ) : compras.length === 0 ? (
        <EmptyState title="Sin compras registradas" description="Registra lo que le compras a tus proveedores para mantener el inventario y los costos al dia." />
      ) : (
        <Card className="divide-y divide-porcelain-200 overflow-hidden">
          {pag.visibles.map((c) => (
            <button key={c.id} onClick={() => setAbierta(c.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-porcelain-200/60">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{c.proveedor?.nombre ?? 'Sin proveedor'}</p>
                <p className="truncate text-xs text-muted">
                  {formatDate(c.fecha)} · {c.totalLineas} linea(s)
                  {c.numeroFactura ? ` · Factura ${c.numeroFactura}` : ''} · {c.user?.nombre ?? ''}
                </p>
              </div>
              <p className="shrink-0 font-display font-semibold tabular-nums text-ink">{formatMoney(c.total)}</p>
            </button>
          ))}
        </Card>
      )}
      <Paginador p={pag} etiqueta="compras" />

      {abierta && (
        <Modal titulo="Detalle de la compra" onClose={() => setAbierta(null)}>
          {!detalle ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted">
                {formatDate(detalle.fecha)} · {detalle.proveedor?.nombre ?? 'Sin proveedor'}
                {detalle.numeroFactura ? ` · Factura ${detalle.numeroFactura}` : ''}
              </p>
              <table className="w-full">
                <tbody className="divide-y divide-porcelain-200">
                  {detalle.items?.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2 text-ink">
                        {i.insumo.nombre}
                        {i.fechaVencimiento && <p className="text-xs text-muted">Vence {formatDate(i.fechaVencimiento)}</p>}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted">
                        {formatCantidad(i.cantidad)} {i.unidad}
                      </td>
                      <td className="py-2 text-right tabular-nums text-ink">{formatMoney(i.costoTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-right font-display text-lg font-bold text-ink">{formatMoney(detalle.total)}</p>
              {detalle.notas && <p className="text-xs text-muted">Notas: {detalle.notas}</p>}
              <Button
                variant="ghost"
                className="w-full"
                disabled={anular.isPending}
                onClick={() => {
                  if (window.confirm('¿Anular esta compra? Se quita del inventario y de gastos (solo si no se ha usado nada de ella).')) {
                    anular.mutate(detalle.id);
                  }
                }}
              >
                <Trash2 size={15} /> Anular compra
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

interface LineaCompra {
  key: string;
  insumoId: string;
  cantidad: string;
  unidad: string;
  costoTotal: string;
  fechaVencimiento: string;
}

function CompraForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: insumos = [] } = useQuery<Insumo[]>({ queryKey: ['insumos'], queryFn: () => insumosApi.list() });
  const { data: proveedores = [] } = useQuery<Proveedor[]>({ queryKey: ['proveedores'], queryFn: () => proveedoresApi.list() });
  const [cabecera, setCabecera] = useState({ proveedorId: '', fecha: fechaLocal(), numeroFactura: '', notas: '', registrarGasto: true });
  const [lineas, setLineas] = useState<LineaCompra[]>([
    { key: 'l0', insumoId: '', cantidad: '', unidad: 'kg', costoTotal: '', fechaVencimiento: '' },
  ]);
  const total = lineas.reduce((s, l) => s + (Number(l.costoTotal) || 0), 0);

  function cambiar(key: string, cambios: Partial<LineaCompra>) {
    setLineas((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const nueva = { ...l, ...cambios };
        if (cambios.insumoId !== undefined) nueva.unidad = insumos.find((i) => i.id === cambios.insumoId)?.unidad ?? nueva.unidad;
        return nueva;
      }),
    );
  }

  const guardar = useMutation({
    mutationFn: () => {
      const payload: CompraPayload = {
        proveedorId: cabecera.proveedorId || undefined,
        fecha: cabecera.fecha || undefined,
        numeroFactura: cabecera.numeroFactura || undefined,
        notas: cabecera.notas || undefined,
        registrarGasto: cabecera.registrarGasto,
        items: lineas
          .filter((l) => l.insumoId && Number(l.cantidad) > 0)
          .map((l) => ({
            insumoId: l.insumoId,
            cantidad: Number(l.cantidad),
            unidad: l.unidad,
            costoTotal: Number(l.costoTotal) || 0,
            fechaVencimiento: l.fechaVencimiento || undefined,
          })),
      };
      return comprasApi.create(payload);
    },
    onSuccess: () => {
      toast.success('Compra registrada: el inventario y los costos se actualizaron.');
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      queryClient.invalidateQueries({ queryKey: ['recetas'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['lista-compras'] });
      onClose();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!lineas.some((l) => l.insumoId && Number(l.cantidad) > 0)) {
      toast.error('Agrega al menos un insumo con su cantidad.');
      return;
    }
    guardar.mutate();
  }

  return (
    <Modal titulo="Registrar compra" onClose={onClose} ancho="max-w-4xl">
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Proveedor">
            <Select
              value={cabecera.proveedorId}
              onChange={(v) => setCabecera((c) => ({ ...c, proveedorId: v }))}
              options={[{ value: '', label: 'Sin proveedor' }, ...proveedores.map((p) => ({ value: p.id, label: p.nombre }))]}
            />
          </Field>
          <Field label="Fecha">
            <input type="date" value={cabecera.fecha} onChange={(e) => setCabecera((c) => ({ ...c, fecha: e.target.value }))} className={INPUT} />
          </Field>
          <Field label="No. de factura">
            <input value={cabecera.numeroFactura} onChange={(e) => setCabecera((c) => ({ ...c, numeroFactura: e.target.value }))} placeholder="Opcional" className={INPUT} />
          </Field>
        </div>

        <div>
          <div className="mb-1 hidden grid-cols-[1fr_90px_120px_120px_140px_auto] gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted sm:grid">
            <span>Insumo</span>
            <span>Cantidad</span>
            <span>Unidad</span>
            <span>Pagado</span>
            <span>Vence</span>
            <span />
          </div>
          <div className="space-y-2">
            {lineas.map((l) => {
              const insumo = insumos.find((i) => i.id === l.insumoId);
              return (
                <div key={l.key} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_90px_120px_120px_140px_auto]">
                  <Select
                    className="col-span-2 sm:col-span-1"
                    size="sm"
                    value={l.insumoId}
                    onChange={(v) => cambiar(l.key, { insumoId: v })}
                    options={[{ value: '', label: 'Elegir insumo...' }, ...insumos.map((i) => ({ value: i.id, label: i.nombre }))]}
                  />
                  <input type="number" min="0" step="any" value={l.cantidad} onChange={(e) => cambiar(l.key, { cantidad: e.target.value })} placeholder="Cant." className="rounded-lg px-2.5 py-1.5 text-sm" />
                  <Select size="sm" value={l.unidad} onChange={(v) => cambiar(l.key, { unidad: v })} options={insumo ? opcionesCompatibles(insumo.unidad) : OPCIONES_UNIDAD} />
                  <input type="number" min="0" step="0.01" value={l.costoTotal} onChange={(e) => cambiar(l.key, { costoTotal: e.target.value })} placeholder="Total pagado" className="rounded-lg px-2.5 py-1.5 text-sm" />
                  <input type="date" value={l.fechaVencimiento} onChange={(e) => cambiar(l.key, { fechaVencimiento: e.target.value })} className="rounded-lg px-2.5 py-1.5 text-sm" />
                  <button type="button" onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} className="justify-self-end rounded p-1 text-muted hover:text-brick-600">
                    <X size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() =>
              setLineas((ls) => [...ls, { key: `l${Date.now()}`, insumoId: '', cantidad: '', unidad: 'kg', costoTotal: '', fechaVencimiento: '' }])
            }
          >
            <Plus size={14} /> Agregar linea
          </Button>
        </div>

        <Field label="Notas">
          <input value={cabecera.notas} onChange={(e) => setCabecera((c) => ({ ...c, notas: e.target.value }))} className={INPUT} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={cabecera.registrarGasto}
            onChange={(e) => setCabecera((c) => ({ ...c, registrarGasto: e.target.checked }))}
            className="h-4 w-4 accent-copper-500"
          />
          Registrar tambien en Gastos (para que el flujo de caja la cuente)
        </label>

        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink">Total: {formatMoney(total)}</p>
          <Button type="submit" disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 size={16} className="animate-spin" />} Registrar compra
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ListaProveedores({ onEditar }: { onEditar: (p: Proveedor) => void }) {
  const queryClient = useQueryClient();
  const { data: proveedores = [], isLoading } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => proveedoresApi.list(),
  });
  const eliminar = useMutation({
    mutationFn: (id: string) => proveedoresApi.delete(id),
    onSuccess: () => {
      toast.success('Proveedor eliminado.');
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
    },
  });

  if (isLoading) return <Skeleton />;
  if (proveedores.length === 0) return <EmptyState title="Sin proveedores" description="Registra a quien le compras la harina, los huevos, las cajas..." />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {proveedores.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 font-display font-semibold text-ink">
              <Truck size={16} className="text-copper-600" /> {p.nombre}
            </p>
            <div className="flex">
              <button onClick={() => onEditar(p)} className="rounded p-1 text-muted hover:text-ink" title="Editar">
                <Pencil size={14} />
              </button>
              <button onClick={() => eliminar.mutate(p.id)} className="rounded p-1 text-muted hover:text-brick-600" title="Eliminar">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {p.contacto && <p className="mt-1 text-sm text-muted">{p.contacto}</p>}
          {p.telefono && (
            <p className="mt-1 flex items-center gap-1 text-sm text-ink">
              <Phone size={12} /> {p.telefono}
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            {p.totalInsumos} insumo(s) · {p.totalCompras} compra(s)
            {p.ultimaCompra ? ` · ultima ${formatDate(p.ultimaCompra)}` : ''}
          </p>
        </Card>
      ))}
    </div>
  );
}

function ProveedorForm({ proveedor, onClose }: { proveedor?: Proveedor; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    nombre: proveedor?.nombre ?? '',
    contacto: proveedor?.contacto ?? '',
    telefono: proveedor?.telefono ?? '',
    email: proveedor?.email ?? '',
    direccion: proveedor?.direccion ?? '',
    notas: proveedor?.notas ?? '',
  });
  const guardar = useMutation({
    mutationFn: () => (proveedor ? proveedoresApi.update(proveedor.id, form) : proveedoresApi.create(form)),
    onSuccess: () => {
      toast.success(proveedor ? 'Proveedor actualizado.' : 'Proveedor creado.');
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      onClose();
    },
  });
  const set = (campo: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  return (
    <Modal titulo={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (form.nombre.trim().length < 2) return toast.error('Escribe el nombre del proveedor.');
          guardar.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Nombre">
          <input value={form.nombre} onChange={set('nombre')} className={INPUT} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contacto">
            <input value={form.contacto} onChange={set('contacto')} className={INPUT} />
          </Field>
          <Field label="Telefono">
            <input value={form.telefono} onChange={set('telefono')} className={INPUT} />
          </Field>
        </div>
        <Field label="Correo">
          <input value={form.email} onChange={set('email')} className={INPUT} />
        </Field>
        <Field label="Direccion">
          <input value={form.direccion} onChange={set('direccion')} className={INPUT} />
        </Field>
        <Field label="Notas">
          <textarea value={form.notas} onChange={set('notas')} rows={2} className={INPUT} />
        </Field>
        <Button type="submit" className="w-full" disabled={guardar.isPending}>
          {guardar.isPending && <Loader2 size={16} className="animate-spin" />} Guardar
        </Button>
      </form>
    </Modal>
  );
}
