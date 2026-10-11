import { useEffect, useRef, useState } from 'react';
import { api } from './api';

const INTERVALO_MS = 15_000;

/**
 * A diferencia de una app que le habla a un servidor en la nube, esta le
 * habla a una PC en la misma WiFi -- que se puede apagar, dormir, o quedar
 * fuera de rango. Este hook hace un ping liviano a /health cada 15s y avisa
 * cuando dos seguidos fallan (para no marcar "desconectado" por un timeout
 * suelto -- si funcionara con uno solo, cualquier hipo de la red prendia el
 * aviso y lo apagaba enseguida, mas ruido que ayuda).
 */
export function useConexionPc() {
  const [conectado, setConectado] = useState(true);
  const fallasSeguidas = useRef(0);

  useEffect(() => {
    let cancelado = false;

    async function ping() {
      try {
        await api.get('/health', { signal: AbortSignal.timeout(5000), skipErrorToast: true });
        fallasSeguidas.current = 0;
        if (!cancelado) setConectado(true);
      } catch {
        fallasSeguidas.current += 1;
        if (!cancelado && fallasSeguidas.current >= 2) setConectado(false);
      }
    }

    ping();
    const id = setInterval(ping, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, []);

  return conectado;
}
