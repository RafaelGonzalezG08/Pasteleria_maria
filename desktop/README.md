# Cafe Shopping — app de escritorio

Empaqueta el backend + el frontend + el agente de WhatsApp en una sola app de
Windows instalable, con icono propio. Al abrirla: levanta el backend como
proceso hijo, sirve la interfaz, prende el agente de WhatsApp y muestra todo en
una ventana nativa. **No necesita Docker.**

- `main.js` — ciclo de vida de Electron: arranque, ventana, splash, actualizador,
  copia de respaldos a OneDrive, agente de WhatsApp.
- `nativo.js` — arranque "sin Docker": levanta el backend hijo, sirve el frontend
  compilado y renderiza las facturas en una BrowserWindow oculta.
- `compilar.js` — genera el instalador completo en orden (ver abajo).

## Compilar el instalador

Requiere **Windows** (electron-builder genera un instalador de Windows) y
**Node.js 20+**.

```powershell
cd desktop
npm install
node compilar.js 2.0.24
```

El número es la versión nueva — **súbelo en cada release** (electron-updater
compara versiones para ofrecer la actualización). `compilar.js`:

1. Compila el backend con webpack (`npm run build:desktop` → un solo `dist/main.js`).
2. Compila el frontend con `VITE_API_URL=http://localhost:3010/api`.
3. Escribe la versión en `desktop/package.json`.
4. Corre `electron-builder`.

Resultado: `desktop/dist/Cafe Shopping Setup 2.0.24.exe`.

> La primera vez, electron-builder descarga Electron (~110 MB) y `winCodeSign`.
> Ese último trae symlinks de macOS que Windows sólo deja crear con **Modo de
> desarrollador** activado (`ms-settings:developers`) o en una terminal de
> administrador. Si el build falla en "winCodeSign", esa es la causa.

## Probar sin compilar el instalador

```powershell
cd desktop
npm install
npm start
```

> Usa la base de datos real de la app instalada
> (`%APPDATA%\cafe-shopping-desktop\datos\`). Para una base aparte:
> `set CAFE_SHOPPING_TEST_DATA_DIR=C:\ruta\temporal` antes de `npm start`.

## Requisitos para *usar* la app instalada

- **WhatsApp Desktop** instalado y con sesión iniciada (para el envío de facturas).
- Si el agente se empaquetó como `.ahk` en vez de `.exe`: **AutoHotkey v1.1**.
  Si `send_whatsapp_agent.exe` existe en la raíz del repo al compilar, se empaqueta
  ese y no hace falta AutoHotkey en la PC del negocio.

## Icono

`build/icon.png` (PNG cuadrado, idealmente 512×512, fondo transparente).
electron-builder genera el `.ico` de Windows a partir de ese archivo.

## Publicar releases automáticamente

`.github/workflows/build.yml` compila y sube el instalador al empujar un tag:

```bash
git tag v2.0.24
git push --tags
```
