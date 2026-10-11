import { api } from '../lib/api';
import type { EstadoPedido, EstadoPedidoWeb, MetodoPago, Order, Sale, WebOrder } from '../types';

export interface AtenderPedidoWebDto {
  clientId?: string;
  metodoPago: MetodoPago;
  fechaVencimiento?: string;
  esPedido?: boolean;
  fechaEntrega?: string;
  descuentoPct?: number;
}

export const ordersApi = {
  list: (estado: EstadoPedido | 'TODOS') =>
    api.get<Order[]>('/orders', { params: { estado: estado === 'TODOS' ? undefined : estado } }).then((r) => r.data),
  update: (id: string, cambios: Record<string, unknown>) => api.patch(`/orders/${id}`, cambios).then((r) => r.data),
  cancel: (id: string) => api.delete(`/orders/${id}`).then((r) => r.data),

  listWeb: (estado: EstadoPedidoWeb | 'TODOS') =>
    api
      .get<WebOrder[]>('/web-orders', { params: { estado: estado === 'TODOS' ? undefined : estado } })
      .then((r) => r.data),
  createWeb: (texto: string) => api.post<WebOrder>('/web-orders', { texto }).then((r) => r.data),
  updateWeb: (id: string, estado: EstadoPedidoWeb) => api.patch(`/web-orders/${id}`, { estado }).then((r) => r.data),
  deleteWeb: (id: string, password: string) =>
    api.delete(`/web-orders/${id}`, { data: { password }, skipErrorToast: true }).then((r) => r.data),
  atenderWeb: (id: string, dto: AtenderPedidoWebDto) =>
    api.post<Sale>(`/web-orders/${id}/atender`, dto).then((r) => r.data),
};
