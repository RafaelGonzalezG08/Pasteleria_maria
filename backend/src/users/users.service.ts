import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Role } from '../common/enums';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        nombre: true,
        email: true,
        role: true,
        activo: true,
        createdAt: true,
      },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Cambia la clave del usuario que tiene la sesion abierta.
   *
   * Se pide la clave actual aunque la sesion ya este iniciada: si alguien deja
   * la caja abierta un momento, cualquiera podria cambiarla y dejar al dueño
   * fuera de su propio sistema.
   *
   * Solo permite cambiar la PROPIA clave (el id sale del token, no del
   * cuerpo de la peticion), asi que un cajero no puede tocar la del
   * administrador.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const correcta = await bcrypt.compare(dto.passwordActual, user.passwordHash);
    if (!correcta) throw new ForbiddenException('La clave actual no es correcta.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.passwordNueva, 10) },
    });

    // Nunca se registra la clave, solo que hubo un cambio y cuando.
    await this.audit.log('User', userId, 'UPDATE', userId, { accion: 'cambio-de-clave' });
    return { ok: true };
  }

  /**
   * Activa/desactiva un usuario. Desactivar corta la sesion al instante
   * (jwt.strategy.ts revalida "activo" en cada peticion), asi que sin estos
   * dos frenos un admin podria dejarse a si mismo, o dejar al negocio
   * entero, sin nadie que pueda volver a entrar.
   */
  async setActive(id: string, activo: boolean, currentUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    if (!activo) {
      if (id === currentUserId) {
        throw new BadRequestException('No puedes desactivar tu propia cuenta.');
      }
      if (user.role === Role.ADMIN) {
        const otrosAdminsActivos = await this.prisma.user.count({
          where: { role: Role.ADMIN, activo: true, id: { not: id } },
        });
        if (otrosAdminsActivos === 0) {
          throw new BadRequestException(
            'No puedes desactivar el unico administrador activo: nadie podria volver a entrar.',
          );
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { activo },
      select: { id: true, nombre: true, email: true, role: true, activo: true },
    });

    await this.audit.log('User', id, 'UPDATE', currentUserId, { activo });
    return updated;
  }
}
