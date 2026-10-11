/**
 * Empaqueta el backend en un puñado de archivos en vez de miles de archivos
 * sueltos de node_modules.
 *
 * Por que: la version nativa (sin Docker) lleva el backend completo dentro
 * del instalador. Con node_modules copiado tal cual, eso son ~28,000
 * archivos individuales — en una PC con antivirus escaneando cada uno, eso
 * es lo que hace que instalar/actualizar tarde 10-30 minutos. Empaquetando
 * el codigo con webpack, esos miles de archivos quedan en un solo main.js.
 *
 * Que se deja AFUERA del paquete (a proposito, no por descuido):
 *  - @prisma/client y su cliente generado (.prisma/client): Prisma resuelve
 *    su motor nativo (el .dll/.so que ejecuta las consultas) por RUTA DE
 *    ARCHIVO real en disco. Empaquetarlo rompe esa resolucion.
 *  - sharp: tiene un binario nativo (.node) para redimensionar imagenes.
 *    Los binarios nativos no se pueden meter dentro de un bundle de webpack.
 *  - blake3-wasm: carga su archivo .wasm en tiempo de ejecucion buscandolo
 *    junto a su propio archivo (__filename) en disco, no con un require()
 *    que webpack pueda seguir. Empaquetado, ese __filename pasa a ser el del
 *    bundle (dist/main.js) y ya no encuentra el .wasm al lado.
 *  - reflect-metadata, class-transformer, class-validator: dependen de que
 *    los decoradores (@Type(), @IsNumber(), etc.) y el codigo que los lee en
 *    tiempo de ejecucion compartan EXACTAMENTE el mismo registro global de
 *    metadatos. Empaquetados, ese registro dejaba de coincidir: los
 *    formularios con archivo adjunto (multipart, ej. editar un producto con
 *    foto) llegaban como texto y @Type(() => Number) no los convertia a
 *    numero, asi que class-validator los rechazaba ("must be a number
 *    conforming to the specified constraints") aunque el valor fuera
 *    perfectamente valido. Un body JSON normal no lo sufria porque ahi los
 *    numeros ya llegan como numero, sin necesitar esa conversion - por eso
 *    parecia funcionar en casi todos lados menos justo en estos formularios.
 *
 * Todo lo demas (el resto de NestJS, passport, etc.) se empaqueta adentro de
 * dist/main.js.
 */
module.exports = function (options) {
  return {
    ...options,
    externals: [
      function ({ request }, callback) {
        if (
          request === '@prisma/client' ||
          request.startsWith('.prisma/') ||
          request.startsWith('@prisma/engines') ||
          request === 'sharp' ||
          request === 'blake3-wasm' ||
          request === 'reflect-metadata' ||
          request === 'class-transformer' ||
          request.startsWith('class-transformer/') ||
          request === 'class-validator' ||
          request.startsWith('class-validator/')
        ) {
          return callback(null, 'commonjs ' + request);
        }
        callback();
      },
    ],
    optimization: {
      ...options.optimization,
      minimize: false,
    },
    // Algunas dependencias opcionales de NestJS (microservicios, websockets,
    // cache-manager, etc.) hacen require() de paquetes que este proyecto
    // nunca instala porque no los usa; NestJS los espera con try/catch en
    // tiempo de ejecucion. Sin ignorarlos aqui, webpack para el build entero
    // al no poder resolverlos en disco durante el empaquetado.
    ignoreWarnings: [/Critical dependency: the request of a dependency is an expression/],
  };
};
