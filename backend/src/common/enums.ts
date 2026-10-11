/**
 * Valores que antes eran enums de Postgres.
 *
 * SQLite no soporta enums, asi que en el esquema estos campos son texto. Para
 * no perder seguridad de tipos ni llenar el codigo de cadenas sueltas, aqui se
 * definen como objetos constantes que ademas funcionan como tipo:
 *
 *   Role.ADMIN            -> "ADMIN"     (igual que antes)
 *   function f(r: Role)   -> solo acepta "ADMIN" | "CAJERO" | "CONTABILIDAD"
 *
 * Asi el resto del backend sigue escribiendose exactamente igual que cuando
 * los enums venian de @prisma/client; solo cambia de donde se importan.
 */

export const Role = {
  ADMIN: 'ADMIN',
  CAJERO: 'CAJERO',
  CONTABILIDAD: 'CONTABILIDAD',
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
 * Estados por los que pasa un pedido antes de llegar al cliente. ENTREGADO no
 * llega a guardarse: al marcarlo, el pedido se borra y la factura queda como
 * el registro de la venta (ver orders.service.ts).
 */
export const EstadoPedido = {
  PENDIENTE: 'PENDIENTE',
  EMPACADO: 'EMPACADO',
  ENTREGADO: 'ENTREGADO',
} as const;
export type EstadoPedido = (typeof EstadoPedido)[keyof typeof EstadoPedido];

/**
 * Estados de deuda que todavia tienen saldo, como lista explicita.
 *
 * Se usa en vez de `{ status: { not: PAGADA } }` a proposito: SQLite limita
 * cuantos parametros admite una consulta, y Prisma la parte en varias cuando
 * hace falta — pero NO puede partirla si lleva un filtro de negacion. Con
 * 2431 clientes eso reventaba el listado entero ("Query parameter limit
 * exceeded"). Enumerar los estados evita la negacion y deja que Prisma parta
 * la consulta con normalidad.
 */
export const ESTADOS_DEUDA_CON_SALDO = ['PENDIENTE', 'PARCIAL', 'VENCIDA'] as const;

/** Listas para validadores (class-validator `IsIn`) y para recorrer valores. */
/**
 * Material de una pieza de joyeria. Se usa para el filtro del catalogo web
 * (el dato que mas preguntan los clientes ademas del precio) y para la
 * insignia en la esquina de la foto en Productos, asi se confirma de un
 * vistazo al cargar la pieza en vez de tener que abrirla para revisarlo.
 */
export const Material = {
  PLATA: 'PLATA',
  ORO: 'ORO',
  GOLDFILLED: 'GOLDFILLED',
  ACERO: 'ACERO',
  OTRO: 'OTRO',
} as const;
export type Material = (typeof Material)[keyof typeof Material];

export const MATERIAL_LABEL: Record<Material, string> = {
  PLATA: 'Plata',
  ORO: 'Oro',
  GOLDFILLED: 'Gold filled',
  ACERO: 'Acero',
  OTRO: 'Otro',
};

/**
 * Estado de un pedido llegado por el catalogo web. Distinto de EstadoPedido
 * (que es de una venta ya cobrada en el POS): un pedido web todavia no es
 * una venta, solo una intencion de compra que hay que atender.
 */
export const EstadoPedidoWeb = {
  PENDIENTE: 'PENDIENTE',
  ATENDIDO: 'ATENDIDO',
  CANCELADO: 'CANCELADO',
} as const;
export type EstadoPedidoWeb = (typeof EstadoPedidoWeb)[keyof typeof EstadoPedidoWeb];

export const ROLES = Object.values(Role);
export const MATERIALES = Object.values(Material);
export const ESTADOS_PEDIDO_WEB = Object.values(EstadoPedidoWeb);
export const METODOS_PAGO = Object.values(MetodoPago);
export const ESTADOS_FACTURA = Object.values(EstadoFactura);
export const ESTADOS_DEUDA = Object.values(EstadoDeuda);
export const ESTADOS_PEDIDO = Object.values(EstadoPedido);
