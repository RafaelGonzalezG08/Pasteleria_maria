/**
 * Valores que en otro motor serian enums de la base de datos.
 *
 * SQLite no soporta enums, asi que en el esquema estos campos son texto. Para
 * no perder seguridad de tipos ni llenar el codigo de cadenas sueltas, aqui se
 * definen como objetos constantes que ademas funcionan como tipo:
 *
 *   Role.ADMIN            -> "ADMIN"
 *   function f(r: Role)   -> solo acepta "ADMIN" | "CAJERO" | "REPOSTERO"
 */

/**
 * ADMIN: todo. CAJERO: caja, ventas, cobros, clientes y encargos.
 * REPOSTERO: inventario, recetas, produccion y el avance de los encargos.
 */
export const Role = {
  ADMIN: 'ADMIN',
  CAJERO: 'CAJERO',
  REPOSTERO: 'REPOSTERO',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MetodoPago = {
  EFECTIVO: 'EFECTIVO',
  TARJETA: 'TARJETA',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CREDITO: 'CREDITO',
  OTRO: 'OTRO',
} as const;
export type MetodoPago = (typeof MetodoPago)[keyof typeof MetodoPago];

export const EstadoFactura = {
  PENDIENTE: 'PENDIENTE',
  GENERADA: 'GENERADA',
  ENVIADA: 'ENVIADA',
  ERROR: 'ERROR',
} as const;
export type EstadoFactura = (typeof EstadoFactura)[keyof typeof EstadoFactura];

/** Estado del envio por WhatsApp de una factura (ver whatsapp-queue.service.ts). */
export const EstadoWhatsapp = {
  EN_COLA: 'EN_COLA',
  ENVIADA: 'ENVIADA',
  ERROR: 'ERROR',
} as const;
export type EstadoWhatsapp = (typeof EstadoWhatsapp)[keyof typeof EstadoWhatsapp];

export const EstadoDeuda = {
  PENDIENTE: 'PENDIENTE',
  PARCIAL: 'PARCIAL',
  PAGADA: 'PAGADA',
  VENCIDA: 'VENCIDA',
} as const;
export type EstadoDeuda = (typeof EstadoDeuda)[keyof typeof EstadoDeuda];

/**
 * Estados de deuda que todavia tienen saldo, como lista explicita.
 *
 * Se usa en vez de `{ status: { not: PAGADA } }` a proposito: SQLite limita
 * cuantos parametros admite una consulta, y Prisma la parte en varias cuando
 * hace falta — pero NO puede partirla si lleva un filtro de negacion.
 * Enumerar los estados evita la negacion.
 */
export const ESTADOS_DEUDA_CON_SALDO = ['PENDIENTE', 'PARCIAL', 'VENCIDA'] as const;

/** Estados de un encargo de cliente. ENTREGADO y CANCELADO son finales. */
export const EstadoEncargo = {
  PENDIENTE: 'PENDIENTE',
  EN_PRODUCCION: 'EN_PRODUCCION',
  LISTO: 'LISTO',
  ENTREGADO: 'ENTREGADO',
  CANCELADO: 'CANCELADO',
} as const;
export type EstadoEncargo = (typeof EstadoEncargo)[keyof typeof EstadoEncargo];

/** Encargos que todavia hay que preparar o entregar (enumerados en positivo, ver arriba). */
export const ESTADOS_ENCARGO_ACTIVOS = ['PENDIENTE', 'EN_PRODUCCION', 'LISTO'] as const;

export const TipoEntrega = {
  DOMICILIO: 'DOMICILIO',
  RETIRO: 'RETIRO',
} as const;
export type TipoEntrega = (typeof TipoEntrega)[keyof typeof TipoEntrega];

/** Ingrediente (harina, huevos...) o material (cajas, bases de pastel, velas...). */
export const TipoInsumo = {
  INGREDIENTE: 'INGREDIENTE',
  MATERIAL: 'MATERIAL',
} as const;
export type TipoInsumo = (typeof TipoInsumo)[keyof typeof TipoInsumo];

/** Tipos de movimiento del historial de un insumo. */
export const TipoMovimiento = {
  ENTRADA: 'ENTRADA',
  SALIDA: 'SALIDA',
  AJUSTE: 'AJUSTE',
  MERMA: 'MERMA',
  COMPRA: 'COMPRA',
  PRODUCCION: 'PRODUCCION',
} as const;
export type TipoMovimiento = (typeof TipoMovimiento)[keyof typeof TipoMovimiento];

/** Listas para validadores (class-validator `IsIn`) y para recorrer valores. */
export const ROLES = Object.values(Role);
export const METODOS_PAGO = Object.values(MetodoPago);
export const ESTADOS_FACTURA = Object.values(EstadoFactura);
export const ESTADOS_DEUDA = Object.values(EstadoDeuda);
export const ESTADOS_ENCARGO = Object.values(EstadoEncargo);
export const TIPOS_ENTREGA = Object.values(TipoEntrega);
export const TIPOS_INSUMO = Object.values(TipoInsumo);
