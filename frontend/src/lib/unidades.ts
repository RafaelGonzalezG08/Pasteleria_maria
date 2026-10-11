/**
 * Unidades de medida (mismo catalogo que backend/src/common/unidades.ts).
 * Solo se convierte dentro de la misma familia: peso, volumen o cantidad.
 */
export type FamiliaUnidad = 'MASA' | 'VOLUMEN' | 'CONTEO';

export const UNIDADES: Record<string, { familia: FamiliaUnidad; factor: number; nombre: string }> = {
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

export const OPCIONES_UNIDAD = Object.entries(UNIDADES).map(([value, u]) => ({
  value,
  label: `${value} (${u.nombre})`,
}));

/** Unidades compatibles con `unidad` (para elegir en que medida escribir una cantidad). */
export function opcionesCompatibles(unidad: string) {
  const familia = UNIDADES[unidad]?.familia;
  return OPCIONES_UNIDAD.filter((o) => !familia || UNIDADES[o.value].familia === familia);
}

export function convertir(cantidad: number, desde: string, hacia: string): number | null {
  const a = UNIDADES[desde];
  const b = UNIDADES[hacia];
  if (!a || !b || a.familia !== b.familia) return null;
  return (cantidad * a.factor) / b.factor;
}
