export type Role = 'ADMIN' | 'CAJERO' | 'REPOSTERO';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  CAJERO: 'Cajero',
  REPOSTERO: 'Repostero',
};

export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'CREDITO' | 'OTRO';

export type EstadoFactura = 'PENDIENTE' | 'GENERADA' | 'ENVIADA' | 'ERROR';

export type EstadoDeuda = 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA';

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  role: Role;
}

export interface FechaEspecial {
  descripcion: string;
  fecha: string;
}

export interface Client {
  id: string;
  nombre: string;
  telefono: string;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
  cumpleanos?: string | null;
  fechasEspeciales?: FechaEspecial[];
  createdAt: string;
  deudaPendiente?: number;
  debts?: ClientDebt[];
  sales?: Sale[];
  encargos?: EncargoResumenCliente[];
}

export interface EncargoResumenCliente {
  id: string;
  codigo: string;
  fechaEntrega: string;
  estado: EstadoEncargo;
  total: number;
  abonado: number;
  saldo: number;
  items: { descripcion: string; cantidad: number }[];
}

export interface ProximaFecha {
  clientId: string;
  nombre: string;
  telefono: string;
  descripcion: string;
  fecha: string;
  enDias: number;
}

export interface Product {
  id: string;
  sku: string;
  nombre: string;
  precioUnitario: number;
  // Solo presente cuando el backend responde a un usuario ADMIN.
  costoUnitario?: number;
  stock: number;
  imageUrl?: string | null;
  descripcion?: string | null;
  activo: boolean;
  categoriaId?: string | null;
  categoria?: { id: string; nombre: string } | null;
  receta?: { id: string; nombre: string } | null;
  /** Venta por porcion: este producto es una porcion de `porcionDe`. */
  porcionDeId?: string | null;
  porcionesPorUnidad?: number | null;
  porcionDe?: { id: string; nombre: string; stock: number } | null;
  /** Productos que son porciones de este (si se vende tambien por pedazo). */
  porciones?: { id: string; nombre: string; porcionesPorUnidad: number | null }[];
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
  encargo?: { id: string; codigo: string } | null;
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

// ---------- Inventario ----------

export type TipoInsumo = 'INGREDIENTE' | 'MATERIAL';
export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'MERMA' | 'COMPRA' | 'PRODUCCION';

export interface Insumo {
  id: string;
  nombre: string;
  tipo: TipoInsumo;
  unidad: string;
  unidadNombre?: string;
  stockActual: number;
  stockMinimo: number;
  /** Solo ADMIN. */
  costoUnitario?: number;
  valorStock?: number;
  proveedorId?: string | null;
  proveedor?: { id: string; nombre: string } | null;
  notas?: string | null;
  activo: boolean;
  proximoVencimiento?: string | null;
  bajoMinimo?: boolean;
  porVencer?: boolean;
  vencido?: boolean;
}

export interface LoteInsumo {
  id: string;
  cantidadInicial: number;
  cantidadRestante: number;
  costoUnitario?: number;
  fechaVencimiento?: string | null;
  fechaEntrada: string;
}

export interface MovimientoInsumo {
  id: string;
  insumoId: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costoUnitario?: number;
  stockResultante: number;
  motivo?: string | null;
  fecha: string;
  user?: { nombre: string } | null;
  insumo?: { id: string; nombre: string; unidad: string };
}

export interface InsumoDetalle extends Insumo {
  lotes: LoteInsumo[];
  movimientos: MovimientoInsumo[];
  usadoEnRecetas: { id: string; nombre: string }[];
}

export interface AlertasInventario {
  bajos: { id: string; nombre: string; unidad: string; stockActual: number; stockMinimo: number; faltante: number }[];
  porVencer: {
    loteId: string;
    insumoId: string;
    nombre: string;
    unidad: string;
    cantidad: number;
    fechaVencimiento: string;
    vencido: boolean;
  }[];
}

// ---------- Recetas ----------

export interface RecetaResumen {
  id: string;
  nombre: string;
  esSubreceta: boolean;
  rendimiento: number;
  unidadRendimiento: string;
  porciones?: number | null;
  tiempoPreparacionMin?: number | null;
  activo: boolean;
  producto?: { id: string; nombre: string; precioUnitario: number; stock: number } | null;
  totalIngredientes: number;
  usadaEnRecetas: number;
  costoTotal?: number | null;
  costoPorUnidad?: number | null;
  costoPorPorcion?: number | null;
  precioSugeridoUnidad?: number | null;
  errorCosto?: string | null;
}

export interface IngredienteReceta {
  id: string;
  insumoId?: string | null;
  subrecetaId?: string | null;
  cantidad: number;
  unidad: string;
  orden: number;
  insumo?: { id: string; nombre: string; unidad: string; stockActual: number } | null;
  subreceta?: { id: string; nombre: string; unidadRendimiento: string } | null;
  costo?: number;
}

export interface Costeo {
  costoTotal: number;
  costoPorUnidad: number;
  costoPorPorcion: number;
  margenPct: number;
  precioSugeridoUnidad: number;
  precioSugeridoPorcion: number;
}

export interface RecetaDetalle {
  id: string;
  nombre: string;
  esSubreceta: boolean;
  rendimiento: number;
  unidadRendimiento: string;
  porciones?: number | null;
  tiempoPreparacionMin?: number | null;
  pasos?: string | null;
  margenPct?: number | null;
  productoId?: string | null;
  activo: boolean;
  producto?: { id: string; nombre: string; precioUnitario: number; stock: number } | null;
  unidadesPorTanda?: number | null;
  ingredientes: IngredienteReceta[];
  usadaEn: { id: string; nombre: string }[];
  /** Solo ADMIN. */
  costeo?: Costeo;
}

export interface RecetaEscalada {
  factor: number;
  rendimiento: number;
  unidadRendimiento: string;
  porciones: number | null;
  costoTotal?: number;
  lineas: { id: string; tipo: 'INSUMO' | 'SUBRECETA'; refId: string; nombre: string; cantidad: number; unidad: string; costo?: number }[];
  insumos: { insumoId: string; nombre: string; unidad: string; necesario: number; disponible: number; faltante: number }[];
}

// ---------- Produccion ----------

export interface Produccion {
  id: string;
  fecha: string;
  recetaId: string;
  tandas: number;
  unidadesProducidas: number;
  costoTotal?: number;
  notas?: string | null;
  receta: { id: string; nombre: string; unidadRendimiento: string };
  producto?: { id: string; nombre: string } | null;
  user?: { nombre: string } | null;
}

export interface ProductoAPreparar {
  productId: string;
  nombre: string;
  cantidad: number;
  stock: number;
  faltante: number;
  tandasSugeridas: number;
  receta: { id: string; nombre: string; unidadesPorTanda: number | null } | null;
}

export interface HojaProduccion {
  fecha: string;
  productos: ProductoAPreparar[];
  encargos: {
    id: string;
    codigo: string;
    estado: EstadoEncargo;
    fechaEntrega: string;
    tipoEntrega: TipoEntrega;
    cliente: { id: string; nombre: string; telefono: string };
    notas?: string | null;
    items: (Personalizacion & { id: string; descripcion: string; cantidad: number; productId?: string | null })[];
  }[];
}

export interface ListaCompras {
  dias: number;
  desde: string;
  hasta: string;
  encargosConsiderados: number;
  productos: ProductoAPreparar[];
  productosSinReceta: string[];
  insumos: {
    insumoId: string;
    nombre: string;
    unidad: string;
    necesarioEncargos: number;
    disponible: number;
    stockMinimo: number;
    aComprar: number;
    costoEstimado?: number;
    proveedor?: { id: string; nombre: string; telefono?: string | null } | null;
    motivo: 'ENCARGOS' | 'MINIMO' | null;
  }[];
  costoEstimadoTotal?: number;
}

// ---------- Proveedores y compras ----------

export interface Proveedor {
  id: string;
  nombre: string;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  notas?: string | null;
  activo: boolean;
  totalInsumos?: number;
  totalCompras?: number;
  ultimaCompra?: string | null;
}

export interface Compra {
  id: string;
  fecha: string;
  proveedor?: { id: string; nombre: string } | null;
  numeroFactura?: string | null;
  total: number;
  notas?: string | null;
  totalLineas?: number;
  user?: { nombre: string } | null;
  items?: {
    id: string;
    cantidad: number;
    unidad: string;
    costoTotal: number;
    costoUnitario: number;
    fechaVencimiento?: string | null;
    insumo: { id: string; nombre: string; unidad: string };
  }[];
}

// ---------- Encargos ----------

export type EstadoEncargo = 'PENDIENTE' | 'EN_PRODUCCION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO';
export type TipoEntrega = 'DOMICILIO' | 'RETIRO';
export type UrgenciaEncargo = 'ATRASADO' | 'HOY' | 'PRONTO' | 'PROGRAMADO' | 'CERRADO';

export interface Personalizacion {
  tamano?: string | null;
  sabor?: string | null;
  relleno?: string | null;
  decoracion?: string | null;
  mensaje?: string | null;
  fotoReferenciaUrl?: string | null;
}

export interface EncargoItem extends Personalizacion {
  id: string;
  productId?: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

export interface EncargoPago {
  id: string;
  monto: number;
  metodo: MetodoPago;
  nota?: string | null;
  fecha: string;
  user?: { nombre: string } | null;
}

export interface Encargo {
  id: string;
  codigo: string;
  clientId: string;
  client: { id: string; nombre: string; telefono: string; direccion?: string | null };
  fechaEntrega: string;
  tipoEntrega: TipoEntrega;
  direccionEntrega?: string | null;
  costoEnvio: number;
  estado: EstadoEncargo;
  subtotal: number;
  impuestos: number;
  total: number;
  tasaImpuesto: number;
  abonado: number;
  saldo: number;
  notas?: string | null;
  motivoCancelacion?: string | null;
  urgencia: UrgenciaEncargo;
  items: EncargoItem[];
  pagos?: EncargoPago[];
  sale?: { id: string; invoice?: { numero: string; pngUrl?: string | null } | null } | null;
  user?: { nombre: string } | null;
  entregadoAt?: string | null;
  createdAt: string;
}

export interface ResumenEncargos {
  total: number;
  pendientes: number;
  enProduccion: number;
  listos: number;
  atrasados: number;
  paraHoy: number;
  diasAlerta: number;
  saldoPorCobrar: number;
  proximos: Encargo[];
}

// ---------- Gastos, transacciones, dashboard ----------

export interface Expense {
  id: string;
  fecha: string;
  categoria: string;
  descripcion: string;
  monto: number;
  user?: { nombre: string };
}

export type TipoTransaccion = 'VENTA' | 'ABONO' | 'ANTICIPO' | 'GASTO';

/** Fila del libro de transacciones: venta, abono, anticipo de encargo o gasto. */
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
  /** Contado + abonos + anticipos cobrados - gastos, del mes en curso. */
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
  telefono?: string | null;
  identifFiscal?: string | null;
  moneda: string;
  nombreImpuesto: string;
  tasaImpuesto: number;
  margenGananciaPct: number;
  diasAlertaEncargos: number;
  diasAlertaVencimiento: number;
  diasAlertaCumpleanos: number;
}
