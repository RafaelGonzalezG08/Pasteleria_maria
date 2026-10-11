import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // registerAsync y no register: con register, process.env se leia al
    // IMPORTAR este archivo, antes de que ConfigModule cargara el .env de
    // desarrollo. Los tokens se firmaban con el secreto de respaldo y
    // JwtStrategy (que se construye despues) los verificaba con el del .env:
    // cada peticion tras iniciar sesion daba 401. En la app de escritorio no
    // pasaba porque Electron pone JWT_SECRET en el entorno antes de arrancar.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET || 'dev-secret-inseguro-cambiame',
        // 30 dias por defecto: es una app de escritorio de un solo negocio,
        // en una PC bajo su control fisico. Sigue siendo revocable: JwtStrategy
        // revisa en cada peticion que el usuario exista y este activo.
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '30d' },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
