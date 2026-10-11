import { api } from '../lib/api';
import type { ClientDebt, EstadoDeuda, MetodoPago } from '../types';

export const cobrosApi = {
  list: (status?: EstadoDeuda | '') =>
    api.get<ClientDebt[]>('/client-debts', { params: { status: status || undefined } }).then((r) => r.data),
  remind: (debtId: string) =>
    api.post<ClientDebt>(`/client-debts/${debtId}/remind`, undefined, { skipErrorToast: true }).then((r) => r.data),
  registerPayment: (debtId: string, amount: number, metodo: MetodoPago) =>
    api.post(`/client-debts/${debtId}/payments`, { amount, metodo }).then((r) => r.data),
  deletePayment: (paymentId: string, password: string) =>
    api.delete(`/client-debts/payments/${paymentId}`, { data: { password }, skipErrorToast: true }).then((r) => r.data),
};
