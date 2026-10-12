import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CakeSlice, Factory, Loader2, Printer, Undo2 } from 'lucide-react';
import { produccionApi, recetasApi } from '../../api/inventario.api';
import { productsApi } from '../../api/products.api';
import { encargosApi } from '../../api/encargos.api';
import { urlArchivo } from '../../lib/api';
import {
  ESTADO_ENCARGO_LABEL,
  fechaLocal,
  formatCantidad,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTime,
  TIPO_ENTREGA_LABEL,
} from '../../lib/format';
import { useAuthStore } from '../../store/auth.store';
import { Badge, Button, Card, EmptyState, Field, INPUT, PageHeader, Select, Skeleton, Tabs } from '../../components/ui';
import type { HojaProduccion, Product, Produccion as ProduccionT, RecetaEscalada, RecetaResumen } from '../../types';

type Pestana = 'REGISTRAR' | 'HOJA';

export default function Produccion() {
  const [params] = useSearchParams();
  const [pestana, setPestana] = useState<Pestana>(params.get('hoja') ? 'HOJA' : 'REGISTRAR');
  const recetaPedida = params.get('receta');

  // Desde la hoja de produccion o desde una receta se llega con ?receta=...:
  // se abre directo el formulario con esa receta elegida.
  useEffect(() => {
    if (recetaPedida) setPestana('REGISTRAR');
  }, [recetaPedida]);

  return (
    <div>
      <PageHeader title="Produccion" subtitle="Lo que se hornea: descuenta insumos y suma producto terminado" />
      <div className="mb-4">
        <Tabs
          value={pestana}
          onChange={setPestana}
          opciones={[
            { valor: 'REGISTRAR', texto: 'Registrar produccion' },
            { valor: 'HOJA', texto: 'Hoja de produccion del dia' },
          ]}
        />
      </div>
      {pestana === 'REGISTRAR' ? <Registrar key={params.toString()} /> : <Hoja />}
    </div>
  );
}

