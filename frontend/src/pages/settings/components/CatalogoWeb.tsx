import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save, Globe } from 'lucide-react';
import { Button } from '../../../components/ui';
import { settingsApi } from '../../../api/settings.api';

/**
 * Catalogo web: datos que solo usa el sitio publico y el boton que lo genera.
 */
export function CatalogoWeb({
  telefonoWhatsapp,
  descripcionWeb,
  relevoPedidosUrl,
  relevoPedidosClave,
  cloudflareApiToken,
  cloudflareAccountId,
  cloudflarePagesProject,
  onChange,
  onGuardar,
  guardando,
}: {
  telefonoWhatsapp: string;
  descripcionWeb: string;
  relevoPedidosUrl: string;
  relevoPedidosClave: string;
  cloudflareApiToken: string;
  cloudflareAccountId: string;
  cloudflarePagesProject: string;
  onChange: (
    campo:
      | 'telefonoWhatsapp'
      | 'descripcionWeb'
      | 'relevoPedidosUrl'
      | 'relevoPedidosClave'
      | 'cloudflareApiToken'
      | 'cloudflareAccountId'
      | 'cloudflarePagesProject',
    valor: string,
  ) => void;
  onGuardar: () => void;
  guardando: boolean;
}) {
  const [resultado, setResultado] = useState<{
    carpeta: string;
    productos: number;
    excluidasSinFoto: number;
    excluidasSinPrecio: number;
    cloudflare?: 'sin-configurar' | 'sin-cambios' | 'publicado' | 'error';
    cloudflareUrl?: string;
    cloudflareError?: string;
  } | null>(null);

  const generar = useMutation({
    mutationFn: () => settingsApi.generarCatalogo(),
    onSuccess: (data) => {
      if (data.ok) {
        setResultado({
          carpeta: data.carpeta,
          productos: data.productos,
          excluidasSinFoto: data.excluidasSinFoto ?? 0,
          excluidasSinPrecio: data.excluidasSinPrecio ?? 0,
          cloudflare: data.cloudflare,
          cloudflareUrl: data.cloudflareUrl,
          cloudflareError: data.cloudflareError,
        });
        if (data.cloudflare === 'publicado' || data.cloudflare === 'sin-cambios') {
          toast.success('Catalogo generado y publicado en linea.');
        } else if (data.cloudflare === 'error') {
          toast.error(`Catalogo generado, pero no se pudo publicar: ${data.cloudflareError ?? ''}`);
        } else {
          toast.success(`Catalogo generado con ${data.productos} piezas.`);
        }
      } else {
        toast.error(data.error || 'No se pudo generar el catalogo.');
      }
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo generar el catalogo.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Genera una pagina publica con tus piezas. Los clientes arman su pedido y te llega por WhatsApp; el
        cobro lo coordinas tu por transferencia.
      </p>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            WhatsApp para pedidos *
          </label>
          <input
            value={telefonoWhatsapp}
            onChange={(e) => onChange('telefonoWhatsapp', e.target.value)}
            placeholder="+1 809 555 1234"
            className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            Frase del negocio
          </label>
          <input
            value={descripcionWeb}
            onChange={(e) => onChange('descripcionWeb', e.target.value)}
            placeholder="Joyeria fina · Envios a todo el pais"
            className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
          />
        </div>

        <div className="border-t border-porcelain-200 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Pedidos web automaticos (opcional)
          </p>
          <p className="mb-2 text-xs text-muted">
            Sin esto, los pedidos siguen llegando por WhatsApp igual — solo hay que pegar el mensaje en
            Pedidos web. Con esto puesto, la app los revisa y los crea sola cada pocos minutos.
          </p>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                URL del relevo
              </label>
              <input
                value={relevoPedidosUrl}
                onChange={(e) => onChange('relevoPedidosUrl', e.target.value)}
                placeholder="https://cafe-shopping-pedidos.tu-usuario.workers.dev"
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Clave secreta del relevo
              </label>
              <input
                type="password"
                value={relevoPedidosClave}
                onChange={(e) => onChange('relevoPedidosClave', e.target.value)}
                placeholder="La misma que pusiste en Cloudflare"
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-porcelain-200 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Publicar el catalogo solo (opcional)
          </p>
          <p className="mb-2 text-xs leading-relaxed text-muted">
            Con esto puesto, cada vez que algo cambia (una pieza se agota, cambia un precio,
            entra una pieza nueva) la app <strong>sube el catalogo a Cloudflare Pages sola</strong> —
            no hay que volver a arrastrar el folder. Es gratis y es la misma cuenta de{' '}
            <strong>Cloudflare</strong> del relevo de pedidos, si ya la tienes.
          </p>
          <ol className="mb-3 list-inside list-decimal space-y-1 text-xs leading-relaxed text-muted">
            <li>
              En Cloudflare: <strong>Workers &amp; Pages &rarr; Create &rarr; Pages &rarr; Upload assets</strong>,
              dale un nombre (ese nombre es el <strong>Project name</strong> de abajo) y sube cualquier
              archivo para crearlo — la app se encarga de reemplazarlo despues.
            </li>
            <li>
              <strong>dash.cloudflare.com &rarr; tu cuenta &rarr; API Tokens &rarr; Create Token</strong>{' '}
              (Custom Token) con permiso <strong>Account &rarr; Cloudflare Pages &rarr; Edit</strong>.
            </li>
            <li>
              El <strong>Account ID</strong> esta en la misma pagina de Overview, a la derecha.
            </li>
          </ol>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Token de API de Cloudflare
              </label>
              <input
                type="password"
                value={cloudflareApiToken}
                onChange={(e) => onChange('cloudflareApiToken', e.target.value)}
                placeholder="Token con permiso Cloudflare Pages: Edit"
                autoComplete="off"
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Account ID de Cloudflare
              </label>
              <input
                value={cloudflareAccountId}
                onChange={(e) => onChange('cloudflareAccountId', e.target.value)}
                placeholder="El de la pagina Overview de tu cuenta"
                autoComplete="off"
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Nombre del proyecto de Pages
              </label>
              <input
                value={cloudflarePagesProject}
                onChange={(e) => onChange('cloudflarePagesProject', e.target.value)}
                placeholder="mi-catalogo"
                autoComplete="off"
                className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-porcelain-200 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Punto de venta desde el catalogo (opcional)
          </p>
          <p className="text-xs leading-relaxed text-muted">
            En la pagina del catalogo, manteniendo pulsado el boton <strong>Filtros</strong> por 2
            segundos aparece un cuadro para una clave. Con esa clave, el personal puede registrar una
            venta real desde el celular y esa venta cae sola en la app (factura, stock, y deuda si es
            a credito), a nombre del usuario <strong>Ventas web</strong>.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            La clave del punto de venta es <strong>otro secreto de Cloudflare</strong>, aparte de la
            de arriba: en tu Worker <code>cafe-shopping-pedidos</code> &rarr;{' '}
            <strong>Settings &rarr; Variables and Secrets &rarr; Add</strong>, nombre{' '}
            <code>CLAVE_POS</code>, tipo Secret. La pide de nuevo en cada recarga de la pagina o
            pasados 5 minutos. Sin ese secreto puesto, el punto de venta simplemente no funciona.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onGuardar} disabled={guardando}>
            <Save size={15} /> Guardar datos
          </Button>
          <Button onClick={() => generar.mutate()} disabled={generar.isPending || !telefonoWhatsapp.trim()}>
            <Globe size={15} /> {generar.isPending ? 'Generando...' : 'Generar catalogo'}
          </Button>
        </div>

        {resultado && (
          <div
            className={`rounded-lg p-3 text-xs ${
              resultado.cloudflare === 'error'
                ? 'bg-brick-100 text-brick-700'
                : 'bg-sage-100 text-sage-700'
            }`}
          >
            <p className="font-semibold">Catalogo listo con {resultado.productos} piezas.</p>

            {(resultado.cloudflare === 'publicado' || resultado.cloudflare === 'sin-cambios') && (
              <p className="mt-2">
                Ya esta en linea.{' '}
                {resultado.cloudflareUrl && (
                  <a
                    href={resultado.cloudflareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline"
                  >
                    Abrir el catalogo
                  </a>
                )}{' '}
                Desde ahora se actualiza solo con cada venta o cambio.
              </p>
            )}

            {resultado.cloudflare === 'error' && (
              <p className="mt-2">
                No se pudo publicar en Cloudflare Pages: {resultado.cloudflareError}. El catalogo
                quedo en la carpeta <code className="break-all">{resultado.carpeta}</code> — puedes
                subirlo a mano en <strong>app.netlify.com/drop</strong> mientras tanto.
              </p>
            )}

            {(!resultado.cloudflare || resultado.cloudflare === 'sin-configurar') && (
              <>
                <p className="mt-1 break-all">
                  Carpeta: <code>{resultado.carpeta}</code>
                </p>
                <p className="mt-2">
                  Para ponerlo en linea gratis: entra a <strong>app.netlify.com/drop</strong> y
                  arrastra esa carpeta completa a la pagina. Te dara una direccion al instante. (O
                  llena arriba el token, el Account ID y el proyecto de Cloudflare Pages para que
                  se suba solo.)
                </p>
              </>
            )}

            {(resultado.excluidasSinFoto > 0 || resultado.excluidasSinPrecio > 0) && (
              <p className="mt-2 border-t border-sage-600/20 pt-2 text-brick-600">
                Quedaron fuera{' '}
                {resultado.excluidasSinFoto > 0 && (
                  <strong>{resultado.excluidasSinFoto} piezas sin foto</strong>
                )}
                {resultado.excluidasSinFoto > 0 && resultado.excluidasSinPrecio > 0 && ' y '}
                {resultado.excluidasSinPrecio > 0 && <strong>{resultado.excluidasSinPrecio} sin precio</strong>}
                . Completalas en Productos y vuelve a generar para incluirlas.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
