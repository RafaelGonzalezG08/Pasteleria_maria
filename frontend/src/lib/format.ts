/**
 * Simbolo de moneda que se antepone a los montos. Sale de Configuracion
 * (RD$ por defecto); Layout lo actualiza en cuanto carga el perfil del
 * negocio, asi cada pantalla no tiene que pedirlo por su lado.
 */
let simboloMoneda = 'RD$';

export function setMoneda(simbolo: string | null | undefined) {
  if (simbolo && simbolo.trim()) simboloMoneda = simbolo.trim();
}

export function getMoneda(): string {
  return simboloMoneda;
}

export function formatMoney(value: number | string): string {
  return `${simboloMoneda} ${Number(value).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Cantidad de inventario: hasta 3 decimales y sin ceros sobrantes ("2.5", "0.125", "12"). */
export function formatCantidad(value: number | string): string {
  return Number(value).toLocaleString('es-DO', { maximumFractionDigits: 3 });
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Solo la hora ("11:22 p. m."), para mostrarla debajo de la fecha y ahorrar ancho. */
export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit' });
}

/** "YYYY-MM-DD" en hora local (para <input type="date"> y filtros). */
export function fechaLocal(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DDTHH:mm" en hora local (para <input type="datetime-local">). */
export function fechaHoraLocal(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${fechaLocal(date)}T${h}:${min}`;
}

export const ESTADO_DEUDA_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  PARCIAL: 'Abono parcial',
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
};

export const ESTADO_ENCARGO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PRODUCCION: 'En producción',
  LISTO: 'Listo',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

export const TIPO_ENTREGA_LABEL: Record<string, string> = {
  DOMICILIO: 'Entrega a domicilio',
  RETIRO: 'Retiro en tienda',
};

export const TIPO_MOVIMIENTO_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
  MERMA: 'Merma',
  COMPRA: 'Compra',
  PRODUCCION: 'Producción',
};

export const ESTADO_FACTURA_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  GENERADA: 'Generada',
  ENVIADA: 'Enviada',
  ERROR: 'Error',
};

export const METODO_PAGO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
  CREDITO: 'Credito',
  OTRO: 'Otro',
};
