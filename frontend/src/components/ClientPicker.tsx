import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, X, Check, UserPlus } from 'lucide-react';
import { clientsApi } from '../api/clients.api';
import { Card, Button } from './ui';
import type { Client } from '../types';

/**
 * Buscador de cliente reutilizado en el punto de venta y al atender un
 * pedido web: mismo flujo en los dos lugares, asi que vive en un solo sitio
 * en vez de mantener dos copias que se puedan ir desalineando.
 *
 * Incluye "crear cliente" porque en el momento de cobrar es tipico
 * encontrarse con alguien que todavia no esta en el sistema — sin esto, el
 * cajero tenia que abandonar el cobro, ir a Clientes, crearlo, y volver.
 */
export function ClientPicker({
  client,
  onChange,
  required,
}: {
  client: Client | null;
  onChange: (client: Client | null) => void;
  required?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        Cliente {required && <span className="text-brick-500">(requerido)</span>}
      </p>

      {client ? (
        <div className="mb-1.5 flex items-center justify-between rounded-lg border border-sage-500 bg-sage-100 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage-500 text-white">
              <Check size={12} strokeWidth={3} />
            </span>
            <div>
              <p className="text-sm font-semibold text-sage-700">{client.nombre}</p>
              <p className="text-xs text-sage-600">{client.telefono}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-sage-600 hover:bg-sage-500/10"
            title="Quitar cliente"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="buscador mb-1.5 w-full !py-2 text-left hover:text-copper-600"
        >
          <Search size={15} className="shrink-0" /> Buscar cliente...
        </button>
      )}

      {modalOpen && (
        <ClientSearchModal
          onSelect={(c) => {
            onChange(c);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function ClientSearchModal({ onSelect, onClose }: { onSelect: (client: Client) => void; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients', search],
    queryFn: () => clientsApi.search(search),
  });

  const crearCliente = useMutation({
    mutationFn: () => clientsApi.create({ nombre: nombreNuevo.trim(), telefono: telefonoNuevo.trim() }),
    onSuccess: (cliente) => {
      toast.success('Cliente creado.');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onSelect(cliente);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg || 'No se pudo crear el cliente.');
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <Card className="flex max-h-[70vh] w-full max-w-md flex-col p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted">
            {creando ? 'Cliente nuevo' : 'Buscar cliente'}
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-100">
            <X size={16} />
          </button>
        </div>

        {creando ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Nombre</label>
              <input
                autoFocus
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Telefono</label>
              <input
                value={telefonoNuevo}
                onChange={(e) => setTelefonoNuevo(e.target.value)}
                placeholder="+1 809 555 1234"
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
                onKeyDown={(e) => e.key === 'Enter' && crearCliente.mutate()}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" type="button" onClick={() => setCreando(false)}>
                Volver
              </Button>
              <Button
                className="flex-1"
                type="button"
                onClick={() => crearCliente.mutate()}
                disabled={crearCliente.isPending || nombreNuevo.trim().length < 2 || telefonoNuevo.trim().length < 7}
              >
                {crearCliente.isPending ? 'Creando...' : 'Crear y seleccionar'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o telefono..."
              className="mb-3 w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
            />
            {/* overflow-hidden afuera + scroll adentro: Chrome no recorta la
                barra de scroll a las esquinas redondeadas cuando ambos van
                en el mismo elemento. */}
            <div className="flex-1 overflow-hidden rounded-lg border border-porcelain-200">
              <div className="h-full overflow-y-auto">
                {isLoading ? (
                  <p className="px-3 py-3 text-sm text-muted">Buscando...</p>
                ) : clients.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted">
                    {search ? 'Sin resultados.' : 'Escribe para buscar un cliente.'}
                  </p>
                ) : (
                  clients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelect(c)}
                      className="block w-full border-b border-porcelain-100 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-porcelain-100"
                    >
                      <span className="font-medium text-ink">{c.nombre}</span>{' '}
                      <span className="text-xs text-muted">{c.telefono}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setNombreNuevo(/^\d[\d\s+-]*$/.test(search.trim()) ? '' : search.trim());
                setTelefonoNuevo(/^\d[\d\s+-]*$/.test(search.trim()) ? search.trim() : '');
                setCreando(true);
              }}
              className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-copper-300 py-2 text-sm font-semibold text-copper-600 hover:border-copper-400 hover:bg-copper-50"
            >
              <UserPlus size={15} /> Crear cliente nuevo
            </button>
          </>
        )}
      </Card>
    </div>
  );
}
