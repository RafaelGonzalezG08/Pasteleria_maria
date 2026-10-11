import { PrismaClient } from '@prisma/client';
// Los enums viven en src/common/enums.ts, pero el tsconfig del seed tiene su
// rootDir en prisma/ y no puede importar desde src. Como en SQLite estos
// campos son texto, basta con repetir aqui los valores que usa el seed.
const Role = { ADMIN: 'ADMIN', CAJERO: 'CAJERO', CONTABILIDAD: 'CONTABILIDAD' } as const;
const MetodoPago = { EFECTIVO: 'EFECTIVO', TARJETA: 'TARJETA', TRANSFERENCIA: 'TRANSFERENCIA', CREDITO: 'CREDITO', OTRO: 'OTRO' } as const;
const EstadoFactura = { PENDIENTE: 'PENDIENTE', GENERADA: 'GENERADA', ENVIADA: 'ENVIADA', ERROR: 'ERROR' } as const;
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Sembrando datos de ejemplo...');

  await prisma.businessProfile.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      nombre: 'Cafe Shopping',
      direccion: 'Calle Principal #123',
      tasaImpuesto: 0.18,
    },
  });

  const passwordHash = await bcrypt.hash('cafe1234', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@cafeshopping.com' },
    update: {},
    create: {
      nombre: 'Administrador',
      email: 'admin@cafeshopping.com',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const cajero = await prisma.user.upsert({
    where: { email: 'cajero@cafeshopping.com' },
    update: {},
    create: {
      nombre: 'Cajero Demo',
      email: 'cajero@cafeshopping.com',
      passwordHash,
      role: Role.CAJERO,
    },
  });

  await prisma.user.upsert({
    where: { email: 'contabilidad@cafeshopping.com' },
    update: {},
    create: {
      nombre: 'Contabilidad Demo',
      email: 'contabilidad@cafeshopping.com',
      passwordHash,
      role: Role.CONTABILIDAD,
    },
  });

  // Usuario de sistema para atribuir las ventas hechas desde el punto de venta
  // oculto del catalogo web. No puede iniciar sesion (hash de un valor
  // aleatorio descartado). En produccion lo crea la migracion
  // 20260905120100_usuario_ventas_web.
  await prisma.user.upsert({
    where: { email: 'ventas-web@cafeshopping.local' },
    update: {},
    create: {
      id: 'usuario-ventas-web',
      nombre: 'Ventas web',
      email: 'ventas-web@cafeshopping.local',
      passwordHash: await bcrypt.hash(Math.random().toString(36), 10),
      role: Role.CAJERO,
    },
  });

  const productos = [
    { sku: 'AN-001', nombre: 'Anillo solitario oro 18k 0.5ct', precioUnitario: 45000, stock: 5 },
    { sku: 'AN-002', nombre: 'Anillo argolla plata 925', precioUnitario: 3200, stock: 20 },
    { sku: 'CO-001', nombre: 'Collar cadena oro 14k 45cm', precioUnitario: 18500, stock: 8 },
    { sku: 'CO-002', nombre: 'Collar perlas cultivadas', precioUnitario: 9800, stock: 10 },
    { sku: 'AR-001', nombre: 'Aretes diamante oro blanco', precioUnitario: 32000, stock: 6 },
    { sku: 'AR-002', nombre: 'Aretes argolla plata 925', precioUnitario: 2400, stock: 25 },
    { sku: 'PU-001', nombre: 'Pulsera tenis circonia', precioUnitario: 12500, stock: 12 },
    { sku: 'RE-001', nombre: 'Reloj acero inoxidable clasico', precioUnitario: 15900, stock: 7 },
  ];
  for (const p of productos) {
    await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p });
  }

  const cliente = await prisma.client.upsert({
    where: { id: 'cliente-demo' },
    update: {},
    create: {
      id: 'cliente-demo',
      nombre: 'Juan Rodriguez',
      telefono: '+18095551234',
      email: 'juan@example.com',
      direccion: 'Av. Independencia #45',
    },
  });

  const existingSale = await prisma.sale.findFirst({ where: { clientId: cliente.id } });
  if (!existingSale) {
    const subtotal = 6400;
    const impuestos = 1152;
    const total = 7552;

    const sale = await prisma.sale.create({
      data: {
        subtotal,
        impuestos,
        total,
        metodoPago: MetodoPago.EFECTIVO,
        userId: cajero.id,
        clientId: cliente.id,
        items: {
          create: [
            { descripcion: 'Aretes argolla plata 925', cantidad: 1, precioUnitario: 2400, total: 2400 },
            { descripcion: 'Anillo argolla plata 925', cantidad: 1, precioUnitario: 3200, total: 3200 },
            { descripcion: 'Pulsera tenis circonia', cantidad: 1, precioUnitario: 800, total: 800 },
          ],
        },
      },
    });

    await prisma.invoice.create({
      data: {
        saleId: sale.id,
        numero: `FAC-${new Date().getFullYear()}-00001`,
        estado: EstadoFactura.PENDIENTE,
      },
    });
  }

  console.log('Listo. Usuarios de prueba (password: "cafe1234"):');
  console.log(`  - ${admin.email} (ADMIN)`);
  console.log(`  - ${cajero.email} (CAJERO)`);
  console.log('  - contabilidad@cafeshopping.com (CONTABILIDAD)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
