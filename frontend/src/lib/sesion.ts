/**
 * Reglas de la sesion: se pide la contraseña cada vez que se abre la app y
 * tras 30 minutos sin tocarla, aunque siga abierta. El correo se recuerda
 * (localStorage, sobrevive a cerrar la app); el token y la hora de la ultima
 * actividad NO (sessionStorage: se borran al cerrar la app, que es justo lo
 * que se busca).
 */
export const MINUTOS_INACTIVIDAD = 30;
const LIMITE_MS = MINUTOS_INACTIVIDAD * 60_000;

const CLAVE_ULTIMO_CORREO = 'pasteleria-maria-ultimo-correo';
const CLAVE_ACTIVIDAD = 'pasteleria-maria-actividad';
const CLAVE_EXPIRADA = 'pasteleria-maria-sesion-expirada';

/** true si pasaron al menos 30 minutos desde `ultima` (null = sin registro). */
export function inactividadSuperada(
  ultima: number | null,
  ahora: number = Date.now(),
  limiteMs: number = LIMITE_MS,
): boolean {
  return ultima !== null && ahora - ultima >= limiteMs;
}

function leerActividad(): number | null {
  try {
    const raw = sessionStorage.getItem(CLAVE_ACTIVIDAD);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function marcarActividad(ahora: number = Date.now()): void {
  try {
    sessionStorage.setItem(CLAVE_ACTIVIDAD, String(ahora));
  } catch {
    /* sin sessionStorage la sesion igual funciona, solo no sobrevive a recargar */
  }
}

export function olvidarActividad(): void {
  try {
    sessionStorage.removeItem(CLAVE_ACTIVIDAD);
  } catch {
    /* nada que limpiar */
  }
}

export function actividadVencida(ahora: number = Date.now()): boolean {
  return inactividadSuperada(leerActividad(), ahora);
}

export function guardarUltimoCorreo(correo: string): void {
  try {
    localStorage.setItem(CLAVE_ULTIMO_CORREO, correo.trim());
  } catch {
    /* sin persistencia: simplemente se vuelve a escribir */
  }
}

export function leerUltimoCorreo(): string {
  try {
    return localStorage.getItem(CLAVE_ULTIMO_CORREO) ?? '';
  } catch {
    return '';
  }
}

/** Deja una marca para que el login explique por que se cerro la sesion. */
export function avisarSesionExpirada(): void {
  try {
    sessionStorage.setItem(CLAVE_EXPIRADA, '1');
  } catch {
    /* solo se pierde el mensaje */
  }
}

/** Solo lee la marca (sin borrarla): es seguro llamarla durante el render. */
export function hayAvisoSesionExpirada(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_EXPIRADA) === '1';
  } catch {
    return false;
  }
}

/** Borra la marca para que el aviso salga una sola vez (llamar desde un efecto). */
export function borrarAvisoSesionExpirada(): void {
  try {
    sessionStorage.removeItem(CLAVE_EXPIRADA);
  } catch {
    /* nada que borrar */
  }
}
