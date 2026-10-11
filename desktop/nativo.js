// nativo.js — arranque sin Docker.
//
// Reemplaza todo lo que antes hacia "docker compose up": levanta el backend
// como proceso hijo y sirve el frontend compilado desde disco. No hace falta
// Docker Desktop, ni Postgres, ni nginx, ni contenedores.
//
// Por que un proceso hijo y no cargar NestJS dentro de Electron: el backend
// tiene su propio ciclo de vida (cron de respaldos, conexiones a la base) y
// aislarlo evita que un fallo suyo tumbe la ventana. Ademas se reinicia solo
// si se cae, sin arrastrar la interfaz.
//
// El backend corre con el Node que YA trae Electron (ELECTRON_RUN_AS_NODE), asi
// que no hay que instalar Node en la PC del cliente.

const { app } = require('electron');
const { fork } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const selfsigned = require('selfsigned');

// Puertos propios, distintos a los de la version con Docker (3000/5173): asi
// las dos pueden convivir en la misma PC mientras se prueba la migracion, sin
// que una le robe el puerto a la otra. El frontend se compila apuntando a
// BACKEND_PORT (ver VITE_API_URL en el build).
const BACKEND_PORT = 3010;
const FRONTEND_PORT = 5183;
const MAX_WAIT_BACKEND_MS = 60000;

let backendProcess = null;
let frontendServer = null;
let frontendServerHttps = null;

// Estado del reinicio automatico del backend.
let cerrando = false; // true cuando stopAll() esta cerrando todo a proposito
let backendEnv = null; // el env ya calculado, para relanzar sin recalcularlo
let backendEntrada = null;
let backendCwd = null;
let backendOnLog = null;
let reinicios = []; // marcas de tiempo de los ultimos relanzamientos
const MAX_REINICIOS = 5; // si se cae mas de esto...
const VENTANA_REINICIOS_MS = 60000; // ...en este lapso, se deja de intentar

/**
 * Carpeta de datos del usuario (AppData). Todo lo que el negocio NO puede
 * perder vive aqui, nunca dentro de la carpeta del programa: el instalador
 * reemplaza esa carpeta en cada actualizacion, y con ella se irian la base de
 * datos, las fotos de los productos y las facturas.
 *
 * OJO: no hay ningun app.setName() en este proyecto, asi que Electron usa
 * SIEMPRE el mismo nombre de carpeta (el "name" de package.json,
 * "cafe-shopping-desktop") sin importar si corres en desarrollo, un build
 * sin instalar (win-unpacked) o la app ya instalada de verdad. Las tres
 * apuntan al mismo lugar. Probar la app empaquetada (fuera de golpear la API
 * contra backend/dev.db, que es un archivo aparte y siempre seguro) sin
 * CAFE_SHOPPING_TEST_DATA_DIR pisa datos reales del negocio.
 */
function dataDir() {
  // Solo se activa si ALGUIEN lo pone a mano para probar; el negocio nunca
  // tiene esta variable definida, asi que su carpeta real nunca cambia.
  const base = process.env.CAFE_SHOPPING_TEST_DATA_DIR || app.getPath('userData');
  const dir = path.join(base, 'datos');
  fs.mkdirSync(dir, { recursive: true });
  publicarRutaParaElAgente(dir);
  return dir;
}

/**
 * Deja escrita la ruta de datos donde el agente de WhatsApp pueda leerla.
 *
 * Hace falta porque el nombre de la carpeta cambia segun como corra la app:
 * en desarrollo es "cafe-shopping-desktop" (el `name` del package.json) y ya
 * instalada es "Cafe Shopping" (el `productName`). El agente es un script
 * aparte que no puede preguntarle nada a Electron, y con la ruta escrita a
 * mano habria buscado las facturas en una carpeta inexistente en la PC del
 * cliente — sin enviar nada y sin un error claro.
 */
function publicarRutaParaElAgente(dir) {
  try {
    const carpetaAgente = 'C:\\temp\\whatsapp_send';
    fs.mkdirSync(carpetaAgente, { recursive: true });
    fs.writeFileSync(path.join(carpetaAgente, 'ruta-datos.txt'), dir, 'utf8');
  } catch {
    // Si no se puede escribir, el agente cae a buscar por los nombres
    // conocidos (ver send_whatsapp_agent.ahk).
  }
}

