import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { BootstrapService } from '../src/prisma/bootstrap.service';
import { PrismaService } from '../src/prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const request = require('supertest');

/**
 * Test e2e sobre una base SQLite temporal (la crea y migra test/global-setup.ts).
 * Cubre el camino que mueve dinero (venta → factura → abono → borrado) y el
 * flujo completo de la pasteleria: insumo → receta → produccion → encargo →
 * cobro → reportes.
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
      .send({ nombre: 'Administrador', email: 'admin@pasteleriamaria.com', password: 'maria1234' });
    token = setup.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (r: any) => r.set('Authorization', `Bearer ${token}`);

  it('una instalacion nueva pide crear el administrador, y la sesion queda iniciada', async () => {
    expect(estadoInicial).toBe(true);
    expect(token).toBeTruthy();
    const yo = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'admin@pasteleriamaria.com', password: 'maria1234' });
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
      .send({ email: 'no-existe@pasteleriamaria.com', password: 'incorrecta12' });
    expect(r.status).toBe(401);
  });

  it('/api/clients sin token responde 401', async () => {
    const r = await request(app.getHttpServer()).get('/api/clients');
    expect(r.status).toBe(401);
  });

  it('numera las facturas de forma consecutiva', async () => {
    const prod = await prisma.product.create({
      data: { sku: `E2E-${Date.now()}`, nombre: 'Pan e2e', precioUnitario: 500, stock: 10 },
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
      items: [{ descripcion: 'Pastel a crédito', cantidad: 1, precioUnitario: 3000 }],
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
      data: { sku: `E2E-STK-${Date.now()}`, nombre: 'Bizcocho e2e', precioUnitario: 800, stock: 5 },
    });

    const venta = await auth(request(app.getHttpServer()).post('/api/sales')).send({
      metodoPago: 'EFECTIVO',
      generarFactura: false,
      items: [
        { productId: prod.id, descripcion: 'Bizcocho e2e', cantidad: 2, precioUnitario: 800 },
      ],
    });
    expect(venta.status).toBe(201);
    expect((await prisma.product.findUnique({ where: { id: prod.id } }))!.stock).toBe(3);

    const del = await auth(request(app.getHttpServer()).delete(`/api/sales/${venta.body.id}`)).send(
      {
        adminPassword: 'maria1234',
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
      items: [{ descripcion: 'Torta a crédito', cantidad: 1, precioUnitario: 1200 }],
    });
    expect(venta.status).toBe(201);
    expect(await prisma.clientDebt.count({ where: { clientId: cliente.id } })).toBe(1);

    const del = await auth(request(app.getHttpServer()).delete(`/api/sales/${venta.body.id}`)).send(
      {
        adminPassword: 'maria1234',
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

  describe('flujo de la pastelería: insumo → receta → producción → encargo → cobro → reporte', () => {
    const api = () => request(app.getHttpServer());
    let harinaId: string;
    let huevosId: string;
    let productoId: string;
    let recetaId: string;
    let clienteId: string;
    let encargoId: string;

    it('crea insumos con stock inicial y una compra que actualiza el costo', async () => {
      const harina = await auth(api().post('/api/insumos')).send({
        nombre: `Harina e2e ${Date.now()}`,
        unidad: 'kg',
        stockMinimo: 2,
        costoUnitario: 40,
        stockInicial: 10,
      });
      expect(harina.status).toBe(201);
      expect(harina.body.stockActual).toBe(10);
      harinaId = harina.body.id;

      const huevos = await auth(api().post('/api/insumos')).send({
        nombre: `Huevos e2e ${Date.now()}`,
        unidad: 'unidad',
        costoUnitario: 8,
        stockInicial: 24,
      });
      expect(huevos.status).toBe(201);
      huevosId = huevos.body.id;

      // 10 kg a 40 + 10 kg comprados a 60 (en libras) -> promedio ponderado.
      const compra = await auth(api().post('/api/compras')).send({
        items: [{ insumoId: harinaId, cantidad: 22.0462262, unidad: 'lb', costoTotal: 600 }],
      });
      expect(compra.status).toBe(201);
      const harinaDespues = await auth(api().get(`/api/insumos/${harinaId}`));
      expect(harinaDespues.body.stockActual).toBeCloseTo(20, 2);
      expect(harinaDespues.body.costoUnitario).toBeCloseTo(50, 1);
      // La compra quedo tambien como gasto.
      expect(
        await prisma.expense.count({ where: { categoria: 'Compras de insumos' } }),
      ).toBeGreaterThan(0);
    });

    it('rechaza convertir unidades de familias distintas', async () => {
      const r = await auth(api().post(`/api/insumos/${huevosId}/movimientos`)).send({
        tipo: 'SALIDA',
        cantidad: 100,
        unidad: 'g',
      });
      expect(r.status).toBe(400);
    });

    it('crea una receta con subreceta y calcula costo, costo por porción y precio sugerido', async () => {
      const prod = await auth(api().post('/api/products')).send({
        nombre: `Pastel e2e ${Date.now()}`,
        precioUnitario: 1500,
        stock: 0,
      });
      expect(prod.status).toBe(201);
      productoId = prod.body.id;

      const sub = await auth(api().post('/api/recetas')).send({
        nombre: `Masa e2e ${Date.now()}`,
        esSubreceta: true,
        rendimiento: 1,
        unidadRendimiento: 'kg',
        ingredientes: [
          { insumoId: harinaId, cantidad: 800, unidad: 'g' },
          { insumoId: huevosId, cantidad: 4, unidad: 'unidad' },
        ],
      });
      expect(sub.status).toBe(201);
      // 0.8 kg * 50 + 4 * 8 = 72
      expect(sub.body.costeo.costoTotal).toBeCloseTo(72, 1);

      const receta = await auth(api().post('/api/recetas')).send({
        nombre: `Pastel e2e ${Date.now()}`,
        rendimiento: 2,
        unidadRendimiento: 'unidad',
        porciones: 24,
        margenPct: 100,
        productoId,
        ingredientes: [
          { subrecetaId: sub.body.id, cantidad: 500, unidad: 'g' },
          { insumoId: huevosId, cantidad: 2, unidad: 'unidad' },
        ],
      });
      expect(receta.status).toBe(201);
      recetaId = receta.body.id;
      // Media tanda de masa (36) + 2 huevos (16) = 52 por tanda de 2 pasteles.
      expect(receta.body.costeo.costoTotal).toBeCloseTo(52, 1);
      expect(receta.body.costeo.costoPorUnidad).toBeCloseTo(26, 1);
      expect(receta.body.costeo.costoPorPorcion).toBeCloseTo(52 / 24, 2);
      expect(receta.body.costeo.precioSugeridoUnidad).toBeCloseTo(52, 1);

      // El producto toma el costo de su receta.
      const p = await prisma.product.findUnique({ where: { id: productoId } });
      expect(Number(p!.costoUnitario)).toBeCloseTo(26, 1);

      // Escalar a 5 tandas multiplica cantidades y dice lo que falta.
      const esc = await auth(api().get(`/api/recetas/${recetaId}/escalar?factor=5`));
      expect(esc.status).toBe(200);
      expect(esc.body.rendimiento).toBe(10);
      const harinaNecesaria = esc.body.insumos.find((i: any) => i.insumoId === harinaId);
      expect(harinaNecesaria.necesario).toBeCloseTo(2, 3); // 5 * 0.5 * 0.8 kg
    });

    it('no deja que una subreceta se use a sí misma en ciclo', async () => {
      const r = await auth(api().get(`/api/recetas/${recetaId}`));
      const subId = r.body.ingredientes.find((i: any) => i.subrecetaId).subrecetaId;
      const ciclo = await auth(api().put(`/api/recetas/${subId}`)).send({
        nombre: r.body.ingredientes.find((i: any) => i.subrecetaId).subreceta.nombre,
        esSubreceta: true,
        rendimiento: 1,
        unidadRendimiento: 'kg',
        ingredientes: [{ subrecetaId: recetaId, cantidad: 1, unidad: 'unidad' }],
      });
      expect(ciclo.status).toBe(400);
    });

    it('registrar producción descuenta insumos (abriendo subrecetas) y suma producto terminado', async () => {
      const r = await auth(api().post('/api/produccion')).send({ recetaId, tandas: 2 });
      expect(r.status).toBe(201);
      expect(r.body.unidadesProducidas).toBe(4);
      expect(r.body.costoTotal).toBeCloseTo(104, 1);

      const harina = await prisma.insumo.findUnique({ where: { id: harinaId } });
      expect(Number(harina!.stockActual)).toBeCloseTo(20 - 0.8, 3);
      const huevos = await prisma.insumo.findUnique({ where: { id: huevosId } });
      expect(Number(huevos!.stockActual)).toBe(24 - 4 - 4);
      const prod = await prisma.product.findUnique({ where: { id: productoId } });
      expect(prod!.stock).toBe(4);

      // Sin insumos suficientes no descuenta nada.
      const demasiado = await auth(api().post('/api/produccion')).send({ recetaId, tandas: 100 });
      expect(demasiado.status).toBe(400);
      expect((await prisma.product.findUnique({ where: { id: productoId } }))!.stock).toBe(4);
    });

    it('crea un encargo con anticipo, lo avanza de estado y lo entrega cobrando el saldo', async () => {
      const cliente = await auth(api().post('/api/clients')).send({
        nombre: 'Clienta encargo e2e',
        telefono: '8093334444',
        cumpleanos: '1995-03-21',
      });
      expect(cliente.status).toBe(201);
      clienteId = cliente.body.id;

      const manana = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const encargo = await auth(api().post('/api/encargos')).send({
        clientId: clienteId,
        fechaEntrega: manana,
        tipoEntrega: 'RETIRO',
        items: [
          {
            productId: productoId,
            descripcion: 'Pastel de cumpleaños',
            cantidad: 2,
            precioUnitario: 1000,
            sabor: 'Chocolate',
            mensaje: 'Feliz cumpleaños',
          },
        ],
        anticipo: { monto: 500, metodo: 'EFECTIVO' },
      });
      expect(encargo.status).toBe(201);
      encargoId = encargo.body.id;
      expect(encargo.body.codigo).toMatch(/^ENC-\d{4}-\d{5}$/);
      expect(encargo.body.total).toBeCloseTo(2360, 2); // 2000 + 18% ITBIS
      expect(encargo.body.saldo).toBeCloseTo(1860, 2);

      const estado = await auth(api().patch(`/api/encargos/${encargoId}/estado`)).send({
        estado: 'LISTO',
      });
      expect(estado.status).toBe(200);

      // Sin cobrar el saldo completo, no se entrega (salvo que se autorice credito).
      const sinPagar = await auth(api().post(`/api/encargos/${encargoId}/entregar`)).send({});
      expect(sinPagar.status).toBe(400);

      const entrega = await auth(api().post(`/api/encargos/${encargoId}/entregar`)).send({
        pagoFinal: { monto: 1860, metodo: 'TARJETA' },
      });
      expect(entrega.status).toBe(201);
      expect(entrega.body.estado).toBe('ENTREGADO');
      expect(entrega.body.saldo).toBe(0);
      expect(entrega.body.sale?.id).toBeTruthy();

      const venta = await prisma.sale.findUnique({
        where: { id: entrega.body.sale.id },
        include: { items: true, invoice: true },
      });
      expect(Number(venta!.total)).toBeCloseTo(2360, 2);
      expect(venta!.metodoPago).toBe('TARJETA');
      expect(venta!.invoice?.numero).toMatch(/^FAC-/);
      // Se entregaron 2 de los 4 pasteles producidos.
      expect((await prisma.product.findUnique({ where: { id: productoId } }))!.stock).toBe(2);

      // Ya entregado no se puede volver a tocar.
      const otra = await auth(api().post(`/api/encargos/${encargoId}/pagos`)).send({
        monto: 1,
        metodo: 'EFECTIVO',
      });
      expect(otra.status).toBe(400);

      // Su venta no se borra desde Ventas.
      const del = await auth(api().delete(`/api/sales/${venta!.id}`)).send({
        adminPassword: 'maria1234',
      });
      expect(del.status).toBe(400);
    });

    it('entregar con saldo a crédito deja la cuenta por cobrar solo por el saldo', async () => {
      const manana = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const encargo = await auth(api().post('/api/encargos')).send({
        clientId: clienteId,
        fechaEntrega: manana,
        tipoEntrega: 'DOMICILIO',
        direccionEntrega: 'Calle 1 #2',
        costoEnvio: 100,
        items: [{ descripcion: 'Cupcakes personalizados', cantidad: 12, precioUnitario: 50 }],
        anticipo: { monto: 300, metodo: 'TRANSFERENCIA' },
      });
      expect(encargo.status).toBe(201);
      expect(encargo.body.total).toBeCloseTo(826, 2); // (600 + 100) * 1.18

      const r = await auth(api().post(`/api/encargos/${encargo.body.id}/entregar`)).send({
        dejarSaldoACredito: true,
      });
      expect(r.status).toBe(201);
      const deuda = await prisma.clientDebt.findFirst({ where: { saleId: r.body.sale.id } });
      expect(Number(deuda!.amountTotal)).toBeCloseTo(526, 2);
    });

    it('los reportes reflejan la venta, el anticipo, la ganancia y las cuentas por cobrar', async () => {
      const top = await auth(api().get('/api/reports/top-productos'));
      expect(top.status).toBe(200);
      expect(top.body.find((p: any) => p.productId === productoId)?.unidades).toBe(2);

      const costos = await auth(api().get('/api/reports/costs'));
      const fila = costos.body.productos.find((p: any) => p.productId === productoId);
      // Vendido a 1000 c/u, costo de receta 26 c/u.
      expect(fila.ingresos).toBeCloseTo(2000, 2);
      expect(fila.costo).toBeCloseTo(52, 1);

      const tx = await auth(api().get('/api/reports/transactions?tipo=ANTICIPO'));
      expect(tx.body.items.some((t: any) => t.referencia?.startsWith('ENC-'))).toBe(true);

      const cxc = await auth(api().get('/api/reports/cuentas-por-cobrar'));
      expect(cxc.status).toBe(200);
      expect(cxc.body.totales.creditos).toBeGreaterThan(0);

      const alertas = await auth(api().get('/api/insumos/alertas'));
      expect(alertas.status).toBe(200);
      expect(Array.isArray(alertas.body.bajos)).toBe(true);

      const mermas = await auth(api().post(`/api/insumos/${harinaId}/movimientos`)).send({
        tipo: 'MERMA',
        cantidad: 1,
        motivo: 'Se mojo',
      });
      expect(mermas.status).toBe(201);
      const rep = await auth(api().get('/api/reports/mermas'));
      expect(rep.body.totales.costoInsumos).toBeGreaterThan(0);
    });

    it('vender por porción: cortar un entero baja el pastel y sube las porciones', async () => {
      // Quedan 2 pasteles enteros (4 producidos - 2 entregados).
      const porcion = await auth(api().post('/api/products')).send({
        nombre: `Porcion e2e ${Date.now()}`,
        precioUnitario: 150,
        stock: 0,
        porcionDeId: productoId,
        porcionesPorUnidad: 8,
      });
      expect(porcion.status).toBe(201);
      expect(porcion.body.porcionDe.id).toBe(productoId);

      const corte = await auth(api().post(`/api/products/${porcion.body.id}/cortar`)).send({
        enteros: 1,
      });
      expect(corte.status).toBe(201);
      expect(corte.body.stock).toBe(8);
      // Costo del entero (26) entre 8 porciones.
      expect(Number(corte.body.costoUnitario)).toBeCloseTo(3.25, 2);
      expect((await prisma.product.findUnique({ where: { id: productoId } }))!.stock).toBe(1);

      const demasiado = await auth(api().post(`/api/products/${porcion.body.id}/cortar`)).send({
        enteros: 5,
      });
      expect(demasiado.status).toBe(400);

      // Se vende una porcion como cualquier producto.
      const venta = await auth(api().post('/api/sales')).send({
        metodoPago: 'EFECTIVO',
        generarFactura: false,
        items: [
          { productId: porcion.body.id, descripcion: 'Porcion', cantidad: 3, precioUnitario: 150 },
        ],
      });
      expect(venta.status).toBe(201);
      expect((await prisma.product.findUnique({ where: { id: porcion.body.id } }))!.stock).toBe(5);

      // Tambien se puede producir la receta directamente en porciones:
      // 1 tanda = 2 pasteles = 16 porciones, sin tocar la existencia de enteros.
      const enPorciones = await auth(api().post('/api/produccion')).send({
        recetaId,
        tandas: 1,
        porcionId: porcion.body.id,
      });
      expect(enPorciones.status).toBe(201);
      expect(enPorciones.body.unidadesProducidas).toBe(16);
      expect((await prisma.product.findUnique({ where: { id: porcion.body.id } }))!.stock).toBe(21);
      expect((await prisma.product.findUnique({ where: { id: productoId } }))!.stock).toBe(1);

      // Una porcion no puede ser porcion de si misma ni de otra porcion.
      const ciclo = await auth(api().put(`/api/products/${porcion.body.id}`)).send({
        porcionDeId: porcion.body.id,
        porcionesPorUnidad: 8,
      });
      expect(ciclo.status).toBe(400);
    });

    it('la lista de compras y la hoja de producción salen de los encargos', async () => {
      const lista = await auth(api().get('/api/produccion/lista-compras?dias=7'));
      expect(lista.status).toBe(200);
      const hoja = await auth(api().get('/api/produccion/hoja'));
      expect(hoja.status).toBe(200);
      expect(Array.isArray(hoja.body.encargos)).toBe(true);
    });
  });
});
