import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CakeSlice, ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { encargosApi, type EncargoPayload } from '../../api/encargos.api';
import { productsApi } from '../../api/products.api';
import { settingsApi } from '../../api/settings.api';
import { urlArchivo } from '../../lib/api';
import { fechaHoraLocal, formatMoney, METODO_PAGO_LABEL } from '../../lib/format';
import { usePersistedState } from '../../lib/usePersistedState';
import { ClientPicker } from '../../components/ClientPicker';
import { Button, Field, INPUT, Modal, Select } from '../../components/ui';
import type { Client, Encargo, MetodoPago, Personalizacion, Product, TipoEntrega } from '../../types';

interface ItemForm extends Personalizacion {
  key: string;
  productId: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  abierto: boolean;
}

interface Borrador {
  client: Client | null;
  fechaEntrega: string;
  tipoEntrega: TipoEntrega;
  direccionEntrega: string;
  costoEnvio: string;
  notas: string;
  items: ItemForm[];
  anticipoMonto: string;
  anticipoMetodo: MetodoPago;
}

const METODOS_ABONO: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO'];

function itemVacio(): ItemForm {
  return { key: `i${Date.now()}${Math.random()}`, productId: '', descripcion: '', cantidad: '1', precioUnitario: '', abierto: true };
}

function borradorInicial(encargo?: Encargo): Borrador {
  if (!encargo) {
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    manana.setHours(15, 0, 0, 0);
    return {
      client: null,
      fechaEntrega: fechaHoraLocal(manana),
      tipoEntrega: 'RETIRO',
      direccionEntrega: '',
      costoEnvio: '',
      notas: '',
      items: [itemVacio()],
      anticipoMonto: '',
      anticipoMetodo: 'EFECTIVO',
    };
  }
  return {
    client: { ...encargo.client, createdAt: '' } as Client,
    fechaEntrega: fechaHoraLocal(new Date(encargo.fechaEntrega)),
    tipoEntrega: encargo.tipoEntrega,
    direccionEntrega: encargo.direccionEntrega ?? '',
    costoEnvio: encargo.costoEnvio ? String(encargo.costoEnvio) : '',
    notas: encargo.notas ?? '',
    items: encargo.items.map((i) => ({
      key: i.id,
      productId: i.productId ?? '',
      descripcion: i.descripcion,
      cantidad: String(i.cantidad),
      precioUnitario: String(i.precioUnitario),
      tamano: i.tamano,
      sabor: i.sabor,
      relleno: i.relleno,
      decoracion: i.decoracion,
      mensaje: i.mensaje,
      fotoReferenciaUrl: i.fotoReferenciaUrl,
      abierto: Boolean(i.tamano || i.sabor || i.relleno || i.decoracion || i.mensaje || i.fotoReferenciaUrl),
    })),
    anticipoMonto: '',
    anticipoMetodo: 'EFECTIVO',
  };
}

