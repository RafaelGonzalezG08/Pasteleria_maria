import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Lo que se puede pasar como detalle del cambio auditado. */
export type AuditChanges = Record<string, unknown> | unknown[];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un cambio en audit_logs. Nunca lanza: una falla al auditar
   * no debe tumbar la operacion de negocio que la origino.
   */
  async log(
    entity: string,
    entityId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    userId?: string,
    changes?: AuditChanges,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          entity,
          entityId,
          action,
          userId,
          // SQLite no tiene tipo Json: se guarda serializado (ver schema.prisma).
          changes: changes === undefined ? undefined : JSON.stringify(changes),
        },
      });
    } catch (error) {
      this.logger.warn(`No se pudo registrar auditoria para ${entity}:${entityId} - ${error}`);
    }
  }
}
