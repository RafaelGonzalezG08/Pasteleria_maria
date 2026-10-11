import { api } from '../lib/api';
import type { Category, Material, Product } from '../types';

export type ProductFormValues = {
  nombre: string;
  precioUnitario: string;
  costoUnitario: string;
  material: Material;
  stock: string;
  /** Tallas / medidas que el negocio ofrece de esta pieza (el cliente elige en el catalogo). */
  tallas: string[];
  file: File | null;
};

export interface GrupoDuplicado {
  nombre: string;
  precioUnitario: number;
  tamanoFotoBytes: number;
  mantiene: { id: string; sku: string };
  elimina: { id: string; sku: string }[];
}

export interface VistaPreviaLimpieza {
  grupos: GrupoDuplicado[];
  sinFoto: { id: string; sku: string; nombre: string }[];
  totalABaja: number;
}

export interface VistaPreviaEliminarDuplicados {
  grupos: GrupoDuplicado[];
  totalEliminables: number;
  omitidosPorVentas: { id: string; sku: string; nombre: string }[];
}

function buildFormData(values: ProductFormValues) {
  const formData = new FormData();
  formData.append('nombre', values.nombre.trim());
  formData.append('precioUnitario', String(Number(values.precioUnitario) || 0));
  formData.append('costoUnitario', String(Number(values.costoUnitario) || 0));
  formData.append('material', values.material);
  formData.append('stock', String(Number(values.stock) || 0));
  formData.append('tallas', JSON.stringify(values.tallas ?? []));
  if (values.file) formData.append('file', values.file);
  return formData;
}

export const productsApi = {
  list: (all = false) => api.get<Product[]>('/products', { params: { all: all || undefined } }).then((r) => r.data),
  create: (values: ProductFormValues) =>
    api
      .post('/products', buildFormData(values), { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data),
  update: (id: string, values: ProductFormValues) =>
    api
      .put(`/products/${id}`, buildFormData(values), { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data),
  delete: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
  restore: (id: string) => api.put(`/products/${id}`, { activo: true }).then((r) => r.data),
  previewDuplicados: () =>
    api.get<VistaPreviaLimpieza>('/products/duplicados/vista-previa').then((r) => r.data),
  limpiarDuplicados: () =>
    api.post<{ bajaDuplicados: number; bajaSinFoto: number }>('/products/duplicados/limpiar').then((r) => r.data),
  previewEliminarDuplicados: () =>
    api
      .get<VistaPreviaEliminarDuplicados>('/products/duplicados/vista-previa-eliminar')
      .then((r) => r.data),
  eliminarDuplicados: () =>
    api.post<{ eliminados: number }>('/products/duplicados/eliminar').then((r) => r.data),
  bulkBaja: (ids: string[]) => api.post<{ actualizados: number }>('/products/bulk/baja', { ids }).then((r) => r.data),
  bulkReactivar: (ids: string[]) =>
    api.post<{ actualizados: number }>('/products/bulk/reactivar', { ids }).then((r) => r.data),
  bulkEliminar: (ids: string[]) =>
    api
      .post<{ eliminados: number; omitidosPorVentas: number }>('/products/bulk/eliminar', { ids })
      .then((r) => r.data),
  exportXlsx: () =>
    api.get('/products/export', { params: { all: 'true' }, responseType: 'blob' }).then((r) => r.data as Blob),
};

export const categoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
  create: (nombre: string) =>
    api.post<{ clasificadas?: number }>('/categories', { nombre }, { skipErrorToast: true }).then((r) => r.data),
  delete: (id: string) => api.delete(`/categories/${id}`).then((r) => r.data),
};
