import { BadRequestException } from '@nestjs/common';

/**
 * Unidades de medida con conversion.
 *
 * Cada unidad pertenece a una familia (masa, volumen, conteo) y tiene un
 * factor hacia la unidad base de su familia (g, ml, unidad). Solo se convierte
 * dentro de la misma familia: pasar "3 huevos" a gramos depende del huevo, y
 * adivinarlo daria costos falsos sin que nadie se entere. Si una receta usa
 * una unidad de otra familia que la del insumo, se rechaza con un mensaje
 * claro para que la corrijan.
 *
 * Mantener sincronizado con frontend/src/lib/unidades.ts.
 */

export type FamiliaUnidad = 'MASA' | 'VOLUMEN' | 'CONTEO';

interface DefUnidad {
  familia: FamiliaUnidad;
  /** Cuantas unidades base (g, ml, unidad) hay en una de esta. */
  factor: number;
  nombre: string;
}

export const UNIDADES: Record<string, DefUnidad> = {
  g: { familia: 'MASA', factor: 1, nombre: 'gramos' },
  kg: { familia: 'MASA', factor: 1000, nombre: 'kilogramos' },
  lb: { familia: 'MASA', factor: 453.59237, nombre: 'libras' },
  oz: { familia: 'MASA', factor: 28.349523125, nombre: 'onzas' },
  ml: { familia: 'VOLUMEN', factor: 1, nombre: 'mililitros' },
  L: { familia: 'VOLUMEN', factor: 1000, nombre: 'litros' },
  unidad: { familia: 'CONTEO', factor: 1, nombre: 'unidades' },
  docena: { familia: 'CONTEO', factor: 12, nombre: 'docenas' },
  porcion: { familia: 'CONTEO', factor: 1, nombre: 'porciones' },
};

export const CODIGOS_UNIDAD = Object.keys(UNIDADES);

export function esUnidadValida(unidad: string): boolean {
  return unidad in UNIDADES;
}

export function familiaDe(unidad: string): FamiliaUnidad {
  const def = UNIDADES[unidad];
  if (!def) throw new BadRequestException(`Unidad desconocida: "${unidad}".`);
  return def.familia;
}

export function sonCompatibles(a: string, b: string): boolean {
  return Boolean(UNIDADES[a] && UNIDADES[b] && UNIDADES[a].familia === UNIDADES[b].familia);
}

/**
 * Convierte `cantidad` de la unidad `desde` a la unidad `hacia`. Lanza un 400
 * si son de familias distintas (ver comentario arriba). `contexto` se agrega
 * al mensaje para que se sepa donde esta el problema (ej. el nombre del insumo).
 */
export function convertir(
  cantidad: number,
  desde: string,
  hacia: string,
  contexto?: string,
): number {
  if (desde === hacia) return cantidad;
  const a = UNIDADES[desde];
  const b = UNIDADES[hacia];
  if (!a || !b) {
    throw new BadRequestException(`Unidad desconocida: "${!a ? desde : hacia}".`);
  }
  if (a.familia !== b.familia) {
    throw new BadRequestException(
      `No se puede convertir ${a.nombre} a ${b.nombre}${contexto ? ` (${contexto})` : ''}: ` +
        'son medidas distintas (peso, volumen o cantidad). Usa una unidad compatible.',
    );
  }
  return (cantidad * a.factor) / b.factor;
}

/** Redondeo para cantidades de inventario (hasta 4 decimales, suficiente para kg con gramos). */
export function redondearCantidad(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function redondearDinero(n: number): number {
  return Math.round(n * 100) / 100;
}
