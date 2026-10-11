import type { EstadoEncargo, UrgenciaEncargo } from '../../types';

/** Color de la insignia de cada estado y de cada nivel de urgencia de un encargo. */
export const TONO_ESTADO: Record<EstadoEncargo, 'neutral' | 'copper' | 'sage' | 'brick' | 'rose'> = {
  PENDIENTE: 'neutral',
  EN_PRODUCCION: 'copper',
  LISTO: 'sage',
  ENTREGADO: 'rose',
  CANCELADO: 'brick',
};

export const URGENCIA: Record<UrgenciaEncargo, { tone: 'brick' | 'copper' | 'sage' | 'neutral'; texto: string } | null> = {
  ATRASADO: { tone: 'brick', texto: 'Atrasado' },
  HOY: { tone: 'copper', texto: 'Hoy' },
  PRONTO: { tone: 'sage', texto: 'Pronto' },
  PROGRAMADO: null,
  CERRADO: null,
};
