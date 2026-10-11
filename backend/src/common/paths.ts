import { join } from 'path';

/**
 * Carpetas de datos del backend.
 *
 * En la version con Docker todo colgaba de process.cwd() (/app dentro del
 * contenedor) porque el volumen se montaba ahi. En la version nativa eso no
 * sirve: process.cwd() seria la carpeta de instalacion del programa, que el
 * instalador REEMPLAZA en cada actualizacion — las fotos de los productos y
 * las facturas se borrarian al actualizar.
 *
 * Por eso Electron pasa estas rutas por variables de entorno, apuntando a la
 * carpeta de datos del usuario (AppData), que sobrevive a las
 * actualizaciones. Si no vienen definidas (desarrollo, o el contenedor de
 * Docker) se mantiene el comportamiento anterior.
 */

export const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
export const BACKUPS_DIR = process.env.BACKUP_DIR || join(process.cwd(), 'backups');

/**
 * Segunda carpeta de respaldos: la copia que vive en OneDrive.
 *
 * Se lee ademas de la local para que los respaldos de la nube sigan
 * disponibles aunque la carpeta de datos del disco desaparezca — que es
 * justo el escenario para el que existe esa copia. La ruta la calcula la app
 * de escritorio segun el usuario de Windows (ver nativo.js); aqui solo se
 * recibe ya resuelta.
 */
export const BACKUPS_MIRROR_DIR = process.env.BACKUP_MIRROR_DIR || '';
