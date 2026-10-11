import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ESTADOS_DEUDA_CON_SALDO } from '../common/enums';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Filas para exportar la lista de clientes a Excel. */
  async filasParaExportar() {
    const clientes = await this.prisma.client.findMany({ orderBy: { nombre: 'asc' } });
    return clientes.map((c) => ({
      Nombre: c.nombre,
      Telefono: c.telefono,
      Email: c.email ?? '',
      Direccion: c.direccion ?? '',
      Notas: c.notas ?? '',
      'Cliente desde': c.createdAt.toISOString().slice(0, 10),
    }));
  }

  async findAll(search?: string) {
    // Por palabras sueltas, sin importar el orden: "juan perez" encuentra a
    // "Juan Carlos Perez" aunque "perez" no vaya pegado a "juan". Cada
    // palabra tiene que aparecer en ALGUNA de las columnas, no
    // necesariamente todas en la misma.
    const palabras = search?.trim().split(/\s+/).filter(Boolean) ?? [];

    const clients = await this.prisma.client.findMany({
      // Sin `mode: 'insensitive'`: SQLite no lo soporta en Prisma, pero su
      // LIKE ya ignora mayusculas/minusculas para texto ASCII, que es como se
      // escriben los nombres y correos aqui. La unica diferencia frente a
      // Postgres es que las letras acentuadas si distinguen mayusculas.
      where:
        palabras.length > 0
          ? {
              AND: palabras.map((palabra) => ({
                OR: [
                  { nombre: { contains: palabra } },
                  { telefono: { contains: palabra } },
                  { email: { contains: palabra } },
                ],
              })),
            }
          : undefined,
      orderBy: { nombre: 'asc' },
      include: {
        debts: { where: { status: { in: [...ESTADOS_DEUDA_CON_SALDO] } } },
      },
    });

    return clients.map((client) => ({
      ...client,
      deudaPendiente: client.debts.reduce(
        (sum, debt) => sum + Number(debt.amountTotal) - Number(debt.amountPaid),
        0,
      ),
    }));
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        // `sale: { select: { id } }` alcanza: el frontend abre el detalle
        // completo (items, factura) con un GET /sales/:id aparte, igual que
        // ya hace Cobros con DebtDetailModal.
        debts: { orderBy: { createdAt: 'desc' }, include: { sale: { select: { id: true } } } },
        sales: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { invoice: true },
        },
      },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    return client;
  }

  async create(dto: CreateClientDto, userId?: string) {
    const client = await this.prisma.client.create({ data: dto });
    await this.audit.log('Client', client.id, 'CREATE', userId, dto as any);
    return client;
  }

  async update(id: string, dto: UpdateClientDto, userId?: string) {
    await this.ensureExists(id);
    const client = await this.prisma.client.update({ where: { id }, data: dto });
    await this.audit.log('Client', id, 'UPDATE', userId, dto as any);
    return client;
  }

  /**
   * Borra un cliente que todavia no tiene historial.
   *
   * Si ya tiene ventas o deudas NO se borra: la base tiene llaves foraneas
   * desde `sales`/`client_debts` hacia `clients`, asi que el borrado fallaba
   * con un error crudo de Postgres (500 sin explicacion). Y aunque no
   * fallara, borrarlo destruiria el rastro de facturas ya emitidas a su
   * nombre. Se avisa con un mensaje claro en su lugar.
   */
  async remove(id: string, userId?: string) {
    await this.ensureExists(id);

    const [ventas, deudas] = await Promise.all([
      this.prisma.sale.count({ where: { clientId: id } }),
      this.prisma.clientDebt.count({ where: { clientId: id } }),
    ]);

    if (ventas > 0 || deudas > 0) {
      throw new BadRequestException(
        `No se puede borrar este cliente porque ya tiene historial (${ventas} venta(s) y ${deudas} deuda(s)). ` +
          `Borrarlo eliminaria el rastro de facturas ya emitidas a su nombre.`,
      );
    }

    await this.prisma.client.delete({ where: { id } });
    await this.audit.log('Client', id, 'DELETE', userId);
    return { id, deleted: true };
  }

  /**
   * Version en lote de remove(), para la seleccion multiple en Clientes.
   * Cada cliente pasa por la MISMA validacion (sin ventas ni deudas): los que
   * no la pasan no se borran, se listan aparte con el motivo.
   */
  async bulkRemove(ids: string[], userId?: string) {
    const omitidos: { id: string; nombre: string; motivo: string }[] = [];
    let eliminados = 0;

    for (const id of ids) {
      const cliente = await this.prisma.client.findUnique({ where: { id } });
      if (!cliente) continue;

      const [ventas, deudas] = await Promise.all([
        this.prisma.sale.count({ where: { clientId: id } }),
        this.prisma.clientDebt.count({ where: { clientId: id } }),
      ]);

      if (ventas > 0 || deudas > 0) {
        omitidos.push({
          id,
          nombre: cliente.nombre,
          motivo: `tiene ${ventas} venta(s) y ${deudas} deuda(s)`,
        });
        continue;
      }

      await this.prisma.client.delete({ where: { id } });
      eliminados++;
    }

    if (eliminados > 0) {
      await this.audit.log('Client', 'eliminar-lote', 'DELETE', userId, {
        eliminados,
        omitidos: omitidos.length,
      });
    }

    return { eliminados, omitidos };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.client.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Cliente no encontrado.');
    return found;
  }
}
