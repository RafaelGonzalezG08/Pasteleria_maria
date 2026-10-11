import { describe, expect, it } from 'vitest';
import { inactividadSuperada, MINUTOS_INACTIVIDAD } from './sesion';

const MIN = 60_000;

describe('inactividadSuperada', () => {
  const ahora = 1_000_000_000_000;

  it('no vence antes de los 30 minutos', () => {
    expect(inactividadSuperada(ahora - 29 * MIN, ahora)).toBe(false);
    expect(inactividadSuperada(ahora - 29 * MIN - 59_000, ahora)).toBe(false);
  });

  it('vence justo a los 30 minutos', () => {
    expect(MINUTOS_INACTIVIDAD).toBe(30);
    expect(inactividadSuperada(ahora - 30 * MIN, ahora)).toBe(true);
    expect(inactividadSuperada(ahora - 3 * 60 * MIN, ahora)).toBe(true);
  });

  it('sin registro de actividad no vence (sesion recien iniciada)', () => {
    expect(inactividadSuperada(null, ahora)).toBe(false);
  });
});
