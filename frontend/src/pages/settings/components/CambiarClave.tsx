import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui';
import { settingsApi } from '../../../api/settings.api';

/** Cambio de la propia clave. */
export function CambiarClave() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');

  const cambiar = useMutation({
    mutationFn: () => settingsApi.changePassword(actual, nueva),
    onSuccess: () => {
      toast.success('Clave actualizada.');
      setActual('');
      setNueva('');
      setRepetir('');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo cambiar la clave.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (nueva.length < 6) {
      toast.error('La clave nueva debe tener al menos 6 caracteres.');
      return;
    }
    if (nueva !== repetir) {
      toast.error('La clave nueva y su repeticion no coinciden.');
      return;
    }
    cambiar.mutate();
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Clave actual
        </label>
        <input
          type="password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Clave nueva
        </label>
        <input
          type="password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Minimo 6 caracteres"
          className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          Repetir la clave nueva
        </label>
        <input
          type="password"
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
          className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
        />
      </div>
      <Button type="submit" className="w-full" disabled={!actual || !nueva || cambiar.isPending}>
        {cambiar.isPending ? 'Guardando...' : 'Cambiar clave'}
      </Button>
    </form>
  );
}
