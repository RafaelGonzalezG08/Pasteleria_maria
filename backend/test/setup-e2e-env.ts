import { join } from 'path';

// Corre en cada worker de jest ANTES de cargar los tests, así el PrismaClient
// que instancia AppModule ya ve la base de datos de pruebas (la crea y migra
// test/global-setup.ts).
const dbPath = join(__dirname, 'e2e.db').replace(/\\/g, '/');
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-e2e';
process.env.NODE_ENV = 'test';
