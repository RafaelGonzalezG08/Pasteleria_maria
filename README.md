# Cafe Shopping

Punto de venta (POS), facturación y reportes para un negocio de joyería.
Al cerrar cada venta genera una factura en PNG y la envía por WhatsApp Desktop
(vía un agente local de AutoHotkey), además de llevar clientes, deudas, gastos,
pedidos por entregar, un catálogo web y reportes.

Es una **app de escritorio de Windows**: no necesita Docker, ni PostgreSQL, ni
servidor. Un solo negocio por instalación.

## Cómo funciona

| Pieza | Qué es |
|---|---|
| **App** | Electron. Levanta el backend como proceso hijo y sirve la interfaz desde disco. |
| **Backend** | NestJS + Prisma. Corre con el Node que ya trae Electron. |
| **Base de datos** | SQLite — un archivo en `%APPDATA%\Cafe Shopping\datos\`. |
| **Facturas PNG/PDF** | Se dibujan en una ventana oculta del propio Chromium de Electron. |
| **WhatsApp** | El backend deja un "pedido" de envío en una carpeta; el agente `send_whatsapp_agent.ahk` (o `.exe`), corriendo en la PC, pega el PNG y el texto en WhatsApp Desktop. |
| **Catálogo web** | Página estática que el backend genera en `Documentos`; se sube a cualquier hosting. |
| **Respaldos** | Diarios, a la carpeta de datos y a una copia en OneDrive. |

## Instalar en la PC del negocio

1. Consigue el instalador `Cafe Shopping Setup X.Y.Z.exe` (lo genera `desktop/`,
   ver abajo, o descárgalo del release de GitHub).
2. Doble clic → siguiente → siguiente. Crea el acceso directo "Cafe Shopping".
3. La primera vez, la app crea la base de datos y un usuario administrador. La
   contraseña inicial la muestra la propia app.
4. Para el envío por WhatsApp: ten **WhatsApp Desktop** abierto con sesión
   iniciada. El agente arranca solo con la app.

Las actualizaciones se instalan solas (electron-updater contra los releases de
GitHub).

## Desarrollo

Requiere **Node.js 20+**. Dos terminales:

```bash
# Backend  → http://localhost:3000/api  (docs en /api/docs)
cd backend
npm install
npx prisma generate
npm run start:dev

# Frontend → http://localhost:5173
cd frontend
npm install
npm run dev
```

En este modo el backend usa `backend/prisma/dev.db` (se crea solo) y la
generación de facturas PNG **no funciona** (necesita la app de escritorio, que
es la que aporta el navegador) — la venta se registra igual.

Para probar la app completa, con facturas y agente de WhatsApp:

```bash
cd desktop
npm install
npm start
```

> ⚠️ `npm start` usa la base de datos real de la app instalada
> (`%APPDATA%\cafe-shopping-desktop\datos\`). Para trabajar contra una base
> aparte: `set CAFE_SHOPPING_TEST_DATA_DIR=C:\ruta\temporal` antes de `npm start`.

## Compilar el instalador

```bash
cd desktop
npm install
node compilar.js 2.0.24     # el número es la versión nueva; súbelo cada vez
```

`compilar.js` compila el backend (webpack, un solo archivo), el frontend
(apuntando al puerto 3010), sube la versión en `desktop/package.json` y corre
electron-builder. El resultado queda en `desktop/dist/Cafe Shopping Setup 2.0.24.exe`.

También corre en CI: al empujar un tag `vX.Y.Z`, `.github/workflows/build.yml`
genera el instalador y lo sube al release.

## Estructura

```
cafe-shopping/
├── backend/            # API NestJS
│   ├── src/
│   │   ├── auth/            # login, JWT, roles (ADMIN/CAJERO/CONTABILIDAD)
│   │   ├── clients/  client-debts/   # clientes, deudas y abonos
│   │   ├── products/ categories/     # inventario de piezas
│   │   ├── sales/    invoices/       # ventas (POS) + factura PNG/PDF + cola WhatsApp
│   │   ├── orders/   web-orders/     # pedidos por entregar / pedidos del catálogo
│   │   ├── expenses/ reports/        # gastos, KPIs, flujo de caja, saldo en caja
│   │   ├── catalogo/                 # generador del sitio público
│   │   ├── settings/ backups/ data-import/ audit/
│   │   └── prisma/                   # servicio de migraciones en proceso
│   └── prisma/schema.prisma
├── frontend/           # SPA React + Vite + Tailwind
├── desktop/            # Electron: main.js (ciclo de vida) + nativo.js (arranque)
├── cloud-relay/        # Cloudflare Worker opcional para los pedidos del catálogo
└── send_whatsapp_agent.ahk   # agente de WhatsApp Desktop
```

## Variables de entorno (backend, sólo desarrollo)

En producción las inyecta `desktop/nativo.js`. Para desarrollo, `backend/.env`:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `file:./dev.db` |
| `JWT_SECRET` | secreto para firmar sesiones |
| `JWT_EXPIRES_IN` | duración del token (default `8h`) |
| `DEFAULT_TAX_RATE` | tasa de impuesto si el negocio no configuró una (`0.18`) |
| `WHATSAPP_AGENT_TIMEOUT_MS` / `WHATSAPP_AGENT_POLL_MS` | espera del backend por la confirmación del agente |

## Respaldos

La app respalda sola (base + fotos + facturas) a `datos\backups\` y copia a
OneDrive. Desde Configuración se puede respaldar y restaurar a mano.

## Licencia

Uso privado / interno del negocio.
