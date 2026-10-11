import { api } from '../lib/api';
import type { Client, FechaEspecial, ProximaFecha } from '../types';

export interface ClientePayload {
  nombre: string;
  telefono: string;
  email?: string;
  direccion?: string;
  notas?: string;
  cumpleanos?: string | null;
  fechasEspeciales?: FechaEspecial[];
}

export const clientsApi = {
  search: (search?: string) => api.get<Client[]>('/clients', { params: { search: search || undefined } }).then((r) => r.data),
  get: (id: string) => api.get<Client>(`/clients/${id}`).then((r) => r.data),
  create: (payload: Partial<ClientePayload>) => api.post<Client>('/clients', payload).then((r) => r.data),
  update: (id: string, payload: Partial<ClientePayload>) => api.put<Client>(`/clients/${id}`, payload).then((r) => r.data),
  delete: (id: string) => api.delete(`/clients/${id}`).then((r) => r.data),
  bulkDelete: (ids: string[]) =>
    api
      .post<{ eliminados: number; omitidos: { id: string; nombre: string; motivo: string }[] }>(
        '/clients/bulk/eliminar',
        { ids },
      )
      .then((r) => r.data),
  proximasFechas: () => api.get<ProximaFecha[]>('/clients/proximas-fechas').then((r) => r.data),
  exportXlsx: () => api.get('/clients/export', { responseType: 'blob' }).then((r) => r.data as Blob),
};
