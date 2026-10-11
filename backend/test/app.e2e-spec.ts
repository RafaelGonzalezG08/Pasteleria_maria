import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { BootstrapService } from '../src/prisma/bootstrap.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaClient } from '@prisma/client';
import { readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Test e2e sobre una base SQLite temporal (la crea y migra test/global-setup.ts).
 * Cubre el camino que mueve dinero: venta → factura → abono → borrado.
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let estadoInicial: boolean;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    await app.get(BootstrapService).ensureInitialData();

    // Base recien migrada = instalacion nueva: no hay administrador hasta que
    // el dueño lo crea en la pantalla de primer arranque.
    const estado = await request(app.getHttpServer()).get('/api/auth/setup-status');
    estadoInicial = estado.body.necesitaConfiguracion;

    const setup = await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ nombre: 'Administrador', email: 'admin@cafeshopping.com', password: 'cafe1234' });
    token = setup.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (r: any) => r.set('Authorization', `Bearer ${token}`);

  it('una instalacion nueva pide crear el administrador, y la sesion queda iniciada', async () => {
    // El usuario de sistema "ventas-web" lo crea la migracion y NO cuenta.
    expect(estadoInicial).toBe(true);
    expect(token).toBeTruthy();
    const yo = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@cafeshopping.com', password: 'cafe1234' });
    expect(yo.status).toBe(201);
    expect(yo.body.user.role).toBe('ADMIN');
  });

  it('ya configurada (p. ej. tras actualizar la app) no vuelve a pedir ni permite otro setup', async () => {
    const estado = await request(app.getHttpServer()).get('/api/auth/setup-status');
    expect(estado.body.necesitaConfiguracion).toBe(false);

    const intento = await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ nombre: 'Intruso', email: 'intruso@x.com', password: 'secreto1' });
    expect(intento.status).toBe(409);
    expect(await prisma.user.count({ where: { email: 'intruso@x.com' } })).toBe(0);
  });

  it('el setup valida los datos', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/setup')
      .send({ nombre: 'A', email: 'no-es-correo', password: '123' });
    expect(r.status).toBe(400);
  });

  it('rechaza credenciales inválidas con 401', async () => {
    const r = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'no-existe@cafeshopping.com', password: 'incorrecta12' });
    expect(r.status).toBe(401);
  });

  it('/api/clients sin token responde 401', async () => {
    const r = await request(app.getHttpServer()).get('/api/clients');
    expect(r.status).toBe(401);
  });

  it('numera las facturas de forma consecutiva', async () => {
    const prod = await prisma.product.create({
      data: { sku: `E2E-${Date.now()}`, nombre: 'Anillo e2e', precioUnitario: 500, stock: 10 },
    });

    const venta = (desc: string) =>
      auth(request(app.getHttpServer()).post('/api/sales')).send({
        metodoPago: 'EFECTIVO',
        generarFactura: false,
        items: [{ productId: prod.id, descripcion: desc, cantidad: 1, precioUnitario: 500 }],
      });

    const a = await venta('primera');
    const b = await venta('segunda');
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const na = parseInt(a.body.invoice.numero.split('-').pop(), 10);
    const nb = parseInt(b.body.invoice.numero.split('-').pop(), 10);
    expect(nb).toBe(na + 1);
  });

  it('venta a crédito crea deuda; el abono la reduce', async () => {
    const cliente = await prisma.client.create({
      data: { nombre: 'Cliente e2e', telefono: '8090000000' },
    });

    const venta = await auth(request(app.getHttpServer()).post('/api/sales')).send({
      metodoPago: 'CREDITO',
      clientId: cliente.id,
      generarFactura: false,
      tasaImpuesto: 0,
      items: [{ descripcion: 'Cadena a crédito', cantidad: 1, precioUnitario: 3000 }],
    });
    expect(venta.status).toBe(201);

    const deudas = await auth(request(app.getHttpServer()).get('/api/client-debts'));
    const deuda = deudas.body.find((d: any) => d.clientId === cliente.id);
    expect(deuda).toBeTruthy();
    expect(Number(deuda.amountTotal)).toBe(3000);

    const abono = await auth(
      request(app.getHttpServer()).post(`/api/client-debts/${deuda.id}/payments`),
    ).send({ amount: 1000, metodo: 'EFECTIVO' });
    expect(abono.status).toBe(201);

    const despues = await prisma.clientDebt.findUnique({ where: { id: deuda.id } });
    expect(Number(despues!.amountPaid)).toBe(1000);
    expect(despues!.status).toBe('PARCIAL');
  });

  it('borrar una venta (admin) devuelve el stock', async () => {
    const prod = await prisma.product.create({
      data: { sku: `E2E-STK-${Date.now()}`, nombre: 'Pulsera e2e', precioUnitario: 800, stock: 5 },
    });

    const venta = await auth(request(app.getHttpServer()).post('/api/sales')).send({
      metodoPago: 'EFECTIVO',
      generarFactura: false,
      items: [{ productId: prod.id, descripcion: 'Pulsera e2e', cantidad: 2, precioUnitario: 800 }],
    });
    expect(venta.status).toBe(201);
    expect((await prisma.product.findUnique({ where: { id: prod.id } }))!.stock).toBe(3);

    const del = await auth(request(app.getHttpServer()).delete(`/api/sales/${venta.body.id}`)).send(
      {
        adminPassword: 'cafe1234',
      },
    );
    expect(del.status).toBe(200);
    expect((await prisma.product.findUnique({ where: { id: prod.id } }))!.stock).toBe(5);
  });

  it('borrar una venta a crédito sin abonos borra también su deuda', async () => {
    const cliente = await prisma.client.create({
      data: { nombre: 'Cliente deuda e2e', telefono: '8091112222' },
    });
    const venta = await auth(request(app.getHttpServer()).post('/api/sales')).send({
      metodoPago: 'CREDITO',
      clientId: cliente.id,
      generarFactura: false,
      tasaImpuesto: 0,
      items: [{ descripcion: 'Anillo a crédito', cantidad: 1, precioUnitario: 1200 }],
    });
    expect(venta.status).toBe(201);
    expect(await prisma.clientDebt.count({ where: { clientId: cliente.id } })).toBe(1);

    const del = await auth(request(app.getHttpServer()).delete(`/api/sales/${venta.body.id}`)).send(
      {
        adminPassword: 'cafe1234',
      },
    );
    expect(del.status).toBe(200);
    expect(await prisma.clientDebt.count({ where: { clientId: cliente.id } })).toBe(0);
  });

  it('borrar una categoría deja sus productos sin categoría (no los borra)', async () => {
    const cat = await prisma.category.create({ data: { nombre: `Cat e2e ${Date.now()}` } });
    const prod = await prisma.product.create({
      data: {
        sku: `E2E-CAT-${Date.now()}`,
        nombre: 'Con categoría',
        precioUnitario: 100,
        stock: 1,
        categoriaId: cat.id,
      },
    });

    const del = await auth(request(app.getHttpServer()).delete(`/api/categories/${cat.id}`));
    expect(del.status).toBe(200);

    const despues = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(despues).not.toBeNull();
    expect(despues!.categoriaId).toBeNull();
  });

  it('rechaza una venta con un producto que ya no existe, con mensaje claro', async () => {
    const r = await auth(request(app.getHttpServer()).post('/api/sales')).send({
      metodoPago: 'EFECTIVO',
      generarFactura: false,
      items: [
        { productId: 'no-existe', descripcion: 'Fantasma', cantidad: 1, precioUnitario: 100 },
      ],
    });
    expect(r.status).toBe(400);
    expect(String(r.body.message)).toMatch(/Fantasma/);
  });

  it('reports/cashflow devuelve saldo en caja y balance total', async () => {
    const r = await auth(request(app.getHttpServer()).get('/api/reports/cashflow'));
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('saldoEnCaja');
    expect(r.body).toHaveProperty('balanceTotal');
    // Hubo ventas de contado en los tests anteriores.
    expect(r.body.cobrado).toBeGreaterThan(0);
  });

  it('importar productos trae la categoría (por nombre) y las tallas', async () => {
    const sku = `IMP-${Date.now()}`;
    const rutaOrigen = join(tmpdir(), `origen-e2e-${Date.now()}.sqlite`).replace(/\\/g, '/');
    // El "archivo de la otra computadora": una copia de esta misma base, en
    // la que solo queda activa la pieza de prueba (con categoria y tallas).
    await prisma.$executeRawUnsafe(`VACUUM INTO '${rutaOrigen}'`);
    const origen = new PrismaClient({ datasources: { db: { url: `file:${rutaOrigen}` } } });
    try {
      const cat = await origen.category.create({ data: { nombre: `Anillo Import ${Date.now()}` } });
      await origen.product.updateMany({ data: { activo: false } });
      await origen.product.create({
        data: {
          sku,
          nombre: 'Anillo importado',
          precioUnitario: 900,
          stock: 3,
          tallas: JSON.stringify(['6', '7']),
          categoriaId: cat.id,
        },
      });
      await origen.$disconnect();

      const r = await auth(request(app.getHttpServer()).post('/api/data-import/productos')).attach(
        'file',
        readFileSync(rutaOrigen),
        'origen.sqlite',
      );
      expect(r.status).toBe(201);
      expect(r.body.agregados).toBe(1);

      const importado = await prisma.product.findUnique({
        where: { sku },
        include: { categoria: true },
      });
      expect(importado).not.toBeNull();
      // La categoria no existia aqui: se crea con el mismo nombre.
      expect(importado!.categoria?.nombre).toBe(cat.nombre);
      expect(JSON.parse(importado!.tallas!)).toEqual(['6', '7']);
      expect(await prisma.category.count({ where: { nombre: cat.nombre } })).toBe(1);
    } finally {
      rmSync(rutaOrigen, { force: true });
    }
  });
});
