import { JwtService } from '@nestjs/jwt';
import { NextFunction, Request, Response } from 'express';

/**
 * Candado de /uploads (fotos de productos y facturas).
 *
 * Antes, /uploads no llevaba autenticacion porque el backend solo escuchaba
 * en 127.0.0.1 -- nadie fuera de esta PC podia pedirlo. Ahora que tambien
 * escucha en la red (para poder usar la app desde el celular en la misma
 * WiFi), cualquiera en esa red podria adivinar un nombre de archivo
 * predecible (FAC-2026-00001.png) y ver facturas de clientes sin loguearse.
 *
 * Se reusa el mismo JWT que ya usa el resto de la API (mismo secreto,
 * mismos 30 dias de vigencia) -- no se crea un token nuevo. Un <img src=...>
 * o un <a href=...> no pueden mandar el header Authorization, asi que
 * tambien se acepta el token por query string (?token=...), que es lo que
 * usa el frontend (ver urlConToken en frontend/src/lib/api.ts).
 */
export function crearMiddlewareUploads(jwtService: JwtService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const deHeader = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const token = deHeader || (req.query.token as string | undefined);

    if (!token) {
      return res.status(401).json({ message: 'No autorizado' });
    }

    try {
      await jwtService.verifyAsync(token);
      next();
    } catch {
      res.status(401).json({ message: 'No autorizado' });
    }
  };
}