/**
 * Carpeta de respaldos dentro del OneDrive del usuario que tiene la sesion
 * abierta en Windows, o null si no usa OneDrive.
 *
 * Se resuelve con las variables que define el propio Windows, nunca con una
 * ruta escrita a mano: el programa lo usan clientes distintos, cada uno con
 * su nombre de usuario.
 */
function resolveOneDriveBackupDirNativo() {
  const candidatos = [
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    process.env.OneDriveConsumer,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'OneDrive') : null,
  ].filter(Boolean);

  const raiz = candidatos.find((dir) => {
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
  if (!raiz) return null;

  const destino = path.join(raiz, 'CafeShopping', 'Respaldos');
  try {
    fs.mkdirSync(destino, { recursive: true });
    return destino;
  } catch {
    return null;
  }
}

/** Raiz del proyecto empaquetado (backend/, frontend/dist, prisma/...). */
function projectDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'app-project') : path.join(__dirname, '..');
}

// Adaptadores que NO son la red real de la casa/negocio: Hyper-V (el "Default
// Switch" que trae Windows activado por WSL/Docker Desktop aunque el usuario
// nunca lo haya pedido), VMs de VirtualBox/VMware, VPNs, loopback de captura.
// Windows los suele reportar CON una IP en el mismo rango privado
// (172.16-31.x.x o hasta 192.168.x.x) que el Wi-Fi real, y el orden en que
// os.networkInterfaces() los entrega no es fiable -- en al menos un caso real
// el adaptador de Hyper-V salio primero y el celular nunca pudo conectarse
// porque esa IP no existe fuera de la PC. Se descartan por nombre antes de
// mirar la IP.
const NOMBRE_ADAPTADOR_VIRTUAL = /virtual|vEthernet|Hyper-V|VMware|VirtualBox|Npcap|TAP-|Tailscale|ZeroTier|WSL/i;

/**
 * IP de esta PC en la red local (para usar la app desde el celular en la
 * misma WiFi). Junta todas las IPv4 no internas en un rango privado comun,
 * descarta las de adaptadores virtuales conocidos y, si quedan varias,
 * prefiere la que se vea como Wi-Fi/Ethernet real por nombre. Sin red (o sin
 * nada que calce), null: la app sigue funcionando solo en esta PC, como hasta
 * ahora.
 */
function obtenerIpLan() {
  const interfaces = os.networkInterfaces();
  const candidatas = [];
  for (const nombre of Object.keys(interfaces)) {
    if (NOMBRE_ADAPTADOR_VIRTUAL.test(nombre)) continue;
    for (const iface of interfaces[nombre] || []) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(iface.address)
      ) {
        candidatas.push({ nombre, address: iface.address });
      }
    }
  }
  if (candidatas.length === 0) return null;
  const preferida = candidatas.find((c) => /wi-?fi|wlan|ethernet/i.test(c.nombre));
  return (preferida || candidatas[0]).address;
}

