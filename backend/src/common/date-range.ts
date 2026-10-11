/**
 * Interpretacion de los filtros de fecha que manda el frontend.
 *
 * El frontend usa <input type="date">, que envia siempre "YYYY-MM-DD" sin
 * hora ni zona. Si eso se pasa directo a `new Date(...)`, JavaScript lo
 * interpreta como medianoche UTC — que en Republica Dominicana (UTC-4) es
 * las 8:00 PM del dia ANTERIOR. El efecto practico era que filtrar
 * "hasta: hoy" escondia todas las ventas de hoy, y los reportes agrupaban
 * las ventas de despues de las 8:00 PM en el dia siguiente.
 *
 * Aqui las fechas sin hora se interpretan en la zona horaria local del
 * servidor (el contenedor del backend fija TZ=America/Santo_Domingo en
 * docker-compose.yml): "desde" arranca a las 00:00:00.000 y "hasta"
 * termina a las 23:59:59.999 del dia indicado, que es lo que cualquiera
 * espera al elegir un rango en un calendario.
 *
 * Si llega una fecha CON hora (ISO completo), se respeta tal cual.
 */

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Inicio del dia (00:00:00.000 local) para un "YYYY-MM-DD". */
export function parseFromDate(value: string): Date {
  if (!SOLO_FECHA.test(value)) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/** Fin del dia (23:59:59.999 local) para un "YYYY-MM-DD", inclusivo. */
export function parseToDate(value: string): Date {
  if (!SOLO_FECHA.test(value)) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/** "YYYY-MM-DD" de una fecha, en hora local (no UTC como toISOString). */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
