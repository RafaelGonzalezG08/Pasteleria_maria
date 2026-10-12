import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Datos de ejemplo SOLO para desarrollo (npm run prisma:seed). La app
 * instalada nunca corre esto: alli el administrador lo crea el dueño en la
 * pantalla de primer arranque y el inventario se carga a mano.
 *
 * Los enums viven en src/common/enums.ts, pero el tsconfig del seed tiene su
 * rootDir en prisma/ y no puede importar desde src. Como en SQLite estos
 * campos son texto, basta con repetir aqui los valores que usa el seed.
 */
const Role = { ADMIN: 'ADMIN', CAJERO: 'CAJERO', REPOSTERO: 'REPOSTERO' } as const;

const prisma = new PrismaClient();

/** Clave de los usuarios demo. Solo desarrollo: nunca existe en una instalacion real. */
const CLAVE_DEMO = 'maria1234';

async function main() {
  console.log('Sembrando datos de ejemplo...');

  const perfil = await prisma.businessProfile.findFirst();
  if (!perfil) {
    await prisma.businessProfile.create({
      data: {
        nombre: 'Pastelería María',
        direccion: 'Calle Principal #123',
        telefono: '809-555-0000',
      },
    });
  }

  const passwordHash = await bcrypt.hash(CLAVE_DEMO, 10);
  const usuarios = [
    { nombre: 'Administrador', email: 'admin@pasteleriamaria.com', role: Role.ADMIN },
    { nombre: 'Cajera Demo', email: 'cajero@pasteleriamaria.com', role: Role.CAJERO },
    { nombre: 'Repostero Demo', email: 'repostero@pasteleriamaria.com', role: Role.REPOSTERO },
  ];
  for (const u of usuarios) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  const proveedor =
    (await prisma.proveedor.findFirst({ where: { nombre: 'Distribuidora La Espiga' } })) ??
    (await prisma.proveedor.create({
      data: { nombre: 'Distribuidora La Espiga', contacto: 'Pedro', telefono: '809-555-0101' },
    }));

  // [nombre, unidad, stock, minimo, costo por unidad, tipo]
  const insumos: [string, string, number, number, number, string][] = [
    ['Harina de trigo', 'kg', 25, 10, 45, 'INGREDIENTE'],
    ['Azucar blanca', 'kg', 20, 8, 55, 'INGREDIENTE'],
    ['Huevos', 'unidad', 90, 30, 8, 'INGREDIENTE'],
    ['Mantequilla', 'kg', 6, 3, 420, 'INGREDIENTE'],
    ['Leche entera', 'L', 10, 4, 75, 'INGREDIENTE'],
    ['Cacao en polvo', 'kg', 2, 1, 650, 'INGREDIENTE'],
    ['Polvo de hornear', 'g', 500, 200, 0.6, 'INGREDIENTE'],
    ['Vainilla', 'ml', 500, 100, 1.2, 'INGREDIENTE'],
    ['Dulce de leche', 'kg', 3, 1, 380, 'INGREDIENTE'],
    ['Caja para pastel 10"', 'unidad', 20, 10, 60, 'MATERIAL'],
    ['Base de carton 10"', 'unidad', 25, 10, 25, 'MATERIAL'],
  ];
  const porNombre = new Map<string, string>();
  for (const [nombre, unidad, stock, minimo, costo, tipo] of insumos) {
    const existente = await prisma.insumo.findUnique({ where: { nombre } });
    if (existente) {
      porNombre.set(nombre, existente.id);
      continue;
    }
    const insumo = await prisma.insumo.create({
      data: {
        nombre,
        unidad,
        tipo,
        stockActual: stock,
        stockMinimo: minimo,
        costoUnitario: costo,
        proveedorId: proveedor.id,
        lotes: {
          create: { cantidadInicial: stock, cantidadRestante: stock, costoUnitario: costo },
        },
        movimientos: {
          create: {
            tipo: 'ENTRADA',
            cantidad: stock,
            costoUnitario: costo,
            stockResultante: stock,
            motivo: 'Stock inicial',
          },
        },
      },
    });
    porNombre.set(nombre, insumo.id);
  }

  const categorias = ['Pasteles', 'Panes', 'Bizcochos', 'Postres'];
  const categoriaId = new Map<string, string>();
  for (const nombre of categorias) {
    const c = await prisma.category.upsert({ where: { nombre }, update: {}, create: { nombre } });
    categoriaId.set(nombre, c.id);
  }

  const productos = [
    {
      sku: 'PA-0001',
      nombre: 'Pastel de chocolate 10"',
      precioUnitario: 2200,
      stock: 2,
      categoria: 'Pasteles',
    },
    {
      sku: 'BI-0001',
      nombre: 'Bizcochito de vainilla (individual)',
      precioUnitario: 150,
      stock: 12,
      categoria: 'Bizcochos',
    },
    { sku: 'PN-0001', nombre: 'Pan de agua', precioUnitario: 10, stock: 60, categoria: 'Panes' },
    {
      sku: 'PO-0001',
      nombre: 'Flan de caramelo',
      precioUnitario: 120,
      stock: 8,
      categoria: 'Postres',
    },
  ];
  const productoId = new Map<string, string>();
  for (const { categoria, ...p } of productos) {
    const creado = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: { ...p, categoriaId: categoriaId.get(categoria) },
    });
    productoId.set(p.nombre, creado.id);
  }

  if ((await prisma.receta.count()) === 0) {
    const relleno = await prisma.receta.create({
      data: {
        nombre: 'Relleno de dulce de leche',
        esSubreceta: true,
        rendimiento: 500,
        unidadRendimiento: 'g',
        pasos: 'Batir el dulce de leche con la mantequilla hasta que quede cremoso.',
        ingredientes: {
          create: [
            { insumoId: porNombre.get('Dulce de leche'), cantidad: 450, unidad: 'g', orden: 0 },
            { insumoId: porNombre.get('Mantequilla'), cantidad: 50, unidad: 'g', orden: 1 },
          ],
        },
      },
    });
    await prisma.receta.create({
      data: {
        nombre: 'Pastel de chocolate 10"',
        rendimiento: 1,
        unidadRendimiento: 'unidad',
        porciones: 16,
        tiempoPreparacionMin: 120,
        productoId: productoId.get('Pastel de chocolate 10"'),
        pasos:
          'Precalentar el horno a 180°C.\nMezclar los secos.\nAgregar huevos, mantequilla y leche.\nHornear 45 minutos.\nRellenar y decorar.',
        ingredientes: {
          create: [
            { insumoId: porNombre.get('Harina de trigo'), cantidad: 500, unidad: 'g', orden: 0 },
            { insumoId: porNombre.get('Azucar blanca'), cantidad: 400, unidad: 'g', orden: 1 },
            { insumoId: porNombre.get('Cacao en polvo'), cantidad: 80, unidad: 'g', orden: 2 },
            { insumoId: porNombre.get('Huevos'), cantidad: 6, unidad: 'unidad', orden: 3 },
            { insumoId: porNombre.get('Mantequilla'), cantidad: 250, unidad: 'g', orden: 4 },
            { insumoId: porNombre.get('Leche entera'), cantidad: 250, unidad: 'ml', orden: 5 },
            { insumoId: porNombre.get('Polvo de hornear'), cantidad: 15, unidad: 'g', orden: 6 },
            { subrecetaId: relleno.id, cantidad: 500, unidad: 'g', orden: 7 },
            {
              insumoId: porNombre.get('Caja para pastel 10"'),
              cantidad: 1,
              unidad: 'unidad',
              orden: 8,
            },
            {
              insumoId: porNombre.get('Base de carton 10"'),
              cantidad: 1,
              unidad: 'unidad',
              orden: 9,
            },
          ],
        },
      },
    });
    await prisma.receta.create({
      data: {
        nombre: 'Bizcochitos de vainilla (docena)',
        rendimiento: 1,
        unidadRendimiento: 'docena',
        tiempoPreparacionMin: 40,
        productoId: productoId.get('Bizcochito de vainilla (individual)'),
        ingredientes: {
          create: [
            { insumoId: porNombre.get('Harina de trigo'), cantidad: 300, unidad: 'g', orden: 0 },
            { insumoId: porNombre.get('Azucar blanca'), cantidad: 200, unidad: 'g', orden: 1 },
            { insumoId: porNombre.get('Huevos'), cantidad: 4, unidad: 'unidad', orden: 2 },
            { insumoId: porNombre.get('Mantequilla'), cantidad: 150, unidad: 'g', orden: 3 },
            { insumoId: porNombre.get('Vainilla'), cantidad: 10, unidad: 'ml', orden: 4 },
          ],
        },
      },
    });
  }

  if ((await prisma.client.count()) === 0) {
    await prisma.client.createMany({
      data: [
        {
          nombre: 'Ana Martinez',
          telefono: '+18095551234',
          direccion: 'Av. Duarte #45',
          cumpleanos: new Date(1990, 9, 14),
        },
        { nombre: 'Carlos Gomez', telefono: '+18295559876' },
      ],
    });
  }

  console.log(
    `Listo. Usuarios demo (clave "${CLAVE_DEMO}"): ${usuarios.map((u) => u.email).join(', ')}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
