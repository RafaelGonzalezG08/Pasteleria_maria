import { api } from '../lib/api';
import type { BusinessProfile, Role } from '../types';

/** Cuantos registros trae un respaldo (lo calcula el backend al generarlo). */
export interface BackupContenido {
  productos: number;
  clientes: number;
  ventas: number;
  facturas: number;
  deudas: number;
  gastos: number;
  encargos?: number;
  insumos?: number;
  recetas?: number;
  usuarios: number;
}

export interface BackupFile {
  name: string;
  sizeBytes: number;
  createdAt: string;
  /** Si se encontro en esta computadora o en la copia de OneDrive. */
  origen: 'local' | 'nube';
  contenido: BackupContenido | null;
}

export interface BackupsStatus {
  lastRun: string | null;
  intervalDays: number;
  retentionDays: number;
  copiaEnNube: boolean;
  files: BackupFile[];
}

export interface IntegrationsStatus {
  whatsapp: boolean;
}

export interface AppUser {
  id: string;
  nombre: string;
  email: string;
  role: Role;
  activo: boolean;
}

/** Formulario de Configuracion: todo como texto; el impuesto en porcentaje (18), no en tasa. */
export interface BusinessProfileForm {
  nombre: string;
  direccion: string;
  telefono: string;
  identifFiscal: string;
  moneda: string;
  nombreImpuesto: string;
  tasaImpuesto: string;
  margenGananciaPct: string;
  diasAlertaEncargos: string;
  diasAlertaVencimiento: string;
  diasAlertaCumpleanos: string;
}

export interface CrearUsuarioDto {
  nombre: string;
  email: string;
  password: string;
  role: Role;
}

export const settingsApi = {
  getBusinessProfile: () => api.get<BusinessProfile>('/settings/business-profile').then((r) => r.data),
  updateBusinessProfile: (form: BusinessProfileForm) =>
    api
      .put('/settings/business-profile', {
        ...form,
        tasaImpuesto: (Number(form.tasaImpuesto) || 0) / 100,
        margenGananciaPct: Number(form.margenGananciaPct) || 0,
        diasAlertaEncargos: Number(form.diasAlertaEncargos) || 0,
        diasAlertaVencimiento: Number(form.diasAlertaVencimiento) || 0,
        diasAlertaCumpleanos: Number(form.diasAlertaCumpleanos) || 0,
      })
      .then((r) => r.data),
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post('/settings/business-profile/logo', formData, { skipErrorToast: true })
      .then((r) => r.data);
  },
  getIntegrationsStatus: () =>
    api.get<IntegrationsStatus>('/settings/integrations-status').then((r) => r.data),

  getBackupsStatus: () => api.get<BackupsStatus>('/backups').then((r) => r.data),
  runBackup: () => api.post<{ ok: boolean; error?: string }>('/backups/run').then((r) => r.data),
  restoreBackup: (fileName: string) =>
    api
      .post<{ ok: boolean; error?: string; restoredUploads?: boolean }>(
        '/backups/restore',
        { fileName },
        { skipErrorToast: true },
      )
      .then((r) => r.data),

  listUsers: () => api.get<AppUser[]>('/users').then((r) => r.data),
  createUser: (payload: CrearUsuarioDto) => api.post('/auth/register', payload).then((r) => r.data),
  toggleUserActive: (id: string, activo: boolean) =>
    api.patch(`/users/${id}/activo`, { activo }, { skipErrorToast: true }).then((r) => r.data),
  changeUserRole: (id: string, role: Role) =>
    api.patch(`/users/${id}/role`, { role }, { skipErrorToast: true }).then((r) => r.data),
  changePassword: (passwordActual: string, passwordNueva: string) =>
    api
      .patch('/users/me/password', { passwordActual, passwordNueva }, { skipErrorToast: true })
      .then((r) => r.data),
};
