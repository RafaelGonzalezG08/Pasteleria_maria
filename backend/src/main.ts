import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import * as http from 'http';
import * as https from 'https';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { MigrationsService } from './prisma/migrations.service';
import { BootstrapService } from './prisma/bootstrap.service';
import { UPLOADS_DIR } from './common/paths';
import { crearMiddlewareUploads } from './common/middleware/uploads-auth.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Aplica las migraciones pendientes antes de atender peticiones. En la
  // version con Docker de esto se encargaba `prisma migrate deploy` en el
  // arranque del contenedor; aqui se hace en proceso para no tener que
  // empaquetar el CLI de Prisma en la app de escritorio (ver
  // MigrationsService). PRISMA_MIGRATIONS_DIR lo define Electron, que sabe
  // donde quedaron los archivos dentro de la instalacion.
  const migrationsDir =
    process.env.PRISMA_MIGRATIONS_DIR || join(process.cwd(), 'prisma', 'migrations');
  await app.get(MigrationsService).applyPending(migrationsDir);

  // Instalacion nueva: crea el primer administrador y el perfil del negocio.
  // Sin esto la base quedaba vacia y nadie podia iniciar sesion.
  await app.get(BootstrapService).ensureInitialData();

  const configuredOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.enableCors({
    origin: configuredOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // Sirve las imagenes de facturas y fotos de productos. Los nombres de
  // factura son predecibles (FAC-2026-00001.png), y ahora que el backend
  // tambien escucha en la red local (para usar la app desde el celular, ver
  // app.listen abajo) cualquiera en esa WiFi podria pedirlas sin este
  // candado. Un <img>/<a> del frontend no puede mandar el header
  // Authorization, por eso el middleware tambien acepta el token por
  // ?token= (ver urlConToken en frontend/src/lib/api.ts).
  app.use('/uploads', crearMiddlewareUploads(app.get(JwtService)), express.static(UPLOADS_DIR));

  // Descarga de la parte publica del certificado autofirmado (ver
  // desktop/nativo.js -> obtenerCertificadoTls). El celular la necesita para
  // instalarla como CA de confianza y que Chrome deje de mostrar el aviso de
  // "conexion no privada" -- no es informacion secreta, no lleva token.
  const certPath = process.env.TLS_CERT_PATH;
  if (certPath && existsSync(certPath)) {
    // .crt en vez de .pem: Android (y su administrador de archivos) lo
    // reconoce mejor como certificado instalable. El contenido es el mismo
    // (PEM), solo cambia el nombre con el que se descarga.
    app.use(['/tls-cert.pem', '/tls-cert.crt'], (req: express.Request, res: express.Response) => {
      res.setHeader('Content-Disposition', 'attachment; filename="cafe-shopping.crt"');
      res.setHeader('Content-Type', 'application/x-x509-ca-cert');
      res.sendFile(certPath);
    });
  }

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Cafe Shopping API')
    .setDescription(
      'API para el sistema de punto de venta, facturacion y reportes de Cafe Shopping.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const keyPath = process.env.TLS_KEY_PATH;
  const lanIp = process.env.LAN_IP;

  // Con certificado y una IP de red detectados (empaquetado con Electron):
  // se escucha en DOS direcciones a la vez, cada una en el mismo puerto.
  // 127.0.0.1 en HTTP plano es solo para esta PC (Chrome ya trata
  // "localhost" como origen seguro sin HTTPS, asi que el frontend de
  // Electron nunca necesita saber nada de certificados). La IP de la red en
  // HTTPS es para el celular: sin un origen realmente seguro, Chrome no deja
  // "instalar" la app como si fuera nativa, solo un simple acceso directo.
  //
  // Sin esas variables (ej. "npm run start:dev" suelto) se comporta
  // exactamente igual que siempre: un solo listener en HTTP en 0.0.0.0.
  if (certPath && keyPath && lanIp && existsSync(certPath) && existsSync(keyPath)) {
    await app.init();
    const expressApp = app.getHttpAdapter().getInstance();
    const httpsOptions = { key: readFileSync(keyPath), cert: readFileSync(certPath) };

    await new Promise<void>((resolve) => http.createServer(expressApp).listen(port, '127.0.0.1', resolve));
    await new Promise<void>((resolve) =>
      https.createServer(httpsOptions, expressApp).listen(port, lanIp, resolve),
    );
    // eslint-disable-next-line no-console
    console.log(`Cafe Shopping API escuchando en http://localhost:${port}/api y https://${lanIp}:${port}/api`);
  } else {
    // 0.0.0.0 aqui es inofensivo: sin TLS_CERT_PATH no hay celular
    // apuntandole (usa localhost:5173 en desarrollo), y con el candado de
    // /uploads y el JWT en cada endpoint no queda nada expuesto sin loguearse.
    await app.listen(port, '0.0.0.0');
    // eslint-disable-next-line no-console
    console.log(`Cafe Shopping API escuchando en http://localhost:${port}/api`);
  }
  // eslint-disable-next-line no-console
  console.log(`Documentacion Swagger en http://localhost:${port}/api/docs`);
}
bootstrap();
