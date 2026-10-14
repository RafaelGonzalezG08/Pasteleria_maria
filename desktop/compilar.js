/**
 * Genera el instalador completo, en orden y sin pasos olvidables.
 *
 *   cd desktop
 *   npm run instalador            (sube el ultimo numero: 1.0.3 -> 1.0.4)
 *   node compilar.js 1.2.0        (o una version exacta)
 *
 * Para PUBLICAR una actualizacion no hace falta correr esto: basta con
 * empujar un tag vX.Y.Z y GitHub Actions compila y publica (ver README >
 * "Publicar una nueva version"). Esto es para generar el instalador en esta PC.
 *
 * Existe porque compilar a mano tiene trampas que producen un instalador
 * roto SIN dar ningun error:
 *
 *  1) La cache incremental de TypeScript (tsconfig.build.tsbuildinfo) cree
 *     que ya emitio los archivos, pero "nest build" borra dist/ antes de
 *     empezar. El resultado es un dist/ a medias. Por eso se borra la cache.
 *
 *  2) Si no se sube la version, electron-builder sobreescribe el instalador
 *     anterior y el actualizador automatico no ofrece el cambio, porque
 *     compara numeros de version.
 *
 *  3) El agente de WhatsApp tiene que ir compilado a .exe (si no, la PC del
 *     negocio necesitaria AutoHotkey instalado). Si en esta PC hay
 *     AutoHotkey v1.1 con su compilador, se compila aqui; si no, se avisa.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const BACKEND = path.join(RAIZ, 'backend');
const FRONTEND = path.join(RAIZ, 'frontend');

function paso(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

function correr(comando, cwd, env = {}) {
  execSync(comando, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}

function versionActual() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;
}

function subirVersion(nueva) {
  const ruta = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  pkg.version = nueva;
  fs.writeFileSync(ruta, JSON.stringify(pkg, null, 2) + '\n');
  return nueva;
}

/** Sube el ultimo numero: 1.0.2 -> 1.0.3 */
function siguienteVersion(actual) {
  const [mayor, menor, parche] = actual.split('.').map(Number);
  return `${mayor}.${menor}.${(parche || 0) + 1}`;
}

/** Compilador de AutoHotkey v1.1 si esta instalado en esta PC, o null. */
function buscarAhk2Exe() {
  const bases = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')];
  for (const base of bases.filter(Boolean)) {
    const compilador = path.join(base, 'AutoHotkey', 'Compiler', 'Ahk2Exe.exe');
    const bin = path.join(base, 'AutoHotkey', 'Compiler', 'Unicode 64-bit.bin');
    if (fs.existsSync(compilador) && fs.existsSync(bin)) return { compilador, bin };
  }
  return null;
}

const nueva = process.argv[2] || siguienteVersion(versionActual());

console.log(`Compilando Rosa Delicias ${versionActual()} -> ${nueva}`);

paso('1/5  Backend');
fs.rmSync(path.join(BACKEND, 'tsconfig.build.tsbuildinfo'), { force: true });
// "build:desktop" empaqueta con webpack en vez de dejar node_modules suelto:
// ~28,000 archivos individuales copiados al instalar es lo que hacia que la
// instalacion/actualizacion tardara 10-30 minutos en una PC modesta. Con el
// backend adentro de un solo dist/main.js, solo quedan sueltos los paquetes
// con binarios nativos (Prisma, sharp) que no se pueden empaquetar.
correr('npm run build:desktop', BACKEND);
if (!fs.existsSync(path.join(BACKEND, 'dist', 'main.js'))) {
  console.error('\nERROR: no se genero backend/dist/main.js. Revisa los errores de arriba.');
  process.exit(1);
}

paso('2/5  Interfaz');
correr('npm run build', FRONTEND);
if (!fs.existsSync(path.join(FRONTEND, 'dist', 'index.html'))) {
  console.error('\nERROR: no se genero frontend/dist. Revisa los errores de arriba.');
  process.exit(1);
}

paso('3/5  Agente de WhatsApp');
const ahk = buscarAhk2Exe();
if (ahk) {
  correr(
    `"${ahk.compilador}" /in "${path.join(RAIZ, 'send_whatsapp_agent.ahk')}" /out "${path.join(RAIZ, 'send_whatsapp_agent.exe')}" /bin "${ahk.bin}"`,
    RAIZ,
  );
} else if (fs.existsSync(path.join(RAIZ, 'send_whatsapp_agent.exe'))) {
  console.log('AutoHotkey no esta instalado: se usa el send_whatsapp_agent.exe que ya existe.');
} else {
  console.warn(
    'AVISO: no hay AutoHotkey v1.1 en esta PC ni un send_whatsapp_agent.exe compilado. El instalador ' +
      'llevara solo el .ahk y la PC del negocio necesitara AutoHotkey para enviar por WhatsApp. ' +
      'Los instaladores que publica GitHub Actions si llevan el .exe.',
  );
}

paso(`4/5  Version ${nueva}`);
subirVersion(nueva);

paso('5/5  Instalador (tarda varios minutos)');
correr('npm run dist', __dirname);

const salida = path.join(__dirname, 'dist', `rosa-delicias-v${nueva}.exe`);
if (fs.existsSync(salida)) {
  const mb = (fs.statSync(salida).size / 1024 / 1024).toFixed(0);
  console.log(`\nLISTO: ${salida}  (${mb} MB)`);
} else {
  console.error('\nERROR: el instalador no aparecio. Revisa los errores de arriba.');
  process.exit(1);
}
