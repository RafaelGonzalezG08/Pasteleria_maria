import type { Material } from '../../types';

/** Color de la insignia por material: el mismo lenguaje visual en toda la app y en el catalogo. */
export const MATERIAL_COLOR: Record<Material, string> = {
  PLATA: 'bg-slate-500',
  ORO: 'bg-copper-500',
  GOLDFILLED: 'bg-copper-400',
  ACERO: 'bg-slate-400',
  OTRO: 'bg-espresso-700',
};
