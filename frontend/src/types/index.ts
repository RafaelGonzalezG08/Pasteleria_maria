export type Role = 'ADMIN' | 'CAJERO' | 'CONTABILIDAD';

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CREDITO' | 'OTRO';

export type EstadoFactura = 'PENDIENTE' | 'GENERADA' | 'ENVIADA' | 'ERROR';

export type EstadoDeuda = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA';

export type Material = 'PLATA' | 'ORO' | 'GOLDFILLED' | 'ACERO' | 'OTRO';

export const MATERIAL_LABEL: Record<Material, string> = {
  PLATA: 'Plata',
  ORO: 'Oro',
  GOLDFILLED: 'Gold filled',
  ACERO: 'Acero',
  OTRO: 'Otro',
};

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  role: Role;
}

export interface Client {
  id: string;
  nombre: string;
  telefono: string;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
  createdAt: string;
  deudaPendiente?: number;
  debts?: ClientDebt[];
  sales?: Sale[];
}

export interface Product {
  id: string;
  sku: string;
  nombre: string;
  precioUnitario: number;
  // Solo presente cuando el backend responde a un usuario ADMIN.
  costoUnitario?: number;
  material: Material;
  stock: number;
  /** Tallas / medidas que ofrece la pieza. Vacio = no maneja tallas. */
  tallas: string[];
  imageUrl?: string | null;
  activo: boolean;
  categoriaId?: string | null;
}

export interface Category {
  id: string;
  nombre: string;
}

export interface ProductMargin {
  productId: string | null;
  nombre: string;
  sku: string | null;
  unidades: number;
  ingresos: number;
  costo: number;
  utilidad: number;
  margenPct: number;
}

export interface CostsReport {
  totales: { ingresos: number; costo: number; utilidad: number; margenPct: number };
  productos: ProductMargin[];
}

export interface SaleItem {
  id: string;
  productId?: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

export type EstadoWhatsapp = 'EN_COLA' | 'ENVIADA' | 'ERROR';

export interface Invoice {
  id: string;
  numero: string;
  estado: EstadoFactura;
  pdfUrl?: string | null;
  pngUrl?: string | null;
  sentWhatsappAt?: string | null;
  ultimoError?: string | null;
  /** Estado del envío por WhatsApp (cola en segundo plano). null = nunca se pidió. */
  whatsappEstado?: EstadoWhatsapp | null;
  whatsappIntentos?: number;
}

export interface Payment {
  id: string;
  saleId: string;
  amount: number;
  fecha: string;
  metodo: MetodoPago;
}

export interface Sale {
  id: string;
  fecha: string;
  subtotal: number;
  impuestos: number;
  total: number;
  descuentoPct?: number;
  metodoPago: MetodoPago;
  clientId?: string | null;
  client?: Client | null;
  items: SaleItem[];
  invoice?: Invoice | null;
  payments?: Payment[];
}

export interface ClientDebt {
  id: string;
  clientId?: string;
  cliente?: string;
  telefono?: string;
  client?: { id: string; nombre: string; telefono: string; lastReminderSentAt?: string | null } | null;
  sale?: {
    id: string;
    fecha?: string;
    total?: number;
    invoice?: { numero: string; pngUrl?: string | null; estado: EstadoFactura } | null;
  } | null;
  amountTotal?: number;
  amountPaid?: number;
  montoTotal?: number;
  montoPagado?: number;
  saldo?: number;
  dueDate?: string | null;
  vencimiento?: string | null;
  status: EstadoDeuda;
}

export type EstadoPedido = 'PENDIENTE' | 'EMPACADO' | 'ENTREGADO';

/** Que tan urgente es la entrega. Lo calcula el backend con la fecha del negocio. */
export type UrgenciaPedido = 'ATRASADO' | 'HOY' | 'PROXIMO' | 'SIN_FECHA';

export interface Order {
  id: string;
  saleId: string;
  estado: EstadoPedido;
  fechaEntrega?: string | null;
  notas?: string | null;
  urgencia: UrgenciaPedido;
  createdAt: string;
  sale?: {
    id: string;
    fecha: string;
    total: number;
    metodoPago: MetodoPago;
    client?: { id: string; nombre: string; telefono: string } | null;
    items: { id: string; descripcion: string; cantidad: number }[];
    invoice?: { numero: string; pngUrl?: string | null; estado: EstadoFactura } | null;
  };
}

export type EstadoPedidoWeb = 'PENDIENTE' | 'ATENDIDO' | 'CANCELADO';

export interface WebOrderItem {
  cantidad: number;
  nombre: string;
  sku: string | null;
  /** Precio de la linea completa (cantidad x unitario). */
  total: number;
}

/** Pedido llegado por el catalogo web, pegando el mensaje de WhatsApp del cliente. */
export interface WebOrder {
  id: string;
  codigo: string;
  items: WebOrderItem[];
  total: number;
  estado: EstadoPedidoWeb;
  textoOriginal: string;
  notas?: string | null;
  saleId?: string | null;
  createdAt: string;
}

export interface OrdersSummary {
  total: number;
  pendientes: number;
  empacados: number;
  atrasados: number;
  paraHoy: number;
  proximos: Order[];
}

export interface Expense {
  id: string;
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number;
  user?: { nombre: string };
}

export type TipoTransaccion = 'VENTA' | 'ABONO' | 'GASTO';

/** Fila del libro de transacciones (Reportes > Transacciones): venta, abono o gasto. */
export interface Transaccion {
  id: string;
  tipo: TipoTransaccion;
  fecha: string;
  monto: number;
  signo: 'INGRESO' | 'EGRESO';
  descripcion: string;
  metodoPago: MetodoPago | null;
  cliente: string | null;
  usuario: string | null;
  referencia: string | null;
  estado: EstadoFactura | null;
  saleId: string | null;
  facturaPngUrl: string | null;
}

export interface TransaccionesResponse {
  items: Transaccion[];
  totales: { ingresos: number; egresos: number; neto: number };
}

export interface DashboardSummary {
  ventasHoy: { total: number; cantidad: number };
  deudaTotalPendiente: number;
  gastosDelMes: number;
  /** Contado + abonos cobrados - gastos, del mes en curso. */
  saldoEnCajaMes: number;
  /** Todas las ventas - gastos, del mes en curso. */
  balanceTotalMes: number;
  gastosRecientes: Expense[];
}

export interface BusinessProfile {
  id: string;
  nombre: string;
  logoUrl?: string | null;
  direccion?: string | null;
  identifFiscal?: string | null;
  tasaImpuesto: number;
  telefonoWhatsapp?: string | null;
  descripcionWeb?: string | null;
  datosPago?: string | null;
  relevoPedidosUrl?: string | null;
  relevoPedidosClave?: string | null;
  cloudflareApiToken?: string | null;
  cloudflareAccountId?: string | null;
  cloudflarePagesProject?: string | null;
}
