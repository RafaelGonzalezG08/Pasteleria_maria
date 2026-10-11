import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Ban,
  Banknote,
  CakeSlice,
  CheckCircle2,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Printer,
  Receipt,
  Trash2,
  Truck,
} from 'lucide-react';
import { encargosApi } from '../../api/encargos.api';
import { settingsApi } from '../../api/settings.api';
import { urlArchivo } from '../../lib/api';
import {
  ESTADO_ENCARGO_LABEL,
  formatDate,
  formatDateTime,
  formatMoney,
  METODO_PAGO_LABEL,
  TIPO_ENTREGA_LABEL,
} from '../../lib/format';
import { useAuthStore } from '../../store/auth.store';
import { Badge, Button, Card, Field, INPUT, Modal, Select, Skeleton } from '../../components/ui';
import { SaleDetailModal } from '../../components/SaleDetailModal';
import { EncargoForm } from './EncargoForm';
import { TONO_ESTADO, URGENCIA } from './estilos';
import type { BusinessProfile, Encargo, MetodoPago } from '../../types';

const METODOS_ABONO: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO'];

export function EncargoDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const esCaja = role === 'ADMIN' || role === 'CAJERO';
  const [editando, setEditando] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [verTicket, setVerTicket] = useState(false);
  const [verVenta, setVerVenta] = useState(false);
  const [abono, setAbono] = useState({ monto: '', metodo: 'EFECTIVO' as MetodoPago });

  const { data: e, isLoading } = useQuery<Encargo>({ queryKey: ['encargo', id], queryFn: () => encargosApi.get(id) });

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['encargo', id] });
    queryClient.invalidateQueries({ queryKey: ['encargos'] });
    queryClient.invalidateQueries({ queryKey: ['hoja-produccion'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  const cambiarEstado = useMutation({
    mutationFn: (estado: 'PENDIENTE' | 'EN_PRODUCCION' | 'LISTO') => encargosApi.cambiarEstado(id, estado),
    onSuccess: refrescar,
  });
  const pagar = useMutation({
    mutationFn: () => encargosApi.pagar(id, { monto: Number(abono.monto), metodo: abono.metodo }),
    onSuccess: () => {
      toast.success('Abono registrado.');
      setAbono((a) => ({ ...a, monto: '' }));
      refrescar();
    },
  });
  const eliminarPago = useMutation({
    mutationFn: (pagoId: string) => encargosApi.eliminarPago(pagoId),
    onSuccess: () => {
      toast.success('Abono eliminado.');
      refrescar();
    },
  });

  if (editando && e) return <EncargoForm encargo={e} onClose={() => setEditando(false)} />;
  if (verVenta && e?.sale) return <SaleDetailModal saleId={e.sale.id} onClose={() => setVerVenta(false)} />;

  const activo = e && ['PENDIENTE', 'EN_PRODUCCION', 'LISTO'].includes(e.estado);
  const urg = e ? URGENCIA[e.urgencia] : null;

  return (
    <Modal titulo={e ? `Encargo ${e.codigo}` : 'Encargo'} onClose={onClose} ancho="max-w-3xl">
      {isLoading || !e ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONO_ESTADO[e.estado]}>{ESTADO_ENCARGO_LABEL[e.estado]}</Badge>
            {urg && <Badge tone={urg.tone}>{urg.texto}</Badge>}
            <span className="text-sm text-muted">Entrega: {formatDateTime(e.fechaEntrega)}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setVerTicket(true)}>
                <Printer size={14} /> Ticket
              </Button>
              {activo && esCaja && (
                <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
                  <Pencil size={14} /> Editar
                </Button>
              )}
              {e.sale && (
                <Button size="sm" variant="secondary" onClick={() => setVerVenta(true)}>
                  <Receipt size={14} /> Ver factura {e.sale.invoice?.numero}
                </Button>
              )}
            </div>
          </div>

          {activo && (
            <div className="flex flex-wrap gap-2">
              {(['PENDIENTE', 'EN_PRODUCCION', 'LISTO'] as const).map((est) => (
                <button
                  key={est}
                  disabled={cambiarEstado.isPending}
                  onClick={() => cambiarEstado.mutate(est)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    e.estado === est ? 'bg-espresso-700 text-white' : 'bg-porcelain-200 text-muted hover:bg-porcelain-300'
                  }`}
                >
                  {ESTADO_ENCARGO_LABEL[est]}
                </button>
              ))}
              {esCaja && (
                <>
                  <Button size="sm" className="ml-auto" onClick={() => setEntregando(true)}>
                    <CheckCircle2 size={14} /> Entregar y cobrar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCancelando(true)}>
                    <Ban size={14} /> Cancelar
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4 text-sm">
              <p className="font-display font-semibold text-ink">{e.client.nombre}</p>
              <p className="mt-1 flex items-center gap-1.5 text-muted">
                <Phone size={13} /> {e.client.telefono}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-muted">
                <Truck size={13} /> {TIPO_ENTREGA_LABEL[e.tipoEntrega]}
              </p>
              {e.direccionEntrega && (
                <p className="mt-1 flex items-center gap-1.5 text-muted">
                  <MapPin size={13} /> {e.direccionEntrega}
                </p>
              )}
              {e.notas && <p className="mt-2 text-xs text-muted">Notas: {e.notas}</p>}
              {e.motivoCancelacion && <p className="mt-2 text-xs text-brick-600">Cancelado: {e.motivoCancelacion}</p>}
            </Card>
            <Card className="space-y-1 p-4 text-sm">
              <Fila label="Subtotal" valor={formatMoney(e.subtotal)} />
              {e.costoEnvio > 0 && <Fila label="Incluye envio" valor={formatMoney(e.costoEnvio)} />}
              {e.impuestos > 0 && <Fila label="Impuestos" valor={formatMoney(e.impuestos)} />}
              <Fila label="Total" valor={formatMoney(e.total)} fuerte />
              <Fila label="Pagado" valor={formatMoney(e.abonado)} />
              <Fila label="Saldo" valor={formatMoney(e.saldo)} fuerte tono={e.saldo > 0 ? 'text-brick-600' : 'text-sage-600'} />
            </Card>
          </div>

          <div>
            <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">Productos</h3>
            <div className="space-y-2">
              {e.items.map((i) => (
                <div key={i.id} className="flex gap-3 rounded-xl p-3 shadow-neu-inset">
                  {i.fotoReferenciaUrl ? (
                    <a href={urlArchivo(i.fotoReferenciaUrl)!} target="_blank" rel="noreferrer">
                      <img src={urlArchivo(i.fotoReferenciaUrl)!} alt="Referencia" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    </a>
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-porcelain-200">
                      <CakeSlice size={22} className="text-muted" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold text-ink">
                        {i.cantidad} × {i.descripcion}
                      </p>
                      <p className="shrink-0 tabular-nums text-ink">{formatMoney(i.total)}</p>
                    </div>
                    <div className="mt-1 grid gap-x-4 text-xs text-muted sm:grid-cols-2">
                      {i.tamano && <p>Tamaño: {i.tamano}</p>}
                      {i.sabor && <p>Sabor: {i.sabor}</p>}
                      {i.relleno && <p>Relleno: {i.relleno}</p>}
                      {i.decoracion && <p>Decoracion: {i.decoracion}</p>}
                    </div>
                    {i.mensaje && <p className="mt-1 text-xs font-semibold text-copper-700">Mensaje: “{i.mensaje}”</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">Anticipos y abonos</h3>
            {(e.pagos ?? []).length === 0 ? (
              <p className="text-sm text-muted">Sin pagos todavia.</p>
            ) : (
              <ul className="divide-y divide-porcelain-200 text-sm">
                {e.pagos!.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-muted">
                      {formatDate(p.fecha)} · {METODO_PAGO_LABEL[p.metodo]}
                      {p.nota ? ` · ${p.nota}` : ''}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-ink">{formatMoney(p.monto)}</span>
                      {activo && role === 'ADMIN' && (
                        <button onClick={() => eliminarPago.mutate(p.id)} className="rounded p-1 text-muted hover:text-brick-600" title="Eliminar abono">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {activo && esCaja && e.saldo > 0 && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Registrar abono" className="w-36">
                  <input type="number" min="0" step="0.01" value={abono.monto} onChange={(ev) => setAbono((a) => ({ ...a, monto: ev.target.value }))} className={INPUT} />
                </Field>
                <Select
                  className="w-40"
                  value={abono.metodo}
                  onChange={(v) => setAbono((a) => ({ ...a, metodo: v as MetodoPago }))}
                  options={METODOS_ABONO.map((m) => ({ value: m, label: METODO_PAGO_LABEL[m] }))}
                />
                <Button size="sm" disabled={!(Number(abono.monto) > 0) || pagar.isPending} onClick={() => pagar.mutate()}>
                  <Banknote size={14} /> Abonar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {entregando && e && <EntregarModal encargo={e} onClose={() => setEntregando(false)} onDone={refrescar} />}
      {cancelando && e && <CancelarModal encargo={e} onClose={() => setCancelando(false)} onDone={refrescar} />}
      {verTicket && e && <TicketEncargo encargo={e} onClose={() => setVerTicket(false)} />}
    </Modal>
  );
}

function Fila({ label, valor, fuerte, tono = 'text-ink' }: { label: string; valor: string; fuerte?: boolean; tono?: string }) {
  return (
    <div className={`flex justify-between ${fuerte ? 'font-semibold' : ''}`}>
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${tono}`}>{valor}</span>
    </div>
  );
}

function EntregarModal({ encargo, onClose, onDone }: { encargo: Encargo; onClose: () => void; onDone: () => void }) {
  const [monto, setMonto] = useState(String(encargo.saldo));
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [aCredito, setACredito] = useState(false);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const pago = Number(monto) || 0;
  const restante = Math.max(0, Math.round((encargo.saldo - pago) * 100) / 100);

  const entregar = useMutation({
    mutationFn: () =>
      encargosApi.entregar(encargo.id, {
        pagoFinal: pago > 0 ? { monto: pago, metodo } : undefined,
        dejarSaldoACredito: restante > 0 ? aCredito : undefined,
        fechaVencimiento: restante > 0 && aCredito && fechaVencimiento ? fechaVencimiento : undefined,
      }),
    onSuccess: () => {
      toast.success('Encargo entregado. Se creo la venta con su factura.');
      onDone();
      onClose();
    },
  });

  return (
    <Modal titulo="Entregar y cobrar" onClose={onClose} ancho="max-w-md">
      <div className="space-y-3 text-sm">
        <div className="rounded-lg p-3 shadow-neu-inset">
          <Fila label="Total" valor={formatMoney(encargo.total)} />
          <Fila label="Ya pagado" valor={formatMoney(encargo.abonado)} />
          <Fila label="Saldo" valor={formatMoney(encargo.saldo)} fuerte />
        </div>
        {encargo.saldo > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cobrar ahora">
              <input type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} className={INPUT} />
            </Field>
            <Field label="Metodo">
              <Select value={metodo} onChange={(v) => setMetodo(v as MetodoPago)} options={METODOS_ABONO.map((m) => ({ value: m, label: METODO_PAGO_LABEL[m] }))} />
            </Field>
          </div>
        )}
        {restante > 0 && (
          <div className="rounded-lg bg-copper-50 p-3 shadow-neu-inset">
            <label className="flex items-center gap-2 font-semibold text-ink">
              <input type="checkbox" checked={aCredito} onChange={(e) => setACredito(e.target.checked)} className="h-4 w-4 accent-copper-500" />
              Dejar {formatMoney(restante)} a credito
            </label>
            <p className="mt-1 text-xs text-muted">El saldo pasa a Cobros como cuenta por cobrar del cliente.</p>
            {aCredito && (
              <Field label="Fecha limite (opcional)" className="mt-2">
                <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className={INPUT} />
              </Field>
            )}
          </div>
        )}
        <Button
          className="w-full"
          disabled={entregar.isPending || pago > encargo.saldo + 0.001 || (restante > 0 && !aCredito)}
          onClick={() => entregar.mutate()}
        >
          {entregar.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          Confirmar entrega
        </Button>
      </div>
    </Modal>
  );
}

function CancelarModal({ encargo, onClose, onDone }: { encargo: Encargo; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState('');
  const cancelar = useMutation({
    mutationFn: () => encargosApi.cancelar(encargo.id, motivo || undefined),
    onSuccess: () => {
      toast.success('Encargo cancelado.');
      onDone();
      onClose();
    },
  });
  return (
    <Modal titulo="Cancelar encargo" onClose={onClose} ancho="max-w-sm">
      <div className="space-y-3 text-sm">
        {encargo.abonado > 0 && (
          <p className="rounded-lg bg-brick-100 p-3 text-brick-700 shadow-neu-inset">
            El cliente ya pago {formatMoney(encargo.abonado)}. Si se le devuelve, registralo en Gastos.
          </p>
        )}
        <Field label="Motivo">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} />
        </Field>
        <Button variant="danger" className="w-full" disabled={cancelar.isPending} onClick={() => cancelar.mutate()}>
          <Ban size={16} /> Cancelar encargo
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Comprobante imprimible del encargo (se le entrega al cliente al hacer el
 * pedido y sirve de hoja de trabajo). Se imprime solo esta zona: ver
 * .zona-impresion en index.css.
 */
function TicketEncargo({ encargo: e, onClose }: { encargo: Encargo; onClose: () => void }) {
  const { data: perfil } = useQuery<BusinessProfile>({
    queryKey: ['settings', 'business-profile'],
    queryFn: () => settingsApi.getBusinessProfile(),
    staleTime: 60_000,
  });
  return (
    <Modal titulo="Comprobante del encargo" onClose={onClose} ancho="max-w-md">
      <div className="zona-impresion mx-auto max-w-[340px] rounded-lg bg-porcelain-50 p-5 font-mono text-[12px] leading-snug text-black">
        <div className="text-center">
          <p className="text-base font-bold">{perfil?.nombre ?? 'Pastelería María'}</p>
          {perfil?.direccion && <p>{perfil.direccion}</p>}
          {perfil?.telefono && <p>Tel. {perfil.telefono}</p>}
          {perfil?.identifFiscal && <p>RNC {perfil.identifFiscal}</p>}
          <p className="mt-2 font-bold">COMPROBANTE DE ENCARGO</p>
          <p className="text-sm font-bold">{e.codigo}</p>
        </div>
        <hr className="my-2 border-dashed border-black/40" />
        <p>Cliente: {e.client.nombre}</p>
        <p>Tel.: {e.client.telefono}</p>
        <p>Entrega: {formatDateTime(e.fechaEntrega)}</p>
        <p>{TIPO_ENTREGA_LABEL[e.tipoEntrega]}</p>
        {e.direccionEntrega && <p>Dir.: {e.direccionEntrega}</p>}
        <hr className="my-2 border-dashed border-black/40" />
        {e.items.map((i) => (
          <div key={i.id} className="mb-1.5">
            <div className="flex justify-between gap-2">
              <span>
                {i.cantidad} x {i.descripcion}
              </span>
              <span>{formatMoney(i.total)}</span>
            </div>
            {[
              i.tamano && `Tamaño: ${i.tamano}`,
              i.sabor && `Sabor: ${i.sabor}`,
              i.relleno && `Relleno: ${i.relleno}`,
              i.decoracion && `Decoración: ${i.decoracion}`,
              i.mensaje && `Mensaje: "${i.mensaje}"`,
            ]
              .filter(Boolean)
              .map((t) => (
                <p key={t as string} className="pl-3">
                  {t}
                </p>
              ))}
          </div>
        ))}
        {e.costoEnvio > 0 && (
          <div className="flex justify-between">
            <span>Envío</span>
            <span>{formatMoney(e.costoEnvio)}</span>
          </div>
        )}
        <hr className="my-2 border-dashed border-black/40" />
        {e.impuestos > 0 && (
          <div className="flex justify-between">
            <span>{perfil?.nombreImpuesto ?? 'Impuestos'}</span>
            <span>{formatMoney(e.impuestos)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold">
          <span>TOTAL</span>
          <span>{formatMoney(e.total)}</span>
        </div>
        <div className="flex justify-between">
          <span>Pagado</span>
          <span>{formatMoney(e.abonado)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>SALDO</span>
          <span>{formatMoney(e.saldo)}</span>
        </div>
        {e.notas && <p className="mt-2">Notas: {e.notas}</p>}
        <p className="mt-3 text-center">Estado: {ESTADO_ENCARGO_LABEL[e.estado]}</p>
        <p className="text-center">¡Gracias por su preferencia!</p>
      </div>
      <Button className="mt-4 w-full" onClick={() => window.print()}>
        <Printer size={16} /> Imprimir
      </Button>
    </Modal>
  );
}