function puertoAbierto(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------

async function startBackend(onLog) {
  const proyecto = projectDir();
  const datos = dataDir();
  const entrada = path.join(proyecto, 'backend', 'dist', 'main.js');

  // El puerto del backend no se puede cambiar sobre la marcha: el frontend se
  // compila apuntando a el. Si esta ocupado, casi siempre es porque quedo una
  // copia anterior a medio cerrar, asi que se explica en esos terminos en vez
  // de mostrar "EADDRINUSE".
  if (await puertoAbierto(BACKEND_PORT)) {
    throw new Error(
      'Parece que Cafe Shopping ya esta abierto (o quedo a medio cerrar).\n\n' +
        'Cierra la ventana que este abierta y vuelve a intentar. Si no ves ninguna, ' +
        'reinicia la computadora y abre la aplicacion de nuevo.',
    );
  }

  if (!fs.existsSync(entrada)) {
    throw new Error(
      `No se encontro el backend compilado en:\n${entrada}\n\nFalta ejecutar "npm run build" en backend/ antes de empaquetar.`,
    );
  }

  const uploads = path.join(datos, 'uploads');
  fs.mkdirSync(uploads, { recursive: true });

  const ipLan = obtenerIpLan();
  // El certificado solo hace falta si hay red -- sin el, esta PC sigue
  // funcionando sola en HTTP como siempre. obtenerCertificadoTls ya deja los
  // archivos en disco (tls-cert.pem/tls-key.pem dentro de "datos").
  if (ipLan) await obtenerCertificadoTls(datos, ipLan);

  backendEnv = {
    ...process.env,
    // ELECTRON_RUN_AS_NODE hace que el proceso hijo se comporte como Node puro
    // (sin ventana ni APIs de Electron), reutilizando el Node que Electron ya
    // incluye. Asi el cliente no necesita instalar Node.
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(BACKEND_PORT),
    // La base es un unico archivo dentro de los datos del usuario.
    DATABASE_URL: `file:${path.join(datos, 'cafe-shopping.db').replace(/\\/g, '/')}`,
    UPLOADS_DIR: uploads,
    BACKUP_DIR: path.join(datos, 'backups'),
    // Segunda carpeta de respaldos: la copia en OneDrive. El backend la lee
    // ademas de la local, para que si el disco se pierde (o alguien borra la
    // carpeta de datos) los respaldos de la nube SIGAN APARECIENDO en la
    // pantalla de Configuracion y se puedan restaurar. Sin esto, la copia en
    // la nube existia pero la aplicacion no sabia verla.
    //
    // La ruta se resuelve por usuario (variables OneDrive/OneDriveCommercial
    // que define Windows), nunca escrita a mano: cada cliente tiene su propio
    // nombre de usuario.
    BACKUP_MIRROR_DIR: resolveOneDriveBackupDirNativo() || '',
    PRISMA_MIGRATIONS_DIR: path.join(proyecto, 'backend', 'prisma', 'migrations'),
    // Se suma la IP de la red local (si hay) para que el CORS del backend
    // tambien acepte al celular abriendo la app por esa IP -- sin esto, la
    // pagina cargaria pero cada llamada a la API se rechazaria por origen
    // distinto. main.ts ya separa esta lista por comas. La PC sigue por
    // "http://localhost" (Chrome ya lo trata como origen seguro sin HTTPS);
    // el celular entra por HTTPS con el certificado autofirmado.
    FRONTEND_URL: [`http://localhost:${FRONTEND_PORT}`, ipLan && `https://${ipLan}:${FRONTEND_PORT}`]
      .filter(Boolean)
      .join(','),
    // Para mostrarla en Configuracion y que el dueño no tenga que correr
    // "ipconfig" para saber que direccion abrir en el celular.
    LAN_URL: ipLan ? `https://${ipLan}:${FRONTEND_PORT}` : '',
    // Para que el backend sepa en que direccion escuchar el HTTPS y arme la
    // URL de descarga del certificado (ver /tls-cert.pem en main.ts).
    LAN_IP: ipLan || '',
    TLS_CERT_PATH: ipLan ? path.join(datos, 'tls-cert.pem') : '',
    TLS_KEY_PATH: ipLan ? path.join(datos, 'tls-key.pem') : '',
    JWT_SECRET: obtenerJwtSecret(datos),
  };
  backendEntrada = entrada;
  backendCwd = path.join(proyecto, 'backend');
  backendOnLog = onLog;
  cerrando = false;
  reinicios = [];

  return lanzarBackend();
}

/**
 * Lanza (o relanza) el proceso hijo del backend con el env ya calculado en
 * startBackend().
 *
 * Antes esto no existia: si el backend se caia (un bug, se quedo sin memoria,
 * lo mato el antivirus...), `exit` solo dejaba `backendProcess = null` y la app
 * quedaba muerta con la ventana abierta pero sin responder — habia que
 * cerrarla y abrirla a mano. Ahora se relanza solo. Si se cae MAX_REINICIOS
 * veces en VENTANA_REINICIOS_MS, se para de intentar (algo esta roto de
 * verdad) y se avisa.
 */
function lanzarBackend() {
  backendProcess = fork(backendEntrada, [], {
    env: backendEnv,
    cwd: backendCwd,
    silent: true,
    windowsHide: true,
    // Techo al heap de V8 (era ilimitado, es decir hasta ~1.5GB por defecto
    // en 64 bits): sin esto, el backend compite por RAM con Chromium (la
    // ventana principal + WhatsApp Desktop, que tambien es Electron) en una
    // PC con poca memoria, y todo se pone lento a la vez. 512 MB sobra de
    // sobra para lo que hace este backend (un negocio con cientos de
    // productos/ventas, no miles); si algun dia hiciera falta mas, subir
    // este numero.
    execArgv: ['--max-old-space-size=512'],
  });

  backendProcess.stdout?.on('data', (d) => backendOnLog?.(String(d).trimEnd()));
  backendProcess.stderr?.on('data', (d) => backendOnLog?.(String(d).trimEnd()));

  // El backend pide por aqui que se rendericen las facturas (ver
  // RenderService). Se responde con el PNG/PDF ya generado.
  backendProcess.on('message', (mensaje) => {
    if (mensaje?.tipo === 'render') renderizarParaBackend(mensaje, backendOnLog);
  });

  backendProcess.on('exit', (code) => {
    backendProcess = null;
    if (cerrando) return; // cierre a proposito: no relanzar

    backendOnLog?.(`El backend termino inesperadamente (codigo ${code}). Reiniciandolo...`);

    const ahora = Date.now();
    reinicios = reinicios.filter((t) => ahora - t < VENTANA_REINICIOS_MS);
    reinicios.push(ahora);

    if (reinicios.length > MAX_REINICIOS) {
      backendOnLog?.(
        `El backend se cayo ${reinicios.length} veces en menos de un minuto. Se deja de reintentar.`,
      );
      const { dialog } = require('electron');
      dialog.showErrorBox(
        'Cafe Shopping',
        'El servicio interno se esta cerrando solo una y otra vez.\n\n' +
          'Cierra la aplicacion y vuelve a abrirla. Si sigue igual, reinicia la ' +
          'computadora; si aun asi pasa, avisa para revisar el registro de errores.',
      );
      return;
    }

    // Pequeña espera para no entrar en un bucle cerrado si el fallo es al
    // arrancar (puerto ocupado unos ms, base bloqueada, etc.).
    setTimeout(() => {
      if (!cerrando && !backendProcess) lanzarBackend();
    }, 1500);
  });

  return backendProcess;
}

/**
 * Genera el PNG o PDF de una factura usando el Chromium de Electron.
 *
 * Esto sustituye a Puppeteer: la app YA es Chromium, asi que abrir un segundo
 * navegador solo para capturar una imagen sobraba. Ademas Puppeteer descarga
 * su propio Chromium al instalar dependencias — algo que en la PC de un
 * cliente no ocurre nunca, y la factura no se habria podido generar.
 *
 * La ventana va oculta (show: false) y se destruye siempre, incluso si el
 * render falla: si quedara viva, cada factura dejaria una ventana invisible
 * consumiendo memoria.
 */
async function renderizarParaBackend(mensaje, onLog) {
  const { BrowserWindow } = require('electron');
  const { id, formato, html, width, scale } = mensaje;
  let ventana = null;

  try {
    // Se renderiza a "factor" aumentos REALES (zoom del motor), no capturando
    // a 1x y estirando la imagen despues: estirar un PNG solo lo hace mas
    // grande y borroso. Con el zoom, el texto y las lineas se dibujan a esa
    // resolucion y la factura se ve nitida al ampliarla en WhatsApp.
    const factor = Math.max(1, Math.round(scale || 3));
    const anchoBase = Math.round(width || 420);

    ventana = new BrowserWindow({
      show: false,
      width: anchoBase * factor,
      height: 1400,
      // JavaScript habilitado porque se necesita para medir el alto real del
      // ticket antes de capturar. El HTML lo genera el propio backend a partir
      // de su plantilla, con los valores escapados (ver invoice.template.ts),
      // asi que no se esta ejecutando codigo de terceros.
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        zoomFactor: factor,
      },
    });

    await ventana.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // El zoomFactor de webPreferences no siempre pega en la primera carga:
    // se re-aplica aqui por seguridad.
    ventana.webContents.setZoomFactor(factor);
    // Espera a que las fuentes esten listas antes de medir/capturar, en vez de
    // un tiempo fijo a ojo: en una PC lenta 300 ms podian no alcanzar (texto
    // con la fuente de reemplazo en la imagen), y en una rapida sobraban.
    await ventana.webContents
      .executeJavaScript('document.fonts.ready.then(() => true)')
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 80));

    let datos;
    if (formato === 'pdf') {
      datos = await ventana.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    } else {
      // getBoundingClientRect() devuelve px de layout (CSS), sin el zoom: se
      // mide el alto "logico" del ticket y se multiplica por el factor para
      // dar a la ventana el tamano fisico que ocupa ya ampliado.
      const altoLogico = await ventana.webContents.executeJavaScript(
        `Math.ceil((document.querySelector('.ticket') || document.body).getBoundingClientRect().height)`,
      );
      ventana.setContentSize(anchoBase * factor, Math.max(1, Math.round(altoLogico * factor)));
      await new Promise((r) => setTimeout(r, 140));

      // capturePage ya entrega la imagen a "factor" aumentos, nitida. No se
      // reescala (eso solo la volveria borrosa).
      const imagen = await ventana.webContents.capturePage();
      datos = imagen.toPNG();
    }

    backendProcess?.send({ tipo: 'render-resultado', id, datosBase64: datos.toString('base64') });
  } catch (error) {
    onLog?.(`Fallo el render de la factura: ${error}`);
    backendProcess?.send({ tipo: 'render-resultado', id, error: String(error?.message || error) });
  } finally {
    if (ventana && !ventana.isDestroyed()) ventana.destroy();
  }
}

