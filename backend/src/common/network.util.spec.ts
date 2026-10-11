import type { Request } from 'express';
import { esConexionLocal } from './network.util';

function conIp(ip: string | undefined): Request {
  return { ip } as Request;
}

describe('esConexionLocal', () => {
  it('reconoce loopback IPv4', () => {
    expect(esConexionLocal(conIp('127.0.0.1'))).toBe(true);
  });

  it('reconoce loopback IPv6', () => {
    expect(esConexionLocal(conIp('::1'))).toBe(true);
  });

  it('reconoce loopback IPv4 mapeado a IPv6', () => {
    expect(esConexionLocal(conIp('::ffff:127.0.0.1'))).toBe(true);
  });

  it('no reconoce una IP de la red local como loopback', () => {
    expect(esConexionLocal(conIp('192.168.1.5'))).toBe(false);
  });

  it('no reconoce una IP publica como loopback', () => {
    expect(esConexionLocal(conIp('201.10.20.30'))).toBe(false);
  });

  it('no revienta si req.ip viene undefined', () => {
    expect(esConexionLocal(conIp(undefined))).toBe(false);
  });
});
