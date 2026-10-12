import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CakeSlice, Download, ImageOff, Loader2, Pencil, Plus, RotateCcw, Search, Tag, Trash2, X } from 'lucide-react';
import { categoriesApi, productsApi, type ProductFormValues } from '../../api/products.api';
import { urlArchivo } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { coincideBusqueda } from '../../lib/search';
import { usePersistedState } from '../../lib/usePersistedState';
import { useAuthStore } from '../../store/auth.store';
import { Badge, Button, Card, EmptyState, Field, INPUT, Modal, PageHeader, Select, Skeleton, Tabs } from '../../components/ui';
import type { Category, Product } from '../../types';

type Pestana = 'ACTIVOS' | 'BAJA';

const FORM_VACIO: ProductFormValues = {
  nombre: '',
  precioUnitario: '',
  costoUnitario: '',
  stock: '0',
  categoriaId: '',
  descripcion: '',
  porcionDeId: '',
  porcionesPorUnidad: '',
  file: null,
};

function margenPct(product: Product): number | null {
  const precio = Number(product.precioUnitario);
  if (product.costoUnitario === undefined || precio <= 0) return null;
  return ((precio - Number(product.costoUnitario)) / precio) * 100;
}

/**
 * Productos terminados de la pasteleria (pasteles, panes, bizcochos,
 * postres): lo que se vende en caja y se encarga. La existencia sube al
 * registrar una produccion y baja al vender, entregar un encargo o dar de
 * baja una merma.
 */
