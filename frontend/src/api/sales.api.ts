import { api } from '../lib/api';
import type { EnvioWhatsappDirecto } from '../lib/whatsappDirecto';
import type { Invoice, MetodoPago, Sale } from '../types';

export interface EditarVentaDto {
  adminPassword: string;
  clientId: string | null;
  items: { productId?: string | null; descripcion: string; cantidad: number; precioUnitario: number }[];
}

export interface CrearVentaDto {
  items: { productId?: string; descripcion: string; cantidad: number; precioUnitario: number }[];
  metodoPago: MetodoPago;
  clientId?: string;
  descuentoPct?: number;
  fechaVencimiento?: string;
  esPedido?: boolean;
  fechaEntrega?: string;
}

export const salesApi = {
  list: (params: { from?: string; to?: string }) => api.get<Sale[]>('/sales', { params }).then((r) => r.data),
  get: (id: string) => api.get<Sale>(`/sales/${id}`).then((r) => r.data),
  create: (dto: CrearVentaDto) => api.post<Sale>('/sales', dto).then((r) => r.data),
  // POS maneja su propio toast de error (skipErrorToast); Ventas usa el
  // generico -- por eso el parametro es opcional en vez de fijo. El
  // resultado es la factura (modo agente, PC) o un EnvioWhatsappDirecto
  // (modo directo, celular) segun de donde vino la peticion -- lo decide
  // el backend, ver esConexionLocal.
  sendWhatsapp: (saleId: string, opts?: { skipErrorToast?: boolean }) =>
    api
      .post<Invoice | EnvioWhatsappDirecto>(`/sales/${saleId}/send-invoice-whatsapp`, undefined, opts)
      .then((r) => r.data),
  delete: (id: string, adminPassword: string) =>
    api.delete(`/sales/${id}`, { data: { adminPassword }, skipErrorToast: true }).then((r) => r.data),
  edit: (id: string, dto: EditarVentaDto) =>
    api.put<Sale>(`/sales/${id}`, dto, { skipErrorToast: true }).then((r) => r.data),
};
