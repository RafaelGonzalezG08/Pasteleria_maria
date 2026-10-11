import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SetupDto } from './dto/setup.dto';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
  ) {}

  /**
   * true solo en una instalacion que todavia no tiene ningun usuario. Decide si el frontend
   * muestra la pantalla de "crear administrador" en vez del login.
   *
   * Al ACTUALIZAR la app la base de datos se conserva (vive en la carpeta de
   * datos del usuario, no en la del programa), asi que ya hay usuarios y esto
   * da false: la actualizacion nunca vuelve a pedir crear el administrador.
   */
  async necesitaConfiguracionInicial(): Promise<boolean> {
    const usuarios = await this.prisma.user.count();
    return usuarios === 0;
  }

  /**
   * Crea el administrador del primer arranque y deja la sesion iniciada.
   * Solo funciona mientras NO exista ningun usuario: despues responde
   * 409, asi que no sirve para crear administradores a escondidas.
   */
  async configuracionInicial(dto: SetupDto) {
    const email = dto.email.trim();
    const user = await this.prisma.$transaction(async (tx) => {
      const usuarios = await tx.user.count();
      if (usuarios > 0) {
        throw new ConflictException('La aplicacion ya esta configurada. Inicia sesion.');
      }
      return tx.user.create({
        data: {
          nombre: dto.nombre.trim(),
          email,
          passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
          role: Role.ADMIN,
          activo: true,
        },
      });
    });

    await this.audit.log('User', user.id, 'CREATE', user.id, {
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      origen: 'configuracion-inicial',
    });

    return this.buildAuthResponse(user.id, user.email, user.role, user.nombre);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.activo) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    return this.buildAuthResponse(user.id, user.email, user.role, user.nombre);
  }

  /**
   * Crea un nuevo usuario. Pensado para uso administrativo (ver UsersModule),
   * pero tambien sirve para el registro inicial (ej. seed / primer admin).
   */
  async register(dto: RegisterDto, creatorUserId?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        nombre: dto.nombre,
        email: dto.email,
        passwordHash,
        role: dto.role ?? 'CAJERO',
      },
    });

    await this.audit.log('User', user.id, 'CREATE', creatorUserId, {
      nombre: user.nombre,
      email: user.email,
      role: user.role,
    });

    return this.buildAuthResponse(user.id, user.email, user.role, user.nombre);
  }

  private buildAuthResponse(userId: string, email: string, role: string, nombre: string) {
    const payload = { sub: userId, email, role, nombre };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: userId, email, role, nombre },
    };
  }
}
