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
 * Si no viene VITE_API_URL fijo de fabrica (el build empaquetado de escritorio
 * ya no lo trae, ver desktop/compilar.js), se calcula con el host desde donde
 * se abrio la pagina. Asi la misma build sirve tanto para la PC (localhost)
 * como para un celular en la misma WiFi (la IP de la PC) sin recompilar nada
 * por dispositivo. El puerto es fijo porque backend/nativo.js ya lo fija asi:
 * 3000 en desarrollo suelto (npm run start:dev), 3010 en el empaquetado.
 */
const PUERTO_API_POR_DEFECTO = import.meta.env.DEV ? 3000 : 3010;
const BASE_CALCULADA = `${window.location.protocol}//${window.location.hostname}:${PUERTO_API_POR_DEFECTO}`;

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
    // Sin "response" es que la peticion ni siquiera llego a la PC (WiFi
    // cortada, la PC apagada/durmiendo) -- eso ya lo avisa la franja de
    // "Sin conexion con la PC" (ver useConexionPc en Layout.tsx), un toast
    // encima por cada peticion que fallo seria ruido repetido de lo mismo.
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
 * mismo JWT tambien por ?token= (ver uploads-auth.middleware.ts). Sin esto,
 * abrir la app desde el celular (backend escuchando en la red, no solo en
 * localhost) dejaria las fotos de productos y facturas visibles a cualquiera
 * en la misma WiFi con solo adivinar el nombre del archivo.
 */
export function urlConToken(url: string): string {
  const token = useAuthStore.getState().token;
  if (!token) return url;
  const separador = url.includes('?') ? '&' : '?';
  return `${url}${separador}token=${encodeURIComponent(token)}`;
}