export default function Products() {
  const queryClient = useQueryClient();
  const esAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const [pestana, setPestana] = useState<Pestana>('ACTIVOS');
  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Product | null>(null);
  const [mermaDe, setMermaDe] = useState<Product | null>(null);
  const [cortarDe, setCortarDe] = useState<Product | null>(null);
  const [verCategorias, setVerCategorias] = useState(false);

  const { data: productos = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', 'todos'],
    queryFn: () => productsApi.list(true),
  });
  const { data: categorias = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
  });

  const visibles = useMemo(
    () =>
      productos
        .filter((p) => (pestana === 'ACTIVOS' ? p.activo : !p.activo))
        .filter((p) => !filtroCategoria || p.categoriaId === filtroCategoria)
        .filter((p) => coincideBusqueda(`${p.nombre} ${p.sku}`, search)),
    [productos, pestana, filtroCategoria, search],
  );

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['recetas'] });
  }

  const guardar = useMutation({
    mutationFn: ({ values, producto }: { values: ProductFormValues; producto: Product | null }) => {
      // Con receta, el costo lo calcula la receta: no se manda el del formulario.
      const incluirCosto = esAdmin && !producto?.receta;
      return producto
        ? productsApi.update(producto.id, values, incluirCosto)
        : productsApi.create(values, incluirCosto);
    },
    onSuccess: (_d, { producto }) => {
      toast.success(producto ? 'Producto actualizado.' : 'Producto creado.');
      setCreando(false);
      setEditando(null);
      refrescar();
    },
  });

  const darDeBaja = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => {
      toast.success('Producto dado de baja. Ya no aparece en caja.');
      setEditando(null);
      refrescar();
    },
  });

  const reactivar = useMutation({
    mutationFn: (id: string) => productsApi.restore(id),
    onSuccess: () => {
      toast.success('Producto reactivado.');
      setEditando(null);
      refrescar();
    },
  });

  async function exportar() {
    const blob = await productsApi.exportXlsx();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'productos.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle="Pasteles, panes, bizcochos y postres listos para vender"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {esAdmin && (
              <Button size="sm" onClick={() => setCreando(true)}>
                <Plus size={16} /> Nuevo producto
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setVerCategorias(true)} title="Categorias">
              <Tag size={16} />
            </Button>
            <Button size="sm" variant="secondary" onClick={exportar} title="Exportar a Excel">
              <Download size={16} />
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={pestana}
          onChange={setPestana}
          opciones={[
            { valor: 'ACTIVOS', texto: 'Activos' },
            { valor: 'BAJA', texto: 'Dados de baja' },
          ]}
        />
        <div className="buscador ml-auto max-w-sm flex-1 !py-2">
          <Search size={16} className="shrink-0 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o codigo..." />
        </div>
        {categorias.length > 0 && (
          <Select
            value={filtroCategoria}
            onChange={setFiltroCategoria}
            className="w-52"
            options={[{ value: '', label: 'Todas las categorias' }, ...categorias.map((c) => ({ value: c.id, label: c.nombre }))]}
          />
        )}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : visibles.length === 0 ? (
        <EmptyState
          title={pestana === 'ACTIVOS' ? 'Sin productos' : 'Sin productos dados de baja'}
          description={
            pestana === 'ACTIVOS'
              ? 'Crea tus pasteles, panes y postres para venderlos en caja y en encargos.'
              : 'Los productos que des de baja aparecen aqui y se pueden reactivar.'
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibles.map((p) => {
            const foto = urlArchivo(p.imageUrl);
            const margen = margenPct(p);
            return (
              <Card key={p.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => (esAdmin ? setEditando(p) : undefined)}
                  className="group relative flex h-36 w-full items-center justify-center bg-porcelain-200"
                  title={esAdmin ? 'Editar producto' : p.nombre}
                >
                  {foto ? (
                    <img src={foto} alt={p.nombre} className="h-full w-full object-cover" />
                  ) : (
                    <CakeSlice size={28} className="text-muted" />
                  )}
                  {esAdmin && (
                    <span className="absolute inset-0 flex items-center justify-center bg-espresso-950/0 opacity-0 transition-opacity group-hover:bg-espresso-950/40 group-hover:opacity-100">
                      <Pencil size={20} className="text-white" />
                    </span>
                  )}
                </button>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="select-text font-mono text-[11px] font-semibold text-copper-600">{p.sku}</p>
                    <span className={`shrink-0 text-[11px] ${p.stock <= 0 ? 'font-semibold text-brick-600' : 'text-muted'}`}>
                      Existencia: {p.stock}
                    </span>
                  </div>
                  <p className="select-text truncate text-sm font-medium text-ink">{p.nombre}</p>
                  {p.categoria && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                      <Tag size={10} /> {p.categoria.nombre}
                    </p>
                  )}
                  <p className="mt-1.5 font-display font-bold tabular-nums text-ink">{formatMoney(p.precioUnitario)}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {p.receta && <Badge tone="rose">Con receta</Badge>}
                    {p.porcionDe && (
                      <Badge tone="copper">
                        Porcion de {p.porcionDe.nombre} (1/{p.porcionesPorUnidad})
                      </Badge>
                    )}
                    {(p.porciones ?? []).length > 0 && <Badge tone="copper">Tambien por porcion</Badge>}
                    {margen !== null && (
                      <Badge tone={margen < 20 ? 'brick' : margen < 40 ? 'copper' : 'sage'}>
                        Margen {margen.toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {p.activo && p.porcionDe && (
                      <button
                        onClick={() => setCortarDe(p)}
                        className="text-[11px] font-semibold text-copper-600 hover:text-copper-700"
                      >
                        Cortar en porciones
                      </button>
                    )}
                    {p.activo && p.stock > 0 && (
                      <button
                        onClick={() => setMermaDe(p)}
                        className="text-[11px] font-semibold text-muted hover:text-brick-600"
                      >
                        Registrar merma
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {(creando || editando) && (
        <ProductoModal
          producto={editando}
          productos={productos}
          categorias={categorias}
          esAdmin={esAdmin}
          pendiente={guardar.isPending}
          onClose={() => {
            setCreando(false);
            setEditando(null);
          }}
          onSubmit={(values) => guardar.mutate({ values, producto: editando })}
          onBaja={editando ? () => darDeBaja.mutate(editando.id) : undefined}
          onReactivar={editando ? () => reactivar.mutate(editando.id) : undefined}
          bajaPendiente={darDeBaja.isPending || reactivar.isPending}
        />
      )}

      {mermaDe && <MermaModal producto={mermaDe} onClose={() => setMermaDe(null)} onDone={refrescar} />}
      {cortarDe && <CortarModal porcion={cortarDe} onClose={() => setCortarDe(null)} onDone={refrescar} />}
      {verCategorias && <CategoriasModal categorias={categorias} esAdmin={esAdmin} onClose={() => setVerCategorias(false)} />}
    </div>
  );
}

function ProductoModal({
  producto,
  productos,
  categorias,
  esAdmin,
  pendiente,
  onClose,
  onSubmit,
  onBaja,
  onReactivar,
  bajaPendiente,
}: {
  producto: Product | null;
  productos: Product[];
  categorias: Category[];
  esAdmin: boolean;
  pendiente: boolean;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => void;
  onBaja?: () => void;
  onReactivar?: () => void;
  bajaPendiente: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = usePersistedState<ProductFormValues>(
    producto ? `productos:editar:${producto.id}` : 'productos:nuevo',
    producto
      ? {
          nombre: producto.nombre,
          precioUnitario: String(producto.precioUnitario),
          costoUnitario: String(producto.costoUnitario ?? ''),
          stock: String(producto.stock),
          categoriaId: producto.categoriaId ?? '',
          descripcion: producto.descripcion ?? '',
          porcionDeId: producto.porcionDeId ?? '',
          porcionesPorUnidad: producto.porcionesPorUnidad ? String(producto.porcionesPorUnidad) : '',
          file: null,
        }
      : FORM_VACIO,
  );
  // Puede ser porcion de cualquier producto entero activo que no sea el mismo
  // ni sea a su vez una porcion.
  const enteros = productos.filter((p) => p.activo && p.id !== producto?.id && !p.porcionDeId);

  // Crear lo que falta sin salir del formulario: la categoria o el producto
  // entero del que sale esta porcion. Queda elegido al crearlo.
  const crearCategoria = useMutation({
    mutationFn: (nombre: string) => categoriesApi.create(nombre),
    onSuccess: (categoria) => {
      toast.success(`Categoria "${categoria.nombre}" creada.`);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setForm((f) => ({ ...f, categoriaId: categoria.id }));
    },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'No se pudo crear la categoria.'),
  });
  const crearEntero = useMutation({
    mutationFn: ({ nombre, precio }: { nombre: string; precio: string }) => {
      if (!(Number(precio) > 0)) throw new Error('Escribe el precio del producto entero.');
      return productsApi.create(
        {
          nombre,
          precioUnitario: precio,
          costoUnitario: '',
          stock: '0',
          categoriaId: form.categoriaId,
          descripcion: '',
          porcionDeId: '',
          porcionesPorUnidad: '',
          file: null,
        },
        false,
      );
    },
    onSuccess: (entero) => {
      toast.success(`"${entero.nombre}" creado.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setForm((f) => ({ ...f, porcionDeId: entero.id, porcionesPorUnidad: f.porcionesPorUnidad || '8' }));
    },
    onError: (error: any) => {
      if (!error?.response) toast.error(error?.message ?? 'No se pudo crear el producto.');
    },
  });
  // El archivo no se puede guardar en localStorage: vive aparte.
  const [archivo, setArchivo] = useState<File | null>(null);
  const fotoActual = urlArchivo(producto?.imageUrl);
  const vistaPrevia = archivo ? URL.createObjectURL(archivo) : fotoActual;

  const quitarFoto = useMutation({
    mutationFn: () => productsApi.quitarFoto(producto!.id),
    onSuccess: () => {
      toast.success('Foto quitada.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (form.nombre.trim().length < 2 || !(Number(form.precioUnitario) > 0)) {
      toast.error('Escribe el nombre y un precio mayor a cero.');
      return;
    }
    onSubmit({ ...form, file: archivo });
    if (!producto) setForm(FORM_VACIO);
  }

  const set = (campo: keyof ProductFormValues) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <Modal titulo={producto ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form onSubmit={enviar} className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-porcelain-200 shadow-neu-inset">
            {vistaPrevia ? <img src={vistaPrevia} alt="" className="h-full w-full object-cover" /> : <CakeSlice size={26} className="text-muted" />}
          </div>
          <div className="space-y-2 text-sm">
            <label className="neu-btn inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold">
              <Plus size={14} /> {vistaPrevia ? 'Cambiar foto' : 'Agregar foto (opcional)'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            </label>
            {producto?.imageUrl && !archivo && (
              <button type="button" onClick={() => quitarFoto.mutate()} className="flex items-center gap-1 text-xs text-muted hover:text-brick-600">
                <ImageOff size={13} /> Quitar foto
              </button>
            )}
          </div>
        </div>

        <Field label="Nombre">
          <input value={form.nombre} onChange={set('nombre')} placeholder='Pastel de chocolate 10"' className={INPUT} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio de venta">
            <input type="number" min="0" step="0.01" value={form.precioUnitario} onChange={set('precioUnitario')} className={INPUT} />
          </Field>
          <Field label="Existencia">
            <input type="number" min="0" step="1" value={form.stock} onChange={set('stock')} className={INPUT} />
          </Field>
        </div>
        {esAdmin && (
          <Field
            label="Costo por unidad"
            ayuda={
              producto?.receta
                ? `Lo calcula la receta "${producto.receta.nombre}" con el precio actual de los insumos.`
                : 'Si le creas una receta, se calcula solo.'
            }
          >
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.costoUnitario}
              onChange={set('costoUnitario')}
              disabled={Boolean(producto?.receta)}
              className={`${INPUT} disabled:opacity-60`}
            />
          </Field>
        )}
        <Field label="Categoria">
          <Select
            value={form.categoriaId}
            onChange={(v) => setForm((f) => ({ ...f, categoriaId: v }))}
            options={[{ value: '', label: 'Sin categoria' }, ...categorias.map((c) => ({ value: c.id, label: c.nombre }))]}
          />
          <CrearEnLinea
            textoBoton="Nueva categoria"
            campos={[{ clave: 'nombre', placeholder: 'Pasteles, Panes, Postres...' }]}
            pendiente={crearCategoria.isPending}
            onCrear={(v) => crearCategoria.mutateAsync(v.nombre)}
          />
        </Field>
        <Field
          label="Se vende por porcion de"
          ayuda={
            form.porcionDeId
              ? 'La existencia de esta porcion sube al usar "Cortar en porciones": baja 1 entero y suben sus porciones. El costo es el del entero dividido entre las porciones.'
              : 'Dejalo en "Se vende entero" salvo que este producto sea un pedazo de otro (ej. porcion de pastel).'
          }
        >
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <Select
              value={form.porcionDeId ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, porcionDeId: v }))}
              options={[{ value: '', label: 'Se vende entero' }, ...enteros.map((p) => ({ value: p.id, label: p.nombre }))]}
            />
            {form.porcionDeId && (
              <input
                type="number"
                min="2"
                step="1"
                value={form.porcionesPorUnidad ?? ''}
                onChange={set('porcionesPorUnidad')}
                placeholder="Porciones"
                title="Porciones por entero"
                className={INPUT}
              />
            )}
          </div>
          <CrearEnLinea
            textoBoton="Crear el producto entero"
            campos={[
              { clave: 'nombre', placeholder: 'Pastel de chocolate 10"' },
              { clave: 'precio', placeholder: 'Precio del entero', tipo: 'number', ancho: 'w-36' },
            ]}
            pendiente={crearEntero.isPending}
            onCrear={(v) => crearEntero.mutateAsync({ nombre: v.nombre, precio: v.precio })}
          />
        </Field>
        <Field label="Descripcion (opcional)">
          <textarea value={form.descripcion} onChange={set('descripcion')} rows={2} className={INPUT} />
        </Field>

        <Button type="submit" disabled={pendiente} className="w-full">
          {pendiente && <Loader2 size={16} className="animate-spin" />}
          {producto ? 'Guardar cambios' : 'Crear producto'}
        </Button>

        {producto && esAdmin && (
          producto.activo ? (
            <Button type="button" variant="ghost" className="w-full" disabled={bajaPendiente} onClick={onBaja}>
              <Trash2 size={15} /> Dar de baja
            </Button>
          ) : (
            <Button type="button" variant="secondary" className="w-full" disabled={bajaPendiente} onClick={onReactivar}>
              <RotateCcw size={15} /> Reactivar producto
            </Button>
          )
        )}
      </form>
    </Modal>
  );
}

/**
 * Boton "+ Nueva ..." debajo de una lista: abre unos campos en linea para
 * crear la opcion que falta sin salir del formulario. Enter crea (sin enviar
 * el formulario de afuera) y Escape cancela.
 */
function CrearEnLinea({
  textoBoton,
  campos,
  pendiente,
  onCrear,
}: {
  textoBoton: string;
  campos: { clave: string; placeholder: string; tipo?: string; ancho?: string }[];
  pendiente: boolean;
  onCrear: (valores: Record<string, string>) => Promise<unknown>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});

  async function crear() {
    if (!campos.every((c) => (valores[c.clave] ?? '').trim())) {
      toast.error('Completa los datos para crearlo.');
      return;
    }
    try {
      await onCrear(Object.fromEntries(campos.map((c) => [c.clave, valores[c.clave].trim()])));
      setValores({});
      setAbierto(false);
    } catch {
      // El error ya se mostro; se deja abierto para corregir.
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-copper-600 hover:text-copper-700"
      >
        <Plus size={13} /> {textoBoton}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg p-2 shadow-neu-inset">
      {campos.map((c, i) => (
        <input
          key={c.clave}
          type={c.tipo ?? 'text'}
          min={c.tipo === 'number' ? '0' : undefined}
          step={c.tipo === 'number' ? '0.01' : undefined}
          autoFocus={i === 0}
          value={valores[c.clave] ?? ''}
          onChange={(e) => setValores((v) => ({ ...v, [c.clave]: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void crear();
            }
            if (e.key === 'Escape') setAbierto(false);
          }}
          placeholder={c.placeholder}
          className={`rounded-lg px-2.5 py-1.5 text-sm ${c.ancho ?? 'min-w-0 flex-1'}`}
        />
      ))}
      <Button type="button" size="sm" disabled={pendiente} onClick={() => void crear()}>
        {pendiente ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Crear
      </Button>
      <button type="button" onClick={() => setAbierto(false)} className="rounded p-1 text-muted hover:text-ink" title="Cancelar">
        <X size={14} />
      </button>
    </div>
  );
}

/** Corta pasteles enteros en porciones para venderlas por pedazo. */
function CortarModal({ porcion, onClose, onDone }: { porcion: Product; onClose: () => void; onDone: () => void }) {
  const [enteros, setEnteros] = useState('1');
  const disponibles = porcion.porcionDe?.stock ?? 0;
  const n = Number(enteros) || 0;
  const cortar = useMutation({
    mutationFn: () => productsApi.cortar(porcion.id, n),
    onSuccess: (p) => {
      toast.success(`Listo: ahora hay ${p.stock} "${p.nombre}".`);
      onDone();
      onClose();
    },
  });
  return (
    <Modal titulo="Cortar en porciones" onClose={onClose} ancho="max-w-sm">
      <p className="mb-3 text-sm text-muted">
        Hay <span className="font-semibold text-ink">{disponibles}</span> "{porcion.porcionDe?.nombre}" enteros. Cada uno
        da {porcion.porcionesPorUnidad} porciones.
      </p>
      <Field label="Enteros a cortar">
        <input type="number" min="1" max={disponibles} value={enteros} onChange={(e) => setEnteros(e.target.value)} className={INPUT} />
      </Field>
      {n > 0 && (
        <p className="mt-2 text-sm text-ink">
          −{n} {porcion.porcionDe?.nombre} · +{n * (porcion.porcionesPorUnidad ?? 0)} {porcion.nombre}
        </p>
      )}
      <Button className="mt-3 w-full" disabled={n < 1 || n > disponibles || cortar.isPending} onClick={() => cortar.mutate()}>
        {cortar.isPending && <Loader2 size={16} className="animate-spin" />} Cortar
      </Button>
    </Modal>
  );
}

function MermaModal({ producto, onClose, onDone }: { producto: Product; onClose: () => void; onDone: () => void }) {
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const registrar = useMutation({
    mutationFn: () => productsApi.merma(producto.id, Number(cantidad), motivo || undefined),
    onSuccess: () => {
      toast.success('Merma registrada.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal titulo={`Merma de "${producto.nombre}"`} onClose={onClose} ancho="max-w-sm">
      <p className="mb-3 text-sm text-muted">
        Para producto que se bota (vencido, dañado). Sale de la existencia ({producto.stock} disponibles) y queda en el reporte de mermas.
      </p>
      <div className="space-y-3">
        <Field label="Cantidad">
          <input type="number" min="1" max={producto.stock} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Motivo">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Pan del dia anterior" className={INPUT} />
        </Field>
        <Button
          variant="danger"
          className="w-full"
          disabled={!(Number(cantidad) >= 1) || registrar.isPending}
          onClick={() => registrar.mutate()}
        >
          {registrar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Registrar merma
        </Button>
      </div>
    </Modal>
  );
}

function CategoriasModal({ categorias, esAdmin, onClose }: { categorias: Category[]; esAdmin: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');
  const crear = useMutation({
    mutationFn: () => categoriesApi.create(nombre),
    onSuccess: () => {
      toast.success('Categoria creada.');
      setNombre('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message ?? 'No se pudo crear la categoria.'),
  });
  const borrar = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
  return (
    <Modal
      titulo={
        <span className="flex items-center gap-2">
          <Tag size={16} /> Categorias
        </span>
      }
      onClose={onClose}
      ancho="max-w-sm"
    >
      {esAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nombre.trim()) crear.mutate();
          }}
          className="mb-4 flex gap-2"
        >
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Pasteles, Panes, Postres..." className={INPUT} />
          <Button type="submit" size="sm" disabled={crear.isPending}>
            <Plus size={15} />
          </Button>
        </form>
      )}
      {categorias.length === 0 ? (
        <p className="text-sm text-muted">Todavia no hay categorias.</p>
      ) : (
        <ul className="divide-y divide-porcelain-200">
          {categorias.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm text-ink">
              {c.nombre}
              {esAdmin && (
                <button onClick={() => borrar.mutate(c.id)} className="rounded p-1 text-muted hover:bg-brick-100 hover:text-brick-600" title="Eliminar categoria">
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
