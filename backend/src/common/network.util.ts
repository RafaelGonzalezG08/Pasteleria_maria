import type { Request } from 'express';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * true si la peticion llego por loopback (la propia PC via localhost). No hay
 * proxy inverso en esta arquitectura -- Electron habla directo con el proceso
 * Nest hijo (ver desktop/nativo.js) -- asi que `req.ip` refleja el socket TCP
 * real y no se puede falsificar con un header.
 *
 * El backend ya escucha solo en 127.0.0.1 (ver main.ts); esto es una segunda
 * barrera para los endpoints que no llevan sesion, como la creacion del
 * primer administrador.
 */
export function esConexionLocal(req: Request): boolean {
  return LOOPBACK.has(req.ip ?? '');
}
