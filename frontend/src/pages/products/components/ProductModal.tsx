import { useRef, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Plus, ImagePlus, Eye, Copy, X, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { usePersistedState } from '../../../lib/usePersistedState';
import { Button, Card } from '../../../components/ui';
import type { ProductFormValues } from '../../../api/products.api';
import type { Material } from '../../../types';
import { MATERIAL_LABEL } from '../../../types';
import { MATERIAL_COLOR } from '../materialColor';

export function ProductModal({
  title,
  submitLabel,
  isPending,
  initial,
  currentImage,
  persistKey,
  onClose,
  onSubmit,
  activo = true,
  onDelete,
  onRestore,
  bajaPendiente = false,
}: {
  title: string;
  submitLabel: string;
  isPending: boolean;
  initial?: ProductFormValues;
  currentImage?: string | null;
  persistKey: string;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => void;
  activo?: boolean;
  /** Solo se pasa a un ADMIN: sin esto no se dibuja el boton. */
  onDelete?: () => void;
  onRestore?: () => void;
  bajaPendiente?: boolean;
}) {
  // Pide confirmar dentro del mismo modal en vez de un window.confirm: el
  // primer clic solo arma el boton, el segundo es el que da de baja.
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const [nuevaTalla, setNuevaTalla] = useState('');
  // Solo los campos de texto se guardan como borrador: un File no se puede
  // serializar, y aunque se pudiera, "recordar" un archivo que el usuario ya
  // no ve seleccionado seria mas confuso que util. La foto se vuelve a elegir.
  const { file: _initialFile, ...initialTexto } = initial ?? {
    nombre: '',
    precioUnitario: '',
    costoUnitario: '',
    material: 'OTRO' as Material,
    stock: '',
    tallas: [] as string[],
    file: null,
  };
  // El borrador persistido solo tiene sentido al CREAR: no hay "version del
  // servidor" que perder. Al EDITAR si se usara igual, abrir el mismo
  // producto de nuevo restauraria un borrador viejo (o vacio, si se cerro el
  // formulario a medio escribir) por encima de sus datos reales y actuales
  // -sin avisar-, y eso es lo que mandaba precio/costo/stock invalidos al
  // guardar. Al editar, useState arranca siempre desde el producto real.
  const persisted = usePersistedState(persistKey, initialTexto);
  const local = useState(initialTexto);
  const [texto, setTexto] = initial ? local : persisted;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);
  const [menuFoto, setMenuFoto] = useState(false);
  const [viendoFoto, setViendoFoto] = useState(false);

  const form: ProductFormValues = { ...texto, file };
  const setForm = (updater: (f: ProductFormValues) => ProductFormValues) => {
    const { file: nuevoFile, ...resto } = updater(form);
    setTexto(resto);
    if (nuevoFile !== file) setFile(nuevoFile);
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim() || !Number(form.precioUnitario)) {
      toast.error('Completa el nombre y un precio valido.');
      return;
    }
    onSubmit(form);
  }

  function handleFile(nuevo: File | null) {
    setFile(nuevo);
    setPreview(nuevo ? URL.createObjectURL(nuevo) : null);
  }

  function agregarTalla() {
    const v = nuevaTalla.trim();
    setNuevaTalla('');
    if (!v) return;
    if (form.tallas.some((t) => t.toLowerCase() === v.toLowerCase())) return;
    if (form.tallas.length >= 40) {
      toast.error('Maximo 40 sizes por pieza.');
      return;
    }
    setForm((f) => ({ ...f, tallas: [...f.tallas, v] }));
  }
  function quitarTalla(talla: string) {
    setForm((f) => ({ ...f, tallas: f.tallas.filter((t) => t !== talla) }));
  }

  const photoToShow = preview ?? currentImage ?? null;
  // Al EDITAR una pieza que ya tiene foto, picar la casilla ofrece elegir
  // entre cambiarla o verla; sin foto (o al crear) solo hay una cosa que
  // hacer, asi que abre directo el selector de archivos.
  const ofreceVerFoto = !!initial && !!photoToShow;

  // El portapapeles del navegador solo acepta image/png de forma fiable; las
  // fotos guardadas suelen ser webp/jpg, asi que se redibujan a PNG antes.
  async function copiarFoto() {
    if (!photoToShow) return;
    try {
      const blob = await (await fetch(photoToShow)).blob();
      let png = blob;
      if (blob.type !== 'image/png') {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('sin imagen'))), 'image/png'),
        );
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast.success('Foto copiada al portapapeles.');
    } catch {
      toast.error('No se pudo copiar la foto en este dispositivo.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
      {/* El scroll va en el div de adentro, no en el Card: Chrome no recorta
          la barra de scroll a las esquinas redondeadas cuando overflow y
          border-radius estan en el mismo elemento. */}
      <Card className="max-h-[90vh] w-full max-w-sm overflow-hidden">
        <div className="max-h-[90vh] overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:bg-porcelain-200">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Foto</label>
            <div className="relative h-32 w-full overflow-hidden rounded-lg border border-dashed border-porcelain-300 bg-porcelain-100">
              <button
                type="button"
                onClick={() => (ofreceVerFoto ? setMenuFoto(true) : inputFoto.current?.click())}
                className="flex h-full w-full cursor-pointer items-center justify-center"
              >
                {photoToShow ? (
                  <img src={photoToShow} alt="Vista previa" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-muted">
                    <ImagePlus size={22} />
                    <span className="text-xs">Subir foto</span>
                  </span>
                )}
              </button>
              <input
                ref={inputFoto}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {menuFoto && (
                <div
                  className="absolute inset-0 flex flex-wrap items-center justify-center gap-2 bg-espresso-950/60 p-2"
                  onClick={() => setMenuFoto(false)}
                >
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFoto(false);
                      inputFoto.current?.click();
                    }}
                  >
                    <ImagePlus size={15} /> Agregar foto
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFoto(false);
                      setViendoFoto(true);
                    }}
                  >
                    <Eye size={15} /> Ver foto
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFoto(false);
                      void copiarFoto();
                    }}
                  >
                    <Copy size={15} /> Copiar foto
                  </Button>
                </div>
              )}
            </div>
          </div>
          {!initial && (
            <p className="text-xs text-muted">
              El codigo (SKU) se genera automaticamente a partir del nombre, por ejemplo{' '}
              <span className="font-mono">AN-0001</span> para "Anillo...".
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Nombre *</label>
            <input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Anillo oro 18k con zafiro"
              className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Precio *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.precioUnitario}
                onChange={(e) => setForm((f) => ({ ...f, precioUnitario: e.target.value }))}
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Stock</label>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Costo de adquisicion
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.costoUnitario}
              onChange={(e) => setForm((f) => ({ ...f, costoUnitario: e.target.value }))}
              placeholder="0.00"
              className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
            />
            <p className="mt-1 text-[11px] text-muted">
              Solo lo ves tu (ADMIN). Se usa para calcular el margen en el apartado de Costos.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Material</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(MATERIAL_LABEL) as Material[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, material: m }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.material === m
                      ? `text-white ${MATERIAL_COLOR[m]}`
                      : 'bg-porcelain-200 text-muted hover:bg-porcelain-300'
                  }`}
                >
                  {MATERIAL_LABEL[m]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Se usa para el filtro del catalogo web y la insignia sobre la foto.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Sizes / medidas
            </label>
            {form.tallas.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.tallas.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-copper-100 px-2.5 py-1 text-xs font-semibold text-copper-700"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => quitarTalla(t)}
                      className="rounded-full p-0.5 hover:bg-copper-200"
                      aria-label={`Quitar size ${t}`}
                    >
                      <X size={11} strokeWidth={3} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={nuevaTalla}
                onChange={(e) => setNuevaTalla(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    agregarTalla();
                  }
                }}
                placeholder='Ej. 6, 7, 8  o  45 cm'
                maxLength={20}
                className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              />
              <Button type="button" variant="secondary" size="sm" onClick={agregarTalla}>
                <Plus size={14} />
                Agregar
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Si la pieza tiene sizes, el cliente elige uno en el catalogo web antes de pedirla. Dejalo vacio si no aplica.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Guardando...' : submitLabel}
          </Button>
        </form>

        {!activo && onRestore && (
          <div className="mt-4 border-t border-porcelain-200 pt-3">
            <p className="mb-2 text-xs text-muted">
              Esta pieza esta dada de baja: no se puede vender y no aparece en el catalogo web.
            </p>
            <Button variant="secondary" className="w-full" disabled={bajaPendiente} onClick={onRestore}>
              {bajaPendiente ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              Reactivar pieza
            </Button>
          </div>
        )}

        {activo && onDelete && (
          <div className="mt-4 border-t border-porcelain-200 pt-3">
            {confirmandoBaja ? (
              <>
                <p className="mb-2 text-xs text-muted">
                  Deja de venderse y sale del catalogo web. Las facturas donde ya aparece no cambian, y puedes
                  reactivarla despues.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => setConfirmandoBaja(false)}>
                    Cancelar
                  </Button>
                  <Button variant="danger" className="flex-1" disabled={bajaPendiente} onClick={onDelete}>
                    {bajaPendiente ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    Si, dar de baja
                  </Button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoBaja(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium text-brick-500 hover:bg-brick-100"
              >
                <Trash2 size={15} /> Eliminar pieza
              </button>
            )}
          </div>
        )}
        </div>
      </Card>

      {viendoFoto && photoToShow && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-espresso-950/85 p-4"
          onClick={() => setViendoFoto(false)}
        >
          <button
            type="button"
            onClick={() => setViendoFoto(false)}
            aria-label="Cerrar foto"
            className="absolute right-4 top-4 rounded-full bg-porcelain-100 p-2 text-ink shadow-neu-sm"
          >
            <X size={18} />
          </button>
          <img src={photoToShow} alt="Foto de la pieza" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}
