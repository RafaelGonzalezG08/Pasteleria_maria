import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Minus, Plus, Search, Trash2, MessageCircle, Loader2, Receipt, X, Gem, Check, Package } from 'lucide-react';
import { apiUrl, urlConToken } from '../../lib/api';
import { productsApi } from '../../api/products.api';
import { settingsApi } from '../../api/settings.api';
import { salesApi } from '../../api/sales.api';
import {
  abrirPestanaRespaldoSiHaceFalta,
  enviarWhatsappDesdeCelular,
  esEnvioDirecto,
} from '../../lib/whatsappDirecto';
import { usePersistedState } from '../../lib/usePersistedState';
import { formatMoney, METODO_PAGO_LABEL } from '../../lib/format';
import { coincideBusqueda } from '../../lib/search';
import { Button, Card } from '../../components/ui';
import { FacturaImagen } from '../../components/FacturaImagen';
import { ClientPicker } from '../../components/ClientPicker';
import type { Client, MetodoPago, Product, Sale } from '../../types';

interface CartLine {
  key: string;
  productId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

const METODOS: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CREDITO', 'OTRO'];

export default function POS() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  // La venta a medio armar se guarda sola: si el cajero sale de la pantalla
  // por accidente (o se cierra la app), al volver el carrito sigue ahi.
  // Ver lib/usePersistedState.ts.
  const [cart, setCart] = usePersistedState<CartLine[]>('pos:carrito', []);
  const [manualDesc, setManualDesc] = usePersistedState('pos:manual-desc', '');
  const [manualPrice, setManualPrice] = usePersistedState('pos:manual-precio', '');
  const [selectedClientId, setSelectedClientId] = usePersistedState<string | undefined>('pos:cliente-id', undefined);
  const [selectedClient, setSelectedClient] = usePersistedState<Client | null>('pos:cliente', null);
  const [metodoPago, setMetodoPago] = usePersistedState<MetodoPago>('pos:metodo-pago', 'EFECTIVO');
  const [descuentoPct, setDescuentoPct] = usePersistedState('pos:descuento', '');
  const [fechaVencimiento, setFechaVencimiento] = usePersistedState('pos:vencimiento', '');
  // Pedido por entregar: la pieza no sale hoy con el cliente, queda en el
  // registro de Pedidos hasta que se entregue.
  const [esPedido, setEsPedido] = usePersistedState('pos:es-pedido', false);
  const [fechaEntrega, setFechaEntrega] = usePersistedState('pos:fecha-entrega', '');
  // completedSale NO se persiste: es el resultado de una venta ya cerrada, no
  // trabajo a medias, y volver a la pantalla mostrando una factura vieja
  // haria pensar que la venta se acaba de hacer otra vez.
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  const { data: products = [], isSuccess: productsLoaded } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list(),
  });

  // El carrito se guarda en el navegador. Si un producto que quedo dentro se
  // borro despues (limpieza de duplicados, importacion de inventario, etc.),
  // su ID ya no vale y la venta se caia. Al cargar la lista real de productos
  // se limpian esas lineas muertas y se avisa cuales.
  useEffect(() => {
    if (!productsLoaded) return;
    const vivos = new Set(products.map((p) => p.id));
    const muertas = cart.filter((l) => l.productId && !vivos.has(l.productId));
    if (muertas.length === 0) return;
    setCart((prev) => prev.filter((l) => !l.productId || vivos.has(l.productId)));
    toast.error(
      `Se quitaron del carrito piezas que ya no estan en el inventario: ${muertas
        .map((l) => l.descripcion)
        .join(', ')}.`,
      { id: 'carrito-piezas-muertas', duration: 6000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoaded, products]);

  const { data: businessProfile } = useQuery<{ tasaImpuesto: number }>({
    queryKey: ['settings', 'business-profile'],
    queryFn: () => settingsApi.getBusinessProfile(),
    staleTime: 60_000,
  });
  const tasaImpuesto = businessProfile?.tasaImpuesto ?? 0;

  const filteredProducts = useMemo(
    () => products.filter((p) => coincideBusqueda(`${p.nombre} ${p.sku}`, search)),
    [products, search],
  );

  const totals = useMemo(() => {
    const bruto = cart.reduce((sum, l) => sum + l.cantidad * l.precioUnitario, 0);
    const descuento = Math.min(100, Math.max(0, Number(descuentoPct) || 0));
    const subtotal = Math.round(bruto * (1 - descuento / 100) * 100) / 100;
    const impuestos = Math.round(subtotal * tasaImpuesto * 100) / 100;
    return {
      bruto: Math.round(bruto * 100) / 100,
      subtotal,
      impuestos,
      total: Math.round((subtotal + impuestos) * 100) / 100,
    };
  }, [cart, tasaImpuesto, descuentoPct]);

  // Picar una pieza del catalogo la agrega; picar la misma pieza de nuevo la
  // QUITA del carrito (toggle), en vez de sumarle cantidad -- para subir la
  // cantidad de algo que ya esta en el carrito estan los botones +/- de ahi.
  function toggleProduct(product: Product) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.filter((l) => l.productId !== product.id);
      }
      if (product.stock < 1) {
        toast.error(`"${product.nombre}" no tiene stock disponible.`);
        return prev;
      }
      return [
        ...prev,
        {
          key: product.id,
          productId: product.id,
          descripcion: product.nombre,
          cantidad: 1,
          precioUnitario: Number(product.precioUnitario),
        },
      ];
    });
  }

  function addManualItem() {
    const price = Number(manualPrice);
    if (!manualDesc.trim() || !price || price <= 0) {
      toast.error('Ingresa una descripcion y un precio valido.');
      return;
    }
    setCart((prev) => [
      ...prev,
      { key: `manual-${Date.now()}`, descripcion: manualDesc.trim(), cantidad: 1, precioUnitario: price },
    ]);
    setManualDesc('');
    setManualPrice('');
  }

  function updateQty(key: string, delta: number) {
    setCart((prev) => {
      const line = prev.find((l) => l.key === key);
      // Mismo limite de stock que toggleProduct: el boton "+" del carrito es
      // otra via para pasarse de las existencias reales.
      if (line?.productId && delta > 0) {
        const product = products.find((p) => p.id === line.productId);
        if (product && line.cantidad + delta > product.stock) {
          toast.error(`Solo quedan ${product.stock} de "${product.nombre}".`);
          return prev;
        }
      }
      return prev
        .map((l) => (l.key === key ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0);
    });
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function resetSale() {
    setCart([]);
    setSelectedClientId(undefined);
    setSelectedClient(null);
    setMetodoPago('EFECTIVO');
    setFechaVencimiento('');
    setEsPedido(false);
    setFechaEntrega('');
    setDescuentoPct('');
    setCompletedSale(null);
  }

  const createSale = useMutation({
    mutationFn: () =>
      salesApi.create({
        clientId: selectedClientId || undefined,
        metodoPago,
        fechaVencimiento: metodoPago === 'CREDITO' && fechaVencimiento ? fechaVencimiento : undefined,
        esPedido: esPedido || undefined,
        fechaEntrega: esPedido && fechaEntrega ? fechaEntrega : undefined,
        descuentoPct: Number(descuentoPct) || undefined,
        items: cart.map((l) => ({
          // `|| undefined`: un articulo manual no lleva producto; si se manda
          // como cadena vacia el backend lo toma como un producto real y falla.
          productId: l.productId || undefined,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
        })),
      }),
    onSuccess: (sale) => {
      toast.success(esPedido ? 'Venta registrada y agregada a Pedidos.' : 'Venta registrada.');
      setCompletedSale(sale);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  if (completedSale) {
    return <InvoicePreview sale={completedSale} onNewSale={resetSale} />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      {/* Catalogo. En celular va DESPUES del carrito (order-2): asi el carrito/cobro
          queda arriba, sin tener que scrollear todo el catalogo para pagar. */}
      <div className="order-2 lg:order-1">
        <div className="buscador mb-4">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o codigo..."
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filteredProducts.map((product) => {
            // Misma señal visual que el cliente seleccionado (verde + palomita):
            // si el producto ya esta en la factura, se nota aunque el cajero
            // llegue a el buscando otra cosa, en vez de agregarlo dos veces
            // sin darse cuenta.
            const enCarrito = cart.find((l) => l.productId === product.id);
            return (
            <button
              key={product.id}
              onClick={() => toggleProduct(product)}
              className={`relative flex flex-col items-start overflow-hidden rounded-xl2 text-left transition-all ${
                enCarrito
                  ? 'bg-sage-100 shadow-neu-inset ring-1 ring-sage-500/40'
                  : 'bg-porcelain-100 shadow-neu-sm hover:-translate-y-0.5 active:shadow-neu-pressed'
              }`}
            >
              {enCarrito && (
                <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-sage-500 px-2 py-0.5 text-xs font-bold text-white shadow">
                  <Check size={11} strokeWidth={3} />
                  {enCarrito.cantidad}
                </span>
              )}
              <div className="flex h-24 w-full items-center justify-center bg-porcelain-200">
                {product.imageUrl ? (
                  <img
                    src={urlConToken(
                      product.imageUrl.startsWith('http') ? product.imageUrl : apiUrl(product.imageUrl),
                    )}
                    alt={product.nombre}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Gem size={22} className="text-muted" />
                )}
              </div>
              <div className="p-3.5">
                <span className="font-mono text-[10px] font-semibold text-copper-600">{product.sku}</span>
                <p className="text-sm font-medium leading-snug text-ink">{product.nombre}</p>
                <span className="mt-1.5 block font-display text-base font-bold tabular-nums text-copper-600">
                  {formatMoney(product.precioUnitario)}
                </span>
                <span className="mt-0.5 block text-xs text-muted">Stock: {product.stock}</span>
              </div>
            </button>
            );
          })}
        </div>

        <Card className="mt-4 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Agregar item manual
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={manualDesc}
              onChange={(e) => setManualDesc(e.target.value)}
              placeholder="Descripcion"
              className="flex-1 rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
            />
            <input
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              placeholder="Precio"
              type="number"
              min="0"
              step="0.01"
              className="w-28 rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
            />
            <Button variant="secondary" onClick={addManualItem} type="button">
              Agregar
            </Button>
          </div>
        </Card>
      </div>

      {/* Carrito */}
      <Card className="order-1 flex h-fit flex-col p-4 lg:order-2">
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-muted">
          Carrito ({cart.length})
        </h2>

        {cart.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Selecciona productos del catalogo</p>
        ) : (
          <div className="mb-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {cart.map((line) => (
              <div key={line.key} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-ink">{line.descripcion}</p>
                  <p className="text-xs text-muted tabular-nums">{formatMoney(line.precioUnitario)} c/u</p>
                </div>
                <button onClick={() => updateQty(line.key, -1)} className="rounded p-1 text-muted hover:bg-porcelain-200">
                  <Minus size={14} />
                </button>
                <span className="w-5 text-center tabular-nums">{line.cantidad}</span>
                <button onClick={() => updateQty(line.key, 1)} className="rounded p-1 text-muted hover:bg-porcelain-200">
                  <Plus size={14} />
                </button>
                <button onClick={() => removeLine(line.key)} className="rounded p-1 text-brick-500 hover:bg-brick-100">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mb-3 space-y-1 border-t border-porcelain-200 pt-3 text-sm tabular-nums">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span>{formatMoney(totals.bruto)}</span>
          </div>
          <div className="flex items-center justify-between text-muted">
            <div className="flex items-center gap-1.5">
              <span>Descuento</span>
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={descuentoPct}
                onChange={(e) => setDescuentoPct(e.target.value)}
                placeholder="0"
                // Sin flechitas de subir/bajar: el descuento se escribe a
                // mano, no tiene sentido ir clic por clic hasta un numero.
                className="w-14 appearance-none rounded border border-porcelain-300 px-1.5 py-0.5 text-right text-xs outline-none [appearance:textfield] focus:border-copper-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-xs">%</span>
            </div>
            <span>
              {totals.bruto > totals.subtotal ? `-${formatMoney(totals.bruto - totals.subtotal)}` : formatMoney(0)}
            </span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Impuestos ({Math.round(tasaImpuesto * 100)}%)</span>
            <span>{formatMoney(totals.impuestos)}</span>
          </div>
          <div className="flex justify-between font-display text-lg font-bold text-copper-600">
            <span>Total</span>
            <span>{formatMoney(totals.total)}</span>
          </div>
        </div>

        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Metodo de pago</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {METODOS.map((m) => (
              <button
                key={m}
                onClick={() => setMetodoPago(m)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  metodoPago === m
                    ? 'border-copper-500 bg-copper-100 text-copper-700'
                    : 'border-porcelain-300 text-muted hover:border-copper-400'
                }`}
              >
                {METODO_PAGO_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <ClientPicker
            client={selectedClient}
            onChange={(c) => {
              setSelectedClient(c);
              setSelectedClientId(c?.id);
            }}
            required={metodoPago === 'CREDITO'}
          />

          {metodoPago === 'CREDITO' && (
            <input
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
            />
          )}

          {/* Pedido por entregar: la pieza no sale hoy con el cliente. */}
          <div className={`mt-3 rounded-lg border p-3 ${esPedido ? 'border-copper-400 bg-copper-50' : 'border-porcelain-300'}`}>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={esPedido}
                onChange={(e) => setEsPedido(e.target.checked)}
                className="h-4 w-4 accent-copper-500"
              />
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Package size={15} className={esPedido ? 'text-copper-600' : 'text-muted'} />
                Es un pedido por entregar
              </span>
            </label>
            {esPedido && (
              <div className="mt-2.5">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Fecha de entrega
                </label>
                <input
                  type="date"
                  value={fechaEntrega}
                  onChange={(e) => setFechaEntrega(e.target.value)}
                  className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
                />
                <p className="mt-1.5 text-[11px] text-muted">
                  Aparecera en Pedidos y en el Dashboard hasta que lo marques como entregado.
                </p>
              </div>
            )}
          </div>
        </div>

        <Button
          disabled={cart.length === 0 || (metodoPago === 'CREDITO' && !selectedClientId) || createSale.isPending}
          onClick={() => createSale.mutate()}
          className="w-full"
        >
          {createSale.isPending ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
          Cobrar {formatMoney(totals.total)}
        </Button>
      </Card>
    </div>
  );
}

export function InvoicePreview({
  sale: saleInicial,
  onNewSale,
}: {
  sale: Sale;
  onNewSale: () => void;
}) {
  // Tras encolar el envío, la factura pasa por EN_COLA → ENVIADA/ERROR en
  // segundo plano. Se refresca la venta cada 4s mientras esté en cola para
  // que el cajero vea el resultado sin recargar.
  const { data: sale = saleInicial } = useQuery<Sale>({
    queryKey: ['sale', saleInicial.id],
    queryFn: () => salesApi.get(saleInicial.id),
    initialData: saleInicial,
    refetchInterval: (query) =>
      query.state.data?.invoice?.whatsappEstado === 'EN_COLA' ? 4000 : false,
  });

  const queryClient = useQueryClient();
  const png = sale.invoice?.pngUrl;
  const waEstado = sale.invoice?.whatsappEstado;

  const sendWhatsapp = useMutation({
    mutationFn: (pestanaRespaldo: Window | null) => salesApi.sendWhatsapp(sale.id, { skipErrorToast: true }),
    onSuccess: async (resultado, pestanaRespaldo) => {
      if (esEnvioDirecto(resultado)) {
        await enviarWhatsappDesdeCelular(resultado, pestanaRespaldo);
        return;
      }
      pestanaRespaldo?.close();
      queryClient.setQueryData<Sale>(['sale', sale.id], (prev) =>
        prev ? { ...prev, invoice: { ...prev.invoice, ...resultado } } : prev,
      );
      queryClient.invalidateQueries({ queryKey: ['sale', sale.id] });
      toast.success('En cola de envío. Se enviará por WhatsApp en unos segundos.');
    },
    onError: (error: any, pestanaRespaldo) => {
      pestanaRespaldo?.close();
      toast.error(error?.response?.data?.message ?? 'No se pudo poner la factura en cola.');
    },
  });

  return (
    <div className="mx-auto max-w-md">
      <Card className="overflow-hidden">
        <div className="bg-sage-100 px-5 py-4 text-center">
          <p className="font-display text-sm font-bold text-sage-600">Venta registrada &middot; {sale.invoice?.numero}</p>
        </div>
        <div className="p-5">
          <FacturaImagen pngUrl={png} className="mx-auto max-h-[60vh]" />
          <div className="receipt-edge mt-0" />
        </div>

        {waEstado && (
          <div className="px-5">
            {waEstado === 'EN_COLA' && (
              <p className="flex items-center gap-2 rounded-lg bg-copper-50 px-3 py-2 text-sm text-copper-700">
                <Loader2 size={15} className="animate-spin" /> En cola de envío por WhatsApp…
              </p>
            )}
            {waEstado === 'ENVIADA' && (
              <p className="flex items-center gap-2 rounded-lg bg-sage-100 px-3 py-2 text-sm font-medium text-sage-700">
                <Check size={15} /> Enviada por WhatsApp
              </p>
            )}
            {waEstado === 'ERROR' && (
              <p className="rounded-lg bg-brick-100 px-3 py-2 text-sm text-brick-700">
                No se pudo enviar: {sale.invoice?.ultimoError ?? 'error desconocido'}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 p-5">
          {sale.client?.telefono ? (
            <Button
              className="w-full"
              onClick={() => sendWhatsapp.mutate(abrirPestanaRespaldoSiHaceFalta())}
              disabled={sendWhatsapp.isPending || waEstado === 'EN_COLA'}
            >
              {sendWhatsapp.isPending ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
              {waEstado === 'EN_COLA'
                ? 'En cola…'
                : waEstado === 'ENVIADA'
                  ? 'Enviar de nuevo por WhatsApp'
                  : waEstado === 'ERROR'
                    ? 'Reintentar envío por WhatsApp'
                    : 'Enviar por WhatsApp'}
            </Button>
          ) : (
            <Button className="w-full" disabled>
              <MessageCircle size={16} /> Sin telefono de cliente
            </Button>
          )}
          <Button variant="secondary" className="w-full" onClick={onNewSale}>
            <X size={16} />
            Nueva venta
          </Button>
        </div>
      </Card>
    </div>
  );
}
