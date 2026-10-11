import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { Button, Select } from '../../../components/ui';
import type { CrearUsuarioDto } from '../../../api/settings.api';
import type { Role } from '../../../types';

export function NewUserForm({ onSubmit }: { onSubmit: (payload: CrearUsuarioDto) => void }) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', role: 'CAJERO' as Role });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.nombre || !form.email || form.password.length < 6) {
          toast.error('Completa nombre, correo y una contraseña de al menos 6 caracteres.');
          return;
        }
        onSubmit(form);
        setForm({ nombre: '', email: '', password: '', role: 'CAJERO' });
      }}
      className="space-y-2 border-t border-porcelain-200 pt-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Agregar usuario</p>
      <input
        placeholder="Nombre"
        value={form.nombre}
        onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
        className="w-full rounded-lg border border-porcelain-300 px-3 py-1.5 text-sm outline-none focus:border-copper-500"
      />
      <input
        placeholder="Correo"
        type="email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        className="w-full rounded-lg border border-porcelain-300 px-3 py-1.5 text-sm outline-none focus:border-copper-500"
      />
      <div className="flex gap-2">
        <input
          placeholder="Contraseña"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          className="min-w-0 flex-1 rounded-lg border border-porcelain-300 px-3 py-1.5 text-sm outline-none focus:border-copper-500"
        />
        <Select
          value={form.role}
          onChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
          className="w-36 shrink-0"
          size="sm"
          options={[
            { value: 'CAJERO', label: 'Cajero' },
            { value: 'CONTABILIDAD', label: 'Contabilidad' },
            { value: 'ADMIN', label: 'Admin' },
          ]}
        />
      </div>
      <Button type="submit" size="sm" variant="secondary" className="w-full">
        <UserPlus size={14} /> Crear usuario
      </Button>
    </form>
  );
}
