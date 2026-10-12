import { PrismaClient } from '@prisma/client';
import { copyFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MigrationsService } from '../src/prisma/migrations.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Una migracion que recrea una tabla PADRE (DROP TABLE products + CREATE)
 * no debe borrar nada de las tablas que la referencian. Con las llaves
 * foraneas activas, el DROP disparaba los ON DELETE SET NULL / CASCADE y la
 * receta perdia su producto (paso en una base de prueba).
 */
describe('MigrationsService con tablas recreadas', () => {
  const dir = join(tmpdir(), `migraciones-e2e-${Date.now()}`);
  const dbPath = join(dir, 'test.db').replace(/\\/g, '/');
  let prisma: PrismaClient;

  beforeAll(() => {
    mkdirSync(join(dir, 'migraciones', '0001_init'), { recursive: true });
    mkdirSync(join(dir, 'migraciones', '0001b_porcion'), { recursive: true });
    copyFileSync(
      join(
        __dirname,
        '..',
        'prisma',
        'migrations',
        '20261012034442_venta_por_porcion',
        'migration.sql',
      ),
      join(dir, 'migraciones', '0001b_porcion', 'migration.sql'),
    );
    mkdirSync(join(dir, 'migraciones', '0002_recrear_products'), { recursive: true });
    copyFileSync(
      join(__dirname, '..', 'prisma', 'migrations', '20261010120000_init', 'migration.sql'),
      join(dir, 'migraciones', '0001_init', 'migration.sql'),
    );
    copyFileSync(
      join(__dirname, 'fixtures', 'recrear-products.sql'),
      join(dir, 'migraciones', '0002_recrear_products', 'migration.sql'),
    );
    prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it('conserva las relaciones de recetas, producciones, ventas y mermas', async () => {
    const servicio = new MigrationsService(prisma as unknown as PrismaService);
    const carpeta = join(dir, 'migraciones');

    // Solo la inicial: se mueve la segunda para aplicarla despues con datos.
    const segunda = join(dir, 'segunda');
    mkdirSync(segunda, { recursive: true });
    copyFileSync(
      join(carpeta, '0002_recrear_products', 'migration.sql'),
      join(segunda, 'migration.sql'),
    );
    rmSync(join(carpeta, '0002_recrear_products'), { recursive: true, force: true });
    await servicio.applyPending(carpeta);

    const user = await prisma.user.create({
      data: { nombre: 'Prueba', email: 'prueba@x.com', passwordHash: 'x', role: 'ADMIN' },
    });
    const producto = await prisma.product.create({
      data: { sku: 'PA-0001', nombre: 'Pastel', precioUnitario: 1000, stock: 2 },
    });
    const receta = await prisma.receta.create({
      data: {
        nombre: 'Pastel',
        rendimiento: 1,
        unidadRendimiento: 'unidad',
        productoId: producto.id,
      },
    });
    await prisma.produccion.create({
      data: { recetaId: receta.id, tandas: 1, unidadesProducidas: 1, productoId: producto.id },
    });
    await prisma.mermaProducto.create({ data: { productId: producto.id, cantidad: 1 } });
    const venta = await prisma.sale.create({
      data: {
        subtotal: 1000,
        total: 1000,
        metodoPago: 'EFECTIVO',
        userId: user.id,
        items: {
          create: {
            productId: producto.id,
            descripcion: 'Pastel',
            cantidad: 1,
            precioUnitario: 1000,
            total: 1000,
          },
        },
      },
    });

    // Ahora la migracion que recrea products, ya con datos.
    mkdirSync(join(carpeta, '0002_recrear_products'), { recursive: true });
    copyFileSync(
      join(segunda, 'migration.sql'),
      join(carpeta, '0002_recrear_products', 'migration.sql'),
    );
    await servicio.applyPending(carpeta);

    expect((await prisma.receta.findUnique({ where: { id: receta.id } }))!.productoId).toBe(
      producto.id,
    );
    expect((await prisma.produccion.findFirst())!.productoId).toBe(producto.id);
    expect(await prisma.mermaProducto.count()).toBe(1);
    const item = await prisma.saleItem.findFirst({ where: { saleId: venta.id } });
    expect(item!.productId).toBe(producto.id);
    // Y las llaves foraneas vuelven a quedar activas.
    const [estado] =
      await prisma.$queryRawUnsafe<{ foreign_keys: number | bigint }[]>('PRAGMA foreign_keys');
    expect(Number(estado.foreign_keys)).toBe(1);
  });
});
