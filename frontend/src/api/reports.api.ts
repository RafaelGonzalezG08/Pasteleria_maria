import { api } from '../lib/api';
import type { ClientDebt, CostsReport, DashboardSummary, OrdersSummary } from '../types';

export interface SalesPeriod {
  periodo: string;
  ventas: number;
  subtotal: number;
  impuestos: number;
  total: number;
}

export interface ExpensesReport {
  total: number;
  categorias: { categoria: string; monto: number }[];
}

export interface Cashflow {
  ingresos: number;
  egresos: number;
  neto: number;
  /** Contado + abonos cobrados - gastos. Dinero que de verdad entro a la caja. */
  saldoEnCaja: number;
  /** Todas las ventas (contado y credito) - gastos. Foto contable del periodo. */
  balanceTotal: number;
}

interface RangoFechas {
  from?: string;
  to?: string;
}

export const reportsApi = {
  dashboard: () => api.get<DashboardSummary>('/reports/dashboard').then((r) => r.data),
  ordersSummary: () => api.get<OrdersSummary>('/orders/summary').then((r) => r.data),
  sales: (params: RangoFechas & { group: 'day' | 'week' | 'month' | 'year' }) =>
    api.get<SalesPeriod[]>('/reports/sales', { params }).then((r) => r.data),
  debts: () => api.get<ClientDebt[]>('/reports/clients/debts').then((r) => r.data),
  expenses: (params: RangoFechas) => api.get<ExpensesReport>('/reports/expenses', { params }).then((r) => r.data),
  cashflow: (params: RangoFechas) => api.get<Cashflow>('/reports/cashflow', { params }).then((r) => r.data),
  costs: (params: RangoFechas) => api.get<CostsReport>('/reports/costs', { params }).then((r) => r.data),
  exportSalesCsv: (params: RangoFechas & { group: 'day' | 'week' | 'month' | 'year' }) =>
    api.get('/reports/sales/export', { params, responseType: 'blob' }).then((r) => r.data as Blob),
};
