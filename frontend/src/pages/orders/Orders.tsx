import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  PackageCheck,
  Package,
  Truck,
  CalendarClock,
  AlertTriangle,
  X,
  Phone,
  Globe,
  ClipboardPaste,
  Check,
  Ban,
  Trash2,
  Loader2,
  Receipt,
  Copy,
} from 'lucide-react';
import { ordersApi } from '../../api/orders.api';
import { usePersistedState } from '../../lib/usePersistedState';
import { formatMoney, formatDateTime, ESTADO_PEDIDO_LABEL, ESTADO_PEDIDO_WEB_LABEL, METODO_PAGO_LABEL } from '../../lib/format';
import { Button, Card, PageHeader, Badge, EmptyState, ConfirmPasswordModal, Skeleton } from '../../components/ui';
import { useAuthStore } from '../../store/auth.store';
import { InvoicePreview } from '../pos/POS';
import { ClientPicker } from '../../components/ClientPicker';
import type { Client, EstadoPedido, EstadoPedidoWeb, MetodoPago, Order, Sale, UrgenciaPedido, WebOrder } from '../../types';

const METODOS_ATENDER: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CREDITO', 'OTRO'];

/** Color e etiqueta de cada nivel de urgencia (lo calcula el backend). */
const URGENCIA: Record<UrgenciaPedido, { tone: 'brick' | 'copper' | 'sage' | 'neutral'; texto: string }> = {
  ATRASADO: { tone: 'brick', texto: 'Atrasado' },
  HOY: { tone: 'copper', texto: 'Entrega hoy' },
  PROXIMO: { tone: 'sage', texto: 'Programado' },
  SIN_FECHA: { tone: 'neutral', texto: 'Sin fecha' },
};

const FILTROS: { valor: EstadoPedido | 'TODOS'; texto: string }[] = [
  { valor: 'TODOS', texto: 'Todos' },
  { valor: 'PENDIENTE', texto: 'Pendientes' },
  { valor: 'EMPACADO', texto: 'Empacados' },
];

const PESTANAS: { valor: 'TIENDA' | 'WEB'; texto: string }[] = [
  { valor: 'TIENDA', texto: 'Pedidos' },
  { valor: 'WEB', texto: 'Pedidos web' },
];

