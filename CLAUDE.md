# CLAUDE.md — guía para trabajar en este repositorio

## Qué es

**Cafe Shopping** es un punto de venta (POS), facturación y reportes para un
negocio de **joyería** en República Dominicana. El nombre "Cafe Shopping" es
histórico: hoy el catálogo son piezas de joyería (material PLATA/ORO/…), los
montos son en **RD$** y la factura se manda por **WhatsApp**.

Corre como una **app de escritorio de Windows** (Electron), sin Docker, sin
PostgreSQL, sin servidor. Un solo usuario/PC por instalación.

## Arquitectura (importante entenderla antes de tocar nada)

```
Electron (desktop/main.js)
 ├─ backend  → proceso hijo Node (backend/dist/main.js), NestJS + Prisma + SQLite
 │             corre con el Node que ya trae Electron (ELECTRON_RUN_AS_NODE)
 ├─ frontend → build de Vite servido por un mini HTTP server (desktop/nativo.js)
 ├─ facturas → se renderizan en una BrowserWindow oculta de Electron
 │             (reemplazó a Puppeteer; ver desktop/nativo.js → renderizarParaBackend)
 └─ WhatsApp → agente AutoHotkey (send_whatsapp_agent.ahk / .exe) que vigila una
               cola de archivos en uploads/whatsapp-queue/ y pega el PNG + texto
               en WhatsApp Desktop
```

- **Base de datos**: SQLite, un archivo en `%APPDATA%\<nombre>\datos\cafe-shopping.db`.
  En desarrollo: `backend/prisma/dev.db`.
- **Migraciones**: se aplican en el arranque **sin el CLI de Prisma**, leyendo
  los `.sql` de `backend/prisma/migrations/` (ver `backend/src/prisma/migrations.service.ts`).
  Usa la misma tabla `_prisma_migrations` que Prisma, así que `prisma migrate dev`
  en desarrollo y este servicio en producción comparten estado.
- **Catálogo web**: página estática que el backend genera a una carpeta de
  `Documentos` (`backend/src/catalogo/`). El negocio la sube a cualquier hosting.
- **Relevo de pedidos** (`cloud-relay/`): Cloudflare Worker opcional que recibe
  los pedidos del catálogo y los guarda un rato para que la app los recoja sola.

## Comandos

Node no siempre está en el PATH; si `npm` no responde, está en
`C:\Program Files\nodejs\`. Los scripts `.claude/run-*.cmd` levantan los dev
servers manejando eso.

```bash
# Desarrollo (dos terminales)
cd backend  && npm install && npx prisma generate && npm run start:dev   # :3000
cd frontend && npm install && npm run dev                                # :5173

# Probar la app real (Electron + render de facturas + agente)
cd desktop && npm install && npm start
# ojo: usa la base de %APPDATA%\cafe-shopping-desktop\datos\ (datos reales si
# ya la usaste). Para una base aparte: set CAFE_SHOPPING_TEST_DATA_DIR=...

# Compilar el instalador
cd desktop && node compilar.js 2.0.24   # sube versión + compila todo + electron-builder

# Chequeos (lo mismo que corre .github/workflows/ci.yml en cada push/PR)
cd backend  && npm run build && npm test && npm run test:e2e
cd frontend && npm run build   # incluye tsc
```

Los tests e2e crean su propia base SQLite temporal (`test/global-setup.ts`),
no tocan `dev.db`. El instalador se publica al empujar un tag `vX.Y.Z`
(`build.yml`).

## Convenciones del código

- **Español** en todo: nombres de funciones/variables nuevas, comentarios,
  mensajes de error al usuario, mensajes de commit. Los comentarios explican el
  **porqué** (a menudo "esto pasó en producción con los datos reales"), no el qué.
- **Enums**: SQLite no tiene enums. Se definen como objetos `as const` en
  `backend/src/common/enums.ts` y en el schema son `String`. Al filtrar por
  varios valores, **enumerar en positivo** (`{ in: [...] }`), nunca `{ not: X }`:
  con ~2400 clientes, la negación revienta el límite de parámetros de SQLite.
- **Llaves foráneas**: SQLite no deja `ALTER TABLE ADD CONSTRAINT`, así que las
  FKs nuevas van con el patrón "recrear tabla" que genera Prisma. `client_debts`,
  `web_orders` y `products.categoria` YA tienen FK real (CASCADE / SET NULL);
  `MigrationsService` aplica esas migraciones dentro de una transacción con
  `PRAGMA defer_foreign_keys = ON`.
- **Envío por WhatsApp**: no bloquea la petición. `POST /sales/:id/send-invoice-whatsapp`
  encola (marca `invoice.whatsappEstado = EN_COLA`) y `WhatsappQueueService`
  procesa en segundo plano con reintentos.
- **Errores**: lanzar `BadRequestException`/`NotFoundException` con mensaje claro
  en español. `common/filters/http-exception.filter.ts` traduce los errores de
  Prisma (P2002/P2003/P2025) a mensajes legibles; todo lo demás es 500.
- **Facturas**: sólo se pueden renderizar dentro de la app de escritorio (aporta
  el Chromium). En `npm run start:dev` suelto, `RenderService` lanza un error
  explicándolo y la venta se crea igual (la factura queda en estado ERROR).

## Trampas conocidas

- **No hay usuario por defecto.** El administrador lo crea el dueño en la
  pantalla de primer arranque (`Login.tsx` → `POST /auth/setup`, solo desde
  loopback y solo si no hay usuarios reales). "Usuarios reales" excluye a
  `ventas-web@cafeshopping.local`, que la migración inserta en TODA base: si lo
  contaras, una instalación nueva nunca pediría crear el administrador. Al
  actualizar la app la base se conserva, así que no vuelve a pedirse. Los
  usuarios demo de `prisma/seed.ts` son solo para desarrollo.

- El **carrito del POS se guarda en localStorage** (`usePersistedState`, clave
  con prefijo `cafe-shopping:borrador:`, TTL 12h). Si se borran productos
  después (limpiar duplicados, importar inventario), el carrito guarda IDs
  muertos → `sale.create` fallaba con FK. Hoy: `sales.service.ts → validarReferencias()`
  avisa qué quitar y `POS.tsx` limpia las líneas muertas al cargar.
- `compilar.js` **sube la versión** de `desktop/package.json` en cada corrida si
  no le pasás el número. Pasá siempre el número que querés.
- El backend hijo corre con `--max-old-space-size=512`.
- `PRISMA_MIGRATIONS_DIR`, `DATABASE_URL`, `UPLOADS_DIR`, `JWT_SECRET`, etc. los
  inyecta `desktop/nativo.js` al hijo; en desarrollo salen de `backend/.env`.

## Historia

La app nació como web con Docker + PostgreSQL + nginx + Puppeteer + Twilio (rama
`main`). La rama `version-nativa` la migró a Electron + SQLite. Muchos
comentarios dicen "en la versión con Docker esto era X" — es contexto, no código
vivo. Los archivos de Docker se eliminaron en `version-nativa`.
