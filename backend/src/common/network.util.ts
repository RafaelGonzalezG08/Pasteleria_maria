import type { Request } from 'express';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * true si la peticion llego por loopback (la propia PC via localhost), no
 * por la red local. No hay proxy inverso en esta arquitectura -- Electron
 * habla directo con el proceso Nest hijo (ver desktop/nativo.js) y el celular
 * entra por la IP de LAN -- asi que `req.ip` refleja el socket TCP real y no
 * se puede falsificar con un header.
 *
 * Sirve para decidir, por ejemplo, si "Enviar por WhatsApp" debe encolarse
 * para el agente de AutoHotkey (que pega el mensaje en el WhatsApp Desktop DE
 * LA PC) o si quien pidio el envio esta en su propio celular y por lo tanto
 * tiene que mandarlo el mismo desde ahi.
 */
export function esConexionLocal(req: Request): boolean {
  return LOOPBACK.has(req.ip ?? '');
}
