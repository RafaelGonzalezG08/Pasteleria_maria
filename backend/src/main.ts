import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
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

  // Sirve las imagenes de facturas, fotos de productos y fotos de referencia
  // de los encargos. Los nombres de factura son predecibles
  // (FAC-2026-00001.png), asi que se exige el mismo JWT que el resto de la
  // API. Un <img>/<a> del frontend no puede mandar el header Authorization,
  // por eso el middleware tambien acepta el token por ?token= (ver
  // urlConToken en frontend/src/lib/api.ts).
  app.use('/uploads', crearMiddlewareUploads(app.get(JwtService)), express.static(UPLOADS_DIR));

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Pastelería María API')
    .setDescription(
      'API del sistema de punto de venta, inventario, recetas, produccion y encargos de Pastelería María.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  // Solo en la propia PC (127.0.0.1): la app se usa unicamente desde la
  // computadora donde esta instalada, nadie en la red tiene por que llegarle.
  await app.listen(port, '127.0.0.1');
  // eslint-disable-next-line no-console
  console.log(`Pastelería María API escuchando en http://localhost:${port}/api`);
  // eslint-disable-next-line no-console
  console.log(`Documentacion Swagger en http://localhost:${port}/api/docs`);
}
bootstrap();
