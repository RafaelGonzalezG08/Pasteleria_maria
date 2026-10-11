/**
 * Borra las 9 ventas de prueba que se crearon por error el 2026-09-02 al
 * reproducir el fallo del POS: FAC-2026-00024 a FAC-2026-00032.
 *
 * Todas son de contado (EFECTIVO), con items escritos a mano (CUADRE, X, Y, Z,
 * A, B0, B1, B2), sin cliente, sin abonos, sin deudas, sin pedidos y sin tocar
 * el inventario. La ultima venta REAL del negocio es FAC-2026-00023
 * ("Dormilona Piedra", 26 de agosto).
 *
 * Correr desde la carpeta backend/:
 *   node limpiar-datos-prueba.mjs
 *
 * Apunta a la base de datos de la version de escritorio en desarrollo
 * (%APPDATA%\cafe-shopping-desktop\datos\cafe-shopping.db).
 */
import { PrismaClient } from '@prisma/client';
import { join } from 'path';

const dbPath = join(process.env.APPDATA, 'cafe-shopping-desktop', 'datos', 'cafe-shopping.db');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + dbPath } } });

const NUMEROS = [
  'FAC-2026-00024', 'FAC-2026-00025', 'FAC-2026-00026', 'FAC-2026-00027',
  'FAC-2026-00028', 'FAC-2026-00029', 'FAC-2026-00030', 'FAC-2026-00031',
  'FAC-2026-00032',
];

const invoices = await prisma.invoice.findMany({
  where: { numero: { in: NUMEROS } },
  select: { id: true, saleId: true, numero: true },
});
const saleIds = invoices.map((i) => i.saleId);

const pagos = await prisma.payment.count({ where: { saleId: { in: saleIds } } });
const deudas = await prisma.clientDebt.count({ where: { saleId: { in: saleIds } } });
const itemsConProducto = await prisma.saleItem.count({
  where: { saleId: { in: saleIds }, productId: { not: null } },
});

console.log(`Facturas de prueba encontradas: ${invoices.length}`);
console.log(`  pagos asociados: ${pagos} | deudas: ${deudas} | items con producto: ${itemsConProducto}`);

if (pagos > 0 || deudas > 0 || itemsConProducto > 0) {
  console.error('ABORTADO: alguna venta tiene dependencias inesperadas. Revisar a mano.');
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.$transaction([
  prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } }),
  prisma.order.deleteMany({ where: { saleId: { in: saleIds } } }),
  prisma.invoice.deleteMany({ where: { saleId: { in: saleIds } } }),
  prisma.sale.deleteMany({ where: { id: { in: saleIds } } }),
]);
await prisma.auditLog.deleteMany({ where: { entity: 'Sale', entityId: { in: saleIds } } });

const total = await prisma.sale.count();
const ultimas = await prisma.invoice.findMany({
  select: { numero: true },
  orderBy: { numero: 'desc' },
  take: 3,
});
console.log(`Listo. Ventas restantes: ${total}. Ultimas facturas: ${ultimas.map((x) => x.numero).join(', ')}`);

await prisma.$disconnect();
