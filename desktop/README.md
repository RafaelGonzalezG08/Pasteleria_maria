# Pastelería María - App de escritorio

Empaqueta todo el proyecto (backend, interfaz y agente de WhatsApp) en una sola
app de Windows con icono propio. Al abrirla:

1. Busca actualizaciones en los releases de
   [RafaelGonzalezG08/Pasteleria_maria](https://github.com/RafaelGonzalezG08/Pasteleria_maria/releases).
2. Arranca el backend (NestJS + SQLite) como proceso hijo con el Node que ya
   trae Electron (no hace falta instalar Node en la PC del negocio).
3. Sirve la interfaz en `http://localhost` y la muestra en una ventana nativa.
4. Arranca el agente de WhatsApp (`send_whatsapp_agent.exe` o `.ahk`).

No usa Docker ni base de datos externa. Los datos viven en
`%APPDATA%\Pasteleria Maria\datos\` y sobreviven a las actualizaciones.

## Archivos

| Archivo | Para qué |
|---|---|
| `main.js` | Ventanas, splash, actualizador automático (electron-updater), arranque del agente. |
| `nativo.js` | Backend hijo (con reinicio si se cae), servidor de la interfaz, render de facturas, carpeta de datos, secreto JWT. |
| `compilar.js` | Genera el instalador en orden (backend → interfaz → agente → versión → electron-builder). |
| `splash.html` | Pantalla de carga. |
| `build/icon.png` | Icono de la app y del instalador (512×512). |
| `dev-app-update.yml` | Repositorio de actualizaciones al probar sin empaquetar. |

## Probar sin compilar

```powershell
cd desktop
npm install
npm start
```

Antes compila backend (`npm run build:desktop` en `backend/`) e interfaz
(`npm run build` en `frontend/`). Ojo: usa la carpeta de datos real; para una
aparte define `PASTELERIA_MARIA_TEST_DATA_DIR`.

## Generar el instalador

```powershell
cd desktop
npm install
npm run instalador        # sube el ultimo numero de version
node compilar.js 1.2.0    # o una version exacta
```

Sale en `desktop/dist/Pasteleria-Maria-Setup-<version>.exe`.

Para **publicar** una actualización no hace falta esto: basta empujar un tag
`vX.Y.Z` y GitHub Actions compila y crea el release (ver el README principal,
"Publicar una nueva versión").

## Agente de WhatsApp

`send_whatsapp_agent.ahk` (AutoHotkey v1.1) vigila la cola de facturas y las
pega en WhatsApp Desktop. Se compila a `.exe` en GitHub Actions (y en
`compilar.js` si la PC tiene AutoHotkey) para que la PC del negocio no necesite
AutoHotkey. El `.exe` no se guarda en el repositorio.

## Icono

Reemplaza `build/icon.png` (cuadrada, 512×512, idealmente fondo transparente) y
vuelve a compilar. El icono de la pestaña de desarrollo es
`frontend/public/icon.svg`.