export function EncargoForm({
  encargo,
  onClose,
  onCreado,
}: {
  encargo?: Encargo;
  onClose: () => void;
  onCreado?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  // El encargo nuevo a medio escribir sobrevive si se cierra sin querer;
  // la edicion siempre arranca de lo guardado.
  const [b, setB] = usePersistedState<Borrador>(
    encargo ? `encargos:editar:${encargo.id}` : 'encargos:nuevo',
    borradorInicial(encargo),
  );
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const { data: productos = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list() });
  const { data: perfil } = useQuery({
    queryKey: ['settings', 'business-profile'],
    queryFn: () => settingsApi.getBusinessProfile(),
    staleTime: 60_000,
  });
  const tasa = Number(perfil?.tasaImpuesto ?? 0);

  const envio = b.tipoEntrega === 'DOMICILIO' ? Number(b.costoEnvio) || 0 : 0;
  const subtotal = b.items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0), 0) + envio;
  const impuestos = Math.round(subtotal * tasa * 100) / 100;
  const total = Math.round((subtotal + impuestos) * 100) / 100;

  function cambiarItem(key: string, cambios: Partial<ItemForm>) {
    setB((x) => ({ ...x, items: x.items.map((i) => (i.key === key ? { ...i, ...cambios } : i)) }));
  }

  function elegirProducto(key: string, productId: string) {
    const p = productos.find((x) => x.id === productId);
    cambiarItem(key, {
      productId,
      ...(p ? { descripcion: p.nombre, precioUnitario: String(Number(p.precioUnitario)) } : {}),
    });
  }

  async function subirFoto(key: string, file: File | undefined) {
    if (!file) return;
    setSubiendo(key);
    try {
      const { url } = await encargosApi.subirFoto(file);
      cambiarItem(key, { fotoReferenciaUrl: url });
    } finally {
      setSubiendo(null);
    }
  }

  const guardar = useMutation({
    mutationFn: () => {
      const payload: EncargoPayload = {
        clientId: b.client!.id,
        fechaEntrega: new Date(b.fechaEntrega).toISOString(),
        tipoEntrega: b.tipoEntrega,
        direccionEntrega: b.tipoEntrega === 'DOMICILIO' ? b.direccionEntrega || b.client?.direccion || '' : undefined,
        costoEnvio: envio,
        notas: b.notas,
        items: b.items
          .filter((i) => i.descripcion.trim())
          .map((i) => ({
            productId: i.productId || undefined,
            descripcion: i.descripcion,
            cantidad: Number(i.cantidad) || 1,
            precioUnitario: Number(i.precioUnitario) || 0,
            tamano: i.tamano || undefined,
            sabor: i.sabor || undefined,
            relleno: i.relleno || undefined,
            decoracion: i.decoracion || undefined,
            mensaje: i.mensaje || undefined,
            fotoReferenciaUrl: i.fotoReferenciaUrl || undefined,
          })),
        anticipo:
          !encargo && Number(b.anticipoMonto) > 0 ? { monto: Number(b.anticipoMonto), metodo: b.anticipoMetodo } : undefined,
      };
      return encargo ? encargosApi.update(encargo.id, payload) : encargosApi.create(payload);
    },
    onSuccess: (guardado) => {
      toast.success(encargo ? 'Encargo actualizado.' : `Encargo ${guardado.codigo} creado.`);
      queryClient.invalidateQueries({ queryKey: ['encargos'] });
      queryClient.invalidateQueries({ queryKey: ['encargo'] });
      queryClient.invalidateQueries({ queryKey: ['hoja-produccion'] });
      setB(borradorInicial());
      onClose();
      if (!encargo) onCreado?.(guardado.id);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!b.client) return void toast.error('Elige el cliente del encargo.');
    if (!b.fechaEntrega) return void toast.error('Indica la fecha y hora de entrega.');
    if (!b.items.some((i) => i.descripcion.trim())) return void toast.error('Agrega al menos un producto al encargo.');
    if (Number(b.anticipoMonto) > total) return void toast.error('El anticipo no puede ser mayor que el total.');
    guardar.mutate();
  }

  return (
    <Modal titulo={encargo ? `Editar encargo ${encargo.codigo}` : 'Nuevo encargo'} onClose={onClose} ancho="max-w-4xl">
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <ClientPicker
            client={b.client}
            onChange={(client) =>
              setB((x) => ({ ...x, client, direccionEntrega: x.direccionEntrega || client?.direccion || '' }))
            }
            required
          />
          <Field label="Fecha y hora de entrega">
            <input
              type="datetime-local"
              value={b.fechaEntrega}
              onChange={(e) => setB((x) => ({ ...x, fechaEntrega: e.target.value }))}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-[200px_1fr_140px]">
          <Field label="Entrega">
            <Select
              value={b.tipoEntrega}
              onChange={(v) => setB((x) => ({ ...x, tipoEntrega: v as TipoEntrega }))}
              options={[
                { value: 'RETIRO', label: 'Retiro en tienda' },
                { value: 'DOMICILIO', label: 'A domicilio' },
              ]}
            />
          </Field>
          {b.tipoEntrega === 'DOMICILIO' && (
            <>
              <Field label="Direccion de entrega">
                <input value={b.direccionEntrega} onChange={(e) => setB((x) => ({ ...x, direccionEntrega: e.target.value }))} className={INPUT} />
              </Field>
              <Field label="Costo de envio">
                <input type="number" min="0" step="0.01" value={b.costoEnvio} onChange={(e) => setB((x) => ({ ...x, costoEnvio: e.target.value }))} className={INPUT} />
              </Field>
            </>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Productos</p>
          <div className="space-y-3">
            {b.items.map((i) => (
              <div key={i.key} className="rounded-xl p-3 shadow-neu-inset">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-[200px_1fr_80px_120px_auto]">
                  <Select
                    size="sm"
                    className="col-span-2 md:col-span-1"
                    value={i.productId}
                    onChange={(v) => elegirProducto(i.key, v)}
                    options={[{ value: '', label: 'Personalizado' }, ...productos.map((p) => ({ value: p.id, label: p.nombre }))]}
                  />
                  <input
                    className="col-span-2 rounded-lg px-2.5 py-1.5 text-sm md:col-span-1"
                    value={i.descripcion}
                    onChange={(e) => cambiarItem(i.key, { descripcion: e.target.value })}
                    placeholder='Pastel de cumpleaños 10"'
                  />
                  <input
                    type="number"
                    min="1"
                    value={i.cantidad}
                    onChange={(e) => cambiarItem(i.key, { cantidad: e.target.value })}
                    className="rounded-lg px-2.5 py-1.5 text-sm"
                    title="Cantidad"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={i.precioUnitario}
                    onChange={(e) => cambiarItem(i.key, { precioUnitario: e.target.value })}
                    placeholder="Precio c/u"
                    className="rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
                    <button
                      type="button"
                      onClick={() => cambiarItem(i.key, { abierto: !i.abierto })}
                      className="rounded px-2 py-1 text-xs font-semibold text-copper-600 hover:bg-copper-50"
                    >
                      {i.abierto ? 'Ocultar detalles' : 'Personalizar'}
                    </button>
                    {b.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setB((x) => ({ ...x, items: x.items.filter((y) => y.key !== i.key) }))}
                        className="rounded p-1 text-muted hover:text-brick-600"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {i.abierto && (
                  <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_110px]">
                    <input value={i.tamano ?? ''} onChange={(e) => cambiarItem(i.key, { tamano: e.target.value })} placeholder="Tamaño (10 pulgadas, 2 pisos...)" className="rounded-lg px-2.5 py-1.5 text-sm" />
                    <input value={i.sabor ?? ''} onChange={(e) => cambiarItem(i.key, { sabor: e.target.value })} placeholder="Sabor" className="rounded-lg px-2.5 py-1.5 text-sm" />
                    <input value={i.relleno ?? ''} onChange={(e) => cambiarItem(i.key, { relleno: e.target.value })} placeholder="Relleno" className="rounded-lg px-2.5 py-1.5 text-sm" />
                    <div className="row-span-2 flex flex-col items-center justify-center gap-1">
                      {i.fotoReferenciaUrl ? (
                        <div className="relative">
                          <img src={urlArchivo(i.fotoReferenciaUrl)!} alt="Referencia" className="h-20 w-20 rounded-lg object-cover" />
                          <button
                            type="button"
                            onClick={() => cambiarItem(i.key, { fotoReferenciaUrl: null })}
                            className="absolute -right-1.5 -top-1.5 rounded-full bg-brick-500 p-0.5 text-white"
                            title="Quitar foto"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-porcelain-200 text-[10px] text-muted hover:text-copper-600">
                          {subiendo === i.key ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                          Foto de referencia
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => subirFoto(i.key, e.target.files?.[0])} />
                        </label>
                      )}
                    </div>
                    <input
                      value={i.decoracion ?? ''}
                      onChange={(e) => cambiarItem(i.key, { decoracion: e.target.value })}
                      placeholder="Decoracion (colores, figuras, flores...)"
                      className="rounded-lg px-2.5 py-1.5 text-sm md:col-span-2"
                    />
                    <input value={i.mensaje ?? ''} onChange={(e) => cambiarItem(i.key, { mensaje: e.target.value })} placeholder="Mensaje escrito" className="rounded-lg px-2.5 py-1.5 text-sm" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={() => setB((x) => ({ ...x, items: [...x.items, itemVacio()] }))}>
            <Plus size={14} /> Agregar producto
          </Button>
        </div>

        <Field label="Notas">
          <textarea value={b.notas} onChange={(e) => setB((x) => ({ ...x, notas: e.target.value }))} rows={2} className={INPUT} placeholder="Alergias, indicaciones de entrega..." />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          {!encargo ? (
            <div className="rounded-xl p-3 shadow-neu-inset">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Anticipo (opcional)</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={b.anticipoMonto}
                  onChange={(e) => setB((x) => ({ ...x, anticipoMonto: e.target.value }))}
                  placeholder="Monto"
                  className="rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Select
                  size="sm"
                  value={b.anticipoMetodo}
                  onChange={(v) => setB((x) => ({ ...x, anticipoMetodo: v as MetodoPago }))}
                  options={METODOS_ABONO.map((m) => ({ value: m, label: METODO_PAGO_LABEL[m] }))}
                />
              </div>
              {total > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {[50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setB((x) => ({ ...x, anticipoMonto: String(Math.round(total * pct) / 100) }))}
                      className="rounded-lg bg-porcelain-200 px-2 py-1 text-[11px] font-semibold text-muted hover:text-copper-600"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted">Los anticipos y abonos se registran desde el detalle del encargo.</div>
          )}
          <div className="space-y-1 text-right text-sm">
            <p className="text-muted">
              Subtotal: <span className="tabular-nums text-ink">{formatMoney(subtotal)}</span>
            </p>
            {impuestos > 0 && (
              <p className="text-muted">
                {perfil?.nombreImpuesto ?? 'Impuestos'} ({Math.round(tasa * 100)}%): <span className="tabular-nums text-ink">{formatMoney(impuestos)}</span>
              </p>
            )}
            <p className="font-display text-xl font-bold text-ink">Total: {formatMoney(total)}</p>
            {Number(b.anticipoMonto) > 0 && (
              <p className="text-brick-600">Saldo al entregar: {formatMoney(Math.max(0, total - Number(b.anticipoMonto)))}</p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={guardar.isPending || Boolean(subiendo)}>
          {guardar.isPending ? <Loader2 size={16} className="animate-spin" /> : <CakeSlice size={16} />}
          {encargo ? 'Guardar cambios' : 'Crear encargo'}
        </Button>
      </form>
    </Modal>
  );
}
