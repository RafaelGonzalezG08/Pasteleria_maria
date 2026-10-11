import { api } from '../lib/api';
import type { Encargo, MetodoPago, Personalizacion, ResumenEncargos, TipoEntrega } from '../types';

export interface EncargoItemPayload extends Personalizacion {
  productId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export interface PagoPayload {
  monto: number;
  metodo: MetodoPago;
  nota?: string;
}

export interface EncargoPayload {
  clientId: string;
  fechaEntrega: string;
  tipoEntrega: TipoEntrega;
  direccionEntrega?: string;
  costoEnvio?: number;
  notas?: string;
  items: EncargoItemPayload[];
  anticipo?: PagoPayload;
}

export const encargosApi = {
  list: (params: { estado?: string; from?: string; to?: string; clientId?: string; q?: string }) =>
    api.get<Encargo[]>('/encargos', { params }).then((r) => r.data),
  resumen: () => api.get<ResumenEncargos>('/encargos/resumen').then((r) => r.data),
  get: (id: string) => api.get<Encargo>(`/encargos/${id}`).then((r) => r.data),
  create: (payload: EncargoPayload) => api.post<Encargo>('/encargos', payload).then((r) => r.data),
  update: (id: string, payload: EncargoPayload) => api.put<Encargo>(`/encargos/${id}`, payload).then((r) => r.data),
  cambiarEstado: (id: string, estado: 'PENDIENTE' | 'EN_PRODUCCION' | 'LISTO') =>
    api.patch<Encargo>(`/encargos/${id}/estado`, { estado }).then((r) => r.data),
  pagar: (id: string, payload: PagoPayload) => api.post<Encargo>(`/encargos/${id}/pagos`, payload).then((r) => r.data),
  eliminarPago: (pagoId: string) => api.delete<Encargo>(`/encargos/pagos/${pagoId}`).then((r) => r.data),
  entregar: (
    id: string,
    payload: { pagoFinal?: PagoPayload; dejarSaldoACredito?: boolean; fechaVencimiento?: string },
  ) => api.post<Encargo>(`/encargos/${id}/entregar`, payload).then((r) => r.data),
  cancelar: (id: string, motivo?: string) =>
    api.post<Encargo>(`/encargos/${id}/cancelar`, { motivo }).then((r) => r.data),
  subirFoto: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ url: string }>('/encargos/foto-referencia', formData).then((r) => r.data);
  },
};
