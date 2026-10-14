import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import logoCompleto from '../assets/logo-rosa-delicias.png';
import { authApi } from '../api/auth.api';
import { useAuthStore } from '../store/auth.store';
import {
  borrarAvisoSesionExpirada,
  hayAvisoSesionExpirada,
  guardarUltimoCorreo,
  leerUltimoCorreo,
  MINUTOS_INACTIVIDAD,
} from '../lib/sesion';
import { Button } from '../components/ui';

function Encabezado({ subtitulo }: { subtitulo: string }) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      {/* Tarjeta crema (el fondo original del logo) en los dos temas: el verde
          oliva del nombre no se leeria sobre el fondo oscuro. */}
      <div className="mb-4 rounded-2xl bg-[#f4f5f0] px-6 py-4 shadow-neu-sm">
        <img src={logoCompleto} alt="" className="h-52 w-auto" />
      </div>
      <h1 className="sr-only">Rosa Delicias</h1>
      <p className="mt-1 text-sm text-muted">{subtitulo}</p>
    </div>
  );
}

const ETIQUETA = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted';

export default function Login() {
  // null = todavia consultando al servidor si es el primer arranque.
  const [necesitaConfiguracion, setNecesitaConfiguracion] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    authApi
      .necesitaConfiguracion()
      // Si el servidor no contesta se muestra el login normal: la franja de
      // "Sin conexion con la PC" ya avisa del problema real.
      .then((v) => vivo && setNecesitaConfiguracion(v))
      .catch(() => vivo && setNecesitaConfiguracion(false));
    return () => {
      vivo = false;
    };
  }, []);

  if (necesitaConfiguracion === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-porcelain-100">
        <Loader2 size={28} className="animate-spin text-muted" />
      </div>
    );
  }

  return necesitaConfiguracion ? <CrearAdministrador /> : <IniciarSesion />;
}

function IniciarSesion() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  // El ultimo correo con el que se entro: asi solo se pide la contraseña.
  // "Usar otro correo" lo suelta por si entra otro usuario (cajero, etc.).
  const [recordado, setRecordado] = useState(leerUltimoCorreo);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sesionExpirada] = useState(hayAvisoSesionExpirada);
  // Se borra en un efecto, no al leerla: en desarrollo React ejecuta los
  // inicializadores de useState dos veces y la segunda ya no la encontraba.
  useEffect(() => {
    borrarAvisoSesionExpirada();
  }, []);

  const correoUsado = recordado || email.trim();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.login(correoUsado, password);
      guardarUltimoCorreo(correoUsado);
      login(data.accessToken, data.user);
      navigate('/');
    } catch {
      setError(recordado ? 'Contraseña incorrecta.' : 'Correo o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-porcelain-100 px-4">
      <div className="w-full max-w-sm">
        <Encabezado
          subtitulo={recordado ? 'Escribe tu contraseña para continuar' : 'Inicia sesion para continuar'}
        />

        <form onSubmit={handleSubmit} className="rounded-xl2 bg-porcelain-100 p-6 shadow-neu">
          {sesionExpirada && (
            <p className="mb-4 rounded-lg bg-copper-100 px-3 py-2 text-xs text-copper-700">
              Cerramos tu sesion por {MINUTOS_INACTIVIDAD} minutos sin actividad. Escribe tu contraseña para
              seguir donde estabas.
            </p>
          )}

          {recordado ? (
            <div className="mb-4">
              <label className={ETIQUETA}>Usuario</label>
              <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 shadow-neu-inset">
                <span className="min-w-0 truncate text-sm text-ink">{recordado}</span>
                <button
                  type="button"
                  onClick={() => {
                    setRecordado('');
                    setPassword('');
                    setError(null);
                  }}
                  className="shrink-0 text-xs font-semibold text-copper-600 hover:text-copper-700"
                >
                  Usar otro correo
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className={ETIQUETA}>Correo</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                placeholder="tucorreo@ejemplo.com"
              />
            </>
          )}

          <label className={ETIQUETA}>Contraseña</label>
          <input
            type="password"
            required
            autoFocus={Boolean(recordado)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-2 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            placeholder="••••••••"
          />

          {error && <p className="mb-3 text-sm text-brick-500">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-3 w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}

/**
 * Primer arranque de una instalacion nueva: el dueño crea su propio
 * administrador. No hay usuario ni clave de fabrica. Esta pantalla solo
 * aparece mientras la base no tiene ningun usuario, asi que al actualizar la
 * app (la base se conserva) no vuelve a salir.
 */
function CrearAdministrador() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repetir, setRepetir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== repetir) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.configurar({ nombre: nombre.trim(), email: email.trim(), password });
      guardarUltimoCorreo(email);
      login(data.accessToken, data.user);
      navigate('/');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(
        Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo crear el administrador. Intenta de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-porcelain-100 px-4 py-8">
      <div className="w-full max-w-sm">
        <Encabezado subtitulo="Bienvenido. Crea tu usuario administrador para empezar." />

        <form onSubmit={handleSubmit} className="rounded-xl2 bg-porcelain-100 p-6 shadow-neu">
          <label className={ETIQUETA}>Tu nombre</label>
          <input
            required
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mb-4 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            placeholder="Maria Perez"
          />

          <label className={ETIQUETA}>Correo</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            placeholder="tucorreo@ejemplo.com"
          />

          <label className={ETIQUETA}>Contraseña</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            placeholder="Minimo 6 caracteres"
          />

          <label className={ETIQUETA}>Repite la contraseña</label>
          <input
            type="password"
            required
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            className="mb-2 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            placeholder="••••••••"
          />

          {error && <p className="mb-3 text-sm text-brick-500">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-3 w-full">
            {loading && <Loader2 size={16} className="animate-spin" />}
            Crear administrador y entrar
          </Button>

          <p className="mt-4 text-center text-xs text-muted">
            Guarda bien estos datos: son los que usaras cada vez que abras la aplicacion.
          </p>
        </form>
      </div>
    </div>
  );
}
