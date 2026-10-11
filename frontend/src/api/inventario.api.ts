import { api } from '../lib/api';
import type {
  AlertasInventario,
  Compra,
  HojaProduccion,
  Insumo,
  InsumoDetalle,
  ListaCompras,
  MovimientoInsumo,
  Produccion,
  Proveedor,
  RecetaDetalle,
  RecetaEscalada,
  RecetaResumen,
  TipoInsumo,
} from '../types';

export interface InsumoPayload {
  nombre: string;
  tipo: TipoInsumo;
  unidad: string;
  stockMinimo: number;
  costoUnitario?: number;
  proveedorId?: string | null;
  notas?: string;
  stockInicial?: number;
  fechaVencimiento?: string;
}

export interface MovimientoPayload {
  tipo: 'ENTRADA' | 'SALIDA' | 'MERMA' | 'AJUSTE';
  cantidad: number;
  unidad?: string;
  costoUnitario?: number;
  fechaVencimiento?: string;
  motivo?: string;
}

export interface IngredientePayload {
  insumoId?: string;
  subrecetaId?: string;
  cantidad: number;
  unidad: string;
}

export interface RecetaPayload {
  nombre: string;
  esSubreceta: boolean;
  rendimiento: number;
  unidadRendimiento: string;
  porciones?: number | null;
  tiempoPreparacionMin?: number | null;
  pasos?: string;
  margenPct?: number | null;
  productoId?: string | null;
  ingredientes: IngredientePayload[];
}

export interface CompraPayload {
  proveedorId?: string;
  fecha?: string;
  numeroFactura?: string;
  notas?: string;
  registrarGasto: boolean;
  items: { insumoId: string; cantidad: number; unidad: string; costoTotal: number; fechaVencimiento?: string }[];
}

export const insumosApi = {
  list: (all = false) => api.get<Insumo[]>('/insumos', { params: { all: all || undefined } }).then((r) => r.data),
  get: (id: string) => api.get<InsumoDetalle>(`/insumos/${id}`).then((r) => r.data),
  alertas: () => api.get<AlertasInventario>('/insumos/alertas').then((r) => r.data),
  movimientos: (params: { from?: string; to?: string; tipo?: string; insumoId?: string }) =>
    api.get<MovimientoInsumo[]>('/insumos/movimientos', { params }).then((r) => r.data),
  create: (payload: InsumoPayload) => api.post<InsumoDetalle>('/insumos', payload).then((r) => r.data),
  update: (id: string, payload: Partial<InsumoPayload> & { activo?: boolean }) =>
    api.put<InsumoDetalle>(`/insumos/${id}`, payload).then((r) => r.data),
  movimiento: (id: string, payload: MovimientoPayload) =>
    api.post<InsumoDetalle>(`/insumos/${id}/movimientos`, payload).then((r) => r.data),
  delete: (id: string) =>
    api.delete<{ eliminado: boolean; desactivado?: boolean }>(`/insumos/${id}`).then((r) => r.data),
};

export const recetasApi = {
  list: () => api.get<RecetaResumen[]>('/recetas').then((r) => r.data),
  get: (id: string) => api.get<RecetaDetalle>(`/recetas/${id}`).then((r) => r.data),
  escalar: (id: string, factor: number) =>
    api.get<RecetaEscalada>(`/recetas/${id}/escalar`, { params: { factor } }).then((r) => r.data),
  create: (payload: RecetaPayload) => api.post<RecetaDetalle>('/recetas', payload).then((r) => r.data),
  update: (id: string, payload: RecetaPayload) =>
    api.put<RecetaDetalle>(`/recetas/${id}`, payload).then((r) => r.data),
  delete: (id: string) =>
    api.delete<{ eliminado: boolean; desactivado?: boolean }>(`/recetas/${id}`).then((r) => r.data),
};

export const produccionApi = {
  list: (params: { from?: string; to?: string }) =>
    api.get<Produccion[]>('/produccion', { params }).then((r) => r.data),
  registrar: (payload: { recetaId: string; tandas: number; notas?: string }) =>
    api.post<Produccion>('/produccion', payload).then((r) => r.data),
  anular: (id: string) => api.delete(`/produccion/${id}`).then((r) => r.data),
  hoja: (fecha?: string) => api.get<HojaProduccion>('/produccion/hoja', { params: { fecha } }).then((r) => r.data),
  listaCompras: (dias: number) =>
    api.get<ListaCompras>('/produccion/lista-compras', { params: { dias } }).then((r) => r.data),
};

export const proveedoresApi = {
  list: (all = false) => api.get<Proveedor[]>('/proveedores', { params: { all: all || undefined } }).then((r) => r.data),
  create: (payload: Partial<Proveedor>) => api.post<Proveedor>('/proveedores', payload).then((r) => r.data),
  update: (id: string, payload: Partial<Proveedor>) =>
    api.put<Proveedor>(`/proveedores/${id}`, payload).then((r) => r.data),
  delete: (id: string) => api.delete(`/proveedores/${id}`).then((r) => r.data),
};

export const comprasApi = {
  list: (params: { from?: string; to?: string; proveedorId?: string }) =>
    api.get<Compra[]>('/compras', { params }).then((r) => r.data),
  get: (id: string) => api.get<Compra>(`/compras/${id}`).then((r) => r.data),
  create: (payload: CompraPayload) => api.post<Compra>('/compras', payload).then((r) => r.data),
  delete: (id: string) => api.delete(`/compras/${id}`).then((r) => r.data),
};
