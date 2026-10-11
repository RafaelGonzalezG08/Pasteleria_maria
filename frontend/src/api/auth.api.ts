import { api } from '../lib/api';
import type { AuthUser } from '../types';

type RespuestaAuth = { accessToken: string; user: AuthUser };

export const authApi = {
  login: (email: string, password: string) =>
    api.post<RespuestaAuth>('/auth/login', { email, password }).then((r) => r.data),

  /** true solo en una instalacion que todavia no tiene administrador. */
  necesitaConfiguracion: () =>
    api.get<{ necesitaConfiguracion: boolean }>('/auth/setup-status').then((r) => r.data.necesitaConfiguracion),

  /** Crea el administrador del primer arranque y devuelve la sesion ya iniciada. */
  configurar: (datos: { nombre: string; email: string; password: string }) =>
    api.post<RespuestaAuth>('/auth/setup', datos, { skipErrorToast: true }).then((r) => r.data),
};
