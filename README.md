# Rosa Delicias

Sistema de escritorio para una pastelería en República Dominicana: punto de venta,
encargos de clientes, inventario de insumos, recetas con costeo, producción,
compras a proveedores, cobros, reportes y factura por WhatsApp.

Es una **app de Windows** (Electron) que trae todo adentro: base de datos local
(SQLite), backend (NestJS) e interfaz (React). No necesita Docker, ni servidor,
ni internet para trabajar. Se actualiza sola desde los releases de este
repositorio.

> Construida a partir de la app de punto de venta original del cliente (rama
> `version-nativa-apk`), conservando su tecnología, arquitectura, estilo visual y
> sistema de actualizaciones. Ver [Qué se quitó, qué se reutilizó y qué se agregó](#qué-se-quitó-qué-se-reutilizó-y-qué-se-agregó).

---

## Contenido

- [Módulos](#módulos)
- [Roles](#roles)
- [Instalación (PC del negocio)](#instalación-pc-del-negocio)
- [Primer uso](#primer-uso)
- [Uso diario](#uso-diario)
- [Desarrollo](#desarrollo)
- [Publicar una nueva versión (actualización automática)](#publicar-una-nueva-versión-actualización-automática)
- [Respaldos](#respaldos)
- [Arquitectura](#arquitectura)
- [Qué se quitó, qué se reutilizó y qué se agregó](#qué-se-quitó-qué-se-reutilizó-y-qué-se-agregó)

---

## Módulos

| Módulo | Qué hace |
|---|---|
| **Dashboard** | Encargos por entregar (atrasados en rojo), alertas de inventario (por agotarse / por vencer), cumpleaños de clientes y cifras del día y del mes. |
| **Punto de venta** | Venta en mostrador, descuento, ITBIS, contado o crédito, factura PNG y envío por WhatsApp. |
| **Encargos** | Pedidos de clientes con fecha y hora de entrega, retiro en tienda o a domicilio (con costo de envío), personalización por pastel (tamaño, sabor, relleno, decoración, mensaje y foto de referencia), anticipos y abonos, estados (pendiente → en producción → listo → entregado / cancelado), calendario mensual y comprobante imprimible. Al entregar se crea la venta con su factura; si queda saldo se puede dejar a crédito. |
| **Productos** | Catálogo interno de producto terminado (pasteles, panes, bizcochos, postres): precio, categoría, foto opcional, existencia y mermas. El costo sale de la receta. **Venta por porción:** un producto puede ser porción de otro (ej. "Porción de pastel de chocolate", 16 por entero); sus porciones entran al **cortar** un pastel entero (también desde la caja, si se acabaron) o al producir directamente en porciones. |
| **Producción** | Registra lo que se hornea: descuenta todos los insumos de la receta (abriendo subrecetas) y suma las unidades al producto, como enteros o directamente como porciones. Hoja de producción del día a partir de los encargos (imprimible). |
| **Recetas** | Ingredientes y subrecetas (rellenos, cremas, masas), rendimiento, porciones, tiempo, pasos. Costo total, por unidad y por porción al precio actual de los insumos, precio sugerido con margen configurable y escalado (×2, ×5…) con aviso de lo que falta en inventario. |
| **Inventario** | Insumos (ingredientes y materiales) con unidad de medida y conversión (g, kg, lb, oz, ml, L, unidad, docena, porción), existencia, mínimo, costo, lotes con fecha de vencimiento (se gasta primero lo que vence antes), historial de entradas/salidas/ajustes/mermas/compras/producción y **lista de compras** calculada con los encargos de los próximos días. |
| **Compras** | Proveedores y compras. Cada compra entra al inventario como lote, actualiza el costo promedio del insumo (y con él el costo de recetas y productos) y queda registrada en Gastos. |
| **Ventas / Cobros** | Historial de ventas y facturas, reenvío por WhatsApp, cuentas por cobrar a crédito con abonos y recordatorio por WhatsApp. |
| **Clientes** | Ficha con teléfono, dirección, cumpleaños, fechas especiales y notas; historial de compras y de encargos. |
| **Gastos / Transacciones** | Gastos del negocio y libro único de ventas, abonos, anticipos y gastos. |
| **Reportes** | Ventas por día/semana/mes/año, productos más vendidos, ganancia estimada (venta − costo de receta), mermas, insumos por agotarse, cuentas por cobrar (encargos + crédito), gastos y flujo de caja. |
| **Configuración** | Datos del negocio, logo, moneda (RD$ por defecto), nombre y % de impuesto (ITBIS 18%), margen de ganancia, días de aviso, usuarios y roles, respaldos y restauración. |

## Roles

| Rol | Puede |
|---|---|
| **Administrador** | Todo, incluidos costos, márgenes, compras, reportes, gastos y configuración. |
| **Cajero** | Punto de venta, encargos (crear, cobrar, entregar), ventas, cobros y clientes. |
| **Repostero** | Inventario, recetas, producción, hoja de producción y avanzar el estado de los encargos. No ve costos ni márgenes. |

## Instalación (PC del negocio)

1. Descarga el instalador `rosa-delicias-vX.Y.Z.exe` del último
   [release](https://github.com/RafaelGonzalezG08/Pasteleria_maria/releases/latest).
2. Ejecútalo (siguiente, siguiente…). Crea el acceso directo **Rosa Delicias**.
3. Para la factura por WhatsApp: instala **WhatsApp Desktop** y deja la sesión
   iniciada. La app arranca sola el agente que pega la factura en el chat.

Los datos viven en `%APPDATA%\Pasteleria Maria\datos\` (base
`pasteleria-maria.db`, fotos, facturas y respaldos). Actualizar o reinstalar
**no** los borra.

## Primer uso

1. Al abrir por primera vez aparece **Crear administrador**: nombre, correo y
   contraseña del dueño. No hay usuarios de fábrica.
2. **Configuración → Datos del negocio**: nombre, logo, dirección, teléfono,
   RNC, moneda, ITBIS y margen de ganancia sugerido.
3. **Configuración → Usuarios y roles**: agrega cajeros y reposteros.
4. **Compras → Proveedores**, luego **Inventario → Nuevo insumo** (con la
   existencia actual y su vencimiento).
5. **Productos → Nuevo producto** y **Recetas → Nueva receta** (elige el
   producto que produce cada receta).

## Uso diario

- **Hornear:** Producción → elige la receta y las tandas → Registrar. Se
  descuentan los insumos y sube la existencia del producto.
- **Encargo:** Encargos → Nuevo encargo → cliente, fecha/hora, productos y
  personalización, anticipo. Imprime el **Ticket** para el cliente.
- **Planificar:** Producción → Hoja de producción del día; Inventario → Lista de compras.
- **Comprar:** Compras → Registrar compra.
- **Entregar:** abre el encargo → Entregar y cobrar.
- **Mermas:** Inventario → insumo → Merma; Productos → Registrar merma.
- **Vender por porción:** crea un producto "Porción de …" y en *Se vende por porción de* elige el pastel entero y cuántas porciones da. Luego *Cortar en porciones* (o producir eligiendo *Sale como: Porciones*).

## Desarrollo

Requisitos: Node.js 20+.

```bash
# Backend (API en http://localhost:3000/api, Swagger en /api/docs)
cd backend
cp .env.example .env          # y cambia JWT_SECRET
npm install
npx prisma generate
npm run prisma:seed           # opcional: datos y usuarios de ejemplo (solo desarrollo)
npm run start:dev

# Frontend (http://localhost:5173), en otra terminal
cd frontend
npm install
npm run dev

# App de escritorio completa (Electron + render de facturas + agente)
cd desktop
npm install
npm start
```

`npm start` en `desktop/` usa la base real de `%APPDATA%`. Para una base aparte:
`set PASTELERIA_MARIA_TEST_DATA_DIR=C:\ruta\de\prueba`.

Los usuarios de ejemplo del seed (solo desarrollo) están en
[`backend/prisma/seed.ts`](backend/prisma/seed.ts).

### Pruebas

```bash
cd backend
npm run build && npm test && npm run test:e2e
cd ../frontend
npm run lint && npm run build && npm test
```

`test:e2e` usa una base SQLite temporal e incluye el flujo completo
*insumo → receta → producción → encargo → cobro → reportes*.

## Publicar una nueva versión (actualización automática)

Las PCs con la app instalada buscan actualizaciones **al abrir** en los releases
de **este repositorio** (`RafaelGonzalezG08/Pasteleria_maria`, configurado en
`desktop/package.json → build.publish`). Si hay una versión nueva, la descargan
y preguntan *Instalar ahora y reiniciar* / *Instalar después* (en ese caso se
instala sola en el siguiente arranque).

### Paso a paso

1. **Sube el número de versión** en `desktop/package.json` (`"version"`),
   siguiendo `MAYOR.MENOR.PARCHE` (ej. `1.0.0` → `1.0.1`). El actualizador solo
   ofrece versiones **mayores** a la instalada. (El workflow además toma el
   número del tag, así que lo importante es que el tag sea mayor.)
2. Haz commit y push a `main`:
   ```bash
   git add -A
   git commit -m "chore(desktop): version 1.0.1"
   git push origin main
   ```
3. **Crea y sube el tag** con el mismo número, con `v` delante:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. GitHub Actions (`.github/workflows/build.yml`) arranca solo: compila backend,
   frontend y el agente de WhatsApp (`.ahk` → `.exe`), genera el instalador y
   crea el **release `v1.0.1`** con:
   - `rosa-delicias-v1.0.1.exe`
   - `rosa-delicias-v1.0.1.exe.blockmap`
   - `latest.yml` (lo que lee el actualizador; **no lo borres del release**)
5. Revisa en **Actions** que termine en verde y en **Releases** que estén los 3
   archivos. Desde ese momento, cada PC se actualiza al abrir la app.

### Token necesario

- **Publicar con GitHub Actions (recomendado):** no hay que crear nada. El
  workflow usa el `GITHUB_TOKEN` automático del repositorio con permiso
  `contents: write` (ya declarado en `build.yml`). Si falla con "Resource not
  accessible by integration", ve a *Settings → Actions → General → Workflow
  permissions* y marca **Read and write permissions**.
- **Publicar desde tu PC (alternativa):** crea un *Personal access token
  (classic)* en GitHub → *Settings → Developer settings* con el permiso
  **`repo`**, y en PowerShell:
  ```powershell
  $env:GH_TOKEN = "<tu token>"
  cd desktop
  node compilar.js 1.0.1      # compila todo y genera desktop/dist/
  npx electron-builder --publish always
  ```
  Nunca guardes el token en el repositorio.
- **Las PCs del negocio no necesitan token:** el repositorio es público y el
  actualizador lee los releases sin autenticarse. Si algún día lo haces
  privado, las actualizaciones automáticas dejarán de funcionar.

### Generar solo el instalador (sin publicar)

```bash
cd desktop
npm install
npm run instalador          # o: node compilar.js 1.0.1
```

Queda en `desktop/dist/`. Si en la PC hay AutoHotkey v1.1 instalado, también
compila `send_whatsapp_agent.exe`; si no, el instalador lleva solo el `.ahk`
(los instaladores publicados por Actions siempre llevan el `.exe`).

## Respaldos

- Automáticos cada 3 días en `%APPDATA%\Pasteleria Maria\datos\backups` y, si
  hay OneDrive, una copia en `OneDrive\PasteleriaMaria\Respaldos`.
- **Configuración → Respaldos:** generar uno al momento y restaurar cualquiera
  (base de datos y archivos). Se conservan 30 días.

## Arquitectura

```
Electron (desktop/main.js)
 ├─ backend  → proceso hijo Node (backend/dist/main.js): NestJS + Prisma + SQLite,
 │             escucha solo en 127.0.0.1:3010
 ├─ frontend → build de Vite (React + Tailwind) servido en 127.0.0.1 (desktop/nativo.js)
 ├─ facturas → PNG/PDF dibujados en una ventana oculta de Electron
 ├─ WhatsApp → send_whatsapp_agent (AutoHotkey) toma la cola de archivos y pega
 │             la factura en WhatsApp Desktop
 └─ updates  → electron-updater contra los releases de este repositorio
```

```
backend/   API NestJS (src/<modulo>), Prisma (prisma/schema.prisma, migrations/)
frontend/  React + Vite + Tailwind (src/pages/<pantalla>, src/api, src/components)
desktop/   Electron: arranque, splash, actualizador, empaquetado (compilar.js)
.github/   ci.yml (lint + build + tests) y build.yml (instalador + release)
```

## Qué se quitó, qué se reutilizó y qué se agregó

### Se quitó
- **Catálogo web** (módulo `catalogo`, plantilla y vista previa, publicación en
  Netlify/Cloudflare Pages, relevo `cloud-relay` y sus campos en Configuración).
- **Acceso desde el celular** (APK `mobile-app`, PWA, HTTPS en la red local con
  certificado autofirmado, detección de IP, aviso de "sin conexión con la PC",
  envío de WhatsApp desde el celular). El backend escucha solo en la propia PC.
- **Panel de pedidos** de la app original (pedidos web y pedidos ligados a
  ventas); los reemplaza el módulo **Encargos**.
- Lo propio de la joyería: material, tallas, limpieza de duplicados por foto,
  "Añadir datos de otra PC", usuario de sistema de ventas web.
- Rol Contabilidad (los roles ahora son Administrador, Cajero y Repostero).
- Datos de la app original: no se copió ninguna base, respaldo, foto, factura,
  `.env`, token ni clave. La base empieza vacía con una sola migración inicial.

### Se reutilizó (adaptado)
Arquitectura Electron + NestJS + Prisma/SQLite + React, estilo visual
(paleta rosa, neumorfismo, modo oscuro), login y primer arranque, punto de
venta, facturas PNG/PDF, envío por WhatsApp (agente AutoHotkey), ventas,
cobros y deudas, clientes, gastos, transacciones, reportes, costos, usuarios,
auditoría, respaldos automáticos con copia en OneDrive y restauración, cierre
por inactividad, migraciones en el arranque y el sistema de actualización
automática (ahora apuntando a este repositorio).

### Se agregó
Inventario de insumos (unidades con conversión, lotes con vencimiento,
movimientos, mermas, alertas), recetas y subrecetas con costeo y precio
sugerido, escalado, producción, productos terminados con mermas, proveedores y
compras, encargos (personalización, foto de referencia, anticipos, calendario,
ticket, entrega con factura), clientes con cumpleaños y fechas especiales,
reportes nuevos (más vendidos, ganancia estimada, mermas, insumos por
agotarse, cuentas por cobrar), moneda/impuesto/margen configurables, cambio
de rol de usuarios y, como extras: aviso de vencimientos, lista de compras,
hoja de producción del día y recordatorio de cumpleaños.

## Licencia

Uso privado / interno del negocio.
