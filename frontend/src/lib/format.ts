/**
 * Incluye el simbolo de moneda ("$", no "RD$"): en celular "RD$" le come
 * espacio a numeros que ya son largos, y esta app solo maneja pesos
 * dominicanos, asi que no hay ambiguedad posible con el simbolo corto.
 */
export function formatMoney(value: number | string): string {
  return `$${Number(value).toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

export const ESTADO_DEUDA_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  PARCIAL: 'Abono parcial',
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
};

export const ESTADO_PEDIDO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EMPACADO: 'Empacado',
  ENTREGADO: 'Entregado',
};

export const ESTADO_PEDIDO_WEB_LABEL: Record<string, string> = {
  PENDIENTE: 'Por atender',
  ATENDIDO: 'Atendido',
  CANCELADO: 'Cancelado',
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
