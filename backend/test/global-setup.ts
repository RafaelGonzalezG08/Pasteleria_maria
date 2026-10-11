import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Prepara una base SQLite limpia para los tests e2e: borra la anterior y
 * aplica todas las migraciones. Se corre una sola vez antes de la suite.
 */
export default function globalSetup() {
  const dbPath = join(__dirname, 'e2e.db');
  process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-e2e';

  for (const suf of ['', '-journal', '-wal', '-shm']) {
    const f = dbPath + suf;
    if (existsSync(f)) unlinkSync(f);
  }

  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env },
  });
}
