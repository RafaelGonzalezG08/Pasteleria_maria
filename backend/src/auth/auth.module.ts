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
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-inseguro-cambiame',
      // 30 dias por defecto (era 8h): es una app de escritorio de un solo
      // negocio, en una PC bajo su control fisico, y el cajero no deberia
      // tener que volver a iniciar sesion a media jornada. Sigue siendo
      // revocable: JwtStrategy revisa en cada peticion que el usuario exista y
      // este activo, asi que dar de baja a alguien corta su sesion al instante.
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '30d' },
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
