import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, List, Plus, Search, Truck, Store } from 'lucide-react';
import { encargosApi } from '../../api/encargos.api';
import { useAuthStore } from '../../store/auth.store';
import { ESTADO_ENCARGO_LABEL, fechaLocal, formatDate, formatMoney, formatTime } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, Tabs } from '../../components/ui';
import { usePaginacion } from '../../lib/usePaginacion';
import { Paginador } from '../../components/Paginador';
import { EncargoForm } from './EncargoForm';
import { EncargoDetalle } from './EncargoDetalle';
import { TONO_ESTADO, URGENCIA } from './estilos';
import type { Encargo } from '../../types';

type Vista = 'LISTA' | 'CALENDARIO';
type Filtro = 'ACTIVOS' | 'ENTREGADO' | 'CANCELADO' | '';

const DIAS_SEMANA = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

/**
 * Encargos de clientes: pasteles personalizados, pedidos para fiestas... Se
 * toman con anticipo, pasan por produccion y al entregarse se convierten en
 * venta con su factura.
 */
export default function Encargos() {
  const puedeCrear = useAuthStore((s) => s.user?.role !== 'REPOSTERO');
  const [params, setParams] = useSearchParams();
  const [vista, setVista] = useState<Vista>('LISTA');
  const [filtro, setFiltro] = useState<Filtro>('ACTIVOS');
  const [q, setQ] = useState('');
  const [creando, setCreando] = useState(false);
  const abiertoId = params.get('id');

  function abrir(id: string | null) {
    const nuevos = new URLSearchParams(params);
    if (id) nuevos.set('id', id);
    else nuevos.delete('id');
    setParams(nuevos, { replace: true });
  }

  const { data: encargos = [], isLoading } = useQuery<Encargo[]>({
    queryKey: ['encargos', 'lista', filtro, q],
    queryFn: () => encargosApi.list({ estado: filtro || undefined, q: q || undefined }),
    enabled: vista === 'LISTA',
  });
  const pag = usePaginacion(encargos, [filtro, q]);

  return (
    <div>
      <PageHeader
        title="Encargos"
        subtitle="Pedidos de clientes: personalizacion, anticipos, entrega y calendario"
        action={
          puedeCrear && (
            <Button size="sm" onClick={() => setCreando(true)}>
              <Plus size={16} /> Nuevo encargo
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs
          value={vista}
          onChange={setVista}
          opciones={[
            {
              valor: 'LISTA',
              texto: (
                <span className="flex items-center gap-1.5">
                  <List size={13} /> Lista
                </span>
              ),
            },
            {
              valor: 'CALENDARIO',
              texto: (
                <span className="flex items-center gap-1.5">
                  <CalendarDays size={13} /> Calendario
                </span>
              ),
            },
          ]}
        />
        {vista === 'LISTA' && (
          <>
            <Tabs
              value={filtro}
              onChange={setFiltro}
              opciones={[
                { valor: 'ACTIVOS', texto: 'Por entregar' },
                { valor: 'ENTREGADO', texto: 'Entregados' },
                { valor: 'CANCELADO', texto: 'Cancelados' },
                { valor: '', texto: 'Todos' },
              ]}
            />
            <div className="buscador ml-auto max-w-xs flex-1 !py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, telefono o codigo..." />
            </div>
          </>
        )}
      </div>

      {vista === 'CALENDARIO' ? (
        <Calendario onAbrir={abrir} />
      ) : isLoading ? (
        <Skeleton />
      ) : encargos.length === 0 ? (
        <EmptyState
          title="Sin encargos"
          description={filtro === 'ACTIVOS' ? 'No hay encargos pendientes de entregar.' : undefined}
        />
      ) : (
        <div className="space-y-2">
          {pag.visibles.map((e) => (
            <FilaEncargo key={e.id} encargo={e} onClick={() => abrir(e.id)} />
          ))}
        </div>
      )}
      {vista === 'LISTA' && <Paginador p={pag} etiqueta="encargos" />}

      {creando && <EncargoForm onClose={() => setCreando(false)} onCreado={(id) => abrir(id)} />}
      {abiertoId && <EncargoDetalle id={abiertoId} onClose={() => abrir(null)} />}
    </div>
  );
}

export function FilaEncargo({ encargo: e, onClick }: { encargo: Encargo; onClick: () => void }) {
  const urg = URGENCIA[e.urgencia];
  return (
    <Card
      onClick={onClick}
      className={`flex cursor-pointer flex-wrap items-center gap-3 p-4 transition-shadow hover:shadow-neu-sm ${
        e.urgencia === 'ATRASADO' ? 'ring-1 ring-brick-500/50' : ''
      }`}
    >
      <div className="w-24 shrink-0 text-center">
        <p className="font-display text-lg font-bold leading-none text-ink">{formatDate(e.fechaEntrega).split(' ').slice(0, 2).join(' ')}</p>
        <p className="mt-1 text-xs text-muted">{formatTime(e.fechaEntrega)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-copper-600">{e.codigo}</span>
          <Badge tone={TONO_ESTADO[e.estado]}>{ESTADO_ENCARGO_LABEL[e.estado]}</Badge>
          {urg && (
            <Badge tone={urg.tone}>
              {e.urgencia === 'ATRASADO' && <AlertTriangle size={11} className="mr-1" />}
              {urg.texto}
            </Badge>
          )}
        </div>
        <p className="mt-1 truncate font-medium text-ink">{e.client.nombre}</p>
        <p className="truncate text-xs text-muted">{e.items.map((i) => `${i.cantidad} × ${i.descripcion}`).join(', ')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4 text-right">
        <span className="hidden text-muted sm:block" title={e.tipoEntrega === 'DOMICILIO' ? 'Entrega a domicilio' : 'Retiro en tienda'}>
          {e.tipoEntrega === 'DOMICILIO' ? <Truck size={16} /> : <Store size={16} />}
        </span>
        <div>
          <p className="font-display font-bold tabular-nums text-ink">{formatMoney(e.total)}</p>
          {e.estado !== 'CANCELADO' && (
            <p className={`text-xs tabular-nums ${e.saldo > 0 ? 'text-brick-600' : 'text-sage-600'}`}>
              {e.saldo > 0 ? `Saldo ${formatMoney(e.saldo)}` : 'Pagado'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Calendario({ onAbrir }: { onAbrir: (id: string) => void }) {
  const hoy = new Date();
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [diaSel, setDiaSel] = useState<string>(fechaLocal());

  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const fin = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  const { data: encargos = [], isLoading } = useQuery<Encargo[]>({
    queryKey: ['encargos', 'calendario', fechaLocal(inicio)],
    queryFn: () => encargosApi.list({ from: fechaLocal(inicio), to: fechaLocal(fin) }),
  });

  const porDia = useMemo(() => {
    const mapa = new Map<string, Encargo[]>();
    for (const e of encargos) {
      if (e.estado === 'CANCELADO') continue;
      const k = fechaLocal(new Date(e.fechaEntrega));
      mapa.set(k, [...(mapa.get(k) ?? []), e]);
    }
    return mapa;
  }, [encargos]);

  // Semana empieza el lunes: getDay() da 0 = domingo.
  const huecos = (inicio.getDay() + 6) % 7;
  const celdas: (Date | null)[] = [
    ...Array.from({ length: huecos }, () => null),
    ...Array.from({ length: fin.getDate() }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1)),
  ];
  const delDia = porDia.get(diaSel) ?? [];
  const hoyKey = fechaLocal();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} className="rounded-lg p-1.5 text-muted shadow-neu-sm hover:text-ink">
            <ChevronLeft size={18} />
          </button>
          <p className="font-display font-bold capitalize text-ink">
            {mes.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })}
          </p>
          <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} className="rounded-lg p-1.5 text-muted shadow-neu-sm hover:text-ink">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        {isLoading ? (
          <Skeleton className="h-72" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((d, i) => {
              if (!d) return <div key={`h${i}`} />;
              const k = fechaLocal(d);
              const lista = porDia.get(k) ?? [];
              const atrasado = lista.some((e) => e.urgencia === 'ATRASADO');
              return (
                <button
                  key={k}
                  onClick={() => setDiaSel(k)}
                  className={`flex min-h-[64px] flex-col items-start rounded-lg p-1.5 text-left text-xs transition-all ${
                    diaSel === k ? 'shadow-neu-inset ring-2 ring-copper-500/40' : 'hover:bg-porcelain-200'
                  }`}
                >
                  <span className={`font-semibold ${k === hoyKey ? 'rounded-full bg-copper-500 px-1.5 text-white' : 'text-ink'}`}>{d.getDate()}</span>
                  {lista.length > 0 && (
                    <span
                      className={`mt-auto w-full rounded px-1 py-0.5 text-center text-[10px] font-bold ${
                        atrasado ? 'bg-brick-100 text-brick-600' : 'bg-copper-100 text-copper-700'
                      }`}
                    >
                      {lista.length} encargo{lista.length === 1 ? '' : 's'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <div>
        <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted">
          {formatDate(`${diaSel}T12:00:00`)}
        </h3>
        {delDia.length === 0 ? (
          <EmptyState title="Sin encargos este dia" />
        ) : (
          <div className="space-y-2">
            {delDia.map((e) => (
              <Card key={e.id} onClick={() => onAbrir(e.id)} className="cursor-pointer p-3 hover:shadow-neu-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{formatTime(e.fechaEntrega)}</span>
                  <Badge tone={TONO_ESTADO[e.estado]}>{ESTADO_ENCARGO_LABEL[e.estado]}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink">{e.client.nombre}</p>
                <p className="truncate text-xs text-muted">{e.items.map((i) => `${i.cantidad} × ${i.descripcion}`).join(', ')}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
