/**
 * Genera el instalador completo, en orden y sin pasos olvidables.
 *
 *   cd desktop
 *   npm run instalador
 *
 * Existe porque compilar a mano tiene tres trampas que producen un
 * instalador roto SIN dar ningun error:
 *
 *  1) La cache incremental de TypeScript (tsconfig.build.tsbuildinfo) cree
 *     que ya emitio los archivos, pero "nest build" borra dist/ antes de
 *     empezar. El resultado es un dist/ a medias — llego a quedar sin
 *     main.js. Por eso se borra la cache antes.
 *
 *  2) (Historico) El frontend solia guardar la direccion del backend EN EL
 *     MOMENTO DE COMPILAR (VITE_API_URL). Eso se rompia al abrir la app desde
 *     el celular: "localhost" ahi es el celular, no la PC. Ahora
 *     frontend/src/lib/api.ts la calcula en el navegador segun el host desde
 *     donde se abrio la pagina, con el puerto 3010 fijo (build de produccion,
 *     ver import.meta.env.DEV ahi) — no hace falta pasar VITE_API_URL aqui.
 *
 *  3) Si no se sube la version, electron-builder sobreescribe el instalador
 *     anterior y el actualizador automatico no ofrece el cambio, porque
 *     compara numeros de version.
 *
 *  4) "vite build" borra frontend/dist entero, asi que el APK del celular
 *     (mobile-app/compilar.js lo copia ahi para que se pueda descargar desde
 *     la app) desaparecia en cada instalador nuevo aunque nadie hubiera
 *     tocado el APK. Se vuelve a copiar aqui si ya existe uno compilado.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const BACKEND = path.join(RAIZ, 'backend');
const FRONTEND = path.join(RAIZ, 'frontend');
const APK_COMPILADO = path.join(RAIZ, 'mobile-app', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

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

/** Sube el ultimo numero: 2.0.2 -> 2.0.3 */
function siguienteVersion(actual) {
  const [mayor, menor, parche] = actual.split('.').map(Number);
  return `${mayor}.${menor}.${(parche || 0) + 1}`;
}

const nueva = process.argv[2] || siguienteVersion(versionActual());

console.log(`Compilando Cafe Shopping ${versionActual()} -> ${nueva}`);

paso('1/4  Backend');
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

paso('2/4  Interfaz');
correr('npm run build', FRONTEND);
const indice = path.join(FRONTEND, 'dist', 'index.html');
if (!fs.existsSync(indice)) {
  console.error('\nERROR: no se genero frontend/dist. Revisa los errores de arriba.');
  process.exit(1);
}
// "vite build" borra frontend/dist entero antes de generarlo de nuevo, asi
// que el APK del celular (mobile-app/compilar.js lo deja ahi para poder
// descargarlo desde la app) desaparece en cada compilada. Si ya existe un
// APK compilado, se vuelve a copiar aqui -- no hace falta recompilarlo con
// Android/Gradle cada vez, solo copiar el que ya estaba.
if (fs.existsSync(APK_COMPILADO)) {
  fs.copyFileSync(APK_COMPILADO, path.join(FRONTEND, 'dist', 'cafe-shopping.apk'));
}

paso(`3/4  Version ${nueva}`);
subirVersion(nueva);

paso('4/4  Instalador (tarda varios minutos)');
correr('npm run dist', __dirname);

const salida = path.join(__dirname, 'dist', `Cafe Shopping Setup ${nueva}.exe`);
if (fs.existsSync(salida)) {
  const mb = (fs.statSync(salida).size / 1024 / 1024).toFixed(0);
  console.log(`\nLISTO: ${salida}  (${mb} MB)`);
} else {
  console.error('\nERROR: el instalador no aparecio. Revisa los errores de arriba.');
  process.exit(1);
}
