# CLAUDE.md — guía para trabajar en este repositorio

## Qué es

**Pastelería María**: punto de venta, encargos, inventario de insumos, recetas
con costeo, producción, compras, cobros y reportes para una pastelería en
República Dominicana. Montos en **RD$** (configurable), impuesto **ITBIS**
(configurable), factura por **WhatsApp**.

Corre como **app de escritorio de Windows** (Electron), sin Docker ni servidor.
Una PC por instalación. Se construyó a partir de una app anterior de punto de
venta; de ahí vienen algunos comentarios con historia, pero no queda código de
catálogo web, acceso por celular ni pedidos web.

## Arquitectura

```
Electron (desktop/main.js)
 ├─ backend  → proceso hijo Node (backend/dist/main.js), NestJS + Prisma + SQLite,
 │             solo en 127.0.0.1; corre con el Node de Electron (ELECTRON_RUN_AS_NODE)
 ├─ frontend → build de Vite servido por un mini HTTP server (desktop/nativo.js)
 ├─ facturas → se dibujan en una BrowserWindow oculta (nativo.js → renderizarParaBackend)
 └─ WhatsApp → agente AutoHotkey (send_whatsapp_agent.ahk; el .exe se compila en CI)
               que vigila uploads/whatsapp-queue/ y pega PNG + texto en WhatsApp Desktop
```

- **Base de datos**: SQLite en `%APPDATA%\Pasteleria Maria\datos\pasteleria-maria.db`.
  En desarrollo: `backend/prisma/dev.db`.
- **Migraciones**: se aplican al arrancar sin el CLI de Prisma
  (`backend/src/prisma/migrations.service.ts`), misma tabla `_prisma_migrations`.
  Hay una sola migración inicial; las nuevas van con `prisma migrate dev`.
- **Actualizaciones**: electron-updater contra los releases de
  `RafaelGonzalezG08/Pasteleria_maria` (`desktop/package.json → build.publish`).
  Se publican empujando un tag `vX.Y.Z` (`.github/workflows/build.yml`).

## Dominio (backend/src)

- `insumos/`: insumos, lotes (FIFO por vencimiento), movimientos. `entrada()` y
  `consumir()` reciben la transacción del llamador (compras, producción).
- `recetas/`: `Recetario` carga todo en memoria y costea/explota recursivamente
  las subrecetas; detecta ciclos. `actualizarCostosProductos()` pone en cada
  producto con receta su costo por unidad.
- `produccion/`: descuenta insumos explotados, suma producto, hoja del día y
  lista de compras.
- `compras/`, `proveedores/`: la compra crea lotes, recalcula costo promedio y
  un gasto.
- `encargos/`: anticipos en `EncargoPago`; al entregar crea la venta con
  `SalesService.crearVentaDeEncargo` (dentro de la misma transacción) y, si
  queda saldo autorizado, una `ClientDebt` solo por el saldo.
- Unidades: `common/unidades.ts` (copia en `frontend/src/lib/unidades.ts`).
  Solo se convierte dentro de la misma familia (masa, volumen, conteo).
- Costos: `common/costos.util.ts → segunRol()` quita costos/márgenes de las
  respuestas a quien no es ADMIN.

## Comandos

```bash
# Desarrollo (dos terminales)
cd backend  && npm install && npx prisma generate && npm run start:dev   # :3000
cd frontend && npm install && npm run dev                                # :5173
cd backend  && npm run prisma:seed     # datos y usuarios demo (solo desarrollo)

# App real (Electron + facturas + agente)
cd desktop && npm install && npm start
# usa %APPDATA%; para una base aparte: set PASTELERIA_MARIA_TEST_DATA_DIR=...

# Instalador local
cd desktop && node compilar.js 1.0.1

# Chequeos (lo mismo que ci.yml)
cd backend  && npm run build && npm test && npm run test:e2e
cd frontend && npm run lint && npm run build
```

## Convenciones

- **Español** en todo: nombres nuevos, comentarios, mensajes, commits. Los
  comentarios explican el **porqué**.
- **Enums**: SQLite no tiene enums; van como objetos `as const` en
  `backend/src/common/enums.ts` y `String` en el schema. Filtrar con
  `{ in: [...] }`, nunca `{ not: X }` (límite de parámetros de SQLite).
- **Transacciones**: SQLite admite un solo escritor. Dentro de un
  `$transaction` todo va por `tx`: una escritura con `this.prisma` (p. ej.
  `audit.log`) espera a que termine la transacción y se tranca. Auditar después.
- **Errores**: `BadRequestException`/`NotFoundException` con mensaje claro.
- **Facturas**: solo se dibujan dentro de Electron; en `start:dev` la venta se
  crea igual y la factura queda en ERROR.
- **Decimales**: Prisma devuelve `Decimal`; los servicios nuevos convierten a
  `Number` antes de responder.

## Trampas conocidas

- **Migraciones que recrean una tabla padre** (patrón `RedefineTables` de
  Prisma: `DROP TABLE` + `CREATE` + `RENAME`). Con llaves foráneas activas, el
  DROP dispara los `ON DELETE` de las tablas hijas (borró el producto de las
  recetas en una base de prueba). `MigrationsService` apaga las FKs fuera de la
  transacción, verifica adentro que estén apagadas y corre `foreign_key_check`
  (prueba: `test/migraciones.e2e-spec.ts`). Aun así, si solo se agregan
  columnas, preferir `ALTER TABLE ADD COLUMN` a mano.

- **No hay usuario por defecto.** El administrador se crea en la pantalla de
  primer arranque (`POST /auth/setup`, solo desde loopback y solo con 0 usuarios).
- `JwtModule` usa `registerAsync`: con `register`, el secreto se leía antes de
  cargar el `.env` y en desarrollo todo daba 401.
- El carrito del POS y los borradores se guardan en localStorage
  (`pasteleria-maria:borrador:`).
- `compilar.js` sube la versión si no le pasas el número.
- El backend hijo corre con `--max-old-space-size=512`.
- `DATABASE_URL`, `UPLOADS_DIR`, `JWT_SECRET`, etc. los inyecta `desktop/nativo.js`;
  en desarrollo salen de `backend/.env` (ver `.env.example`).
