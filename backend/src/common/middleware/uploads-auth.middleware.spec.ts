import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { crearMiddlewareUploads } from './uploads-auth.middleware';

function crearRespuestaFalsa() {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('crearMiddlewareUploads', () => {
  const jwtService = new JwtService({ secret: 'secreto-de-prueba' });
  const token = jwtService.sign({ sub: 'user-1' });
  const middleware = crearMiddlewareUploads(jwtService);

  it('token valido por header Authorization: deja pasar', async () => {
    const req = { headers: { authorization: `Bearer ${token}` }, query: {} } as unknown as Request;
    const res = crearRespuestaFalsa();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('token valido por ?token=: deja pasar', async () => {
    const req = { headers: {}, query: { token } } as unknown as Request;
    const res = crearRespuestaFalsa();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('sin token: 401 y no llama next', async () => {
    const req = { headers: {}, query: {} } as unknown as Request;
    const res = crearRespuestaFalsa();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('token invalido: 401 y no llama next', async () => {
    const req = {
      headers: { authorization: 'Bearer token-inventado' },
      query: {},
    } as unknown as Request;
    const res = crearRespuestaFalsa();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
