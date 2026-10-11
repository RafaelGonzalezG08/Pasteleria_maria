import { api } from '../lib/api';
import type { Expense } from '../types';

export const expensesApi = {
  list: () => api.get<Expense[]>('/expenses').then((r) => r.data),
  create: (dto: { categoria: string; descripcion: string; monto: number }) =>
    api.post('/expenses', dto).then((r) => r.data),
  delete: (id: string, password: string) =>
    api.delete(`/expenses/${id}`, { data: { password }, skipErrorToast: true }).then((r) => r.data),
};
