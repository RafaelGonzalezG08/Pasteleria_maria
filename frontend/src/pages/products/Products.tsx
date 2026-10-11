import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus,
  Gem,
  Pencil,
  Search,
  Trash2,
  RotateCcw,
  Loader2,
  Sparkles,
  Tag,
  Check,
  Download,
  MoreVertical,
  type LucideIcon,
} from 'lucide-react';
import { apiUrl, urlConToken } from '../../lib/api';
import {
  productsApi,
  categoriesApi,
  type ProductFormValues,
  type VistaPreviaLimpieza,
  type VistaPreviaEliminarDuplicados,
} from '../../api/products.api';
import { usePersistedState, limpiarBorrador } from '../../lib/usePersistedState';
import { formatMoney } from '../../lib/format';
import { coincideBusqueda } from '../../lib/search';
import { Button, Card, PageHeader, EmptyState, Badge, Select, Skeleton } from '../../components/ui';
import { useAuthStore } from '../../store/auth.store';
import type { Category, Product } from '../../types';
import { MATERIAL_LABEL } from '../../types';
import { MATERIAL_COLOR } from './materialColor';
import { ProductModal } from './components/ProductModal';
import { LimpiarDuplicadosModal } from './components/LimpiarDuplicadosModal';
import { EliminarDuplicadosModal } from './components/EliminarDuplicadosModal';
import { CategoriasModal } from './components/CategoriasModal';

const PESTANAS: { valor: 'ACTIVOS' | 'BAJA'; texto: string }[] = [
  { valor: 'ACTIVOS', texto: 'Activos' },
  { valor: 'BAJA', texto: 'Dados de baja' },
];

function margenPct(product: Product): number | null {
  if (product.costoUnitario === undefined || product.precioUnitario <= 0) return null;
  return ((product.precioUnitario - product.costoUnitario) / product.precioUnitario) * 100;
}

