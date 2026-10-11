import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs, createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline as pipelineCb } from 'stream';
import { join, isAbsolute, resolve, dirname, basename } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MigrationsService } from '../prisma/migrations.service';
import { BACKUPS_DIR, BACKUPS_MIRROR_DIR, UPLOADS_DIR } from '../common/paths';

/** Cuantos registros guarda un respaldo (se calcula al generarlo). */
export interface BackupContenido {
  productos: number;
  clientes: number;
  ventas: number;
  facturas: number;
  deudas: number;
  gastos: number;
  pedidos: number;
  usuarios: number;
}

export interface BackupFileInfo {
  name: string;
  sizeBytes: number;
  createdAt: Date;
  /** Donde se encontro: en el disco o en la copia de OneDrive. */
  origen: 'local' | 'nube';
  contenido: BackupContenido | null;
}

const execAsync = promisify(exec);
const pipeline = promisify(pipelineCb);

/**
 * Ruta real del archivo .db a partir de DATABASE_URL ("file:./cafe.db").
 * Se necesita para restaurar, porque restaurar en SQLite es literalmente
 * reemplazar ese archivo.
 */
function resolveSqliteFile(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('file:')) {
    throw new Error('DATABASE_URL debe apuntar a un archivo SQLite (file:...).');
  }
  const ruta = url.slice('file:'.length);
  // Prisma resuelve las rutas relativas respecto a la carpeta del schema.
  return isAbsolute(ruta) ? ruta : resolve(process.cwd(), 'prisma', ruta);
}

const BACKUP_DIR = BACKUPS_DIR;

const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 30);
const INTERVAL_DAYS = Number(process.env.BACKUP_INTERVAL_DAYS ?? 3);
const MARKER_FILE = join(BACKUP_DIR, '.last-backup.json');

