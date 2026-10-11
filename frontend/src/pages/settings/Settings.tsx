import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  XCircle,
  Save,
  DatabaseBackup,
  Play,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  Image as ImageIcon,
  Globe,
  UploadCloud,
  Loader2,
  ChevronDown,
  Store,
  Users,
  KeyRound,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { apiUrl, urlConToken } from '../../lib/api';
import {
  settingsApi,
  type AppUser,
  type BackupsStatus,
  type IntegrationsStatus,
  type CrearUsuarioDto,
} from '../../api/settings.api';
import { Button, Card, PageHeader, Badge } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useAuthStore } from '../../store/auth.store';
import type { BusinessProfile } from '../../types';
import { CatalogoWeb } from './components/CatalogoWeb';
import { AgregarDatos } from './components/AgregarDatos';
import { CambiarClave } from './components/CambiarClave';
import { NewUserForm } from './components/NewUserForm';

/**
 * Seccion plegable de Configuracion. Todas arrancan cerradas menos la que se
 * marque con `abiertaPorDefecto`; al pulsar el encabezado se abre hacia abajo.
 * La animacion usa grid-template-rows 0fr/1fr, que no necesita saber el alto.
 */
function Seccion({
  titulo,
  icono: Icono,
  children,
  abiertaPorDefecto = false,
  resumen,
}: {
  titulo: string;
  icono: typeof Store;
  children: ReactNode;
  abiertaPorDefecto?: boolean;
  resumen?: string;
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-porcelain-100"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-copper-100 text-copper-700">
          <Icono size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold text-ink">{titulo}</span>
          {resumen && <span className="block truncate text-xs text-muted">{resumen}</span>}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-muted transition-transform ${abierta ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className="grid transition-all duration-200 ease-out"
        style={{ gridTemplateRows: abierta ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-porcelain-200 p-5">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: profile } = useQuery<BusinessProfile>({
    queryKey: ['settings', 'business-profile'],
    queryFn: () => settingsApi.getBusinessProfile(),
  });

  const { data: integrations } = useQuery<IntegrationsStatus>({
    queryKey: ['settings', 'integrations'],
    queryFn: () => settingsApi.getIntegrationsStatus(),
  });

  const { data: redLocal } = useQuery<{ url: string | null; certUrl: string | null }>({
    queryKey: ['settings', 'red-local'],
    queryFn: () => settingsApi.getRedLocal(),
  });

  const { data: users = [] } = useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: () => settingsApi.listUsers(),
  });

  const [form, setForm] = useState({
    nombre: '',
    direccion: '',
    identifFiscal: '',
    tasaImpuesto: '0.18',
    telefonoWhatsapp: '',
    descripcionWeb: '',
    relevoPedidosUrl: '',
    relevoPedidosClave: '',
    cloudflareApiToken: '',
    cloudflareAccountId: '',
    cloudflarePagesProject: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        nombre: profile.nombre,
        direccion: profile.direccion ?? '',
        identifFiscal: profile.identifFiscal ?? '',
        tasaImpuesto: String(profile.tasaImpuesto),
        telefonoWhatsapp: profile.telefonoWhatsapp ?? '',
        descripcionWeb: profile.descripcionWeb ?? '',
        relevoPedidosUrl: profile.relevoPedidosUrl ?? '',
        relevoPedidosClave: profile.relevoPedidosClave ?? '',
        cloudflareApiToken: profile.cloudflareApiToken ?? '',
        cloudflareAccountId: profile.cloudflareAccountId ?? '',
        cloudflarePagesProject: profile.cloudflarePagesProject ?? '',
      });
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: () => settingsApi.updateBusinessProfile(form),
    onSuccess: () => {
      toast.success('Datos del negocio actualizados.');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => {
      toast.success('Icono del negocio actualizado.');
      queryClient.invalidateQueries({ queryKey: ['settings', 'business-profile'] });
    },
    onError: () => toast.error('No se pudo subir el icono. Intenta con una imagen mas liviana.'),
  });

  const { data: backups } = useQuery<BackupsStatus>({
    queryKey: ['settings', 'backups'],
    queryFn: () => settingsApi.getBackupsStatus(),
    refetchInterval: 15000,
  });

  const runBackup = useMutation({
    mutationFn: () => settingsApi.runBackup(),
    onSuccess: (data) => {
      if (data.ok) {
        toast.success('Respaldo generado correctamente.');
      } else {
        toast.error(data.error || 'No se pudo generar el respaldo.');
      }
      queryClient.invalidateQueries({ queryKey: ['settings', 'backups'] });
    },
  });

  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const restoreBackup = useMutation({
    mutationFn: (fileName: string) => settingsApi.restoreBackup(fileName),
    onSuccess: (data) => {
      if (data.ok) {
        toast.success(
          data.restoredUploads
            ? 'Restauracion completada (base de datos y archivos).'
            : 'Restauracion completada (base de datos).',
        );
      } else {
        toast.error(data.error || 'No se pudo restaurar ese respaldo.');
      }
      setRestoreTarget(null);
    },
    onError: () => {
      toast.error('No se pudo restaurar ese respaldo.');
      setRestoreTarget(null);
    },
  });

  const createUser = useMutation({
    mutationFn: (payload: CrearUsuarioDto) => settingsApi.createUser(payload),
    onSuccess: () => {
      toast.success('Usuario creado.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => settingsApi.toggleUserActive(id, activo),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.activo ? 'Usuario activado.' : 'Usuario desactivado. Ya no podra iniciar sesion.',
      );
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message ?? 'No se pudo actualizar el usuario.';
      toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    },
  });

  return (
    <div>
      <PageHeader
        title="Configuracion"
        subtitle="Datos del negocio, usuarios, catalogo y respaldos"
        action={<IntegracionesChip whatsapp={Boolean(integrations?.whatsapp)} />}
      />

      <div className="mx-auto max-w-3xl space-y-3">
        <Seccion
          titulo="Datos del negocio"
          icono={Store}
          abiertaPorDefecto
          resumen={form.nombre || 'Nombre, direccion, impuesto e icono'}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Icono del negocio
              </label>
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-porcelain-300 bg-porcelain-100">
                  {profile?.logoUrl ? (
                    <img
                      src={urlConToken(
                        profile.logoUrl.startsWith('http') ? profile.logoUrl : apiUrl(profile.logoUrl),
                      )}
                      alt="Icono actual"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={20} className="text-muted" />
                  )}
                </div>
                <label className="cursor-pointer rounded-lg border border-porcelain-300 px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-copper-400 hover:text-copper-600">
                  {uploadLogo.isPending ? 'Subiendo...' : 'Cambiar icono'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadLogo.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo.mutate(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            <Field label="Nombre" value={form.nombre} onChange={(v) => setForm((f) => ({ ...f, nombre: v }))} />
            <Field
              label="Direccion"
              value={form.direccion}
              onChange={(v) => setForm((f) => ({ ...f, direccion: v }))}
            />
            <Field
              label="RNC / ID fiscal"
              value={form.identifFiscal}
              onChange={(v) => setForm((f) => ({ ...f, identifFiscal: v }))}
            />
            <Field
              label="Tasa de impuesto (0.18 = 18%)"
              type="number"
              value={form.tasaImpuesto}
              onChange={(v) => setForm((f) => ({ ...f, tasaImpuesto: v }))}
            />
            <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>
              <Save size={16} /> Guardar cambios
            </Button>

            {redLocal?.url && (
              <div className="border-t border-porcelain-200 pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Accede desde el celular
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  Con el celular en la misma red WiFi que esta PC, abre{' '}
                  <strong>{redLocal.url}</strong> en el navegador para usar la app (ventas,
                  productos, fotos) igual que en la computadora.
                </p>
                {redLocal.certUrl && (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    La primera vez, Chrome va a avisar "conexion no privada" — toca{' '}
                    <strong>Avanzado &rarr; Continuar</strong> (es esta misma PC). Para que ese
                    aviso no vuelva a salir y puedas instalar la app sin la barra del navegador,{' '}
                    <a
                      href={redLocal.certUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-copper-600 hover:underline"
                    >
                      descarga el certificado
                    </a>{' '}
                    desde el celular y en <strong>Ajustes &rarr; Seguridad &rarr; Cifrado y
                    credenciales &rarr; Instalar un certificado &rarr; Certificado de CA</strong>{' '}
                    elige ese archivo. Se hace una sola vez (hasta que cambie la IP de la WiFi).
                  </p>
                )}
              </div>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Usuarios y roles" icono={Users} resumen={`${users.length} usuario(s)`}>
          <div className="mb-3 divide-y divide-porcelain-200">
            {users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2 text-sm">
                <div className="min-w-0">
                  <p className={`truncate ${u.activo ? 'text-ink' : 'text-muted line-through'}`}>{u.nombre}</p>
                  <p className="truncate text-xs text-muted">{u.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!u.activo && <Badge tone="brick">Inactivo</Badge>}
                  <span className="rounded-full bg-porcelain-200 px-2 py-0.5 text-xs font-semibold text-muted">
                    {u.role}
                  </span>
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => toggleActive.mutate({ id: u.id, activo: !u.activo })}
                      disabled={toggleActive.isPending}
                      title={u.activo ? 'Desactivar (no podra iniciar sesion)' : 'Activar'}
                      className={`rounded p-1 transition-colors ${
                        u.activo
                          ? 'text-sage-600 hover:bg-brick-100 hover:text-brick-600'
                          : 'text-muted hover:bg-sage-100 hover:text-sage-600'
                      }`}
                    >
                      {u.activo ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <NewUserForm onSubmit={(payload) => createUser.mutate(payload)} />
        </Seccion>

        <Seccion
          titulo="Catalogo web"
          icono={Globe}
          resumen="Pagina publica de tus piezas + pedidos por WhatsApp"
        >
          <CatalogoWeb
            telefonoWhatsapp={form.telefonoWhatsapp}
            descripcionWeb={form.descripcionWeb}
            relevoPedidosUrl={form.relevoPedidosUrl}
            relevoPedidosClave={form.relevoPedidosClave}
            cloudflareApiToken={form.cloudflareApiToken}
            cloudflareAccountId={form.cloudflareAccountId}
            cloudflarePagesProject={form.cloudflarePagesProject}
            onChange={(campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))}
            onGuardar={() => updateProfile.mutate()}
            guardando={updateProfile.isPending}
          />
        </Seccion>

        <Seccion
          titulo="Respaldos automaticos"
          icono={DatabaseBackup}
          resumen={
            backups?.lastRun ? `Ultimo: ${formatDateTime(backups.lastRun)}` : 'Aun no se ha ejecutado'
          }
        >
          <div className="mb-3 flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runBackup.mutate()}
              disabled={runBackup.isPending}
            >
              <Play size={13} /> {runBackup.isPending ? 'Generando...' : 'Respaldar ahora'}
            </Button>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg bg-porcelain-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted">Ultimo respaldo</p>
              <p className="font-medium text-ink">
                {backups?.lastRun ? formatDateTime(backups.lastRun) : 'Aun no se ha ejecutado'}
              </p>
            </div>
            <div className="rounded-lg bg-porcelain-100 p-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted">Frecuencia</p>
              <p className="font-medium text-ink">
                Cada {backups?.intervalDays ?? 3} dias &middot; se conservan {backups?.retentionDays ?? 30}{' '}
                dias
              </p>
            </div>
          </div>
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-sage-600">
            <ShieldCheck size={13} /> Se guarda solo en disco local.
          </p>
          <p className="mb-3 text-xs text-muted">
            {backups?.copiaEnNube
              ? 'Cada respaldo se copia tambien a tu OneDrive, para que sobreviva si esta computadora falla. Abajo se listan los de ambos lugares.'
              : 'Los respaldos se guardan solo en esta computadora: no se detecto OneDrive para hacer una copia fuera de ella.'}
          </p>
          {backups?.files && backups.files.length > 0 ? (
            // overflow-hidden afuera + scroll adentro: Chrome no recorta la
            // barra de scroll a las esquinas redondeadas cuando ambos van en
            // el mismo elemento.
            <div className="max-h-64 overflow-hidden rounded-lg border border-porcelain-200">
             <div className="max-h-64 divide-y divide-porcelain-200 overflow-y-auto">
              {backups.files.slice(0, 10).map((f) => (
                <div key={f.name} className="px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {f.name.startsWith('db-') ? 'Base de datos' : 'Fotos y facturas'}
                      {' · '}
                      {formatDateTime(f.createdAt)}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          f.origen === 'nube' ? 'bg-sage-100 text-sage-700' : 'bg-porcelain-200 text-muted'
                        }`}
                      >
                        {f.origen === 'nube' ? 'OneDrive' : 'Esta PC'}
                      </span>
                      <span className="text-muted">{(f.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                      {f.name.endsWith('.sqlite.gz') && (
                        <button
                          onClick={() => setRestoreTarget(f.name)}
                          className="flex items-center gap-1 rounded-md border border-porcelain-300 px-1.5 py-0.5 text-[11px] font-semibold text-muted transition-colors hover:border-brick-400 hover:text-brick-600"
                        >
                          <RotateCcw size={11} /> Restaurar
                        </button>
                      )}
                      {f.name.startsWith('db-') && !f.name.endsWith('.sqlite.gz') && (
                        <span className="text-[10px] italic text-muted">formato anterior</span>
                      )}
                    </div>
                  </div>
                  {f.contenido && (
                    <p className="mt-0.5 text-[11px] text-muted">
                      {f.contenido.productos.toLocaleString('es-DO')} productos ·{' '}
                      {f.contenido.clientes.toLocaleString('es-DO')} clientes ·{' '}
                      {f.contenido.ventas.toLocaleString('es-DO')} ventas ·{' '}
                      {f.contenido.facturas.toLocaleString('es-DO')} facturas
                    </p>
                  )}
                </div>
              ))}
             </div>
            </div>
          ) : (
            <p className="text-xs text-muted">Sin respaldos generados todavia.</p>
          )}
        </Seccion>

        <Seccion
          titulo="Añadir datos de otra PC"
          icono={UploadCloud}
          resumen="Traer el inventario de la computadora de otra persona"
        >
          <AgregarDatos />
        </Seccion>

        <Seccion titulo="Cambiar mi clave" icono={KeyRound} resumen="Contraseña de tu propio usuario">
          <CambiarClave />
        </Seccion>
      </div>

      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          {/* El scroll va en el div de adentro, no en el Card: Chrome no
              recorta la barra de scroll a las esquinas redondeadas cuando
              overflow y border-radius estan en el mismo elemento. */}
          <Card className="max-h-[90vh] w-full max-w-sm overflow-hidden">
            <div className="max-h-[90vh] overflow-y-auto p-5">
            <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-brick-600">
              <AlertTriangle size={16} /> Restaurar respaldo
            </h3>
            <p className="mb-1 text-sm text-ink">
              Vas a restaurar el punto <span className="font-mono text-xs">{restoreTarget}</span>.
            </p>
            <p className="mb-4 text-xs text-muted">
              Esto reemplaza los datos actuales (ventas, clientes, productos) por los del respaldo. No se
              puede deshacer. Si quieres conservar lo que hay ahora, genera un respaldo antes de continuar.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRestoreTarget(null)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="!bg-brick-600 hover:!bg-brick-700"
                disabled={restoreBackup.isPending}
                onClick={() => restoreBackup.mutate(restoreTarget)}
              >
                {restoreBackup.isPending ? 'Restaurando...' : 'Si, restaurar'}
              </Button>
            </div>
            </div>
          </Card>
        </div>
      )}

      {restoreBackup.isPending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/60 p-4">
          <Card className="w-full max-w-sm p-6 text-center">
            <Loader2 size={32} className="mx-auto mb-3 animate-spin text-copper-600" />
            <h3 className="mb-1 font-display text-sm font-bold text-ink">Restaurando respaldo...</h3>
            <p className="text-xs text-muted">
              No cierres el programa ni hagas nada mas mientras termina. Esto toma unos segundos.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Estado de integraciones — va en la esquina del encabezado, no es una configuracion. */
function IntegracionesChip({ whatsapp }: { whatsapp: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        whatsapp ? 'bg-sage-100 text-sage-700' : 'bg-brick-100 text-brick-600'
      }`}
      title="Agente de WhatsApp Desktop"
    >
      {whatsapp ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      WhatsApp {whatsapp ? 'conectado' : 'sin conectar'}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</label>
      <input
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-porcelain-300 px-3 py-2 text-sm outline-none focus:border-copper-500"
      />
    </div>
  );
}

