import { api } from '../lib/api';
import type { EnvioWhatsappDirecto } from '../lib/whatsappDirecto';
import type { ClientDebt, EstadoDeuda, MetodoPago } from '../types';

export const cobrosApi = {
  list: (status?: EstadoDeuda | '') =>
    api.get<ClientDebt[]>('/client-debts', { params: { status: status || undefined } }).then((r) => r.data),
  // El resultado es la deuda actualizada (modo agente, PC) o un
  // EnvioWhatsappDirecto (modo directo, celular) segun de donde vino la
  // peticion -- lo decide el backend, ver esConexionLocal.
  remind: (debtId: string) =>
    api
      .post<ClientDebt | EnvioWhatsappDirecto>(`/client-debts/${debtId}/remind`, undefined, { skipErrorToast: true })
      .then((r) => r.data),
  registerPayment: (debtId: string, amount: number, metodo: MetodoPago) =>
    api.post(`/client-debts/${debtId}/payments`, { amount, metodo }).then((r) => r.data),
  deletePayment: (paymentId: string, password: string) =>
    api.delete(`/client-debts/payments/${paymentId}`, { data: { password }, skipErrorToast: true }).then((r) => r.data),
};
