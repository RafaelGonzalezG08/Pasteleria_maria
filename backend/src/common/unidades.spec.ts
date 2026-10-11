import { BadRequestException } from '@nestjs/common';
import { convertir, sonCompatibles } from './unidades';

describe('convertir (unidades de medida)', () => {
  it('convierte dentro de la misma familia', () => {
    expect(convertir(1, 'kg', 'g')).toBe(1000);
    expect(convertir(500, 'g', 'kg')).toBe(0.5);
    expect(convertir(1, 'lb', 'g')).toBeCloseTo(453.59, 2);
    expect(convertir(1, 'L', 'ml')).toBe(1000);
    expect(convertir(2, 'docena', 'unidad')).toBe(24);
  });

  it('misma unidad devuelve la misma cantidad', () => {
    expect(convertir(3.25, 'kg', 'kg')).toBe(3.25);
  });

  it('rechaza convertir entre familias distintas (peso vs. cantidad)', () => {
    expect(() => convertir(3, 'unidad', 'g', 'Huevos')).toThrow(BadRequestException);
    expect(() => convertir(1, 'L', 'kg')).toThrow(/medidas distintas/);
  });

  it('rechaza unidades desconocidas', () => {
    expect(() => convertir(1, 'taza', 'g')).toThrow(/desconocida/);
  });

  it('sonCompatibles', () => {
    expect(sonCompatibles('kg', 'lb')).toBe(true);
    expect(sonCompatibles('ml', 'g')).toBe(false);
  });
});
