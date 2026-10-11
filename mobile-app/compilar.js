/**
 * Compila el APK del celular y lo deja listo para descargar desde la app.
 *
 *   cd mobile-app
 *   node compilar.js
 *
 * A diferencia de desktop/compilar.js, esto NO hace falta correrlo con cada
 * cambio de la app: el APK es solo un WebView que carga la misma direccion de
 * siempre (ver MainActivity.kt) -- el contenido real lo sigue sirviendo la
 * PC. Solo hace falta recompilar si cambia el icono, el nombre, o la logica
 * de confianza del certificado en MainActivity.kt.
 *
 * Requiere Java 17 y el Android SDK ya instalados (ver mobile-app/local.properties
 * para la ruta del SDK que se uso al armar este proyecto).
 *
 * Sube la version en cada corrida (versionCode +1 siempre, versionName el
 * ultimo numero +1 salvo que se pase uno a mano: "node compilar.js 1.5").
 * Android necesita que versionCode suba siempre para aceptar instalar un APK
 * encima del anterior.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const FRONTEND_DIST = path.join(RAIZ, 'frontend', 'dist');
const APK_GENERADO = path.join(__dirname, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const APK_DESTINO = path.join(FRONTEND_DIST, 'cafe-shopping.apk');
const BUILD_GRADLE = path.join(__dirname, 'app', 'build.gradle');

function paso(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

/**
 * versionCode: el numero que Android compara para saber si un APK es "mas
 * nuevo" que el ya instalado -- tiene que subir siempre, si no, el celular
 * rechaza instalarlo encima del anterior (o no se ofrece como actualizacion).
 * versionName: el texto que ve el usuario (no lo ve en ningun lado hoy, pero
 * sirve para identificar de que build salio un APK si hay que revisar algo).
 */
function leerVersion() {
  const contenido = fs.readFileSync(BUILD_GRADLE, 'utf8');
  const code = Number(contenido.match(/versionCode (\d+)/)[1]);
  const name = contenido.match(/versionName "([^"]+)"/)[1];
  return { code, name };
}

function escribirVersion(code, name) {
  let contenido = fs.readFileSync(BUILD_GRADLE, 'utf8');
  contenido = contenido.replace(/versionCode \d+/, `versionCode ${code}`);
  contenido = contenido.replace(/versionName "[^"]+"/, `versionName "${name}"`);
  fs.writeFileSync(BUILD_GRADLE, contenido);
}

/** Sube el ultimo numero: 1.2 -> 1.3 */
function siguienteVersionName(actual) {
  const partes = actual.split('.').map(Number);
  partes[partes.length - 1] += 1;
  return partes.join('.');
}

const actual = leerVersion();
const nuevoCode = actual.code + 1;
const nuevoName = process.argv[2] || siguienteVersionName(actual.name);
escribirVersion(nuevoCode, nuevoName);
console.log(`Version ${actual.name} (${actual.code}) -> ${nuevoName} (${nuevoCode})`);

paso('1/2  Compilando el APK (modo debug, para instalar a mano)');
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
execSync(`${gradlew} assembleDebug --console=plain`, { cwd: __dirname, stdio: 'inherit' });

if (!fs.existsSync(APK_GENERADO)) {
  console.error(`\nERROR: no se genero ${APK_GENERADO}. Revisa los errores de arriba.`);
  process.exit(1);
}

paso('2/2  Copiando a frontend/dist para que se pueda descargar desde el celular');
if (!fs.existsSync(FRONTEND_DIST)) {
  console.error(
    `\nERROR: no existe ${FRONTEND_DIST}. Corre "npm run build" en frontend/ (o desktop/compilar.js) al menos una vez antes.`,
  );
  process.exit(1);
}
fs.copyFileSync(APK_GENERADO, APK_DESTINO);

const mb = (fs.statSync(APK_DESTINO).size / 1024 / 1024).toFixed(1);
console.log(`\nLISTO: ${APK_DESTINO} (${mb} MB)`);
console.log('Se descarga desde el celular entrando a https://<ip-de-la-pc>:5183/cafe-shopping.apk');
