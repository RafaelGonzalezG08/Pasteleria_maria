import { describe, expect, it } from 'vitest';
import { calcularPagina, TAMANO_PAGINA } from './usePaginacion';

describe('calcularPagina', () => {
  it('usa 50 por pagina', () => {
    expect(TAMANO_PAGINA).toBe(50);
  });

  it('la primera pagina de 951 piezas son los 50 primeros, en 20 paginas', () => {
    const p = calcularPagina(951, 1);
    expect(p).toMatchObject({ pagina: 1, totalPaginas: 20, inicio: 0, fin: 50, desde: 1 });
  });

  it('la ultima pagina trae solo el sobrante', () => {
    const p = calcularPagina(951, 20);
    expect(p).toMatchObject({ pagina: 20, inicio: 950, fin: 951, desde: 951 });
  });

  it('exactamente 50 elementos caben en una sola pagina', () => {
    expect(calcularPagina(50, 1).totalPaginas).toBe(1);
    expect(calcularPagina(51, 1).totalPaginas).toBe(2);
  });

  it('una lista vacia no rompe nada', () => {
    expect(calcularPagina(0, 1)).toMatchObject({ pagina: 1, totalPaginas: 1, inicio: 0, fin: 0, desde: 0 });
  });

  it('acota una pagina fuera de rango (la lista se encogio al eliminar)', () => {
    expect(calcularPagina(60, 9).pagina).toBe(2);
    expect(calcularPagina(60, 0).pagina).toBe(1);
    expect(calcularPagina(10, 3).pagina).toBe(1);
  });
});