/**
 * Secreto para firmar las sesiones. Se genera una vez por instalacion y se
 * guarda junto a los datos.
 *
 * No se deja uno fijo en el codigo a proposito: seria el mismo en todas las
 * instalaciones, y cualquiera con una copia del programa podria fabricar un
 * token valido para entrar como administrador en otro negocio.
 */
function obtenerJwtSecret(datos) {
  const archivo = path.join(datos, '.jwt-secret');
  try {
    if (fs.existsSync(archivo)) return fs.readFileSync(archivo, 'utf8').trim();
  } catch {
    // Si no se puede leer, se genera uno nuevo (solo cierra las sesiones abiertas).
  }
  const secreto = require('crypto').randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(archivo, secreto, { mode: 0o600 });
  } catch {
    // Aunque no se pueda guardar, el secreto sirve para esta sesion.
  }
  return secreto;
}

/**
 * Certificado autofirmado para servir por HTTPS a quien entra por la IP de la
 * red local (el celular). No hace falta para la PC: Electron sigue cargando
 * "http://localhost", que Chrome ya trata como origen seguro sin HTTPS -- por
 * eso este certificado nunca lo ve el propio Electron, solo el celular.
 *
 * Se cachea junto a los demas datos (mismo patron que obtenerJwtSecret) para
 * no generar uno nuevo en cada arranque. Se regenera si cambia la IP de la
 * red (el certificado anterior no serviria para la IP nueva) o si faltan los
 * archivos.
 */
