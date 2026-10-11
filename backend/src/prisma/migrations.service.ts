import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from './prisma.service';

/**
 * Aplica las migraciones pendientes al arrancar, sin depender del CLI de Prisma.
 *
 * En la version con Docker esto lo hacia `npx prisma migrate deploy` en el
 * arranque del contenedor. Para la version nativa eso no sirve: obligaria a
 * empaquetar el CLI de Prisma y sus motores (decenas de MB) dentro del
 * instalador, y a que el cliente tuviera npm disponible.
 *
 * Como SQLite es un solo archivo y las migraciones son SQL plano, aqui se
 * leen los archivos de prisma/migrations en orden y se ejecutan los que
 * falten. Se usa la MISMA tabla `_prisma_migrations` que usa Prisma y con su
 * mismo formato, para que las dos formas de migrar conozcan el mismo estado:
 * lo que aplique `prisma migrate dev` durante el desarrollo se ve como
 * aplicado aqui, y viceversa.
 */
@Injectable()
export class MigrationsService {
  private readonly logger = new Logger(MigrationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async applyPending(migrationsDir: string): Promise<number> {
    await this.ensureTable();

    const carpetas = await this.listMigrationFolders(migrationsDir);
    if (carpetas.length === 0) {
      this.logger.warn(`No se encontraron migraciones en ${migrationsDir}`);
      return 0;
    }

    const aplicadas = await this.appliedNames();
    let nuevas = 0;

    for (const nombre of carpetas) {
      if (aplicadas.has(nombre)) continue;

      const sql = await fs.readFile(join(migrationsDir, nombre, 'migration.sql'), 'utf8');
      this.logger.log(`Aplicando migracion ${nombre} ...`);

      // Toda la migracion va en UNA transaccion: si algo falla, no queda a
      // medias ni se registra como aplicada. `defer_foreign_keys = ON` aplaza
      // el chequeo de llaves foraneas hasta el COMMIT, que es lo que necesitan
      // las migraciones que recrean una tabla (DROP + CREATE + RENAME): entre
      // medias hay referencias temporalmente rotas que si no reventarian.
      // (Prisma mete tambien `PRAGMA foreign_keys=OFF`, pero eso es un no-op
      // dentro de una transaccion; por eso ademas se hace aqui.)
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON');
          for (const sentencia of this.splitStatements(sql)) {
            if (/^PRAGMA\s/i.test(sentencia)) continue; // ya se maneja aqui
            await tx.$executeRawUnsafe(sentencia);
          }
          await this.registrar(tx, nombre, sql);
        },
        { timeout: 120_000, maxWait: 15_000 },
      );

      nuevas += 1;
    }

    if (nuevas > 0) this.logger.log(`${nuevas} migracion(es) aplicadas.`);
    return nuevas;
  }

  private async ensureTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
        "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
      )
    `);
  }

  private async appliedNames(): Promise<Set<string>> {
    const filas = await this.prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    return new Set(filas.map((f) => f.migration_name));
  }

  /** Carpetas de migracion en orden cronologico (su nombre empieza por la marca de tiempo). */
  private async listMigrationFolders(dir: string): Promise<string[]> {
    const entradas = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const carpetas: string[] = [];
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      const existe = await fs
        .access(join(dir, e.name, 'migration.sql'))
        .then(() => true)
        .catch(() => false);
      if (existe) carpetas.push(e.name);
    }
    return carpetas.sort();
  }

  /**
   * Separa el SQL en sentencias por ";" al final de linea.
   *
   * Es deliberadamente simple porque solo procesa SQL generado por Prisma
   * (CREATE TABLE / CREATE INDEX / ALTER TABLE), no consultas arbitrarias con
   * ";" dentro de cadenas o disparadores.
   */
  private splitStatements(sql: string): string[] {
    return sql
      .split(/;\s*$/m)
      .map((s) =>
        s
          .split('\n')
          .filter((linea) => !linea.trim().startsWith('--'))
          .join('\n')
          .trim(),
      )
      .filter((s) => s.length > 0);
  }

  private async registrar(
    tx: { $executeRawUnsafe: (q: string, ...v: unknown[]) => Promise<number> },
    nombre: string,
    sql: string,
  ): Promise<void> {
    const checksum = createHash('sha256').update(sql).digest('hex');
    const ahora = new Date().toISOString();
    await tx.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
      randomUUID(),
      checksum,
      ahora,
      nombre,
      ahora,
    );
  }
}
