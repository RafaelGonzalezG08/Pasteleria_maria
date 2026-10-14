import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CalendarClock, Loader2, Pencil, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import { insumosApi, produccionApi, proveedoresApi, type InsumoPayload, type MovimientoPayload } from '../../api/inventario.api';
import {
  fechaLocal,
  formatCantidad,
  formatDate,
  formatDateTime,
  formatMoney,
  TIPO_MOVIMIENTO_LABEL,
} from '../../lib/format';
import { OPCIONES_UNIDAD, opcionesCompatibles } from '../../lib/unidades';
import { coincideBusqueda } from '../../lib/search';
import { usePaginacion } from '../../lib/usePaginacion';
import { Paginador } from '../../components/Paginador';
import { useAuthStore } from '../../store/auth.store';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  INPUT,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  Stat,
  Tabs,
} from '../../components/ui';
import type { Insumo, InsumoDetalle, ListaCompras, MovimientoInsumo, Proveedor, TipoInsumo } from '../../types';

type Pestana = 'INSUMOS' | 'HISTORIAL' | 'COMPRAS';

const TONO_MOVIMIENTO: Record<string, 'sage' | 'brick' | 'copper' | 'neutral' | 'rose'> = {
  ENTRADA: 'sage',
  COMPRA: 'sage',
  SALIDA: 'neutral',
  PRODUCCION: 'rose',
  MERMA: 'brick',
  AJUSTE: 'copper',
};

