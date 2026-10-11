import { api } from '../lib/api';
import type { TransaccionesResponse } from '../types';

export const transactionsApi = {
  list: (params: Record<string, string | undefined>) =>
    api.get<TransaccionesResponse>('/reports/transactions', { params }).then((r) => r.data),
  exportCsv: (params: Record<string, string | undefined>) =>
    api.get('/reports/transactions/export', { params, responseType: 'blob' }).then((r) => r.data as Blob),
  /**
   * Una transaccion mezcla tres tablas (venta/abono/gasto, ver
   * endpointDeBorrado en Transactions.tsx) -- el borrado real le pega al
   * endpoint del dominio correspondiente, no a uno propio de "transacciones".
   */
  eliminarPorUrl: (url: string, body: Record<string, string>) =>
    api.delete(url, { data: body, skipErrorToast: true }).then((r) => r.data),
};
