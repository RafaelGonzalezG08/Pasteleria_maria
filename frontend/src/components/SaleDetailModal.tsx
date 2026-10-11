import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, CreditCard, Banknote, Pencil, Trash2, Search, UserRound, Loader2 } from 'lucide-react';
import { salesApi } from '../api/sales.api';
import { clientsApi } from '../api/clients.api';
import { usePersistedState, limpiarBorrador } from '../lib/usePersistedState';
import { formatMoney, formatDateTime, METODO_PAGO_LABEL } from '../lib/format';
import { Card, Button, Skeleton } from './ui';
import { FacturaImagen } from './FacturaImagen';
import { useAuthStore } from '../store/auth.store';
import type { Client, Sale } from '../types';

/**
 * Detalle completo de una venta (piezas, totales, factura), con edicion y
 * borrado para ADMIN. Se usa tanto en Ventas como en el historial de compras
 * de un cliente -- siempre trae los datos frescos con GET /sales/:id, para
 * no depender de que quien lo abre ya tenga items/factura cargados.
 */
export function SaleDetailModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { user } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: sale, isLoading } = useQuery<Sale>({
    queryKey: ['sale', saleId],
    queryFn: () => salesApi.get(saleId),
  });

  if (editing && sale) {
    return <EditSaleModal sale={sale} onClose={() => setEditing(false)} onDone={onClose} />;
  }

  if (deleting && sale) {
    return <DeleteSaleModal sale={sale} onClose={() => setDeleting(false)} onDone={onClose} />;
  }

  if (isLoading || !sale) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
        <Card className="w-full max-w-md p-5">
          <Skeleton className="h-64" />
        </Card>
      </div>
    );
  }

  const esCredito = sale.metodoPago === 'CREDITO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[85vh] w-full max-w-md overflow-hidden">
        <div className="max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-porcelain-200 p-5">
          <div>
            <p className="font-display font-bold text-ink">{sale.invoice?.numero ?? 'Venta'}</p>
            <p className="text-xs text-muted">{formatDateTime(sale.fecha)}</p>
          </div>
          <div className="flex items-center gap-1">
            {user?.role === 'ADMIN' && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg p-1.5 text-muted hover:bg-porcelain-200"
                  title="Corregir factura (requiere clave de administrador)"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeleting(true)}
                  className="rounded-lg p-1.5 text-brick-500 hover:bg-brick-100"
                  title="Eliminar factura (requiere clave de administrador)"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* Metodo de pago bien visible: contado o credito */}
          <div
            className={`mb-4 flex items-center gap-2.5 rounded-lg p-3 ${
              esCredito ? 'bg-brick-100 text-brick-600' : 'bg-sage-100 text-sage-600'
            }`}
          >
            {esCredito ? <CreditCard size={18} /> : <Banknote size={18} />}
            <div>
              <p className="text-sm font-bold">
                {esCredito ? 'Venta a credito' : `Venta de contado (${METODO_PAGO_LABEL[sale.metodoPago]})`}
              </p>
              {esCredito && <p className="text-xs opacity-80">El cliente debe el total de esta factura.</p>}
            </div>
          </div>

          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Cliente</p>
          <p className="mb-4 text-sm text-ink">{sale.client?.nombre ?? 'Consumidor final'}</p>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Piezas seleccionadas</p>
          <div className="mb-4 divide-y divide-porcelain-200 rounded-lg border border-porcelain-200">
            {sale.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <p className="text-ink">{item.descripcion}</p>
                  <p className="text-xs text-muted">
                    {item.cantidad} x {formatMoney(item.precioUnitario)}
                  </p>
                </div>
                <p className="font-display font-semibold tabular-nums text-ink">{formatMoney(item.total)}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-t border-porcelain-200 pt-3 text-sm tabular-nums">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span>{formatMoney(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Impuestos</span>
              <span>{formatMoney(sale.impuestos)}</span>
            </div>
            <div className="flex justify-between font-display text-lg font-bold text-copper-600">
              <span>Total</span>
              <span>{formatMoney(sale.total)}</span>
            </div>
          </div>

          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Factura</p>
          <FacturaImagen pngUrl={sale.invoice?.pngUrl} className="mx-auto max-h-96" />
        </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Eliminar una factura. Pide la clave del admin igual que corregirla, porque
 * mueve inventario, reportes y posiblemente una deuda del cliente.
 */
function DeleteSaleModal({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [adminPassword, setAdminPassword] = useState('');

  const piezasDevueltas = sale.items.filter((i) => i.productId);

  const deleteSale = useMutation({
    mutationFn: () => salesApi.delete(sale.id, adminPassword),
    onSuccess: () => {
      toast.success('Factura eliminada. Las piezas volvieron al inventario.');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-debts'] });
      onDone();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo eliminar la factura.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[90vh] w-full max-w-sm overflow-hidden">
        <div className="max-h-[90vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display font-bold text-ink">Eliminar {sale.invoice?.numero ?? 'factura'}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 rounded-lg bg-brick-100 p-3 text-brick-700">
          <p className="text-sm font-semibold">Esto no se puede deshacer.</p>
          <p className="mt-1 text-xs">
            Se borra la venta, su factura y los abonos registrados. Si era una venta a credito, tambien se
            elimina la deuda del cliente.
          </p>
        </div>

        {piezasDevueltas.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Vuelven al inventario
            </p>
            <ul className="space-y-0.5 text-sm text-ink">
              {piezasDevueltas.map((item) => (
                <li key={item.id}>
                  + {item.cantidad} &times; {item.descripcion}
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Clave de administrador
        </label>
        <input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="Confirma tu clave para eliminar"
          className="mb-4 w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
        />

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={!adminPassword || deleteSale.isPending}
            onClick={() => deleteSale.mutate()}
          >
            {deleteSale.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {deleteSale.isPending ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </div>
        </div>
      </Card>
    </div>
  );
}

interface EditableLine {
  productId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

function EditSaleModal({ sale, onClose, onDone }: { sale: Sale; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  // La correccion a medias se guarda por factura (cada una lleva su propia
  // clave), asi cerrar el modal sin querer no obliga a rehacer los ajustes.
  const [lines, setLines] = usePersistedState<EditableLine[]>(
    `factura:corregir:${sale.id}`,
    sale.items.map((i) => ({
      productId: i.productId ?? undefined,
      descripcion: i.descripcion,
      // Los Decimal de Prisma llegan como string por JSON (ej. "650.00"); si no se
      // normalizan aqui, una linea que el usuario nunca toca (p.ej. porque solo
      // borro otra) se manda como string y el backend la rechaza al validar.
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precioUnitario),
    })),
  );
  // La clave de administrador NUNCA se persiste: los borradores quedan en el
  // disco de la PC en texto plano. Se vuelve a pedir siempre.
  const [adminPassword, setAdminPassword] = useState('');

  // El cliente de la factura SI se puede corregir (se eligio al equivocado, o
  // se cobro sin elegir ninguno). A diferencia de las lineas, no se persiste
  // como borrador: arranca siempre del cliente real que tiene la venta hoy,
  // para no re-aplicar en silencio un cambio a medias de otra sesion.
  const [cliente, setCliente] = useState<Client | null>(sale.client ?? null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const { data: clientes = [] } = useQuery<Client[]>({
    queryKey: ['clients', clientSearch],
    queryFn: () => clientsApi.search(clientSearch),
    enabled: buscandoCliente,
  });

  // Misma regla que en el backend: sin cliente no hay a quien cobrarle la deuda.
  const faltaCliente = sale.metodoPago === 'CREDITO' && !cliente;

  const subtotal = lines.reduce((sum, l) => sum + l.cantidad * l.precioUnitario, 0);

  function updateLine(index: number, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const saveEdit = useMutation({
    mutationFn: () => {
      if (lines.length === 0) throw new Error('La factura debe tener al menos un producto.');
      return salesApi.edit(sale.id, {
        adminPassword,
        // null = consumidor final. Se manda siempre (no solo si cambio) para
        // que el backend no tenga que adivinar la intencion.
        clientId: cliente?.id ?? null,
        items: lines.map((l) => ({
          productId: l.productId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
        })),
      });
    },
    onSuccess: () => {
      toast.success('Factura corregida y regenerada.');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // Cambiar el cliente mueve el historial de compras y, si era a credito,
      // a quien le aparece la deuda en Cobros.
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-debts'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      limpiarBorrador(`factura:corregir:${sale.id}`);
      onDone();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo corregir la factura.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[85vh] w-full max-w-md overflow-hidden">
        <div className="max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-porcelain-200 p-5">
          <div>
            <p className="font-display font-bold text-ink">Corregir {sale.invoice?.numero ?? 'factura'}</p>
            <p className="text-xs text-muted">Cambia el cliente, ajusta cantidad/precio o quita una linea.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 p-5">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Cliente</label>
          <div className="flex items-center gap-2 rounded-lg border border-porcelain-200 p-2.5">
            <UserRound size={16} className={cliente ? 'text-sage-600' : 'text-muted'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{cliente?.nombre ?? 'Consumidor final'}</p>
              {cliente?.telefono && <p className="truncate text-xs text-muted">{cliente.telefono}</p>}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setBuscandoCliente((abierto) => !abierto)}>
              {buscandoCliente ? 'Cerrar' : 'Cambiar'}
            </Button>
            {cliente && (
              <button
                onClick={() => setCliente(null)}
                className="rounded-lg p-1.5 text-brick-500 hover:bg-brick-100"
                title="Dejar la factura como consumidor final"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {buscandoCliente && (
            <div className="rounded-lg border border-porcelain-200 p-2.5">
              <div className="buscador mb-2 !py-1.5">
                <Search size={14} className="shrink-0 text-muted" />
                <input
                  autoFocus
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Buscar por nombre, telefono o correo..."
                />
              </div>
              <div className="max-h-40 divide-y divide-porcelain-200 overflow-y-auto">
                {clientes.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted">
                    {clientSearch ? 'Sin resultados.' : 'Escribe para buscar un cliente.'}
                  </p>
                ) : (
                  clientes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCliente(c);
                        setBuscandoCliente(false);
                        setClientSearch('');
                      }}
                      className="flex w-full items-center justify-between px-2 py-2 text-left text-sm hover:bg-porcelain-100"
                    >
                      <span className="truncate text-ink">{c.nombre}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted">{c.telefono}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {faltaCliente && (
            <p className="text-xs text-brick-600">
              Esta es una venta a credito: tiene que quedar a nombre de un cliente, porque es quien debe el dinero.
            </p>
          )}

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">Piezas</p>
          {lines.map((line, index) => (
            // El nombre va en su propia fila arriba: al lado de dos inputs de
            // numero (cantidad, precio) casi no le quedaba espacio y quedaba
            // truncado casi por completo.
            <div key={index} className="rounded-lg border border-porcelain-200 p-2.5">
              <p className="mb-2 text-sm text-ink">{line.descripcion}</p>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={line.cantidad}
                    onChange={(e) => updateLine(index, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                    className="w-full rounded-lg border border-porcelain-300 px-2 py-1 text-right text-sm outline-none focus:border-copper-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Precio
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.precioUnitario}
                    onChange={(e) => updateLine(index, { precioUnitario: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-full rounded-lg border border-porcelain-300 px-2 py-1 text-right text-sm outline-none focus:border-copper-500"
                  />
                </div>
                <button
                  onClick={() => removeLine(index)}
                  className="mt-3.5 shrink-0 rounded-lg p-1.5 text-brick-500 hover:bg-brick-100"
                  title="Quitar esta linea"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex justify-between border-t border-porcelain-200 pt-3 text-sm font-semibold text-ink">
            <span>Nuevo subtotal</span>
            <span>{formatMoney(Math.round(subtotal * 100) / 100)}</span>
          </div>
          <p className="text-xs text-muted">
            Los impuestos y el total se recalculan automaticamente con la tasa configurada, y la factura (PNG/PDF) se
            regenera al guardar con el cliente y las lineas que queden.
          </p>

          <div className="pt-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Clave de administrador
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Confirma tu clave para guardar la correccion"
              className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
            />
          </div>

          <Button
            className="w-full"
            disabled={saveEdit.isPending || !adminPassword || lines.length === 0 || faltaCliente}
            onClick={() => saveEdit.mutate()}
          >
            {saveEdit.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
            {saveEdit.isPending ? 'Guardando...' : 'Guardar correccion'}
          </Button>
        </div>
        </div>
      </Card>
    </div>
  );
}