export default function Inventario() {
  const esAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const [pestana, setPestana] = useState<Pestana>('INSUMOS');
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'TODOS' | 'BAJOS' | 'VENCER'>('TODOS');
  const [creando, setCreando] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const { data: insumos = [], isLoading } = useQuery<Insumo[]>({
    queryKey: ['insumos'],
    queryFn: () => insumosApi.list(),
  });

  const visibles = useMemo(
    () =>
      insumos
        .filter((i) => coincideBusqueda(i.nombre, search))
        .filter((i) => (filtro === 'BAJOS' ? i.bajoMinimo : filtro === 'VENCER' ? i.porVencer : true)),
    [insumos, search, filtro],
  );
  const pag = usePaginacion(visibles, [search, filtro]);
  const bajos = insumos.filter((i) => i.bajoMinimo).length;
  const porVencer = insumos.filter((i) => i.porVencer).length;
  const valorTotal = insumos.reduce((s, i) => s + (i.valorStock ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Inventario de insumos"
        subtitle="Ingredientes y materiales: existencia, lotes, vencimientos y movimientos"
        action={
          pestana === 'INSUMOS' && (
            <Button size="sm" onClick={() => setCreando(true)}>
              <Plus size={16} /> Nuevo insumo
            </Button>
          )
        }
      />

      <div className="mb-4">
        <Tabs
          value={pestana}
          onChange={setPestana}
          opciones={[
            { valor: 'INSUMOS', texto: 'Insumos' },
            { valor: 'HISTORIAL', texto: 'Historial de movimientos' },
            { valor: 'COMPRAS', texto: 'Lista de compras' },
          ]}
        />
      </div>

      {pestana === 'HISTORIAL' && <Historial esAdmin={esAdmin} />}
      {pestana === 'COMPRAS' && <ListaDeCompras esAdmin={esAdmin} />}

      {pestana === 'INSUMOS' && (
        <>
          <div className={`mb-4 grid gap-3 ${esAdmin ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            <Stat label="Insumos" value={insumos.length} />
            <Stat label="Bajo el minimo" value={bajos} tone={bajos > 0 ? 'brick' : 'ink'} />
            <Stat label="Por vencer" value={porVencer} tone={porVencer > 0 ? 'copper' : 'ink'} />
            {esAdmin && <Stat label="Valor del inventario" value={formatMoney(valorTotal)} />}
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tabs
              value={filtro}
              onChange={setFiltro}
              opciones={[
                { valor: 'TODOS', texto: 'Todos' },
                { valor: 'BAJOS', texto: `Bajo el minimo (${bajos})` },
                { valor: 'VENCER', texto: `Por vencer (${porVencer})` },
              ]}
            />
            <div className="buscador ml-auto max-w-sm flex-1 !py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar insumo..." />
            </div>
          </div>

          {isLoading ? (
            <Skeleton />
          ) : visibles.length === 0 ? (
            <EmptyState
              title={insumos.length === 0 ? 'Sin insumos' : 'Sin resultados'}
              description={
                insumos.length === 0 ? 'Registra la harina, el azucar, los huevos, las cajas... para llevar su existencia.' : undefined
              }
            />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Insumo</th>
                    <th className="px-4 py-3 text-right">Existencia</th>
                    <th className="px-4 py-3 text-right">Minimo</th>
                    {esAdmin && <th className="px-4 py-3 text-right">Costo / unidad</th>}
                    <th className="px-4 py-3">Vence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-porcelain-200">
                  {pag.visibles.map((i) => (
                    <tr key={i.id} onClick={() => setAbiertoId(i.id)} className="cursor-pointer hover:bg-porcelain-200/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{i.nombre}</p>
                        <p className="text-xs text-muted">
                          {i.tipo === 'MATERIAL' ? 'Material' : 'Ingrediente'}
                          {i.proveedor ? ` · ${i.proveedor.nombre}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={i.bajoMinimo ? 'font-semibold text-brick-600' : 'text-ink'}>
                          {formatCantidad(i.stockActual)} {i.unidad}
                        </span>
                        {i.bajoMinimo && (
                          <span className="ml-1.5 inline-flex align-middle">
                            <AlertTriangle size={13} className="text-brick-500" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatCantidad(i.stockMinimo)} {i.unidad}
                      </td>
                      {esAdmin && (
                        <td className="px-4 py-3 text-right tabular-nums text-ink">{formatMoney(i.costoUnitario ?? 0)}</td>
                      )}
                      <td className="px-4 py-3">
                        {i.proximoVencimiento ? (
                          <Badge tone={i.vencido ? 'brick' : i.porVencer ? 'copper' : 'neutral'}>
                            {i.vencido ? 'Vencido ' : ''}
                            {formatDate(i.proximoVencimiento)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Paginador p={pag} etiqueta="insumos" />
        </>
      )}

      {creando && <InsumoForm onClose={() => setCreando(false)} esAdmin={esAdmin} />}
      {abiertoId && <InsumoDetalleModal id={abiertoId} esAdmin={esAdmin} onClose={() => setAbiertoId(null)} />}
    </div>
  );
}

function InsumoForm({ insumo, onClose, esAdmin }: { insumo?: InsumoDetalle; onClose: () => void; esAdmin: boolean }) {
  const queryClient = useQueryClient();
  const { data: proveedores = [] } = useQuery<Proveedor[]>({
    queryKey: ['proveedores'],
    queryFn: () => proveedoresApi.list(),
  });
  const [form, setForm] = useState({
    nombre: insumo?.nombre ?? '',
    tipo: (insumo?.tipo ?? 'INGREDIENTE') as TipoInsumo,
    unidad: insumo?.unidad ?? 'kg',
    stockMinimo: insumo ? String(insumo.stockMinimo) : '',
    costoUnitario: insumo?.costoUnitario !== undefined ? String(insumo.costoUnitario) : '',
    proveedorId: insumo?.proveedorId ?? '',
    notas: insumo?.notas ?? '',
    stockInicial: '',
    fechaVencimiento: '',
  });

  const guardar = useMutation({
    mutationFn: () => {
      const payload: InsumoPayload = {
        nombre: form.nombre,
        tipo: form.tipo,
        unidad: form.unidad,
        stockMinimo: Number(form.stockMinimo) || 0,
        proveedorId: form.proveedorId || null,
        notas: form.notas,
        ...(esAdmin ? { costoUnitario: Number(form.costoUnitario) || 0 } : {}),
      };
      if (insumo) return insumosApi.update(insumo.id, payload);
      return insumosApi.create({
        ...payload,
        stockInicial: Number(form.stockInicial) || undefined,
        fechaVencimiento: form.fechaVencimiento || undefined,
      });
    },
    onSuccess: () => {
      toast.success(insumo ? 'Insumo actualizado.' : 'Insumo creado.');
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      queryClient.invalidateQueries({ queryKey: ['insumo'] });
      queryClient.invalidateQueries({ queryKey: ['recetas'] });
      onClose();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (form.nombre.trim().length < 2) {
      toast.error('Escribe el nombre del insumo.');
      return;
    }
    guardar.mutate();
  }

  const set = (campo: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <Modal titulo={insumo ? 'Editar insumo' : 'Nuevo insumo'} onClose={onClose}>
      <form onSubmit={enviar} className="space-y-3">
        <Field label="Nombre">
          <input value={form.nombre} onChange={set('nombre')} placeholder="Harina de trigo" className={INPUT} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select
              value={form.tipo}
              onChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoInsumo }))}
              options={[
                { value: 'INGREDIENTE', label: 'Ingrediente' },
                { value: 'MATERIAL', label: 'Material (cajas, bases...)' },
              ]}
            />
          </Field>
          <Field label="Unidad de inventario" ayuda={insumo ? 'Solo se puede cambiar si no tiene movimientos.' : undefined}>
            <Select value={form.unidad} onChange={(v) => setForm((f) => ({ ...f, unidad: v }))} options={OPCIONES_UNIDAD} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Stock minimo (${form.unidad})`} ayuda="Debajo de esto avisa.">
            <input type="number" min="0" step="any" value={form.stockMinimo} onChange={set('stockMinimo')} className={INPUT} />
          </Field>
          {esAdmin && (
            <Field label={`Costo por ${form.unidad}`} ayuda="Las compras lo actualizan solas.">
              <input type="number" min="0" step="any" value={form.costoUnitario} onChange={set('costoUnitario')} className={INPUT} />
            </Field>
          )}
        </div>
        {!insumo && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Existencia actual (${form.unidad})`}>
              <input type="number" min="0" step="any" value={form.stockInicial} onChange={set('stockInicial')} className={INPUT} />
            </Field>
            <Field label="Vence (opcional)">
              <input type="date" value={form.fechaVencimiento} onChange={set('fechaVencimiento')} className={INPUT} />
            </Field>
          </div>
        )}
        <Field label="Proveedor habitual">
          <Select
            value={form.proveedorId}
            onChange={(v) => setForm((f) => ({ ...f, proveedorId: v }))}
            options={[{ value: '', label: 'Sin proveedor' }, ...proveedores.map((p) => ({ value: p.id, label: p.nombre }))]}
          />
        </Field>
        <Field label="Notas">
          <textarea value={form.notas} onChange={set('notas')} rows={2} className={INPUT} />
        </Field>
        <Button type="submit" className="w-full" disabled={guardar.isPending}>
          {guardar.isPending && <Loader2 size={16} className="animate-spin" />}
          {insumo ? 'Guardar cambios' : 'Crear insumo'}
        </Button>
      </form>
    </Modal>
  );
}

function InsumoDetalleModal({ id, esAdmin, onClose }: { id: string; esAdmin: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editando, setEditando] = useState(false);
  const { data: insumo, isLoading } = useQuery<InsumoDetalle>({
    queryKey: ['insumo', id],
    queryFn: () => insumosApi.get(id),
  });
  const [mov, setMov] = useState({
    tipo: 'ENTRADA' as MovimientoPayload['tipo'],
    cantidad: '',
    unidad: '',
    costoUnitario: '',
    fechaVencimiento: '',
    motivo: '',
  });

  const registrar = useMutation({
    mutationFn: () =>
      insumosApi.movimiento(id, {
        tipo: mov.tipo,
        cantidad: Number(mov.cantidad),
        unidad: mov.unidad || undefined,
        costoUnitario: mov.tipo === 'ENTRADA' && mov.costoUnitario ? Number(mov.costoUnitario) : undefined,
        fechaVencimiento: mov.tipo === 'ENTRADA' && mov.fechaVencimiento ? mov.fechaVencimiento : undefined,
        motivo: mov.motivo || undefined,
      }),
    onSuccess: () => {
      toast.success('Movimiento registrado.');
      setMov((m) => ({ ...m, cantidad: '', costoUnitario: '', fechaVencimiento: '', motivo: '' }));
      queryClient.invalidateQueries({ queryKey: ['insumo', id] });
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      queryClient.invalidateQueries({ queryKey: ['alertas-inventario'] });
    },
  });

  const eliminar = useMutation({
    mutationFn: () => insumosApi.delete(id),
    onSuccess: (r) => {
      toast.success(r.eliminado ? 'Insumo eliminado.' : 'El insumo tiene historial: quedo desactivado.');
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      onClose();
    },
  });

  if (editando && insumo) return <InsumoForm insumo={insumo} esAdmin={esAdmin} onClose={() => setEditando(false)} />;

  const unidadMov = mov.unidad || insumo?.unidad || '';

  return (
    <Modal titulo={insumo?.nombre ?? 'Insumo'} onClose={onClose} ancho="max-w-3xl">
      {isLoading || !insumo ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={insumo.bajoMinimo ? 'brick' : 'sage'}>
              Existencia: {formatCantidad(insumo.stockActual)} {insumo.unidad}
            </Badge>
            <Badge>
              Minimo: {formatCantidad(insumo.stockMinimo)} {insumo.unidad}
            </Badge>
            {esAdmin && insumo.costoUnitario !== undefined && (
              <Badge tone="copper">
                {formatMoney(insumo.costoUnitario)} / {insumo.unidad}
              </Badge>
            )}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
                <Pencil size={14} /> Editar
              </Button>
              {esAdmin && (
                <Button size="sm" variant="ghost" onClick={() => eliminar.mutate()} disabled={eliminar.isPending}>
                  <Trash2 size={14} /> Eliminar
                </Button>
              )}
            </div>
          </div>

          <Card className="p-4">
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">Registrar movimiento</h3>
            <div className="mb-3">
              <Tabs
                value={mov.tipo}
                onChange={(tipo) => setMov((m) => ({ ...m, tipo }))}
                opciones={[
                  { valor: 'ENTRADA', texto: 'Entrada' },
                  { valor: 'SALIDA', texto: 'Salida' },
                  { valor: 'MERMA', texto: 'Merma' },
                  { valor: 'AJUSTE', texto: 'Ajuste (conteo)' },
                ]}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={mov.tipo === 'AJUSTE' ? 'Cantidad contada' : 'Cantidad'}>
                <input type="number" min="0" step="any" value={mov.cantidad} onChange={(e) => setMov((m) => ({ ...m, cantidad: e.target.value }))} className={INPUT} />
              </Field>
              <Field label="Unidad">
                <Select value={unidadMov} onChange={(v) => setMov((m) => ({ ...m, unidad: v }))} options={opcionesCompatibles(insumo.unidad)} />
              </Field>
              {mov.tipo === 'ENTRADA' ? (
                <Field label="Vence (opcional)">
                  <input type="date" value={mov.fechaVencimiento} onChange={(e) => setMov((m) => ({ ...m, fechaVencimiento: e.target.value }))} className={INPUT} />
                </Field>
              ) : (
                <Field label="Motivo">
                  <input
                    value={mov.motivo}
                    onChange={(e) => setMov((m) => ({ ...m, motivo: e.target.value }))}
                    placeholder={mov.tipo === 'MERMA' ? 'Se daño, vencio...' : 'Opcional'}
                    className={INPUT}
                  />
                </Field>
              )}
              {mov.tipo === 'ENTRADA' && esAdmin && (
                <Field label={`Costo por ${unidadMov} (opcional)`} ayuda="Si lo pones, actualiza el costo promedio.">
                  <input type="number" min="0" step="any" value={mov.costoUnitario} onChange={(e) => setMov((m) => ({ ...m, costoUnitario: e.target.value }))} className={INPUT} />
                </Field>
              )}
              {mov.tipo === 'ENTRADA' && (
                <Field label="Motivo" className={esAdmin ? 'sm:col-span-2' : 'sm:col-span-3'}>
                  <input value={mov.motivo} onChange={(e) => setMov((m) => ({ ...m, motivo: e.target.value }))} placeholder="Opcional" className={INPUT} />
                </Field>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              {mov.tipo === 'AJUSTE'
                ? 'Escribe lo que hay de verdad en el almacen: la diferencia queda registrada como ajuste.'
                : mov.tipo === 'MERMA'
                  ? 'La merma sale del inventario y aparece en el reporte de mermas.'
                  : 'Para compras con factura usa Compras: actualiza el costo y queda como gasto.'}
            </p>
            <Button className="mt-3" size="sm" disabled={!mov.cantidad || registrar.isPending} onClick={() => registrar.mutate()}>
              {registrar.isPending && <Loader2 size={14} className="animate-spin" />} Registrar
            </Button>
          </Card>

          <div>
            <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">Lotes con existencia</h3>
            {insumo.lotes.length === 0 ? (
              <p className="text-sm text-muted">No hay lotes con existencia.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {insumo.lotes.map((l) => {
                  const vence = l.fechaVencimiento ? new Date(l.fechaVencimiento) : null;
                  const vencido = vence && vence < new Date();
                  return (
                    <div key={l.id} className="neu-inset px-3 py-2 text-xs">
                      <p className="font-semibold text-ink">
                        {formatCantidad(l.cantidadRestante)} {insumo.unidad}
                        <span className="font-normal text-muted"> de {formatCantidad(l.cantidadInicial)}</span>
                      </p>
                      <p className={vencido ? 'font-semibold text-brick-600' : 'text-muted'}>
                        <CalendarClock size={11} className="mr-1 inline" />
                        {vence ? `${vencido ? 'Vencio' : 'Vence'} ${formatDate(vence)}` : 'Sin vencimiento'}
                      </p>
                      <p className="text-muted">Entro {formatDate(l.fechaEntrada)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {insumo.usadoEnRecetas.length > 0 && (
            <p className="text-xs text-muted">
              Se usa en: {insumo.usadoEnRecetas.map((r) => r.nombre).join(', ')}
            </p>
          )}

          <div>
            <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">Historial</h3>
            <TablaMovimientos movimientos={insumo.movimientos} unidad={insumo.unidad} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function TablaMovimientos({ movimientos, unidad, conInsumo }: { movimientos: MovimientoInsumo[]; unidad?: string; conInsumo?: boolean }) {
  if (movimientos.length === 0) return <p className="text-sm text-muted">Sin movimientos.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-3">Fecha</th>
            {conInsumo && <th className="py-2 pr-3">Insumo</th>}
            <th className="py-2 pr-3">Tipo</th>
            <th className="py-2 pr-3 text-right">Cantidad</th>
            <th className="py-2 pr-3 text-right">Queda</th>
            <th className="py-2 pr-3">Motivo</th>
            <th className="py-2">Usuario</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-porcelain-200">
          {movimientos.map((m) => {
            const u = unidad ?? m.insumo?.unidad ?? '';
            return (
              <tr key={m.id}>
                <td className="py-2 pr-3 text-xs text-muted">{formatDateTime(m.fecha)}</td>
                {conInsumo && <td className="py-2 pr-3 font-medium text-ink">{m.insumo?.nombre}</td>}
                <td className="py-2 pr-3">
                  <Badge tone={TONO_MOVIMIENTO[m.tipo]}>{TIPO_MOVIMIENTO_LABEL[m.tipo]}</Badge>
                </td>
                <td className={`py-2 pr-3 text-right tabular-nums ${m.cantidad < 0 ? 'text-brick-600' : 'text-sage-600'}`}>
                  {m.cantidad > 0 ? '+' : ''}
                  {formatCantidad(m.cantidad)} {u}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted">
                  {formatCantidad(m.stockResultante)} {u}
                </td>
                <td className="py-2 pr-3 text-xs text-muted">{m.motivo ?? ''}</td>
                <td className="py-2 text-xs text-muted">{m.user?.nombre ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Historial({ esAdmin }: { esAdmin: boolean }) {
  const [tipo, setTipo] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: movimientos = [], isLoading } = useQuery<MovimientoInsumo[]>({
    queryKey: ['movimientos', tipo, from, to],
    queryFn: () => insumosApi.movimientos({ tipo: tipo || undefined, from: from || undefined, to: to || undefined }),
  });
  const costoMermas = movimientos
    .filter((m) => m.tipo === 'MERMA')
    .reduce((s, m) => s + Math.abs(m.cantidad) * (m.costoUnitario ?? 0), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Tipo" className="w-48">
          <Select
            value={tipo}
            onChange={setTipo}
            options={[{ value: '', label: 'Todos' }, ...Object.entries(TIPO_MOVIMIENTO_LABEL).map(([value, label]) => ({ value, label }))]}
          />
        </Field>
        <Field label="Desde">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Hasta">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={INPUT} />
        </Field>
        {esAdmin && tipo === 'MERMA' && (
          <Badge tone="brick">Costo de las mermas: {formatMoney(costoMermas)}</Badge>
        )}
      </div>
      {isLoading ? (
        <Skeleton />
      ) : (
        <Card className="p-4">
          <TablaMovimientos movimientos={movimientos} conInsumo />
        </Card>
      )}
    </div>
  );
}

function ListaDeCompras({ esAdmin }: { esAdmin: boolean }) {
  const [dias, setDias] = useState('3');
  const { data, isLoading } = useQuery<ListaCompras>({
    queryKey: ['lista-compras', dias],
    queryFn: () => produccionApi.listaCompras(Number(dias) || 0),
  });

  return (
    <div>
      <Card className="mb-4 p-4 text-sm text-muted">
        <p className="flex items-center gap-2 font-semibold text-ink">
          <ShoppingBasket size={16} /> Que comprar
        </p>
        <p className="mt-1">
          Calcula lo que falta producir para los encargos que se entregan en los proximos dias (descontando lo que ya
          hay hecho), lo abre en sus insumos con las recetas y le suma lo necesario para volver al stock minimo.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span>Encargos de los proximos</span>
          <input type="number" min="0" max="60" value={dias} onChange={(e) => setDias(e.target.value)} className="w-20 rounded-lg px-3 py-1.5 text-sm" />
          <span>dias (hasta {data ? formatDate(`${data.hasta}T12:00:00`) : fechaLocal()})</span>
        </div>
      </Card>

      {isLoading || !data ? (
        <Skeleton />
      ) : (
        <>
          {data.productosSinReceta.length > 0 && (
            <div className="mb-4 rounded-lg bg-copper-50 p-3 text-xs text-copper-700 shadow-neu-inset">
              Sin receta (no se pueden calcular sus insumos): {data.productosSinReceta.join(', ')}.
            </div>
          )}
          {data.insumos.length === 0 ? (
            <EmptyState title="No hace falta comprar nada" description={`${data.encargosConsiderados} encargo(s) considerado(s).`} />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3">Insumo</th>
                    <th className="px-4 py-3 text-right">Para encargos</th>
                    <th className="px-4 py-3 text-right">Hay</th>
                    <th className="px-4 py-3 text-right">Comprar</th>
                    {esAdmin && <th className="px-4 py-3 text-right">Costo estimado</th>}
                    <th className="px-4 py-3">Proveedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-porcelain-200">
                  {data.insumos.map((i) => (
                    <tr key={i.insumoId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{i.nombre}</p>
                        {i.motivo && (
                          <Badge tone={i.motivo === 'ENCARGOS' ? 'brick' : 'copper'}>
                            {i.motivo === 'ENCARGOS' ? 'Falta para encargos' : 'Bajo el minimo'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatCantidad(i.necesarioEncargos)} {i.unidad}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">
                        {formatCantidad(i.disponible)} {i.unidad}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                        {formatCantidad(i.aComprar)} {i.unidad}
                      </td>
                      {esAdmin && <td className="px-4 py-3 text-right tabular-nums">{formatMoney(i.costoEstimado ?? 0)}</td>}
                      <td className="px-4 py-3 text-xs text-muted">
                        {i.proveedor ? `${i.proveedor.nombre}${i.proveedor.telefono ? ` · ${i.proveedor.telefono}` : ''}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {esAdmin && (
                  <tfoot>
                    <tr className="text-sm font-semibold text-ink">
                      <td className="px-4 py-3" colSpan={4}>
                        Total estimado
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.costoEstimadoTotal ?? 0)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