async function obtenerCertificadoTls(datos, ipLan) {
  const archivoCert = path.join(datos, 'tls-cert.pem');
  const archivoKey = path.join(datos, 'tls-key.pem');
  const archivoMeta = path.join(datos, 'tls-meta.json');

  try {
    if (fs.existsSync(archivoCert) && fs.existsSync(archivoKey) && fs.existsSync(archivoMeta)) {
      const meta = JSON.parse(fs.readFileSync(archivoMeta, 'utf8'));
      if (meta.ip === (ipLan || null)) {
        return { cert: fs.readFileSync(archivoCert, 'utf8'), key: fs.readFileSync(archivoKey, 'utf8') };
      }
    }
  } catch {
    // Cache corrupto o ilegible: se regenera abajo.
  }

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ];
  if (ipLan) altNames.push({ type: 7, ip: ipLan });

  const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    days: 3650,
    algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }],
  });

  try {
    fs.writeFileSync(archivoCert, pems.cert, { mode: 0o600 });
    fs.writeFileSync(archivoKey, pems.private, { mode: 0o600 });
    fs.writeFileSync(archivoMeta, JSON.stringify({ ip: ipLan || null }), { mode: 0o600 });
  } catch {
    // Aunque no se pueda guardar, el certificado sirve para esta sesion.
  }

  return { cert: pems.cert, key: pems.private };
}

async function waitForBackend(onStatus) {
  let transcurrido = 0;
  while (transcurrido < MAX_WAIT_BACKEND_MS) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(
          { host: '127.0.0.1', port: BACKEND_PORT, path: '/api/health', timeout: 1500 },
          (res) => {
            res.resume();
            resolve(res.statusCode === 200);
          },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
    } catch {
      // sigue esperando
    }
    onStatus?.(`Preparando la base de datos... (${Math.round(transcurrido / 1000)}s)`);
    await sleep(500);
    transcurrido += 500;
  }
  return false;
}

