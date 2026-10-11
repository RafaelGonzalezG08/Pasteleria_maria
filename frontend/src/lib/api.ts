import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * Marca una peticion cuyo error muestra el propio componente (con un
     * mensaje mas especifico). Sin esto, el interceptor de abajo tambien
     * mostraba su toast y el usuario veia el MISMO error dos veces.
     */
    skipErrorToast?: boolean;
  }
}

/**
 * Si no viene VITE_API_URL fijo de fabrica, se usa el backend de esta misma
 * PC. El puerto es fijo porque desktop/nativo.js ya lo fija asi: 3000 en
 * desarrollo suelto (npm run start:dev), 3010 en la app empaquetada.
 */
const PUERTO_API_POR_DEFECTO = import.meta.env.DEV ? 3000 : 3010;
const BASE_CALCULADA = `http://localhost:${PUERTO_API_POR_DEFECTO}`;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `${BASE_CALCULADA}/api`,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const message = error?.response?.data?.message || 'Ocurrio un error inesperado.';

    if (status === 401) {
      useAuthStore.getState().logout();
    }
    // Sin "response" es que la peticion ni siquiera llego al backend (se
    // esta reiniciando): no se muestra un toast por cada peticion fallida.
    if (status !== 401 && error?.response && !error?.config?.skipErrorToast) {
      const texto = Array.isArray(message) ? message.join(', ') : String(message);
      // `id` estable por mensaje: si varias peticiones fallan con lo mismo
      // (o el usuario reintenta el mismo boton), react-hot-toast reemplaza el
      // toast en vez de apilar cinco copias identicas en pantalla.
      toast.error(texto, { id: `err:${status}:${texto}` });
    }
    return Promise.reject(error);
  },
);

export function apiUrl(path: string) {
  const base = (import.meta.env.VITE_API_URL || `${BASE_CALCULADA}/api`).replace(/\/api$/, '');
  return `${base}${path}`;
}

/**
 * Le pega el token de sesion como query string a una URL de /uploads.
 *
 * Esas imagenes las carga un <img src=...> o un <a href=...> del navegador,
 * que no puede mandar el header Authorization -- por eso el backend acepta el
 * mismo JWT tambien por ?token= (ver uploads-auth.middleware.ts).
 */
export function urlConToken(url: string): string {
  const token = useAuthStore.getState().token;
  if (!token) return url;
  const separador = url.includes('?') ? '&' : '?';
  return `${url}${separador}token=${encodeURIComponent(token)}`;
}

/** URL lista para un <img> de un archivo de /uploads (foto de producto, logo, referencia). */
export function urlArchivo(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  return urlConToken(ruta.startsWith('http') ? ruta : apiUrl(ruta));
}
