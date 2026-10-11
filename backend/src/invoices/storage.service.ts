import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { UPLOADS_DIR } from '../common/paths';

/**
 * Guarda archivos (fotos de producto, logo, facturas) en disco local bajo
 * /uploads, servido estaticamente por main.ts.
 *
 * NOTA: el envio de facturas por WhatsApp (ver whatsapp.service.ts) no
 * depende de que este archivo sea accesible publicamente: send_whatsapp_
 * agent.ahk lee el PNG directo del disco local, sin pasar por una URL.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly localDir = UPLOADS_DIR;

  async upload(buffer: Buffer, key: string): Promise<string> {
    const filePath = join(this.localDir, key);
    await fs.mkdir(join(filePath, '..'), { recursive: true });
    await fs.writeFile(filePath, buffer);

    // Ruta RELATIVA, no una URL absoluta con host y puerto.
    //
    // Antes se guardaba "http://localhost:3000/uploads/...", con el puerto
    // incrustado en la base de datos. Eso rompia las fotos en cuanto el
    // backend cambiaba de puerto (justo lo que paso al pasar a la version
    // nativa, que usa el 3010): las fichas quedaban sin imagen aunque el
    // archivo siguiera ahi. La interfaz ya sabe anteponer la direccion del
    // backend a las rutas relativas (ver apiUrl() en el frontend).
    //
    // Si hay una URL publica configurada (para links que se abran fuera de la
    // PC) si se usa completa, porque ahi el host importa.
    const backendUrl = process.env.BACKEND_PUBLIC_URL?.replace(/\/$/, '');
    return backendUrl ? `${backendUrl}/uploads/${key}` : `/uploads/${key}`;
  }
}
