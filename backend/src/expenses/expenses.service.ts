import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { DeleteExpenseDto } from './dto/delete-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(from?: string, to?: string) {
    return this.prisma.expense.findMany({
      where:
        from || to
          ? {
              fecha: { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined },
            }
          : undefined,
      orderBy: { fecha: 'desc' },
      include: { user: { select: { nombre: true } } },
    });
  }

  async create(dto: CreateExpenseDto, userId: string) {
    const expense = await this.prisma.expense.create({
      data: {
        fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
        categoria: dto.categoria,
        descripcion: dto.descripcion,
        monto: dto.monto,
        userId,
      },
    });
    await this.audit.log('Expense', expense.id, 'CREATE', userId, dto as any);
    return expense;
  }

  async remove(id: string, dto: DeleteExpenseDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) throw new ForbiddenException('Clave incorrecta.');

    const found = await this.prisma.expense.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Gasto no encontrado.');
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log('Expense', id, 'DELETE', userId);
    return { id, deleted: true };
  }
}