interface AccionMenu {
  label: string;
  icono: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Acciones secundarias del encabezado (exportar, categorias, limpiar
 * duplicados) agrupadas en un menu: en celular, ponerlas como botones
 * sueltos ocupaba 2 filas completas antes de llegar al listado.
 */
function MenuAcciones({ acciones }: { acciones: AccionMenu[] }) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!abierto || !contenedor.current) return;
    const r = contenedor.current.getBoundingClientRect();
    setPosicion({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    function alClickFuera(e: MouseEvent) {
      const objetivo = e.target as Node;
      if (contenedor.current?.contains(objetivo) || panel.current?.contains(objetivo)) return;
      setAbierto(false);
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', alClickFuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('mousedown', alClickFuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [abierto]);

  return (
    <div ref={contenedor}>
      <Button size="sm" variant="secondary" onClick={() => setAbierto((a) => !a)} title="Más acciones">
        <MoreVertical size={16} />
      </Button>

      {abierto &&
        posicion &&
        createPortal(
          <div
            ref={panel}
            style={{ top: posicion.top, right: posicion.right }}
            className="fixed z-50 w-60 rounded-xl bg-porcelain-100 py-1 shadow-neu"
          >
            {acciones.map((a) => (
              <button
                key={a.label}
                type="button"
                disabled={a.disabled}
                onClick={() => {
                  setAbierto(false);
                  a.onClick();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-porcelain-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <a.icono size={15} /> {a.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function Products() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const esAdmin = user?.role === 'ADMIN';
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [pestana, setPestana] = usePersistedState<'ACTIVOS' | 'BAJA'>('productos:pestana', 'ACTIVOS');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [showCategorias, setShowCategorias] = useState(false);
  // Seleccion multiple: para no tener que dar de baja/reactivar/eliminar
  // pieza por pieza cuando hay muchas. Se limpia sola al cambiar de pestaña
  // o al salir del modo, para no arrastrar una seleccion que ya no se ve.
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  function cambiarPestana(valor: 'ACTIVOS' | 'BAJA') {
    setPestana(valor);
    setSeleccionados(new Set());
  }

  function toggleSeleccion(id: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list(true),
  });

  const { data: categorias = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
  });
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c.nombre]));

  const productosPestana = products.filter((product) => product.activo === (pestana === 'ACTIVOS'));
  const filteredProducts = productosPestana
    .filter((product) => coincideBusqueda(`${product.nombre} ${product.sku}`, search))
    .filter((product) => !filtroCategoria || product.categoriaId === filtroCategoria);

  const createProduct = useMutation({
    mutationFn: (values: ProductFormValues) => productsApi.create(values),
    onSuccess: () => {
      toast.success('Producto creado.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      limpiarBorrador('productos:nuevo');
      setShowForm(false);
    },
  });

  const updateProduct = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ProductFormValues }) => productsApi.update(id, values),
    onSuccess: (_data, variables) => {
      toast.success('Producto actualizado.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      limpiarBorrador(`productos:editar:${variables.id}`);
      setEditing(null);
    },
  });

  /**
   * Dar de baja una pieza. En el backend es una baja logica (activo = false),
   * no un borrado real: las ventas viejas siguen apuntando al producto, asi
   * que borrarlo de verdad dejaria facturas historicas sin pieza. Deja de
   * venderse y sale del catalogo web, pero se puede reactivar.
   */
  const deleteProduct = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => {
      toast.success('Pieza dada de baja. Ya no se vende ni sale en el catalogo web.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
    },
  });

  const restoreProduct = useMutation({
    mutationFn: (id: string) => productsApi.restore(id),
    onSuccess: () => {
      toast.success('Pieza reactivada.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
    },
  });

  // "Limpiar duplicados": primero se pide una vista previa (que se daria de
  // baja) y solo se ejecuta si el usuario la confirma. Es baja logica igual
  // que el boton individual, asi que se puede deshacer pieza por pieza si
  // algo se marco de mas.
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaLimpieza | null>(null);

  const cargarVistaPrevia = useMutation({
    mutationFn: () => productsApi.previewDuplicados(),
    onSuccess: (data) => setVistaPrevia(data),
    onError: () => toast.error('No se pudo revisar los duplicados.'),
  });

  const limpiarDuplicados = useMutation({
    mutationFn: () => productsApi.limpiarDuplicados(),
    onSuccess: (data) => {
      const total = data.bajaDuplicados + data.bajaSinFoto;
      toast.success(total > 0 ? `${total} piezas dadas de baja.` : 'Nada que limpiar.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setVistaPrevia(null);
    },
    onError: () => toast.error('No se pudo completar la limpieza.'),
  });

  // "Eliminar duplicados" (solo en la pestaña de dados de baja): a diferencia
  // del boton de arriba, esto SI borra de verdad — es para recuperar espacio
  // de piezas repetidas que ya estaban dadas de baja. El backend se niega a
  // borrar cualquiera que tenga una venta encima (ver products.service.ts),
  // asi que nunca rompe una factura vieja.
  const [vistaPreviaEliminar, setVistaPreviaEliminar] = useState<VistaPreviaEliminarDuplicados | null>(null);

  const cargarVistaPreviaEliminar = useMutation({
    mutationFn: () => productsApi.previewEliminarDuplicados(),
    onSuccess: (data) => setVistaPreviaEliminar(data),
    onError: () => toast.error('No se pudo revisar los duplicados.'),
  });

  const eliminarDuplicados = useMutation({
    mutationFn: () => productsApi.eliminarDuplicados(),
    onSuccess: (data) => {
      toast.success(data.eliminados > 0 ? `${data.eliminados} piezas eliminadas.` : 'Nada que eliminar.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setVistaPreviaEliminar(null);
    },
    onError: () => toast.error('No se pudo completar la eliminacion.'),
  });

  const bulkBaja = useMutation({
    mutationFn: () => productsApi.bulkBaja([...seleccionados]),
    onSuccess: (data) => {
      toast.success(`${data.actualizados} piezas dadas de baja.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSeleccionados(new Set());
    },
    onError: () => toast.error('No se pudo completar la baja.'),
  });

  const bulkReactivar = useMutation({
    mutationFn: () => productsApi.bulkReactivar([...seleccionados]),
    onSuccess: (data) => {
      toast.success(`${data.actualizados} piezas reactivadas.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSeleccionados(new Set());
    },
    onError: () => toast.error('No se pudo reactivar.'),
  });

  const bulkEliminar = useMutation({
    mutationFn: () => productsApi.bulkEliminar([...seleccionados]),
    onSuccess: (data) => {
      toast.success(
        data.omitidosPorVentas > 0
          ? `${data.eliminados} eliminadas. ${data.omitidosPorVentas} no se pudieron (ya tienen ventas).`
          : `${data.eliminados} piezas eliminadas.`,
      );
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setSeleccionados(new Set());
    },
    onError: () => toast.error('No se pudo completar la eliminacion.'),
  });

  function imageSrc(product: Product) {
    if (!product.imageUrl) return null;
    const base = product.imageUrl.startsWith('http') ? product.imageUrl : apiUrl(product.imageUrl);
    return urlConToken(base);
  }

  async function exportarCsv() {
    // Siempre el inventario completo (activos + dados de baja): mas
    // predecible que depender de en cual pestana se este parado al pulsar
    // el boton.
    const blob = await productsApi.exportXlsx();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'inventario.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Productos"
        subtitle="Catalogo con codigo unico y foto por pieza"
        action={
          <div className="flex flex-nowrap items-center gap-2">
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus size={16} /> Nuevo producto
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="!px-2.5"
              onClick={() => setShowCategorias(true)}
              title="Categorias"
            >
              <Tag size={16} />
            </Button>
            <MenuAcciones
              acciones={[
                { label: 'Exportar Excel', icono: Download, onClick: exportarCsv },
                ...(esAdmin
                  ? [
                      {
                        label: cargarVistaPrevia.isPending ? 'Revisando...' : 'Limpiar duplicados',
                        icono: Sparkles,
                        onClick: () => cargarVistaPrevia.mutate(),
                        disabled: cargarVistaPrevia.isPending,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {PESTANAS.map((p) => (
            <button
              key={p.valor}
              onClick={() => cambiarPestana(p.valor)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                pestana === p.valor ? 'bg-espresso-700 text-white' : 'bg-porcelain-200 text-muted hover:bg-porcelain-300'
              }`}
            >
              {p.texto}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {esAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setModoSeleccion((v) => !v);
                setSeleccionados(new Set());
              }}
            >
              {modoSeleccion ? 'Cancelar seleccion' : 'Seleccionar varios'}
            </Button>
          )}
          {esAdmin && pestana === 'BAJA' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => cargarVistaPreviaEliminar.mutate()}
              disabled={cargarVistaPreviaEliminar.isPending}
            >
              <Trash2 size={14} /> {cargarVistaPreviaEliminar.isPending ? 'Revisando...' : 'Eliminar duplicados'}
            </Button>
          )}
        </div>
      </div>

      {seleccionados.size > 0 && (
        // Fijo al bajar la pantalla (sticky, no fixed: solo se pega dentro
        // del area que scrollea) -- con muchas piezas dadas de baja, sin esto
        // habia que subir hasta arriba para encontrar "Eliminar de verdad".
        // top-[61px] deja lugar a la barra movil (hamburguesa + nombre) que
        // ya es sticky arriba; en escritorio esa barra no existe (md:hidden)
        // asi que ahi va pegado del todo arriba (md:top-0).
        <div className="sticky top-[61px] z-20 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-copper-300 bg-copper-50 px-3 py-2 shadow-neu-sm md:top-0">
          <span className="text-sm font-semibold text-copper-700">{seleccionados.size} seleccionadas</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {pestana === 'ACTIVOS' ? (
              <Button size="sm" variant="secondary" disabled={bulkBaja.isPending} onClick={() => bulkBaja.mutate()}>
                {bulkBaja.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Dar de baja
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={bulkReactivar.isPending}
                  onClick={() => bulkReactivar.mutate()}
                >
                  {bulkReactivar.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Reactivar
                </Button>
                <Button
                  size="sm"
                  className="!bg-brick-600 hover:!bg-brick-700"
                  disabled={bulkEliminar.isPending}
                  onClick={() => bulkEliminar.mutate()}
                >
                  {bulkEliminar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Eliminar de verdad
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="buscador max-w-sm flex-1 !py-2">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o codigo..."
          />
        </div>
        {categorias.length > 0 && (
          <Select
            value={filtroCategoria}
            onChange={setFiltroCategoria}
            className="w-52"
            options={[
              { value: '', label: 'Todas las categorias' },
              ...categorias.map((c) => ({ value: c.id, label: c.nombre })),
            ]}
          />
        )}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : productosPestana.length === 0 ? (
        <EmptyState
          title={pestana === 'ACTIVOS' ? 'Sin productos' : 'Sin piezas dadas de baja'}
          description={
            pestana === 'ACTIVOS'
              ? 'Registra tu primera pieza para empezar.'
              : 'Las piezas que des de baja apareceran aqui, y las puedes reactivar cuando quieras.'
          }
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyState title="Sin resultados" description={`No hay productos que coincidan con "${search}".`} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((product) => (
            <Card
              key={product.id}
              className={`overflow-hidden ${seleccionados.has(product.id) ? 'ring-2 ring-copper-500' : ''}`}
            >
              <div className="group relative flex h-36 w-full items-center justify-center bg-porcelain-200">
                <button
                  type="button"
                  onClick={() => (modoSeleccion ? toggleSeleccion(product.id) : setEditing(product))}
                  className="absolute inset-0 flex items-center justify-center"
                  title={modoSeleccion ? 'Marcar / desmarcar' : 'Editar producto'}
                >
                  {imageSrc(product) ? (
                    <img src={imageSrc(product)!} alt={product.nombre} className="h-full w-full object-cover" />
                  ) : (
                    <Gem size={28} className="text-muted" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-espresso-950/0 opacity-0 transition-opacity group-hover:bg-espresso-950/40 group-hover:opacity-100">
                    {modoSeleccion ? (
                      <Check size={20} className="text-white" />
                    ) : (
                      <Pencil size={20} className="text-white" />
                    )}
                  </span>
                </button>
                {/* Insignia de material en la esquina: para confirmar de un
                    vistazo que la pieza quedo con el material correcto,
                    sin tener que abrirla a revisar. */}
                <span
                  className={`pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${MATERIAL_COLOR[product.material]}`}
                >
                  {MATERIAL_LABEL[product.material]}
                </span>
                {/* En modo "Seleccionar varios": indicador de marcada (no es un
                    boton aparte — toda la tarjeta marca/desmarca al pulsarla,
                    asi no hay dos zonas de clic encimadas). */}
                {modoSeleccion && (
                  <span
                    className={`pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      seleccionados.has(product.id)
                        ? 'border-copper-600 bg-copper-600 text-white'
                        : 'border-white bg-black/25 text-white'
                    }`}
                  >
                    {seleccionados.has(product.id) && <Check size={13} strokeWidth={3} />}
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="select-text font-mono text-[11px] font-semibold text-copper-600">{product.sku}</p>
                  <span className="shrink-0 text-[11px] text-muted">Stock: {product.stock}</span>
                </div>
                <p className="select-text truncate text-sm font-medium text-ink">{product.nombre}</p>
                {product.categoriaId && categoriaPorId.get(product.categoriaId) && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                    <Tag size={10} /> {categoriaPorId.get(product.categoriaId)}
                  </p>
                )}
                <div className="mt-1.5">
                  <span className="font-display font-bold tabular-nums text-ink">
                    {formatMoney(product.precioUnitario)}
                  </span>
                </div>
                {product.tallas.length > 0 && (
                  <p className="mt-1 truncate text-[11px] text-muted" title={product.tallas.join(', ')}>
                    Sizes: {product.tallas.join(', ')}
                  </p>
                )}
                {margenPct(product) !== null && (
                  <div className="mt-1.5">
                    <Badge tone={margenPct(product)! < 20 ? 'brick' : margenPct(product)! < 40 ? 'copper' : 'sage'}>
                      Margen {margenPct(product)!.toFixed(0)}%
                    </Badge>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <ProductModal
          title="Nuevo producto"
          submitLabel="Crear producto"
          isPending={createProduct.isPending}
          persistKey="productos:nuevo"
          onClose={() => setShowForm(false)}
          onSubmit={(values) => createProduct.mutate(values)}
        />
      )}

      {editing && (
        <ProductModal
          title="Editar producto"
          submitLabel="Guardar cambios"
          isPending={updateProduct.isPending}
          initial={{
            nombre: editing.nombre,
            precioUnitario: String(editing.precioUnitario),
            costoUnitario: String(editing.costoUnitario ?? ''),
            material: editing.material ?? 'OTRO',
            stock: String(editing.stock),
            tallas: editing.tallas ?? [],
            file: null,
          }}
          currentImage={imageSrc(editing)}
          persistKey={`productos:editar:${editing.id}`}
          onClose={() => setEditing(null)}
          onSubmit={(values) => updateProduct.mutate({ id: editing.id, values })}
          // Dar de baja / reactivar es solo de ADMIN, igual que en el backend
          // (@Roles(Role.ADMIN) en products.controller.ts).
          activo={editing.activo}
          onDelete={esAdmin ? () => deleteProduct.mutate(editing.id) : undefined}
          onRestore={esAdmin ? () => restoreProduct.mutate(editing.id) : undefined}
          bajaPendiente={deleteProduct.isPending || restoreProduct.isPending}
        />
      )}

      {vistaPrevia && (
        <LimpiarDuplicadosModal
          vistaPrevia={vistaPrevia}
          onCancel={() => setVistaPrevia(null)}
          onConfirm={() => limpiarDuplicados.mutate()}
          confirmando={limpiarDuplicados.isPending}
        />
      )}

      {vistaPreviaEliminar && (
        <EliminarDuplicadosModal
          vistaPrevia={vistaPreviaEliminar}
          onCancel={() => setVistaPreviaEliminar(null)}
          onConfirm={() => eliminarDuplicados.mutate()}
          confirmando={eliminarDuplicados.isPending}
        />
      )}

      {showCategorias && (
        <CategoriasModal categorias={categorias} esAdmin={esAdmin} onClose={() => setShowCategorias(false)} />
      )}
    </div>
  );
}

