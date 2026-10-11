/**
 * Copia los datos de la version con Docker (PostgreSQL) a la version nativa
 * (SQLite).
 *
 * Uso:
 *   node prisma/migrar-desde-postgres.js
 *
 * Variables:
 *   PG_URL      cadena de conexion a Postgres
 *               (por defecto la del docker-compose)
 *   SQLITE_FILE archivo destino
 *               (por defecto la base de la app instalada, en AppData)
 *
 * Como funciona: lee tabla por tabla con el cliente de Postgres y escribe en
 * SQLite RESPETANDO EL ORDEN de las llaves foraneas (primero usuarios y
 * clientes, al final las lineas de venta). Conserva los ids originales para
 * que las relaciones sigan apuntando a lo mismo.
 *
 * Es seguro repetirlo: antes de copiar vacia las tablas del destino, asi que
 * dos ejecuciones seguidas dejan el mismo resultado en vez de duplicar todo.
 * NO toca la base de Postgres — solo lee.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
// Dos clientes distintos a proposito: el normal ya quedo generado contra
// SQLite y rechaza una URL de postgres. El de lectura se genera aparte desde
// schema-origen-postgres.prisma (ver README de la rama).
const { PrismaClient } = require('@prisma/client');
const { PrismaClient: PrismaPostgres } = require('./cliente-postgres');

const PG_URL =
  process.env.PG_URL || 'postgresql://cafeshopping:cafeshopping@localhost:5432/cafe_shopping';

const SQLITE_FILE =
  process.env.SQLITE_FILE ||
  path.join(
    process.env.APPDATA || '',
    'cafe-shopping-desktop',
    'datos',
    'cafe-shopping.db',
  );

// Orden importante: cada tabla depende de las anteriores.
const TABLAS = [
  'user',
  'client',
  'product',
  'businessProfile',
  'sale',
  'saleItem',
  'invoice',
  'payment',
  'clientDebt',
  'expense',
  'order',
  'auditLog',
];

/**
 * Convierte las URLs absolutas de archivos en rutas relativas.
 *
 * La version con Docker guardaba "http://localhost:3000/uploads/...", con el
 * puerto metido dentro del dato. La version nativa usa otro puerto, asi que
 * esas fotos y facturas apuntarian a un servidor que ya no existe y las
 * fichas se verian sin imagen. Guardar la ruta relativa las hace
 * independientes del puerto.
 */
function aRutaRelativa(valor) {
  if (typeof valor !== 'string') return valor;
  const m = valor.match(/^https?:\/\/[^/]+(\/uploads\/.*)$/);
  return m ? m[1] : valor;
}

const CAMPOS_DE_ARCHIVO = new Set(['imageUrl', 'logoUrl', 'pngUrl', 'pdfUrl']);

/** Los Decimal de Prisma se pasan a string para no perder centavos por el camino. */
function normalizar(fila) {
  const salida = {};
  for (const [clave, valor] of Object.entries(fila)) {
    if (CAMPOS_DE_ARCHIVO.has(clave)) {
      salida[clave] = aRutaRelativa(valor);
      continue;
    }
    if (valor === null || valor === undefined) {
      salida[clave] = valor;
    } else if (typeof valor === 'object' && typeof valor.toFixed === 'function' && !(valor instanceof Date)) {
      salida[clave] = valor.toString();
    } else if (valor !== null && typeof valor === 'object' && !(valor instanceof Date) && !Buffer.isBuffer(valor)) {
      // audit_logs.changes era Json en Postgres y en SQLite es texto.
      salida[clave] = JSON.stringify(valor);
    } else {
      salida[clave] = valor;
    }
  }
  return salida;
}

/**
 * Copia las fotos de productos y los PNG de facturas desde el volumen de
 * Docker a la carpeta de la version nativa.
 *
 * Migrar solo la base de datos no basta: los registros guardan la RUTA del
 * archivo, no el archivo. Sin este paso el catalogo quedaria con todas las
 * fichas sin foto y las facturas ya emitidas no se podrian reenviar por
 * WhatsApp.
 */
