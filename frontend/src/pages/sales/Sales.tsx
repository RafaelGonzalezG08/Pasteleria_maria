import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MessageCircle, Download, Loader2, Eye } from 'lucide-react';
import { apiUrl, urlConToken } from '../../lib/api';
import { salesApi } from '../../api/sales.api';
import {
  abrirPestanaRespaldoSiHaceFalta,
  enviarWhatsappDesdeCelular,
  esEnvioDirecto,
} from '../../lib/whatsappDirecto';
import { formatMoney, formatDate, formatTime, METODO_PAGO_LABEL } from '../../lib/format';
import { Card, PageHeader, Badge, EmptyState, Skeleton } from '../../components/ui';
import { SaleDetailModal } from '../../components/SaleDetailModal';
import type { EstadoFactura, Sale } from '../../types';

const ESTADO_TONE: Record<EstadoFactura, 'neutral' | 'copper' | 'sage' | 'brick'> = {
  PENDIENTE: 'neutral',
  GENERADA: 'copper',
  ENVIADA: 'sage',
  ERROR: 'brick',
};

export default function Sales() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

  const { data: sales = [], isLoading } = useQuery<Sale[]>({
    queryKey: ['sales', from, to],
    queryFn: () => salesApi.list({ from: from || undefined, to: to || undefined }),
    // Si alguna factura está EN_COLA, refrescar cada 5s para ver cuándo pasa a
    // ENVIADA/ERROR (el envío corre en segundo plano).
    refetchInterval: (query) =>
      query.state.data?.some((s) => s.invoice?.whatsappEstado === 'EN_COLA') ? 5000 : false,
  });

  const sendWhatsapp = useMutation({
    mutationFn: ({ saleId }: { saleId: string; pestanaRespaldo: Window | null }) =>
      salesApi.sendWhatsapp(saleId),
    onSuccess: async (resultado, variables) => {
      if (esEnvioDirecto(resultado)) {
        await enviarWhatsappDesdeCelular(resultado, variables.pestanaRespaldo);
      } else {
        variables.pestanaRespaldo?.close();
        toast.success('En cola de envío. Se enviará por WhatsApp en unos segundos.');
      }
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (_error, variables) => {
      variables.pestanaRespaldo?.close();
    },
  });

  function enviarPorWhatsapp(saleId: string) {
    // Sincronico, dentro del click: ver comentario en abrirPestanaRespaldoSiHaceFalta.
    sendWhatsapp.mutate({ saleId, pestanaRespaldo: abrirPestanaRespaldoSiHaceFalta() });
  }

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Historial de ventas y estado de facturacion" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted">Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-porcelain-300 px-2.5 py-1.5 text-sm outline-none focus:border-copper-500" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted">Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-porcelain-300 px-2.5 py-1.5 text-sm outline-none focus:border-copper-500" />
        </div>
      </div>

      {isLoading ? (
        <Skeleton />
      ) : sales.length === 0 ? (
        <EmptyState title="Sin ventas en este rango" description="Registra una venta desde el Punto de venta." />
      ) : (
        <>
          {/* Celular: tarjetas. El detalle completo (items, factura) vive en SaleDetailModal. */}
          <div className="space-y-2 md:hidden">
            {sales.map((sale) => (
              <Card
                key={sale.id}
                className="cursor-pointer p-3.5 active:shadow-neu-pressed"
                onClick={() => setSelectedSaleId(sale.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {sale.client?.nombre ?? 'Consumidor final'}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDate(sale.fecha)} · {formatTime(sale.fecha)}
                    </p>
                  </div>
                  <span className="shrink-0 font-display font-semibold tabular-nums text-ink">
                    {formatMoney(sale.total)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={sale.metodoPago === 'CREDITO' ? 'brick' : 'sage'}>
                      {METODO_PAGO_LABEL[sale.metodoPago]}
                    </Badge>
                    {sale.invoice && (
                      <Badge tone={ESTADO_TONE[sale.invoice.estado]}>{sale.invoice.numero}</Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
                    {sale.invoice?.pngUrl && (
                      <a
                        href={urlConToken(
                          sale.invoice.pngUrl.startsWith('http')
                            ? sale.invoice.pngUrl
                            : apiUrl(sale.invoice.pngUrl),
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg p-1.5 text-muted hover:bg-porcelain-200"
                        title="Descargar PNG"
                      >
                        <Download size={15} />
                      </a>
                    )}
                    {sale.client?.telefono && (
                      <button
                        onClick={() => enviarPorWhatsapp(sale.id)}
                        disabled={sendWhatsapp.isPending || sale.invoice?.whatsappEstado === 'EN_COLA'}
                        className={`rounded-lg p-1.5 hover:bg-sage-100 ${
                          sale.invoice?.whatsappEstado === 'ERROR' ? 'text-brick-600' : 'text-sage-600'
                        }`}
                        title="Enviar por WhatsApp"
                      >
                        {(sendWhatsapp.isPending && sendWhatsapp.variables?.saleId === sale.id) ||
                        sale.invoice?.whatsappEstado === 'EN_COLA' ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <MessageCircle size={15} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* PC: tabla, sin cambios. */}
          <Card className="hidden overflow-hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-porcelain-100 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Metodo</th>
                <th className="px-4 py-2.5">Factura</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-porcelain-200">
              {sales.map((sale) => (
                <tr
                  key={sale.id}
                  onClick={() => setSelectedSaleId(sale.id)}
                  className="cursor-pointer hover:bg-porcelain-100"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 leading-tight text-ink">
                    <span className="block">{formatDate(sale.fecha)}</span>
                    <span className="block text-xs text-muted">{formatTime(sale.fecha)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-ink">{sale.client?.nombre ?? 'Consumidor final'}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={sale.metodoPago === 'CREDITO' ? 'brick' : 'sage'}>
                      {METODO_PAGO_LABEL[sale.metodoPago]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {sale.invoice && (
                      <Badge tone={ESTADO_TONE[sale.invoice.estado]}>{sale.invoice.numero}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-display font-semibold tabular-nums text-ink">
                    {formatMoney(sale.total)}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedSaleId(sale.id)}
                        className="rounded-lg p-1.5 text-muted hover:bg-porcelain-200"
                        title="Ver detalle"
                      >
                        <Eye size={15} />
                      </button>
                      {sale.invoice?.pngUrl && (
                        <a
                          href={urlConToken(
                            sale.invoice.pngUrl.startsWith('http')
                              ? sale.invoice.pngUrl
                              : apiUrl(sale.invoice.pngUrl),
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg p-1.5 text-muted hover:bg-porcelain-200"
                          title="Descargar PNG"
                        >
                          <Download size={15} />
                        </a>
                      )}
                      {sale.client?.telefono && (
                        <button
                          onClick={() => enviarPorWhatsapp(sale.id)}
                          disabled={sendWhatsapp.isPending || sale.invoice?.whatsappEstado === 'EN_COLA'}
                          className={`rounded-lg p-1.5 hover:bg-sage-100 ${
                            sale.invoice?.whatsappEstado === 'ERROR' ? 'text-brick-600' : 'text-sage-600'
                          }`}
                          title={
                            sale.invoice?.whatsappEstado === 'EN_COLA'
                              ? 'En cola de envío…'
                              : sale.invoice?.whatsappEstado === 'ERROR'
                                ? `No se pudo enviar: ${sale.invoice?.ultimoError ?? 'error'}. Clic para reintentar.`
                                : sale.invoice?.whatsappEstado === 'ENVIADA'
                                  ? 'Enviada. Clic para enviar de nuevo.'
                                  : 'Enviar por WhatsApp'
                          }
                        >
                          {(sendWhatsapp.isPending && sendWhatsapp.variables?.saleId === sale.id) ||
                          sale.invoice?.whatsappEstado === 'EN_COLA' ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <MessageCircle size={15} />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </Card>
        </>
      )}

      {selectedSaleId && <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />}
    </div>
  );
}