/**
 * Respalda la base de datos (pg_dump) y la carpeta de uploads cada
 * `BACKUP_INTERVAL_DAYS` dias (3 por defecto), guardandolos SIEMPRE en
 * /app/backups, en disco local — nunca en S3/R2, a proposito: el bucket de
 * R2 esta configurado con lectura publica (para que WhatsApp vea las
 * facturas), y un respaldo completo de la base de datos ahi expondria datos
 * sensibles de clientes (telefonos, montos, contraseñas hasheadas).
 *
 * Ese directorio /app/backups se monta como volumen desde docker-compose.yml
 * a una carpeta del host (ver BACKUP_HOST_DIR en docker-compose.yml) - si
 * quieres una copia fuera de tu propia PC, la forma recomendada es apuntar
 * BACKUP_HOST_DIR a una carpeta dentro de tu OneDrive/Google Drive/Dropbox
 * *privados*: el propio cliente de sincronizacion de Windows la sube solo,
 * sin necesitar credenciales ni integraciones adicionales, y sigue siendo
 * una carpeta privada tuya (no un bucket con lectura publica).
 *
 * Se usa un archivo marcador (en vez de un setInterval en memoria) para que
 * la periodicidad de "cada 3 dias" sobreviva a reinicios del contenedor.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private running = false;

  // Se usa para el snapshot con VACUUM INTO y para soltar/retomar la conexion
  // al restaurar (Windows no permite sobrescribir un archivo abierto).
  constructor(
    private readonly prisma: PrismaService,
    private readonly migrations: MigrationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async checkAndRun() {
    const last = await this.getLastRun();
    const dueMs = INTERVAL_DAYS * 24 * 60 * 60 * 1000;
    if (last && Date.now() - last.getTime() < dueMs) return;
    await this.run();
  }

  async getLastRun(): Promise<Date | null> {
    try {
      const raw = await fs.readFile(MARKER_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return data.timestamp ? new Date(data.timestamp) : null;
    } catch {
      return null;
    }
  }

  /** Info para mostrar en Configuracion: ultimo respaldo y archivos guardados. */
  /**
   * Lista los respaldos de la carpeta local Y de la copia en OneDrive.
   *
   * Mirar las dos es el punto: si el disco falla o alguien borra la carpeta
   * de datos, los respaldos de la nube tienen que seguir apareciendo aqui
   * para poder restaurar. Antes solo se leia la local, asi que en ese
   * escenario —el unico para el que existe la copia en la nube— la pantalla
   * salia vacia y parecia que no habia nada que recuperar.
   *
   * Si un respaldo esta en ambos lados aparece una sola vez, marcado como
   * local (restaurar desde el disco es mas rapido y no depende de que
   * OneDrive lo haya descargado).
   */
  async list() {
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    const items = new Map<string, BackupFileInfo>();
    for (const [carpeta, origen] of [
      [BACKUP_DIR, 'local'],
      [BACKUPS_MIRROR_DIR, 'nube'],
    ] as const) {
      if (!carpeta) continue;
      const nombres = await fs.readdir(carpeta).catch(() => [] as string[]);
      for (const nombre of nombres) {
        if (nombre.startsWith('.') || nombre.endsWith('.info.json')) continue;
        if (items.has(nombre)) continue; // ya estaba en la carpeta local
        const stat = await fs.stat(join(carpeta, nombre)).catch(() => null);
        if (!stat) continue;
        items.set(nombre, {
          name: nombre,
          sizeBytes: stat.size,
          createdAt: stat.mtime,
          origen,
          contenido: await this.leerFicha(carpeta, nombre),
        });
      }
    }

    const files = [...items.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      lastRun: await this.getLastRun(),
      intervalDays: INTERVAL_DAYS,
      retentionDays: RETENTION_DAYS,
      copiaEnNube: Boolean(BACKUPS_MIRROR_DIR),
      files,
    };
  }

  /** Ruta completa de un respaldo, buscandolo en el disco y luego en OneDrive. */
  private async buscarRespaldo(nombre: string): Promise<string | null> {
    for (const carpeta of [BACKUP_DIR, BACKUPS_MIRROR_DIR]) {
      if (!carpeta) continue;
      const ruta = join(carpeta, nombre);
      const existe = await fs
        .access(ruta)
        .then(() => true)
        .catch(() => false);
      if (existe) return ruta;
    }
    return null;
  }

  /** Conteos guardados junto al respaldo, si los tiene (los viejos no). */
  private async leerFicha(carpeta: string, nombre: string): Promise<BackupContenido | null> {
    if (!nombre.endsWith('.sqlite.gz')) return null;
    try {
      const raw = await fs.readFile(join(carpeta, `${nombre}.info.json`), 'utf8');
      return JSON.parse(raw) as BackupContenido;
    } catch {
      // Respaldo anterior a esta funcion, o ficha perdida: no es un error.
      return null;
    }
  }

  /**
   * Cuenta que hay dentro de la base al respaldar y lo guarda en una ficha
   * junto al archivo.
   *
   * Se calcula AQUI y no al listar porque para saberlo habria que
   * descomprimir y abrir cada respaldo: con varios acumulados, la pantalla
   * de Configuracion tardaria segundos en cargar.
   */
  private async escribirFicha(rutaRespaldo: string): Promise<void> {
    try {
      const [productos, clientes, ventas, facturas, deudas, gastos, pedidos, usuarios] =
        await Promise.all([
          this.prisma.product.count(),
          this.prisma.client.count(),
          this.prisma.sale.count(),
          this.prisma.invoice.count(),
          this.prisma.clientDebt.count(),
          this.prisma.expense.count(),
          this.prisma.order.count(),
          this.prisma.user.count(),
        ]);
      await fs.writeFile(
        `${rutaRespaldo}.info.json`,
        JSON.stringify({
          productos,
          clientes,
          ventas,
          facturas,
          deudas,
          gastos,
          pedidos,
          usuarios,
        }),
      );
    } catch (error) {
      // La ficha es informativa: si falla, el respaldo sigue siendo valido.
      this.logger.warn(`No se pudo escribir la ficha del respaldo: ${error}`);
    }
  }

  /** Ejecuta el respaldo ahora mismo (usado por el cron y por el boton manual). */
  async run(): Promise<{ ok: boolean; error?: string }> {
    if (this.running) return { ok: false, error: 'Ya hay un respaldo en curso.' };
    this.running = true;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    try {
      await fs.mkdir(BACKUP_DIR, { recursive: true });

      const dbFile = join(BACKUP_DIR, `db-${timestamp}.sqlite.gz`);
      const snapshotFile = join(BACKUP_DIR, `.snapshot-${timestamp}.sqlite`);

      // "VACUUM INTO" es la forma correcta de respaldar SQLite mientras la
      // app esta en uso: pide a SQLite que escriba una copia consistente y ya
      // compactada. Copiar el archivo con fs.copyFile seria mas simple pero
      // peligroso — si alguien esta cobrando una venta en ese instante, la
      // copia puede quedar a medio escribir y el respaldo naceria corrupto,
      // justo el dia que haga falta.
      await this.prisma.$executeRawUnsafe(`VACUUM INTO '${snapshotFile.replace(/'/g, "''")}'`);

      const rawStat = await fs.stat(snapshotFile);
      if (rawStat.size < 200) {
        await fs.unlink(snapshotFile).catch(() => undefined);
        throw new Error(
          `La copia de la base de datos salio sospechosamente pequeña (${rawStat.size} bytes).`,
        );
      }

      // Se comprime con zlib (incluido en Node) en vez de invocar "gzip":
      // corriendo nativo en Windows ese comando no existe, y el respaldo
      // fallaria en la PC del cliente aunque aqui funcione por tener Git.
      await pipeline(createReadStream(snapshotFile), createGzip(), createWriteStream(dbFile));
      await fs.unlink(snapshotFile).catch(() => undefined);
      await this.escribirFicha(dbFile);

      let uploadsFile: string | null = null;
      try {
        const hasUploads = await fs
          .readdir(UPLOADS_DIR)
          .then((list) => list.length > 0)
          .catch(() => false);
        if (hasUploads) {
          uploadsFile = join(BACKUP_DIR, `uploads-${timestamp}.tar.gz`);
          // -C a la carpeta PADRE de uploads (no a process.cwd()): en la
          // version nativa uploads vive en los datos del usuario, fuera de la
          // carpeta del programa.
          await execAsync(
            `tar -czf "${uploadsFile}" -C "${dirname(UPLOADS_DIR)}" "${basename(UPLOADS_DIR)}"`,
          );
        }
      } catch (error) {
        this.logger.warn(`No se pudo respaldar la carpeta de uploads: ${error}`);
      }

      await fs.writeFile(
        MARKER_FILE,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          files: [dbFile, uploadsFile].filter(Boolean),
        }),
      );

      await this.cleanupOld();
      this.logger.log(
        `Respaldo completado (local): ${dbFile}${uploadsFile ? ` + ${uploadsFile}` : ''}`,
      );
      return { ok: true };
    } catch (error: any) {
      this.logger.error(`Fallo el respaldo: ${error?.message ?? error}`);
      return { ok: false, error: String(error?.message ?? error) };
    } finally {
      this.running = false;
    }
  }

  /**
   * Restaura la base de datos (y los uploads, si el respaldo los incluye) a
   * partir de un archivo db-<timestamp>.sql.gz de la lista de `list()`.
   * DESTRUCTIVO: reemplaza los datos actuales por los del respaldo. Por eso
   * solo se expone a ADMIN (ver backups.controller.ts) y el frontend pide
   * confirmacion antes de llamarlo.
   */
  async restore(
    dbFileName: string,
  ): Promise<{ ok: boolean; error?: string; restoredUploads?: boolean }> {
    if (this.running)
      return { ok: false, error: 'Hay un respaldo/restauracion en curso, intenta en un momento.' };
    if (!/^db-[\w.-]+\.sqlite\.gz$/.test(dbFileName)) {
      return { ok: false, error: 'Nombre de archivo de respaldo invalido.' };
    }
    this.running = true;
    try {
      // Se busca primero en el disco y luego en OneDrive: asi se puede
      // restaurar aunque la carpeta local ya no exista (disco perdido,
      // borrado accidental), que es para lo que sirve la copia en la nube.
      const dbFile = await this.buscarRespaldo(dbFileName);
      if (!dbFile) throw new Error(`No se encontro el respaldo ${dbFileName}.`);

      // Se descomprime a un archivo aparte y se valida ANTES de tocar la base
      // en uso: si el .gz estuviera corrupto, descubrirlo despues de haber
      // borrado la base actual dejaria al negocio sin datos y sin respaldo.
      const restoredFile = join(BACKUP_DIR, `.restore-${Date.now()}.sqlite`);
      await pipeline(createReadStream(dbFile), createGunzip(), createWriteStream(restoredFile));

      const restoreStat = await fs.stat(restoredFile);
      if (restoreStat.size < 200) {
        await fs.unlink(restoredFile).catch(() => undefined);
        throw new Error(
          `El respaldo ${dbFileName} esta vacio o corrupto (${restoreStat.size} bytes) — no se puede restaurar. ` +
            `Prueba con otro punto de la lista.`,
        );
      }
      // Comprobacion extra: que sea de verdad una base SQLite (los primeros
      // 16 bytes de todo archivo SQLite son "SQLite format 3\0").
      const cabecera = await fs
        .readFile(restoredFile, { encoding: 'latin1', flag: 'r' })
        .then((c) => c.slice(0, 15));
      if (cabecera !== 'SQLite format 3') {
        await fs.unlink(restoredFile).catch(() => undefined);
        throw new Error(`El respaldo ${dbFileName} no parece una base de datos valida.`);
      }

      this.logger.warn(`Restaurando base de datos desde ${dbFileName} ...`);

      // Con SQLite "restaurar" es reemplazar el archivo. Hay que soltar la
      // conexion primero (Windows no deja sobrescribir un archivo abierto) y
      // volver a conectar despues. Se guarda la base actual como .anterior
      // por si la restauracion resulta ser la decision equivocada.
      const rutaActual = resolveSqliteFile();
      await this.prisma.$disconnect();
      try {
        await fs.rename(rutaActual, `${rutaActual}.anterior`).catch(() => undefined);
        await fs.copyFile(restoredFile, rutaActual);
      } finally {
        await this.prisma.$connect();
      }
      await fs.unlink(restoredFile).catch(() => undefined);

      // Un respaldo viejo puede ser de antes de una migracion (una columna
      // nueva, etc.). Sin esto, la base restaurada se queda desfasada del
      // esquema que espera la app y todo revienta con "P2022: columna no
      // existe" hasta el siguiente reinicio. Se aplican aqui mismo las que
      // falten, igual que hace el arranque.
      try {
        const dir =
          process.env.PRISMA_MIGRATIONS_DIR || join(process.cwd(), 'prisma', 'migrations');
        const aplicadas = await this.migrations.applyPending(dir);
        if (aplicadas > 0) {
          this.logger.warn(
            `El respaldo era de una version anterior: se aplicaron ${aplicadas} migracion(es) para ponerlo al dia.`,
          );
        }
      } catch (error) {
        this.logger.error(
          `La base se restauro pero fallaron las migraciones para ponerla al dia: ${error}. ` +
            `Reinicia la aplicacion para que se apliquen al arrancar.`,
        );
      }

      // El archivo de uploads comparte el mismo sufijo de timestamp que el
      // de la base de datos (ej. db-2026-...gz / uploads-2026-...tar.gz).
      // La extension correcta es ".sqlite.gz" (10 caracteres). Al pasar de
      // PostgreSQL a SQLite esto seguia recortando 7 (".sql.gz"), asi que el
      // nombre calculado terminaba en "...108Z.sq" y NUNCA encontraba el
      // archivo de fotos: la base se restauraba y las imagenes no.
      const timestamp = dbFileName.slice('db-'.length, -'.sqlite.gz'.length);
      const uploadsFile = await this.buscarRespaldo(`uploads-${timestamp}.tar.gz`);

      let restoredUploads = false;
      if (uploadsFile) {
        this.logger.warn(`Restaurando carpeta de uploads desde uploads-${timestamp}.tar.gz ...`);
        // fs.rm en vez de "rm -rf": ese comando no existe en Windows nativo.
        await fs.rm(UPLOADS_DIR, { recursive: true, force: true });
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        await execAsync(`tar -xzf "${uploadsFile}" -C "${dirname(UPLOADS_DIR)}"`);
        restoredUploads = true;
      }

      this.logger.warn(`Restauracion completada desde ${dbFileName}.`);
      return { ok: true, restoredUploads };
    } catch (error: any) {
      this.logger.error(`Fallo la restauracion: ${error?.message ?? error}`);
      return { ok: false, error: String(error?.message ?? error) };
    } finally {
      this.running = false;
    }
  }

  private async cleanupOld() {
    const files = await fs.readdir(BACKUP_DIR);
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (file.startsWith('.')) continue;
      const filePath = join(BACKUP_DIR, file);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(filePath);
        this.logger.log(`Respaldo antiguo eliminado (> ${RETENTION_DAYS} dias): ${file}`);
      }
    }
  }
}
