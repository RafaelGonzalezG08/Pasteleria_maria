import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UploadCloud, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui';
import { settingsApi } from '../../../api/settings.api';

/**
 * Une el inventario de OTRA computadora (ej. la de mama) con el de esta,
 * a partir de un respaldo .sqlite.gz generado alli en Respaldos automaticos.
 */
export function AgregarDatos() {
  const queryClient = useQueryClient();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoFotos, setArchivoFotos] = useState<File | null>(null);
  const [resultado, setResultado] = useState<{
    total: number;
    agregados: number;
    omitidos: number;
    conFoto: number;
    renumerados: { nombre: string; skuOriginal: string; skuNuevo: string }[];
  } | null>(null);

  const importar = useMutation({
    mutationFn: () => settingsApi.importarProductos(archivo!, archivoFotos),
    onSuccess: (data) => {
      setResultado(data);
      setArchivo(null);
      setArchivoFotos(null);
      toast.success(`Listo: ${data.agregados + data.renumerados.length} productos agregados.`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo importar ese archivo.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Si tu y otra persona (ej. mama) trabajan cada quien en su propia computadora, usa esto para traer
        el inventario de la otra hacia esta. Lo que ya existe aqui no se toca — solo se agrega lo nuevo, y
        si un codigo se repite se le pone uno nuevo automaticamente.
      </p>

      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Base de datos (obligatorio)
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-porcelain-300 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-copper-400 hover:text-copper-600">
            {archivo ? archivo.name : 'Elegir archivo .sqlite.gz...'}
            <input
              type="file"
              accept=".gz,.sqlite,.db"
              className="hidden"
              disabled={importar.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setArchivo(file ?? null);
                setResultado(null);
              }}
            />
          </label>
          <p className="mt-1 text-[11px] text-muted">
            El archivo <code>db-....sqlite.gz</code> que se genera en <strong>Respaldos automaticos</strong>{' '}
            de la OTRA computadora.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Fotos de los productos (opcional)
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-porcelain-300 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-copper-400 hover:text-copper-600">
            {archivoFotos ? archivoFotos.name : 'Elegir archivo .tar.gz...'}
            <input
              type="file"
              accept=".gz,.tar.gz"
              className="hidden"
              disabled={importar.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setArchivoFotos(file ?? null);
                setResultado(null);
              }}
            />
          </label>
          <p className="mt-1 text-[11px] text-muted">
            El archivo <code>uploads-....tar.gz</code> (misma fecha que el de arriba, tambien esta en{' '}
            <strong>Respaldos automaticos</strong>) trae las fotos. Sin este, los productos se agregan igual
            pero sin foto — se completan despues desde Productos.
          </p>
        </div>

        <Button size="sm" onClick={() => importar.mutate()} disabled={!archivo || importar.isPending}>
          <UploadCloud size={14} /> {importar.isPending ? 'Importando...' : 'Importar productos'}
        </Button>
      </div>

      {resultado && (
        <div className="mt-3 rounded-lg bg-sage-100 p-3 text-xs text-sage-700">
          <p className="font-semibold">
            {resultado.total} productos en el archivo · {resultado.agregados} agregados tal cual
            {resultado.renumerados.length > 0 && ` · ${resultado.renumerados.length} renumerados`}
            {resultado.omitidos > 0 && ` · ${resultado.omitidos} omitidos`}
          </p>
          <p className="mt-1">
            {resultado.conFoto > 0
              ? `${resultado.conFoto} de ${resultado.agregados + resultado.renumerados.length} llegaron con foto.`
              : 'Ninguno llego con foto — se completan despues desde Productos.'}
          </p>
          {resultado.renumerados.length > 0 && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-sage-600/20 pt-2">
              <p className="text-[11px] text-muted">
                Estos ya existian con ese codigo en esta base, asi que se les asigno uno nuevo:
              </p>
              {resultado.renumerados.map((r, i) => (
                <p key={i} className="flex items-center gap-1 font-mono text-[11px]">
                  {r.nombre}: {r.skuOriginal} <ArrowRight size={10} /> {r.skuNuevo}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
