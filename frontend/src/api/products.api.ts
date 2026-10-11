import { api } from '../lib/api';
import type { Category, Product } from '../types';

export type ProductFormValues = {
  nombre: string;
  precioUnitario: string;
  costoUnitario: string;
  stock: string;
  categoriaId: string;
  descripcion: string;
  file: File | null;
};

function buildFormData(values: ProductFormValues, incluirCosto: boolean) {
  const formData = new FormData();
  formData.append('nombre', values.nombre.trim());
  formData.append('precioUnitario', String(Number(values.precioUnitario) || 0));
  if (incluirCosto) formData.append('costoUnitario', String(Number(values.costoUnitario) || 0));
  formData.append('stock', String(Number(values.stock) || 0));
  formData.append('categoriaId', values.categoriaId);
  formData.append('descripcion', values.descripcion.trim());
  if (values.file) formData.append('file', values.file);
  return formData;
}

export interface MermaProducto {
  id: string;
  fecha: string;
  cantidad: number;
  costoUnitario?: number;
  motivo?: string | null;
  product: { id: string; nombre: string };
  user?: { nombre: string } | null;
}

export const productsApi = {
  list: (all = false) => api.get<Product[]>('/products', { params: { all: all || undefined } }).then((r) => r.data),
  /**
   * `incluirCosto`: un producto con receta toma su costo de la receta; mandar
   * el costo del formulario lo pisaria con el valor viejo.
   */
  create: (values: ProductFormValues, incluirCosto = true) =>
    api
      .post<Product>('/products', buildFormData(values, incluirCosto), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
  update: (id: string, values: ProductFormValues, incluirCosto = true) =>
    api
      .put<Product>(`/products/${id}`, buildFormData(values, incluirCosto), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
  delete: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
  restore: (id: string) => api.put(`/products/${id}`, { activo: true }).then((r) => r.data),
  quitarFoto: (id: string) => api.delete(`/products/${id}/photo`).then((r) => r.data),
  merma: (id: string, cantidad: number, motivo?: string) =>
    api.post<Product>(`/products/${id}/merma`, { cantidad, motivo }).then((r) => r.data),
  mermas: (params: { from?: string; to?: string }) =>
    api.get<MermaProducto[]>('/products/mermas', { params }).then((r) => r.data),
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
  create: (nombre: string) => api.post<Category>('/categories', { nombre }, { skipErrorToast: true }).then((r) => r.data),
  delete: (id: string) => api.delete(`/categories/${id}`).then((r) => r.data),
};