export default function Orders() {
  // useState normal, no usePersistedState: la pestaña por defecto debe ser
  // siempre "Pedidos web" CADA VEZ que se entra a esta pagina, no la ultima
  // que se dejo seleccionada (eso es lo que pedia recordar una preferencia
  // guardada de una sesion anterior habria seguido abriendo en "Pedidos").
  const [pestana, setPestana] = useState<'TIENDA' | 'WEB'>('WEB');

  return (
    <div>
      <PageHeader
        title="Pedidos"
        subtitle="Piezas comprometidas que todavia no estan en manos del cliente"
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {PESTANAS.map((p) => (
          <button
            key={p.valor}
            onClick={() => setPestana(p.valor)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              pestana === p.valor ? 'bg-espresso-700 text-white' : 'bg-porcelain-200 text-muted hover:bg-porcelain-300'
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {pestana === 'TIENDA' ? <PedidosTienda /> : <PedidosWeb />}
    </div>
  );
}

function PedidosTienda() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [filtro, setFiltro] = usePersistedState<EstadoPedido | 'TODOS'>('pedidos:filtro', 'TODOS');
  const [entregando, setEntregando] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['orders', filtro],
    queryFn: () => ordersApi.list(filtro),
  });

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const actualizar = useMutation({
    mutationFn: ({ id, cambios }: { id: string; cambios: Record<string, unknown> }) =>
      ordersApi.update(id, cambios),
    onSuccess: (_data, variables) => {
      if (variables.cambios.estado === 'ENTREGADO') {
        toast.success('Pedido entregado. La factura queda como registro de la venta.');
        setEntregando(null);
      } else {
        toast.success('Pedido actualizado.');
      }
      refrescar();
    },
  });

  const cancelar = useMutation({
    mutationFn: (id: string) => ordersApi.cancel(id),
    onSuccess: () => {
      toast.success('Pedido cancelado. La venta y su factura no se tocaron.');
      refrescar();
    },
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtro === f.valor ? 'bg-copper-500 text-white' : 'bg-porcelain-200 text-muted hover:bg-porcelain-300'
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Sin pedidos por entregar"
          description="Al cobrar en el punto de venta puedes marcar la venta como pedido y ponerle fecha de entrega."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const urgencia = URGENCIA[order.urgencia];
            return (
              <Card
                key={order.id}
                className={`p-4 ${order.urgencia === 'ATRASADO' ? 'border-brick-500' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge tone={order.estado === 'EMPACADO' ? 'sage' : 'copper'}>
                        {ESTADO_PEDIDO_LABEL[order.estado]}
                      </Badge>
                      <Badge tone={urgencia.tone}>
                        {order.urgencia === 'ATRASADO' && <AlertTriangle size={11} className="mr-1" />}
                        {urgencia.texto}
                      </Badge>
                      {order.sale?.invoice && (
                        <span className="font-mono text-[11px] text-muted">{order.sale.invoice.numero}</span>
                      )}
                    </div>

                    <p className="font-display font-bold text-ink">
                      {order.sale?.client?.nombre ?? 'Consumidor final'}
                    </p>
                    {order.sale?.client?.telefono && (
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <Phone size={11} /> {order.sale.client.telefono}
                      </p>
                    )}

                    <ul className="mt-2 space-y-0.5 text-sm text-ink">
                      {order.sale?.items.map((item) => (
                        <li key={item.id}>
                          {item.cantidad} x {item.descripcion}
                        </li>
                      ))}
                    </ul>

                    {order.notas && <p className="mt-2 text-xs italic text-muted">Nota: {order.notas}</p>}
                  </div>

                  <div className="text-right">
                    <p className="font-display text-lg font-bold tabular-nums text-copper-600">
                      {formatMoney(order.sale?.total ?? 0)}
                    </p>
                    <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Fecha de entrega
                    </label>
                    <input
                      type="date"
                      value={order.fechaEntrega ? order.fechaEntrega.slice(0, 10) : ''}
                      onChange={(e) =>
                        actualizar.mutate({ id: order.id, cambios: { fechaEntrega: e.target.value || undefined } })
                      }
                      className="rounded-lg border border-porcelain-300 px-2 py-1 text-sm outline-none focus:border-copper-500"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-porcelain-200 pt-3">
                  {order.estado === 'PENDIENTE' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => actualizar.mutate({ id: order.id, cambios: { estado: 'EMPACADO' } })}
                      disabled={actualizar.isPending}
                    >
                      <Package size={15} /> Marcar empacado
                    </Button>
                  )}
                  {order.estado === 'EMPACADO' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => actualizar.mutate({ id: order.id, cambios: { estado: 'PENDIENTE' } })}
                      disabled={actualizar.isPending}
                    >
                      Volver a pendiente
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setEntregando(order)} disabled={actualizar.isPending}>
                    <Truck size={15} /> Entregar
                  </Button>
                  {user?.role === 'ADMIN' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelar.mutate(order.id)}
                      disabled={cancelar.isPending}
                    >
                      Cancelar pedido
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {entregando && (
        <ConfirmarEntrega
          order={entregando}
          isPending={actualizar.isPending}
          onClose={() => setEntregando(null)}
          onConfirm={() => actualizar.mutate({ id: entregando.id, cambios: { estado: 'ENTREGADO' } })}
        />
      )}
    </div>
  );
}

/**
 * Entregar borra el pedido (queda solo la factura), asi que se confirma antes:
 * no hay forma de "des-entregar" desde la interfaz.
 */
function ConfirmarEntrega({
  order,
  isPending,
  onClose,
  onConfirm,
}: {
  order: Order;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[90vh] w-full max-w-sm overflow-hidden">
        <div className="max-h-[90vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display font-bold text-ink">Confirmar entrega</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-sage-100 p-3 text-sage-700">
          <PackageCheck size={18} className="mt-0.5 shrink-0" />
          <p className="text-sm">
            El pedido de <strong>{order.sale?.client?.nombre ?? 'consumidor final'}</strong> sale del listado y
            la factura {order.sale?.invoice?.numero ?? ''} queda como el registro de la venta.
          </p>
        </div>

        <p className="mb-4 text-xs text-muted">
          Esto no se puede deshacer desde aqui: si te equivocas, tendras que crear el pedido de nuevo.
        </p>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={isPending}>
            <CalendarClock size={15} /> {isPending ? 'Entregando...' : 'Si, entregado'}
          </Button>
        </div>
        </div>
      </Card>
    </div>
  );
}

const FILTROS_WEB: { valor: EstadoPedidoWeb | 'TODOS'; texto: string }[] = [
  { valor: 'PENDIENTE', texto: 'Por atender' },
  { valor: 'ATENDIDO', texto: 'Atendidos' },
  { valor: 'CANCELADO', texto: 'Cancelados' },
  { valor: 'TODOS', texto: 'Todos' },
];

/**
 * Pedidos que llegan del catalogo web. La pagina no pide datos del cliente a
 * proposito, asi que no hay forma de que caigan solos: el cliente manda el
 * pedido por WhatsApp con su codigo (ej. PED-K3F7Q2) y ese mismo mensaje se
 * pega aqui para crearlo, sin volver a escribir nada a mano.
 */
function PedidosWeb() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = usePersistedState<EstadoPedidoWeb | 'TODOS'>('pedidos-web:filtro', 'PENDIENTE');
  const [texto, setTexto] = useState('');
  const [atendiendo, setAtendiendo] = useState<WebOrder | null>(null);
  const [aEliminar, setAEliminar] = useState<WebOrder | null>(null);

  const { data: pedidos = [], isLoading } = useQuery<WebOrder[]>({
    queryKey: ['web-orders', filtro],
    queryFn: () => ordersApi.listWeb(filtro),
  });

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['web-orders'] });
    // "Atender" un pedido crea una venta de verdad: tambien hay que
    // refrescar todo lo que eso mueve (stock, pedidos por entregar, dashboard).
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }

  const crear = useMutation({
    mutationFn: (mensaje: string) => ordersApi.createWeb(mensaje),
    onSuccess: (pedido) => {
      toast.success(`Pedido ${pedido.codigo} creado.`);
      setTexto('');
      refrescar();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'No se pudo crear el pedido.');
    },
  });

  const actualizar = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoPedidoWeb }) => ordersApi.updateWeb(id, estado),
    onSuccess: () => {
      toast.success('Pedido actualizado.');
      refrescar();
    },
  });

  const eliminar = useMutation({
    mutationFn: (password: string) => ordersApi.deleteWeb(aEliminar!.id, password),
    onSuccess: () => {
      toast.success('Pedido eliminado.');
      setAEliminar(null);
      refrescar();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo eliminar el pedido.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  return (
    <div>
      <Card className="mb-5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <ClipboardPaste size={16} className="text-espresso-700" />
          <p className="font-display font-bold text-ink">Pegar pedido de WhatsApp</p>
        </div>
        <p className="mb-3 text-xs text-muted">
          Copia el mensaje que el cliente mando desde el catalogo web (trae su numero de pedido) y pegalo aqui para
          crearlo.
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'Hola! Quiero hacer este pedido #PED-XXXXX:\n\n1 x Anillo oro (AN-0001) - RD$ 3,000.00\n\nTotal: RD$ 3,000.00'}
          rows={4}
          className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            onClick={() => texto.trim() && crear.mutate(texto)}
            disabled={crear.isPending || !texto.trim()}
          >
            <ClipboardPaste size={15} /> {crear.isPending ? 'Creando...' : 'Crear pedido'}
          </Button>
        </div>
      </Card>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTROS_WEB.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtro === f.valor ? 'bg-copper-500 text-white' : 'bg-porcelain-200 text-muted hover:bg-porcelain-300'
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton />
      ) : pedidos.length === 0 ? (
        <EmptyState
          title="Sin pedidos web"
          description="La pagina no pide datos del cliente: cuando te escriban por WhatsApp con su numero de pedido, pega el mensaje arriba."
        />
      ) : (
        <div className="space-y-3">
          {pedidos.map((pedido) => (
            <Card key={pedido.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <Badge
                      tone={pedido.estado === 'ATENDIDO' ? 'sage' : pedido.estado === 'CANCELADO' ? 'brick' : 'copper'}
                    >
                      {ESTADO_PEDIDO_WEB_LABEL[pedido.estado]}
                    </Badge>
                    <span className="flex items-center gap-1 font-mono text-xs text-muted">
                      <Globe size={11} /> {pedido.codigo}
                    </span>
                  </div>

                  <ul className="mt-1 space-y-0.5 text-sm text-ink">
                    {pedido.items.map((item, i) => (
                      <li key={i}>
                        {item.cantidad} x {item.nombre}
                        {item.sku && <span className="text-muted"> ({item.sku})</span>} - {formatMoney(item.total)}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-2 text-[11px] text-muted">{formatDateTime(pedido.createdAt)}</p>
                </div>

                <p className="font-display text-lg font-bold tabular-nums text-copper-600">
                  {formatMoney(pedido.total)}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-porcelain-200 pt-3">
                {pedido.estado === 'PENDIENTE' ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setAtendiendo(pedido)}>
                      <Check size={15} /> Marcar atendido
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => actualizar.mutate({ id: pedido.id, estado: 'CANCELADO' })}
                      disabled={actualizar.isPending}
                    >
                      <Ban size={15} /> Cancelar
                    </Button>
                  </>
                ) : pedido.estado === 'CANCELADO' ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => actualizar.mutate({ id: pedido.id, estado: 'PENDIENTE' })}
                    disabled={actualizar.isPending}
                  >
                    Volver a pendiente
                  </Button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-sage-600">
                    <Receipt size={13} /> Convertido en venta
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={() => setAEliminar(pedido)}>
                  <Trash2 size={15} /> Eliminar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {atendiendo && (
        <AtenderPedidoWebModal
          pedido={atendiendo}
          onClose={() => setAtendiendo(null)}
          onAtendido={() => {
            setAtendiendo(null);
            refrescar();
          }}
        />
      )}

      {aEliminar && (
        <ConfirmPasswordModal
          titulo="Eliminar pedido"
          mensaje={
            <>
              Se eliminara el pedido {aEliminar.codigo} por {formatMoney(aEliminar.total)}.
            </>
          }
          pendiente={eliminar.isPending}
          onConfirm={(password) => eliminar.mutate(password)}
          onClose={() => setAEliminar(null)}
        />
      )}
    </div>
  );
}

/**
 * "Atender" un pedido web es convertirlo en una venta real: mismo panel que
 * el punto de venta (cliente, metodo de pago, si es pedido por entregar),
 * pero con los items fijos - son los que el cliente pidio por WhatsApp, no
 * se arman aqui. Al confirmar, el pedido queda ATENDIDO y enlazado a la
 * factura que se genera.
 */
function AtenderPedidoWebModal({
  pedido,
  onClose,
  onAtendido,
}: {
  pedido: WebOrder;
  onClose: () => void;
  onAtendido: () => void;
}) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [esPedido, setEsPedido] = useState(false);
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [descuentoPct, setDescuentoPct] = useState('');
  const [facturaCreada, setFacturaCreada] = useState<Sale | null>(null);

  const descuento = Math.min(100, Math.max(0, Number(descuentoPct) || 0));
  const totalConDescuento = Math.round(pedido.total * (1 - descuento / 100) * 100) / 100;

  const atender = useMutation({
    mutationFn: () =>
      ordersApi.atenderWeb(pedido.id, {
        clientId: selectedClient?.id,
        metodoPago,
        fechaVencimiento: metodoPago === 'CREDITO' && fechaVencimiento ? fechaVencimiento : undefined,
        esPedido: esPedido || undefined,
        fechaEntrega: esPedido && fechaEntrega ? fechaEntrega : undefined,
        descuentoPct: descuento || undefined,
      }),
    onSuccess: (sale) => {
      toast.success(esPedido ? 'Factura creada y agregada a Pedidos.' : 'Factura creada.');
      setFacturaCreada(sale);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'No se pudo crear la factura.');
    },
  });

  if (facturaCreada) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
        <div className="w-full max-w-md">
          <InvoicePreview sale={facturaCreada} onNewSale={onAtendido} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden">
        <div className="max-h-[90vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display font-bold text-ink">
            Atender {pedido.codigo}
            <CopiarCodigo codigo={pedido.codigo} />
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 space-y-1 rounded-lg bg-porcelain-100 p-3 text-sm">
          {pedido.items.map((item, i) => (
            <div key={i} className="flex justify-between text-ink">
              <span>
                {item.cantidad} x {item.nombre}
              </span>
              <span className="tabular-nums">{formatMoney(item.total)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-porcelain-300 pt-1 text-ink">
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
                className="w-14 appearance-none rounded border border-porcelain-300 px-1.5 py-0.5 text-right text-xs outline-none [appearance:textfield] focus:border-copper-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-xs">%</span>
            </div>
          </div>
          <div className="flex justify-between font-display font-bold text-copper-600">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(totalConDescuento)}</span>
          </div>
        </div>

        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Metodo de pago</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {METODOS_ATENDER.map((m) => (
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
          <ClientPicker client={selectedClient} onChange={setSelectedClient} required={metodoPago === 'CREDITO'} />

          {metodoPago === 'CREDITO' && (
            <input
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
            />
          )}

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
              </div>
            )}
          </div>
        </div>

        <Button
          disabled={(metodoPago === 'CREDITO' && !selectedClient) || atender.isPending}
          onClick={() => atender.mutate()}
          className="w-full"
        >
          {atender.isPending ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
          Crear factura {formatMoney(totalConDescuento)}
        </Button>
        </div>
      </Card>
    </div>
  );
}

/** Boton chiquito para copiar el numero de pedido - el cliente lo va a pedir por telefono o WhatsApp seguido. */
function CopiarCodigo({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(codigo);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        } catch {
          toast.error('No se pudo copiar. Copia el codigo a mano.');
        }
      }}
      title="Copiar numero de pedido"
      className="rounded p-1 text-muted transition-colors hover:bg-porcelain-200 hover:text-copper-600"
    >
      {copiado ? <Check size={14} className="text-sage-600" /> : <Copy size={14} />}
    </button>
  );
}
