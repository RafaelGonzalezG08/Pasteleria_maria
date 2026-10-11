import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  nombre: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret-inseguro-cambiame',
    });
  }

  /**
   * Se confirma en CADA peticion que el usuario del token sigue existiendo y
   * activo. Antes solo se confiaba en el contenido del token, asi que:
   *  - un usuario dado de baja seguia pudiendo usar su sesion hasta que
   *    caducara (8h);
   *  - si la base se restauro a un punto anterior a ese usuario, el token
   *    apuntaba a un id inexistente y cada venta reventaba con un choque de
   *    llave foranea ("hace referencia a un registro que ya no existe").
   * Con la validacion, en ese caso el frontend recibe un 401 limpio y manda a
   * iniciar sesion de nuevo.
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, nombre: true, activo: true },
    });
    if (!user || !user.activo) {
      throw new UnauthorizedException('La sesion ya no es valida. Vuelve a iniciar sesion.');
    }
    return { userId: user.id, email: user.email, role: user.role, nombre: user.nombre };
  }
}
