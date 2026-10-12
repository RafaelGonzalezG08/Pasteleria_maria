import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookOpen, ChefHat, Clock, Factory, Layers, Loader2, Pencil, Plus, Scale, Search, Trash2, X } from 'lucide-react';
import { insumosApi, recetasApi, type IngredientePayload, type RecetaPayload } from '../../api/inventario.api';
import { productsApi } from '../../api/products.api';
import { formatCantidad, formatMoney } from '../../lib/format';
import { OPCIONES_UNIDAD, UNIDADES, convertir, opcionesCompatibles } from '../../lib/unidades';
import { coincideBusqueda } from '../../lib/search';
import { useAuthStore } from '../../store/auth.store';
import { Badge, Button, Card, EmptyState, Field, INPUT, Modal, PageHeader, Select, Skeleton, Stat, Tabs } from '../../components/ui';
import type { Insumo, Product, RecetaDetalle, RecetaEscalada, RecetaResumen } from '../../types';

type Pestana = 'FINALES' | 'SUBRECETAS';

export default function Recetas() {
  const esAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const [pestana, setPestana] = useState<Pestana>('FINALES');
  const [search, setSearch] = useState('');
  const [creando, setCreando] = useState(false);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);

  const { data: recetas = [], isLoading } = useQuery<RecetaResumen[]>({
    queryKey: ['recetas'],
    queryFn: () => recetasApi.list(),
  });

  const visibles = useMemo(
    () =>
      recetas
        .filter((r) => (pestana === 'SUBRECETAS' ? r.esSubreceta : !r.esSubreceta))
        .filter((r) => coincideBusqueda(r.nombre, search)),
    [recetas, pestana, search],
  );

  return (
    <div>
      <PageHeader
        title="Recetas"
        subtitle="Ingredientes, rendimiento, pasos y costo al precio actual de los insumos"
        action={
          <Button size="sm" onClick={() => setCreando(true)}>
            <Plus size={16} /> Nueva receta
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={pestana}
          onChange={setPestana}
          opciones={[
            { valor: 'FINALES', texto: 'Recetas' },
            { valor: 'SUBRECETAS', texto: 'Subrecetas (rellenos, cremas, masas)' },
          ]}
        />
        <div className="buscador ml-auto max-w-sm flex-1 !py-2">
          <Search size={16} className="shrink-0 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar receta..." />
        </div>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : visibles.length === 0 ? (
        <EmptyState
          title={pestana === 'SUBRECETAS' ? 'Sin subrecetas' : 'Sin recetas'}
          description={
            pestana === 'SUBRECETAS'
              ? 'Una subreceta (relleno, crema, masa) se prepara aparte y se usa dentro de otras recetas.'
              : 'Crea la receta de cada producto: con ella se calcula su costo y se registra la produccion.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((r) => (
            <Card key={r.id} className="cursor-pointer p-4 transition-shadow hover:shadow-neu-sm" onClick={() => setAbiertaId(r.id)}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-display font-semibold text-ink">{r.nombre}</p>
                {!r.activo && <Badge>Inactiva</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">
                Rinde {formatCantidad(r.rendimiento)} {r.unidadRendimiento}
                {r.porciones ? ` · ${r.porciones} porciones` : ''}
                {r.tiempoPreparacionMin ? ` · ${r.tiempoPreparacionMin} min` : ''}
              </p>
              <p className="mt-1 text-xs text-muted">
                {r.totalIngredientes} ingrediente(s)
                {r.usadaEnRecetas > 0 ? ` · usada en ${r.usadaEnRecetas} receta(s)` : ''}
              </p>
              {r.producto && (
                <p className="mt-2">
                  <Badge tone="rose">Produce: {r.producto.nombre}</Badge>
                </p>
              )}
              {esAdmin && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-porcelain-200 pt-3 text-xs">
                  {r.errorCosto ? (
                    <p className="col-span-2 text-brick-600">{r.errorCosto}</p>
                  ) : (
                    <>
                      <div>
                        <p className="text-muted">Costo total</p>
                        <p className="font-semibold tabular-nums text-ink">{formatMoney(r.costoTotal ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-muted">{r.porciones ? 'Costo por porcion' : `Costo por ${r.unidadRendimiento}`}</p>
                        <p className="font-semibold tabular-nums text-ink">
                          {formatMoney((r.porciones ? r.costoPorPorcion : r.costoPorUnidad) ?? 0)}
                        </p>
                      </div>
                      {!r.esSubreceta && (
                        <div className="col-span-2">
                          <p className="text-muted">Precio sugerido por {r.unidadRendimiento}</p>
                          <p className="font-semibold tabular-nums text-copper-600">{formatMoney(r.precioSugeridoUnidad ?? 0)}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {creando && <RecetaForm esSubreceta={pestana === 'SUBRECETAS'} esAdmin={esAdmin} onClose={() => setCreando(false)} />}
      {abiertaId && <RecetaDetalleModal id={abiertaId} esAdmin={esAdmin} onClose={() => setAbiertaId(null)} />}
    </div>
  );
}

interface LineaForm {
  key: string;
  ref: string; // "i:<insumoId>" | "s:<subrecetaId>"
  cantidad: string;
  unidad: string;
}

function RecetaForm({
  receta,
  esSubreceta,
  esAdmin,
  onClose,
}: {
  receta?: RecetaDetalle;
  esSubreceta: boolean;
  esAdmin: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: insumos = [] } = useQuery<Insumo[]>({ queryKey: ['insumos'], queryFn: () => insumosApi.list() });
  const { data: recetas = [] } = useQuery<RecetaResumen[]>({ queryKey: ['recetas'], queryFn: () => recetasApi.list() });
  const { data: productos = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list() });

  const [form, setForm] = useState({
    nombre: receta?.nombre ?? '',
    esSubreceta: receta?.esSubreceta ?? esSubreceta,
    rendimiento: receta ? String(receta.rendimiento) : '1',
    unidadRendimiento: receta?.unidadRendimiento ?? (esSubreceta ? 'g' : 'unidad'),
    porciones: receta?.porciones ? String(receta.porciones) : '',
    tiempoPreparacionMin: receta?.tiempoPreparacionMin ? String(receta.tiempoPreparacionMin) : '',
    pasos: receta?.pasos ?? '',
    margenPct: receta?.margenPct != null ? String(receta.margenPct) : '',
    productoId: receta?.productoId ?? '',
  });
  const [lineas, setLineas] = useState<LineaForm[]>(
    receta?.ingredientes.map((l) => ({
      key: l.id,
      ref: l.insumoId ? `i:${l.insumoId}` : `s:${l.subrecetaId}`,
      cantidad: String(l.cantidad),
      unidad: l.unidad,
    })) ?? [{ key: 'nueva-0', ref: '', cantidad: '', unidad: 'g' }],
  );

  // Una subreceta no puede usarse a si misma; el backend ademas detecta ciclos mas largos.
  const subrecetas = recetas.filter((r) => r.esSubreceta && r.id !== receta?.id);
  const opcionesIngrediente = [
    { value: '', label: 'Elegir...' },
    ...insumos.map((i) => ({ value: `i:${i.id}`, label: `${i.nombre} (${i.unidad})` })),
    ...subrecetas.map((r) => ({ value: `s:${r.id}`, label: `▸ ${r.nombre} (subreceta, ${r.unidadRendimiento})` })),
  ];

  function unidadBase(ref: string): string | undefined {
    if (ref.startsWith('i:')) return insumos.find((i) => i.id === ref.slice(2))?.unidad;
    if (ref.startsWith('s:')) return recetas.find((r) => r.id === ref.slice(2))?.unidadRendimiento;
    return undefined;
  }

  function cambiarLinea(key: string, cambios: Partial<LineaForm>) {
    setLineas((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const nueva = { ...l, ...cambios };
        // Al elegir otro ingrediente se toma su unidad, para no dejar una de otra familia.
        if (cambios.ref !== undefined) nueva.unidad = unidadBase(cambios.ref) ?? nueva.unidad;
        return nueva;
      }),
    );
  }

  function mover(index: number, delta: number) {
    setLineas((ls) => {
      const copia = [...ls];
      const destino = index + delta;
      if (destino < 0 || destino >= copia.length) return ls;
      [copia[index], copia[destino]] = [copia[destino], copia[index]];
      return copia;
    });
  }

  const productosLibres = productos.filter((p) => !p.receta || p.receta.id === receta?.id);
  const cuentaRendimiento = UNIDADES[form.unidadRendimiento]?.familia === 'CONTEO';
  // Lo que de verdad suma a la existencia cada tanda: "1 docena" son 12
  // productos, no un producto. Se dice con todas las letras porque es facil
  // confundir "12 bizcochitos" con "un bizcocho de 12 porciones".
  const productoElegido = productos.find((p) => p.id === form.productoId);
  const unidadesTanda = cuentaRendimiento
    ? Math.floor((convertir(Number(form.rendimiento) || 0, form.unidadRendimiento, 'unidad') ?? 0) + 1e-6)
    : 0;

  const guardar = useMutation({
    mutationFn: () => {
      const ingredientes: IngredientePayload[] = lineas
        .filter((l) => l.ref && Number(l.cantidad) > 0)
        .map((l) => ({
          ...(l.ref.startsWith('i:') ? { insumoId: l.ref.slice(2) } : { subrecetaId: l.ref.slice(2) }),
          cantidad: Number(l.cantidad),
          unidad: l.unidad,
        }));
      const payload: RecetaPayload = {
        nombre: form.nombre,
        esSubreceta: form.esSubreceta,
        rendimiento: Number(form.rendimiento),
        unidadRendimiento: form.unidadRendimiento,
        porciones: form.porciones ? Number(form.porciones) : null,
        tiempoPreparacionMin: form.tiempoPreparacionMin ? Number(form.tiempoPreparacionMin) : null,
        pasos: form.pasos,
        productoId: form.esSubreceta || !cuentaRendimiento ? null : form.productoId || null,
        ingredientes,
        // Solo ADMIN ve y toca el margen; para los demas se omite (no se borra).
        ...(esAdmin ? { margenPct: form.margenPct === '' ? null : Number(form.margenPct) } : {}),
      };
      return receta ? recetasApi.update(receta.id, payload) : recetasApi.create(payload);
    },
    onSuccess: () => {
      toast.success(receta ? 'Receta actualizada.' : 'Receta creada.');
      queryClient.invalidateQueries({ queryKey: ['recetas'] });
      queryClient.invalidateQueries({ queryKey: ['receta'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (form.nombre.trim().length < 2 || !(Number(form.rendimiento) > 0)) {
      toast.error('Escribe el nombre y un rendimiento mayor a cero.');
      return;
    }
    if (!lineas.some((l) => l.ref && Number(l.cantidad) > 0)) {
      toast.error('Agrega al menos un ingrediente con su cantidad.');
      return;
    }
    guardar.mutate();
  }

  const set = (campo: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <Modal titulo={receta ? 'Editar receta' : form.esSubreceta ? 'Nueva subreceta' : 'Nueva receta'} onClose={onClose} ancho="max-w-3xl">
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Nombre">
            <input value={form.nombre} onChange={set('nombre')} placeholder={form.esSubreceta ? 'Crema de mantequilla' : 'Pastel de chocolate 10"'} className={INPUT} autoFocus />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.esSubreceta}
              onChange={(e) => setForm((f) => ({ ...f, esSubreceta: e.target.checked }))}
              className="h-4 w-4 accent-copper-500"
            />
            Es subreceta
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Rinde">
            <input type="number" min="0" step="any" value={form.rendimiento} onChange={set('rendimiento')} className={INPUT} />
          </Field>
          <Field label="Unidad">
            <Select value={form.unidadRendimiento} onChange={(v) => setForm((f) => ({ ...f, unidadRendimiento: v }))} options={OPCIONES_UNIDAD} />
          </Field>
          <Field label="Porciones">
            <input type="number" min="1" step="1" value={form.porciones} onChange={set('porciones')} placeholder="Opcional" className={INPUT} />
          </Field>
          <Field label="Tiempo (min)">
            <input type="number" min="0" step="1" value={form.tiempoPreparacionMin} onChange={set('tiempoPreparacionMin')} className={INPUT} />
          </Field>
        </div>

        {!form.esSubreceta && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Producto que produce"
              ayuda={
                !cuentaRendimiento
                  ? 'Para producir un producto, el rendimiento debe contarse (unidad, docena o porcion).'
                  : productoElegido
                    ? `Cada tanda suma ${unidadesTanda} "${productoElegido.nombre}" a la existencia (cada uno se vende por separado). Si es un pastel entero, pon Rinde 1 unidad y usa Porciones para los pedazos.`
                    : 'Al registrar la produccion, cada unidad que rinde suma una a la existencia del producto.'
              }
            >
              <Select
                value={cuentaRendimiento ? form.productoId : ''}
                onChange={(v) => setForm((f) => ({ ...f, productoId: v }))}
                options={[{ value: '', label: 'Ninguno' }, ...productosLibres.map((p) => ({ value: p.id, label: p.nombre }))]}
              />
            </Field>
            {esAdmin && (
              <Field label="Ganancia sobre el costo (%)" ayuda="Vacio = la del negocio (Configuracion).">
                <input type="number" min="0" step="any" value={form.margenPct} onChange={set('margenPct')} className={INPUT} />
              </Field>
            )}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Ingredientes</p>
          <div className="space-y-2">
            {lineas.map((l, index) => {
              const base = unidadBase(l.ref);
              return (
                <div key={l.key} className="grid grid-cols-[1fr_90px_130px_auto] items-center gap-2">
                  <Select value={l.ref} onChange={(v) => cambiarLinea(l.key, { ref: v })} options={opcionesIngrediente} size="sm" />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.cantidad}
                    onChange={(e) => cambiarLinea(l.key, { cantidad: e.target.value })}
                    placeholder="Cant."
                    className="w-full rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <Select
                    value={l.unidad}
                    onChange={(v) => cambiarLinea(l.key, { unidad: v })}
                    options={base ? opcionesCompatibles(base) : OPCIONES_UNIDAD}
                    size="sm"
                  />
                  <div className="flex">
                    <button type="button" onClick={() => mover(index, -1)} className="rounded p-1 text-muted hover:text-ink" title="Subir">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => mover(index, 1)} className="rounded p-1 text-muted hover:text-ink" title="Bajar">
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                      className="rounded p-1 text-muted hover:text-brick-600"
                      title="Quitar"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setLineas((ls) => [...ls, { key: `nueva-${Date.now()}`, ref: '', cantidad: '', unidad: 'g' }])}
          >
            <Plus size={14} /> Agregar ingrediente
          </Button>
        </div>

        <Field label="Pasos de preparacion" ayuda="Un paso por linea.">
          <textarea value={form.pasos} onChange={set('pasos')} rows={5} className={INPUT} />
        </Field>

        <Button type="submit" className="w-full" disabled={guardar.isPending}>
          {guardar.isPending && <Loader2 size={16} className="animate-spin" />}
          {receta ? 'Guardar cambios' : 'Crear receta'}
        </Button>
      </form>
    </Modal>
  );
}

function RecetaDetalleModal({ id, esAdmin, onClose }: { id: string; esAdmin: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);
  const [factor, setFactor] = useState('1');
  const { data: receta, isLoading } = useQuery<RecetaDetalle>({ queryKey: ['receta', id], queryFn: () => recetasApi.get(id) });
  const factorNum = Number(factor) > 0 ? Number(factor) : 1;
  const { data: escalada } = useQuery<RecetaEscalada>({
    queryKey: ['receta', id, 'escalar', factorNum],
    queryFn: () => recetasApi.escalar(id, factorNum),
    enabled: Boolean(receta),
  });

  const eliminar = useMutation({
    mutationFn: () => recetasApi.delete(id),
    onSuccess: (r) => {
      toast.success(r.eliminado ? 'Receta eliminada.' : 'La receta ya tiene producciones: quedo desactivada.');
      queryClient.invalidateQueries({ queryKey: ['recetas'] });
      onClose();
    },
  });

  if (editando && receta) {
    return <RecetaForm receta={receta} esSubreceta={receta.esSubreceta} esAdmin={esAdmin} onClose={() => setEditando(false)} />;
  }

  const faltantes = escalada?.insumos.filter((i) => i.faltante > 0) ?? [];

  return (
    <Modal
      titulo={
        <span className="flex items-center gap-2">
          {receta?.esSubreceta ? <Layers size={18} /> : <ChefHat size={18} />} {receta?.nombre ?? 'Receta'}
        </span>
      }
      onClose={onClose}
      ancho="max-w-3xl"
    >
      {isLoading || !receta ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="copper">
              Rinde {formatCantidad(receta.rendimiento)} {receta.unidadRendimiento}
            </Badge>
            {receta.porciones && <Badge>{receta.porciones} porciones</Badge>}
            {receta.tiempoPreparacionMin && (
              <Badge>
                <Clock size={11} className="mr-1" /> {receta.tiempoPreparacionMin} min
              </Badge>
            )}
            {receta.producto && (
              <Badge tone="rose">
                Cada tanda: +{receta.unidadesPorTanda ?? 0} {receta.producto.nombre}
              </Badge>
            )}
            <div className="ml-auto flex gap-2">
              {!receta.esSubreceta && receta.activo && (
                <Button size="sm" onClick={() => navigate(`/produccion?receta=${receta.id}`)}>
                  <Factory size={14} /> Producir
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
                <Pencil size={14} /> Editar
              </Button>
              {esAdmin && (
                <Button size="sm" variant="ghost" onClick={() => eliminar.mutate()} disabled={eliminar.isPending}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>

          {esAdmin && receta.costeo && (
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Costo de la receta" value={formatMoney(receta.costeo.costoTotal)} />
              <Stat label={`Costo por ${receta.unidadRendimiento}`} value={formatMoney(receta.costeo.costoPorUnidad)} />
              <Stat label="Costo por porcion" value={formatMoney(receta.costeo.costoPorPorcion)} />
              <Stat
                label={`Precio sugerido (+${formatCantidad(receta.costeo.margenPct)}%)`}
                value={formatMoney(receta.porciones ? receta.costeo.precioSugeridoPorcion : receta.costeo.precioSugeridoUnidad)}
                hint={receta.porciones ? 'por porcion' : `por ${receta.unidadRendimiento}`}
                tone="copper"
              />
            </div>
          )}
          {esAdmin && receta.costeo && receta.porciones && (
            <p className="-mt-2 text-xs text-muted">
              Precio sugerido por {receta.unidadRendimiento}: {formatMoney(receta.costeo.precioSugeridoUnidad)}
              {receta.producto ? ` · precio actual del producto: ${formatMoney(receta.producto.precioUnitario)}` : ''}
            </p>
          )}

          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
                <Scale size={15} /> Ingredientes
              </h3>
              <div className="ml-auto flex items-center gap-2 text-sm text-muted">
                Escalar ×
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  className="w-20 rounded-lg px-2 py-1 text-sm"
                />
                {escalada && (
                  <span>
                    = {formatCantidad(escalada.rendimiento)} {escalada.unidadRendimiento}
                  </span>
                )}
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-porcelain-200">
                {(escalada?.lineas ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-ink">
                      {l.tipo === 'SUBRECETA' && <Layers size={12} className="mr-1 inline text-copper-600" />}
                      {l.nombre}
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">
                      {formatCantidad(l.cantidad)} {l.unidad}
                    </td>
                    {esAdmin && <td className="w-28 py-2 text-right tabular-nums text-muted">{formatMoney(l.costo ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
              {esAdmin && escalada?.costoTotal !== undefined && (
                <tfoot>
                  <tr className="font-semibold text-ink">
                    <td className="pt-2" colSpan={2}>
                      Costo de {formatCantidad(factorNum)} tanda(s)
                    </td>
                    <td className="pt-2 text-right tabular-nums">{formatMoney(escalada.costoTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            {faltantes.length > 0 ? (
              <div className="mt-3 rounded-lg bg-brick-100 p-3 text-xs text-brick-700 shadow-neu-inset">
                Para {formatCantidad(factorNum)} tanda(s) falta inventario:{' '}
                {faltantes.map((f) => `${f.nombre} (${formatCantidad(f.faltante)} ${f.unidad})`).join(', ')}.
              </div>
            ) : (
              escalada && <p className="mt-3 text-xs text-sage-600">Hay inventario suficiente para {formatCantidad(factorNum)} tanda(s).</p>
            )}
          </Card>

          {receta.pasos && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
                <BookOpen size={15} /> Preparacion
              </h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
                {receta.pasos
                  .split('\n')
                  .filter((p) => p.trim())
                  .map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
              </ol>
            </div>
          )}

          {receta.usadaEn.length > 0 && (
            <p className="text-xs text-muted">Se usa dentro de: {receta.usadaEn.map((r) => r.nombre).join(', ')}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