function copiarArchivos(destinoUploads) {
  const CONTENEDOR = process.env.CONTENEDOR_BACKEND || 'cafe-shopping-backend-1';
  try {
    execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', CONTENEDOR], {
      stdio: 'pipe',
    });
  } catch {
    console.log('');
    console.log(`No se encontro el contenedor ${CONTENEDOR} corriendo.`);
    console.log('Enciende la version con Docker y vuelve a ejecutar, o copia a mano');
    console.log(`las carpetas products/ e invoices/ a: ${destinoUploads}`);
    return false;
  }

  fs.mkdirSync(destinoUploads, { recursive: true });
  console.log('');
  console.log('Copiando fotos y facturas desde el volumen de Docker...');
  execFileSync('docker', ['cp', `${CONTENEDOR}:/app/uploads/.`, destinoUploads], { stdio: 'pipe' });

  for (const carpeta of ['products', 'invoices']) {
    const ruta = path.join(destinoUploads, carpeta);
    const cuantos = fs.existsSync(ruta) ? fs.readdirSync(ruta).length : 0;
    console.log(`  ${carpeta.padEnd(10)} ${cuantos} archivos`);
  }
  return true;
}

async function main() {
  console.log('Origen  (PostgreSQL):', PG_URL.replace(/:[^:@]*@/, ':****@'));
  console.log('Destino (SQLite)    :', SQLITE_FILE);
  console.log('');

  const pg = new PrismaPostgres({ datasources: { db: { url: PG_URL } } });
  const sqlite = new PrismaClient({
    datasources: { db: { url: 'file:' + SQLITE_FILE.replace(/\\/g, '/') } },
  });

  try {
    // Vaciar el destino en orden inverso, para no chocar con las llaves foraneas.
    for (const tabla of [...TABLAS].reverse()) {
      await sqlite[tabla].deleteMany({});
    }

    const resumen = [];
    for (const tabla of TABLAS) {
      const filas = await pg[tabla].findMany();
      let copiadas = 0;
      for (const fila of filas) {
        try {
          await sqlite[tabla].create({ data: normalizar(fila) });
          copiadas += 1;
        } catch (error) {
          console.error(`  ! ${tabla}: no se pudo copiar un registro -> ${error.message.split('\n')[0]}`);
        }
      }
      resumen.push({ tabla, origen: filas.length, copiadas });
      console.log(`${tabla.padEnd(16)} ${String(filas.length).padStart(5)} -> ${String(copiadas).padStart(5)}`);
    }

    console.log('');
    const faltantes = resumen.filter((r) => r.origen !== r.copiadas);
    if (faltantes.length === 0) {
      console.log('Migracion completa: todos los registros se copiaron.');
    } else {
      console.log('ATENCION, quedaron registros sin copiar:');
      for (const f of faltantes) console.log(`  ${f.tabla}: ${f.origen - f.copiadas} sin copiar`);
      process.exitCode = 1;
    }

    // Comprobacion de dinero: la suma de las ventas debe coincidir exactamente.
    const [totalPg, totalSqlite] = await Promise.all([
      pg.sale.aggregate({ _sum: { total: true } }),
      sqlite.sale.aggregate({ _sum: { total: true } }),
    ]);
    const a = Number(totalPg._sum.total ?? 0);
    const b = Number(totalSqlite._sum.total ?? 0);
    console.log('');
    console.log(`Total vendido en Postgres: ${a.toFixed(2)}`);
    console.log(`Total vendido en SQLite  : ${b.toFixed(2)}`);
    console.log(Math.abs(a - b) < 0.005 ? 'Los montos coinciden.' : 'LOS MONTOS NO COINCIDEN — revisar.');

    // Los archivos van despues de los datos: si algo falla en la copia, al
    // menos la base ya quedo migrada y se puede reintentar solo esta parte.
    copiarArchivos(path.join(path.dirname(SQLITE_FILE), 'uploads'));
  } finally {
    await pg.$disconnect().catch(() => undefined);
    await sqlite.$disconnect().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('Fallo la migracion:', error.message);
  process.exit(1);
});
