import { create } from 'zustand';
import type { AuthUser } from '../types';
import {
  actividadVencida,
  avisarSesionExpirada,
  marcarActividad,
  olvidarActividad,
} from '../lib/sesion';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const STORAGE_KEY = 'pasteleria-maria-auth';

function loadInitial(): { token: string | null; user: AuthUser | null } {
  // Antes la sesion vivia en localStorage y sobrevivia a cerrar la app, asi
  // que se entraba directo. Ahora se pide la contraseña en cada arranque:
  // se borra la copia vieja (tambien deja de quedar un token en disco).
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nada que limpiar */
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    // Recargar la pagina no debe saltarse el limite de inactividad.
    if (actividadVencida()) {
      sessionStorage.removeItem(STORAGE_KEY);
      avisarSesionExpirada();
      return { token: null, user: null };
    }
    return JSON.parse(raw);
  } catch {
    return { token: null, user: null };
  }
}

const initial = loadInitial();

export const useAuthStore = create<AuthState>((set) => ({
  token: initial.token,
  user: initial.user,
  isAuthenticated: Boolean(initial.token),
  login: (token, user) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    } catch {
      /* la sesion vive en memoria aunque no se pueda persistir */
    }
    marcarActividad();
    set({ token, user, isAuthenticated: true });
  },
  logout: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nada que limpiar */
    }
    olvidarActividad();
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
