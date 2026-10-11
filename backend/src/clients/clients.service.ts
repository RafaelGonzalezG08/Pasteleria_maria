import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ESTADOS_DEUDA_CON_SALDO } from '../common/enums';
import { parseFromDate } from '../common/date-range';
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
      Cumpleanos: c.cumpleanos ? c.cumpleanos.toISOString().slice(5, 10) : '',
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
      ...this.conFechas(client),
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
        encargos: {
          orderBy: { fechaEntrega: 'desc' },
          take: 30,
          select: {
            id: true,
            codigo: true,
            fechaEntrega: true,
            estado: true,
            total: true,
            abonado: true,
            items: { select: { descripcion: true, cantidad: true } },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    return {
      ...this.conFechas(client),
      encargos: client.encargos.map((e) => ({
        ...e,
        total: Number(e.total),
        abonado: Number(e.abonado),
        saldo: Math.max(0, Number(e.total) - Number(e.abonado)),
      })),
    };
  }

  /**
   * Clientes que cumplen años (o tienen una fecha especial) dentro de los
   * proximos `dias` dias, para felicitarlos u ofrecerles su pastel a tiempo.
   * Se compara solo dia y mes.
   */
  async proximasFechas(dias?: number) {
    const profile = await this.prisma.businessProfile.findFirst();
    const rango = dias ?? profile?.diasAlertaCumpleanos ?? 7;
    const clientes = await this.prisma.client.findMany({
      where: { OR: [{ cumpleanos: { not: null } }, { fechasEspeciales: { not: null } }] },
      select: { id: true, nombre: true, telefono: true, cumpleanos: true, fechasEspeciales: true },
    });

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const faltan = (fecha: Date): number => {
      const proxima = new Date(hoy.getFullYear(), fecha.getMonth(), fecha.getDate());
      if (proxima < hoy) proxima.setFullYear(hoy.getFullYear() + 1);
      return Math.round((proxima.getTime() - hoy.getTime()) / 86400000);
    };

    const resultado: {
      clientId: string;
      nombre: string;
      telefono: string;
      descripcion: string;
      fecha: Date;
      enDias: number;
    }[] = [];
    for (const c of clientes) {
      const fechas: { descripcion: string; fecha: Date }[] = [];
      if (c.cumpleanos) fechas.push({ descripcion: 'Cumpleaños', fecha: c.cumpleanos });
      for (const f of this.leerFechasEspeciales(c.fechasEspeciales)) {
        fechas.push({ descripcion: f.descripcion, fecha: parseFromDate(f.fecha) });
      }
      for (const f of fechas) {
        const enDias = faltan(f.fecha);
        if (enDias <= rango) {
          resultado.push({ clientId: c.id, nombre: c.nombre, telefono: c.telefono, ...f, enDias });
        }
      }
    }
    return resultado.sort((a, b) => a.enDias - b.enDias);
  }

  async create(dto: CreateClientDto, userId?: string) {
    const client = await this.prisma.client.create({
      data: { ...this.datos(dto), nombre: dto.nombre, telefono: dto.telefono },
    });
    await this.audit.log('Client', client.id, 'CREATE', userId, dto as any);
    return client;
  }

  async update(id: string, dto: UpdateClientDto, userId?: string) {
    await this.ensureExists(id);
    const client = await this.prisma.client.update({ where: { id }, data: this.datos(dto) });
    await this.audit.log('Client', id, 'UPDATE', userId, dto as any);
    return client;
  }

  /** Pasa cumpleaños a fecha y las fechas especiales a texto JSON (SQLite no tiene Json). */
  private datos(dto: UpdateClientDto) {
    const { cumpleanos, fechasEspeciales, ...resto } = dto;
    return {
      ...resto,
      ...(cumpleanos !== undefined
        ? { cumpleanos: cumpleanos ? parseFromDate(cumpleanos.slice(0, 10)) : null }
        : {}),
      ...(fechasEspeciales !== undefined
        ? {
            fechasEspeciales:
              fechasEspeciales.length > 0
                ? JSON.stringify(
                    fechasEspeciales.map((f) => ({
                      descripcion: f.descripcion.trim(),
                      fecha: f.fecha.slice(0, 10),
                    })),
                  )
                : null,
          }
        : {}),
    };
  }

  private leerFechasEspeciales(raw: string | null): { descripcion: string; fecha: string }[] {
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((f) => f && f.descripcion && f.fecha) : [];
    } catch {
      return [];
    }
  }

  private conFechas<T extends { fechasEspeciales: string | null }>(c: T) {
    return { ...c, fechasEspeciales: this.leerFechasEspeciales(c.fechasEspeciales) };
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

    const [ventas, deudas, encargos] = await Promise.all([
      this.prisma.sale.count({ where: { clientId: id } }),
      this.prisma.clientDebt.count({ where: { clientId: id } }),
      this.prisma.encargo.count({ where: { clientId: id } }),
    ]);

    if (ventas > 0 || deudas > 0 || encargos > 0) {
      throw new BadRequestException(
        `No se puede borrar este cliente porque ya tiene historial (${ventas} venta(s), ${deudas} deuda(s) y ${encargos} encargo(s)). ` +
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

      const [ventas, deudas, encargos] = await Promise.all([
        this.prisma.sale.count({ where: { clientId: id } }),
        this.prisma.clientDebt.count({ where: { clientId: id } }),
        this.prisma.encargo.count({ where: { clientId: id } }),
      ]);

      if (ventas > 0 || deudas > 0 || encargos > 0) {
        omitidos.push({
          id,
          nombre: cliente.nombre,
          motivo: `tiene ${ventas} venta(s), ${deudas} deuda(s) y ${encargos} encargo(s)`,
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
