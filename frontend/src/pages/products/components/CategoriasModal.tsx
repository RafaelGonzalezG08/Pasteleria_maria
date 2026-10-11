import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Tag, X, Trash2, Plus } from 'lucide-react';
import { Button, Card } from '../../../components/ui';
import { categoriesApi } from '../../../api/products.api';
import type { Category } from '../../../types';

/**
 * Administrar categorias: crear nuevas y borrar las que ya no hagan falta.
 * Borrar una no borra los productos, solo los deja sin categoria (ver
 * CategoriesService.remove() en el backend).
 */
export function CategoriasModal({
  categorias,
  esAdmin,
  onClose,
}: {
  categorias: Category[];
  esAdmin: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState('');

  const crear = useMutation({
    mutationFn: () => categoriesApi.create(nombre),
    onSuccess: (data) => {
      const n = data.clasificadas ?? 0;
      toast.success(
        n > 0
          ? `Categoria creada. ${n} pieza${n === 1 ? '' : 's'} clasificada${n === 1 ? '' : 's'}.`
          : 'Categoria creada.',
      );
      setNombre('');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message ?? 'No se pudo crear la categoria.');
    },
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      toast.success('Categoria eliminada.');
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[90vh] w-full max-w-sm overflow-hidden">
        <div className="max-h-[90vh] overflow-y-auto p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
            <Tag size={16} /> Categorias de joyas
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-100">
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-xs text-muted">
          Cada pieza se clasifica sola: si la primera palabra de su nombre coincide exacto con una categoria
          (ej. "Anillo solitario..." con la categoria "Anillo"), se le asigna automaticamente.
        </p>

        {/* overflow-hidden afuera + scroll adentro: Chrome no recorta la
            barra de scroll a las esquinas redondeadas cuando ambos van en el
            mismo elemento. */}
        <div className="mb-3 max-h-52 overflow-hidden rounded-lg border border-porcelain-200">
          <div className="max-h-52 divide-y divide-porcelain-200 overflow-y-auto">
            {categorias.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted">Todavia no hay categorias.</p>
            ) : (
              categorias.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-ink">{c.nombre}</span>
                  {esAdmin && (
                    <button
                      type="button"
                      onClick={() => eliminar.mutate(c.id)}
                      disabled={eliminar.isPending}
                      className="rounded p-1 text-muted hover:bg-brick-100 hover:text-brick-600"
                      title="Eliminar categoria"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nombre.trim()) crear.mutate();
          }}
          className="flex gap-2"
        >
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la categoria..."
            className="flex-1 rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
          />
          <Button type="submit" size="sm" disabled={!nombre.trim() || crear.isPending}>
            <Plus size={14} />
          </Button>
        </form>
        </div>
      </Card>
    </div>
  );
}