function Registrar() {
  const queryClient = useQueryClient();
  const esAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const [params] = useSearchParams();
  const [recetaId, setRecetaId] = useState(params.get('receta') ?? '');
  const [tandas, setTandas] = useState(params.get('tandas') ?? '1');
  const [notas, setNotas] = useState('');
  // '' = sale como enteros; si no, el id del producto "porcion" en que sale.
  const [porcionId, setPorcionId] = useState('');
  const { data: productos = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const [desde, setDesde] = useState(fechaLocal());
  const [hasta, setHasta] = useState(fechaLocal());

  const { data: recetas = [] } = useQuery<RecetaResumen[]>({ queryKey: ['recetas'], queryFn: () => recetasApi.list() });
  const finales = recetas.filter((r) => !r.esSubreceta && r.activo);
  const receta = finales.find((r) => r.id === recetaId);
  const tandasNum = Number(tandas) > 0 ? Number(tandas) : 0;

  const { data: vistaPrevia } = useQuery<RecetaEscalada>({
    queryKey: ['receta', recetaId, 'escalar', tandasNum],
    queryFn: () => recetasApi.escalar(recetaId, tandasNum),
    enabled: Boolean(recetaId) && tandasNum > 0,
  });
  const { data: producciones = [], isLoading } = useQuery<ProduccionT[]>({
    queryKey: ['producciones', desde, hasta],
    queryFn: () => produccionApi.list({ from: desde || undefined, to: hasta || undefined }),
  });

  useEffect(() => {
    if (!recetaId && finales.length === 1) setRecetaId(finales[0].id);
  }, [finales, recetaId]);

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['producciones'] });
    queryClient.invalidateQueries({ queryKey: ['insumos'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['receta'] });
    queryClient.invalidateQueries({ queryKey: ['hoja-produccion'] });
    queryClient.invalidateQueries({ queryKey: ['alertas-inventario'] });
  }

  const registrar = useMutation({
    mutationFn: () =>
      produccionApi.registrar({ recetaId, tandas: tandasNum, notas: notas || undefined, porcionId: porcionId || undefined }),
    onSuccess: (p) => {
      toast.success(
        p.unidadesProducidas > 0
          ? `Produccion registrada: +${p.unidadesProducidas} ${p.producto?.nombre ?? 'unidades'}.`
          : 'Produccion registrada. Se descontaron los insumos.',
      );
      setNotas('');
      refrescar();
    },
  });

  const anular = useMutation({
    mutationFn: (id: string) => produccionApi.anular(id),
    onSuccess: () => {
      toast.success('Produccion anulada: los insumos volvieron al inventario.');
      refrescar();
    },
  });

  const faltantes = vistaPrevia?.insumos.filter((i) => i.faltante > 0) ?? [];
  // Porciones en que se puede vender el producto de esta receta.
  const porcionesDelProducto = productos.filter((p) => receta?.producto && p.porcionDeId === receta.producto.id);
  const porcionElegida = porcionesDelProducto.find((p) => p.id === porcionId);
  const enteros =
    receta && receta.producto && vistaPrevia
      ? vistaPrevia.rendimiento * (receta.unidadRendimiento === 'docena' ? 12 : 1)
      : null;
  const unidades =
    enteros === null ? null : Math.floor(enteros * (porcionElegida?.porcionesPorUnidad ?? 1) + 1e-6);
  const nombreDestino = porcionElegida?.nombre ?? receta?.producto?.nombre;

  // Al cambiar de receta, lo que sale vuelve a ser "enteros".
  useEffect(() => setPorcionId(''), [recetaId]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="order-2 lg:order-1">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Desde">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Hasta">
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INPUT} />
          </Field>
        </div>
        {isLoading ? (
          <Skeleton />
        ) : producciones.length === 0 ? (
          <EmptyState title="Sin producciones en estas fechas" />
        ) : (
          <Card className="divide-y divide-porcelain-200 overflow-hidden">
            {producciones.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {p.receta.nombre} <span className="text-muted">× {formatCantidad(p.tandas)}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {formatDateTime(p.fecha)} · {p.user?.nombre ?? ''}
                    {p.notas ? ` · ${p.notas}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {p.unidadesProducidas > 0 && <Badge tone="sage">+{p.unidadesProducidas} {p.producto?.nombre}</Badge>}
                  {esAdmin && p.costoTotal !== undefined && (
                    <span className="tabular-nums text-muted">{formatMoney(p.costoTotal)}</span>
                  )}
                  {esAdmin && (
                    <button
                      onClick={() => {
                        if (window.confirm('¿Anular esta produccion? Los insumos vuelven al inventario y se quitan las unidades producidas.')) {
                          anular.mutate(p.id);
                        }
                      }}
                      className="rounded p-1 text-muted hover:bg-brick-100 hover:text-brick-600"
                      title="Anular produccion"
                    >
                      <Undo2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Card className="order-1 h-fit space-y-3 p-4 lg:order-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted">Nueva produccion</h2>
        {finales.length === 0 ? (
          <p className="text-sm text-muted">Primero crea una receta en Recetas.</p>
        ) : (
          <>
            <Field label="Receta">
              <Select
                value={recetaId}
                onChange={setRecetaId}
                options={[{ value: '', label: 'Elegir receta...' }, ...finales.map((r) => ({ value: r.id, label: r.nombre }))]}
              />
            </Field>
            <Field
              label="Tandas"
              ayuda={receta ? `Una tanda rinde ${formatCantidad(receta.rendimiento)} ${receta.unidadRendimiento}.` : undefined}
            >
              <input type="number" min="0.1" step="any" value={tandas} onChange={(e) => setTandas(e.target.value)} className={INPUT} />
            </Field>
            {porcionesDelProducto.length > 0 && receta?.producto && (
              <Field label="Sale como" ayuda="Enteros van a la existencia del pastel; porciones, directo a la de sus pedazos.">
                <Select
                  value={porcionId}
                  onChange={setPorcionId}
                  options={[
                    { value: '', label: `Enteros (${receta.producto.nombre})` },
                    ...porcionesDelProducto.map((p) => ({
                      value: p.id,
                      label: `Porciones: ${p.nombre} (${p.porcionesPorUnidad} por entero)`,
                    })),
                  ]}
                />
              </Field>
            )}
            <Field label="Notas">
              <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={INPUT} />
            </Field>

            {vistaPrevia && (
              <div className="rounded-lg p-3 text-xs shadow-neu-inset">
                <p className="mb-1 font-semibold text-ink">
                  Sale: {formatCantidad(vistaPrevia.rendimiento)} {vistaPrevia.unidadRendimiento}
                  {unidades !== null && nombreDestino ? ` → +${unidades} ${nombreDestino}` : ''}
                </p>
                <p className="mb-1 text-muted">Se descuenta:</p>
                <ul className="space-y-0.5">
                  {vistaPrevia.insumos.map((i) => (
                    <li key={i.insumoId} className={i.faltante > 0 ? 'font-semibold text-brick-600' : 'text-muted'}>
                      {i.nombre}: {formatCantidad(i.necesario)} {i.unidad}
                      {i.faltante > 0 ? ` (faltan ${formatCantidad(i.faltante)})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!recetaId || tandasNum <= 0 || faltantes.length > 0 || registrar.isPending}
              onClick={() => registrar.mutate()}
            >
              {registrar.isPending ? <Loader2 size={16} className="animate-spin" /> : <Factory size={16} />}
              Registrar produccion
            </Button>
            {faltantes.length > 0 && (
              <p className="text-xs text-brick-600">No hay inventario suficiente. Registra la compra o ajusta las tandas.</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Hoja() {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(fechaLocal());
  const { data, isLoading } = useQuery<HojaProduccion>({
    queryKey: ['hoja-produccion', fecha],
    queryFn: () => produccionApi.hoja(fecha),
  });

  const enProduccion = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: 'EN_PRODUCCION' | 'LISTO' }) => encargosApi.cambiarEstado(id, estado),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hoja-produccion'] });
      queryClient.invalidateQueries({ queryKey: ['encargos'] });
    },
  });

  return (
    <div className="zona-impresion">
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Dia">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
        </Field>
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer size={15} /> Imprimir
        </Button>
      </div>

      <h2 className="mb-3 hidden font-display text-lg font-bold print:block">
        Hoja de produccion — {formatDate(`${fecha}T12:00:00`)}
      </h2>

      {isLoading || !data ? (
        <Skeleton />
      ) : data.encargos.length === 0 ? (
        <EmptyState title="No hay encargos para este dia" description="Los encargos pendientes con entrega ese dia aparecen aqui." />
      ) : (
        <div className="space-y-6">
          {data.productos.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">Que preparar</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5">Producto</th>
                    <th className="py-1.5 text-right">Encargado</th>
                    <th className="py-1.5 text-right">Hecho</th>
                    <th className="py-1.5 text-right">Falta</th>
                    <th className="py-1.5">Receta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-porcelain-200">
                  {data.productos.map((p) => (
                    <tr key={p.productId}>
                      <td className="py-2 font-medium text-ink">{p.nombre}</td>
                      <td className="py-2 text-right tabular-nums">{p.cantidad}</td>
                      <td className="py-2 text-right tabular-nums text-muted">{p.stock}</td>
                      <td className={`py-2 text-right font-semibold tabular-nums ${p.faltante > 0 ? 'text-brick-600' : 'text-sage-600'}`}>
                        {p.faltante}
                      </td>
                      <td className="py-2 text-xs">
                        {p.receta ? (
                          p.tandasSugeridas > 0 ? (
                            <Link
                              to={`/produccion?receta=${p.receta.id}&tandas=${p.tandasSugeridas}`}
                              className="font-semibold text-copper-600 hover:underline print:no-underline"
                            >
                              {p.receta.nombre} × {p.tandasSugeridas}
                            </Link>
                          ) : (
                            <span className="text-muted">{p.receta.nombre}</span>
                          )
                        ) : (
                          <span className="text-muted">Sin receta</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {data.encargos.map((e) => (
              <Card key={e.id} className="break-inside-avoid p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-copper-600">{e.codigo}</p>
                    <p className="font-display font-semibold text-ink">{e.cliente.nombre}</p>
                    <p className="text-xs text-muted">
                      {formatTime(e.fechaEntrega)} · {TIPO_ENTREGA_LABEL[e.tipoEntrega]}
                    </p>
                  </div>
                  <Badge tone={e.estado === 'LISTO' ? 'sage' : e.estado === 'EN_PRODUCCION' ? 'copper' : 'neutral'}>
                    {ESTADO_ENCARGO_LABEL[e.estado]}
                  </Badge>
                </div>
                <ul className="space-y-2">
                  {e.items.map((i) => (
                    <li key={i.id} className="flex gap-3 rounded-lg p-2 text-sm shadow-neu-inset">
                      {i.fotoReferenciaUrl ? (
                        <img src={urlArchivo(i.fotoReferenciaUrl)!} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-porcelain-200">
                          <CakeSlice size={20} className="text-muted" />
                        </div>
                      )}
                      <div className="min-w-0 text-xs text-muted">
                        <p className="text-sm font-semibold text-ink">
                          {i.cantidad} × {i.descripcion}
                        </p>
                        {i.tamano && <p>Tamaño: {i.tamano}</p>}
                        {i.sabor && <p>Sabor: {i.sabor}</p>}
                        {i.relleno && <p>Relleno: {i.relleno}</p>}
                        {i.decoracion && <p>Decoracion: {i.decoracion}</p>}
                        {i.mensaje && <p className="font-semibold text-copper-700">Mensaje: “{i.mensaje}”</p>}
                      </div>
                    </li>
                  ))}
                </ul>
                {e.notas && <p className="mt-2 text-xs text-muted">Notas: {e.notas}</p>}
                <div className="mt-3 flex gap-2 print:hidden">
                  {e.estado === 'PENDIENTE' && (
                    <Button size="sm" variant="secondary" onClick={() => enProduccion.mutate({ id: e.id, estado: 'EN_PRODUCCION' })}>
                      Empezar
                    </Button>
                  )}
                  {e.estado !== 'LISTO' && (
                    <Button size="sm" variant="secondary" onClick={() => enProduccion.mutate({ id: e.id, estado: 'LISTO' })}>
                      Marcar listo
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
