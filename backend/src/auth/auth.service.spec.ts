import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('fake-jwt-token') },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('deberia rechazar credenciales de un usuario inexistente', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'nadie@cafeshopping.com', password: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deberia rechazar una contraseña incorrecta', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'admin@cafeshopping.com',
      passwordHash: await bcrypt.hash('correcta', 10),
      role: 'ADMIN',
      nombre: 'Admin',
      activo: true,
    });

    await expect(
      service.login({ email: 'admin@cafeshopping.com', password: 'incorrecta' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('deberia devolver un token cuando las credenciales son correctas', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '1',
      email: 'admin@cafeshopping.com',
      passwordHash: await bcrypt.hash('correcta', 10),
      role: 'ADMIN',
      nombre: 'Admin',
      activo: true,
    });

    const result = await service.login({
      email: 'admin@cafeshopping.com',
      password: 'correcta',
    });

    expect(result.accessToken).toBe('fake-jwt-token');
    expect(result.user.email).toBe('admin@cafeshopping.com');
  });
});