// ---------------------------------------------------------------------
// Frontend
// ---------------------------------------------------------------------

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Sirve el frontend compilado en dos direcciones a la vez:
 *  - HTTP en 127.0.0.1, solo para esta PC (lo que carga la ventana de
 *    Electron). Chrome ya trata "localhost" como origen seguro sin HTTPS,
 *    asi que Electron nunca necesita saber nada de certificados.
 *  - HTTPS en la IP de la red local (si hay), para el celular: Chrome solo
 *    ofrece "Instalar aplicacion" (sin la barra del navegador) en un origen
 *    seguro de verdad, y una IP en HTTP plano no cuenta como tal.
 *
 * Se usa un servidor HTTP diminuto en vez de cargar los archivos con file://
 * porque la app es una SPA con rutas (/pos, /pedidos, ...): con file:// esas
 * rutas no resuelven, y ademas el navegador trataria cada archivo como origen
 * distinto, rompiendo las llamadas a la API. Con http://localhost todo se
 * comporta igual que en la version con nginx.
 */
async function startFrontend() {
  const raiz = path.join(projectDir(), 'frontend', 'dist');
  if (!fs.existsSync(path.join(raiz, 'index.html'))) {
    throw new Error(
      `No se encontro el frontend compilado en:\n${raiz}\n\nFalta ejecutar "npm run build" en frontend/ antes de empaquetar.`,
    );
  }

  const manejador = (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let archivo = path.join(raiz, url);

    // Cualquier ruta que no sea un archivo real cae en index.html, que es lo
    // que hace que funcionen las rutas de la SPA al recargar.
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      archivo = path.join(raiz, 'index.html');
    }

    // Defensa contra rutas tipo "../../": nunca salir de la carpeta del build.
    if (!path.resolve(archivo).startsWith(path.resolve(raiz))) {
      res.writeHead(403).end('Prohibido');
      return;
    }

    const ext = path.extname(archivo).toLowerCase();
    res.setHeader('Content-Type', TIPOS[ext] || 'application/octet-stream');
    // index.html sin cache: si el navegador se queda con una copia vieja, la
    // app sigue mostrando la version anterior tras actualizar (ya paso).
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000');
    fs.createReadStream(archivo).pipe(res);
  };

  const ipLan = obtenerIpLan();
  const tls = ipLan ? await obtenerCertificadoTls(dataDir(), ipLan) : null;

  // Si el puerto esta ocupado se prueba el siguiente, en vez de reventar con
  // "EADDRINUSE" — un error tecnico que al usuario no le dice nada. La
  // interfaz puede vivir en cualquier puerto porque la ventana carga la URL
  // que devolvemos aqui; el del backend NO (viene fijo en la compilacion del
  // frontend), por eso alli si se avisa con un mensaje claro.
  //
  // Se crea un servidor nuevo en cada intento (en vez de reintentar sobre el
  // mismo objeto ya cerrado): un http.Server cerrado puede tardar un instante
  // en soltar el puerto, y no hay necesidad de arriesgarse a esa carrera.
  const escuchar = (servidor, puerto, host) =>
    new Promise((resolve, reject) => {
      const alFallar = (error) => {
        servidor.removeListener('error', alFallar);
        reject(error);
      };
      servidor.once('error', alFallar);
      servidor.listen(puerto, host, () => {
        servidor.removeListener('error', alFallar);
        resolve();
      });
    });

  const intentar = async (puerto, quedan) => {
    const servidorHttp = http.createServer(manejador);
    const servidorHttps = tls ? https.createServer({ key: tls.key, cert: tls.cert }, manejador) : null;
    try {
      await escuchar(servidorHttp, puerto, '127.0.0.1');
      if (servidorHttps) await escuchar(servidorHttps, puerto, ipLan);
      frontendServer = servidorHttp;
      frontendServerHttps = servidorHttps;
      return `http://localhost:${puerto}`;
    } catch (error) {
      servidorHttp.close();
      if (servidorHttps) servidorHttps.close();
      if (error.code === 'EADDRINUSE' && quedan > 0) return intentar(puerto + 1, quedan - 1);
      throw error;
    }
  };

  return intentar(FRONTEND_PORT, 10);
}

// ---------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------

function stopAll() {
  cerrando = true; // que el handler de 'exit' NO relance el backend
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (frontendServer) {
    frontendServer.close();
    frontendServer = null;
  }
  if (frontendServerHttps) {
    frontendServerHttps.close();
    frontendServerHttps = null;
  }
}

module.exports = {
  BACKEND_PORT,
  FRONTEND_PORT,
  dataDir,
  projectDir,
  startBackend,
  waitForBackend,
  startFrontend,
  stopAll,
  puertoAbierto,
};
