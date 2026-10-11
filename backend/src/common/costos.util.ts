import { Role } from './enums';

/** Claves que revelan cuanto le cuesta al negocio producir (su margen). */
const CLAVE_DE_COSTO = /^(costo|valorStock|precioSugerido|margen|utilidad|ganancia)/i;

/**
 * Quita de una respuesta todo lo que sea costo o margen, recorriendo objetos y
 * listas anidados. Los costos son informacion sensible del negocio (igual que
 * el costo de los productos en la app original): solo ADMIN los ve. El
 * repostero sigue viendo cantidades, lotes y vencimientos, que es lo que
 * necesita para trabajar.
 */
export function sinCostos<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((v) => sinCostos(v)) as T;
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    const limpio: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CLAVE_DE_COSTO.test(clave)) continue;
      limpio[clave] = sinCostos(v);
    }
    return limpio as T;
  }
  return valor;
}

/** Devuelve la respuesta completa a ADMIN y sin costos a los demas roles. */
export function segunRol<T>(valor: T, role: string | undefined): T {
  return role === Role.ADMIN ? valor : sinCostos(valor);
}
