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
  pedidos: number;
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

export interface BusinessProfileForm {
  nombre: string;
  direccion: string;
  identifFiscal: string;
  tasaImpuesto: string;
  telefonoWhatsapp: string;
  descripcionWeb: string;
  relevoPedidosUrl: string;
  relevoPedidosClave: string;
  cloudflareApiToken: string;
  cloudflareAccountId: string;
  cloudflarePagesProject: string;
}

export interface CrearUsuarioDto {
  nombre: string;
  email: string;
  password: string;
  role: Role;
}

export interface GenerarCatalogoResult {
  ok: boolean;
  error?: string;
  carpeta: string;
  productos: number;
  excluidasSinFoto?: number;
  excluidasSinPrecio?: number;
  cloudflare?: 'sin-configurar' | 'sin-cambios' | 'publicado' | 'error';
  cloudflareUrl?: string;
  cloudflareError?: string;
}

export interface ImportarProductosResult {
  total: number;
  agregados: number;
  omitidos: number;
  conFoto: number;
  renumerados: { nombre: string; skuOriginal: string; skuNuevo: string }[];
}

export const settingsApi = {
  getBusinessProfile: () => api.get<BusinessProfile>('/settings/business-profile').then((r) => r.data),
  updateBusinessProfile: (form: BusinessProfileForm) =>
    api
      .put('/settings/business-profile', { ...form, tasaImpuesto: Number(form.tasaImpuesto) })
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
  getRedLocal: () =>
    api.get<{ url: string | null; certUrl: string | null }>('/settings/red-local').then((r) => r.data),

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
  changePassword: (passwordActual: string, passwordNueva: string) =>
    api
      .patch('/users/me/password', { passwordActual, passwordNueva }, { skipErrorToast: true })
      .then((r) => r.data),

  generarCatalogo: () =>
    api.post<GenerarCatalogoResult>('/catalogo/generar', undefined, { skipErrorToast: true }).then((r) => r.data),

  importarProductos: (archivo: File, archivoFotos: File | null) => {
    const formData = new FormData();
    formData.append('file', archivo);
    if (archivoFotos) formData.append('fotos', archivoFotos);
    return api
      .post<ImportarProductosResult>('/data-import/productos', formData, { skipErrorToast: true })
      .then((r) => r.data);
  },
};
