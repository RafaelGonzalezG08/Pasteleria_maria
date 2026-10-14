import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ShoppingCart,
  CakeSlice,
  Users,
  Receipt,
  Wallet,
  BarChart3,
  History,
  PiggyBank,
  ClipboardList,
  Settings,
  LogOut,
  HandCoins,
  Moon,
  Sun,
  X,
  Menu,
  Wheat,
  ChefHat,
  Factory,
  Truck,
} from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { api, apiUrl, urlConToken } from '../lib/api';
import { useTheme } from '../lib/useTheme';
import { useCierrePorInactividad } from '../lib/useCierrePorInactividad';
import { Button, Card } from './ui';
import { setMoneda } from '../lib/format';
import { ROLE_LABEL, type BusinessProfile, type Role } from '../types';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pos', label: 'Punto de venta', icon: ShoppingCart, roles: ['ADMIN', 'CAJERO'] },
  { to: '/encargos', label: 'Encargos', icon: ClipboardList },
  { to: '/productos', label: 'Productos', icon: CakeSlice },
  { to: '/produccion', label: 'Produccion', icon: Factory, roles: ['ADMIN', 'REPOSTERO'] },
  { to: '/recetas', label: 'Recetas', icon: ChefHat, roles: ['ADMIN', 'REPOSTERO'] },
  { to: '/inventario', label: 'Inventario', icon: Wheat, roles: ['ADMIN', 'REPOSTERO'] },
  { to: '/compras', label: 'Compras', icon: Truck, roles: ['ADMIN'] },
  { to: '/ventas', label: 'Ventas', icon: Receipt, roles: ['ADMIN', 'CAJERO'] },
  { to: '/cobros', label: 'Cobros', icon: HandCoins, roles: ['ADMIN', 'CAJERO'] },
  { to: '/clientes', label: 'Clientes', icon: Users, roles: ['ADMIN', 'CAJERO'] },
  { to: '/gastos', label: 'Gastos', icon: Wallet, roles: ['ADMIN'] },
  { to: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['ADMIN'] },
  { to: '/transacciones', label: 'Transacciones', icon: History, roles: ['ADMIN'] },
  { to: '/costos', label: 'Costos', icon: PiggyBank, roles: ['ADMIN'] },
];

/** Solo ADMIN administra la configuracion del negocio. */
const ROLES_CONFIGURACION: Role[] = ['ADMIN'];

export function Layout() {
  const { user, logout } = useAuthStore();
  const { esOscuro, alternar } = useTheme();
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);
  /** En ventana angosta el menu lateral empieza escondido; en ancho normal (md+) siempre se ve. */
  const [menuAbierto, setMenuAbierto] = useState(false);
  useCierrePorInactividad();

  const { data: profile } = useQuery<BusinessProfile>({
    queryKey: ['settings', 'business-profile'],
    queryFn: async () => (await api.get('/settings/business-profile')).data,
    staleTime: 60_000,
  });

  // La moneda de Configuracion se aplica a todos los montos de la app.
  useEffect(() => setMoneda(profile?.moneda), [profile?.moneda]);

  const visibleItems = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));
  const puedeVerConfiguracion = Boolean(user && ROLES_CONFIGURACION.includes(user.role));
  const logoSrc = profile?.logoUrl
    ? urlConToken(profile.logoUrl.startsWith('http') ? profile.logoUrl : apiUrl(profile.logoUrl))
    : null;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-porcelain-100">
      <div className="flex flex-1 overflow-hidden">
      {/* Fondo oscuro detras del menu en ventana angosta; tocarlo lo cierra. */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-20 bg-espresso-950/50 md:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex h-dvh w-72 shrink-0 flex-col bg-porcelain-side text-ink shadow-[8px_0_24px_-16px_rgba(20,10,16,0.35)] transition-transform duration-200 md:static md:translate-x-0 ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className="flex shrink-0 items-center gap-2.5 px-5 pb-5"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-copper-400 to-copper-600 shadow-neu-sm">
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <CakeSlice size={18} strokeWidth={2.25} className="text-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold leading-none tracking-tight text-ink">
              {profile?.nombre || 'Rosa Delicias'}
            </p>
            <p className="mt-1 font-lema text-[13px] italic leading-none text-sage-600">
              hecho con cariño
            </p>
          </div>
          <button
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menu"
            className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-porcelain-200 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2">
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMenuAbierto(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-porcelain-side text-copper-700 shadow-neu-inset'
                    : 'text-muted hover:text-ink'
                }`
              }
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div
          className="mx-3 mt-2 shrink-0 border-t border-porcelain-300 px-0 pt-3"
          style={{ marginBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-porcelain-side px-3 py-2 shadow-neu-inset">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-copper-400 to-copper-600 font-display text-xs font-bold text-white">
              {user?.nombre?.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user?.nombre}</p>
              <p className="truncate text-[11px] uppercase tracking-wide text-muted">{user ? ROLE_LABEL[user.role] ?? user.role : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmandoSalir(true)}
              className="flex flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-all hover:text-brick-600 active:shadow-neu-pressed"
            >
              <LogOut size={17} strokeWidth={2} />
              Cerrar sesion
            </button>
            <button
              onClick={alternar}
              title={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              aria-label={esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="flex shrink-0 items-center justify-center rounded-xl p-2.5 text-muted shadow-neu-sm transition-all hover:text-ink active:shadow-neu-pressed"
            >
              {esOscuro ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
            </button>
            {puedeVerConfiguracion && (
              <NavLink
                to="/configuracion"
                title="Configuracion"
                onClick={() => setMenuAbierto(false)}
                className={({ isActive }) =>
                  `flex shrink-0 items-center justify-center rounded-xl p-2.5 transition-all ${
                    isActive
                      ? 'text-copper-700 shadow-neu-inset'
                      : 'text-muted hover:text-ink shadow-neu-sm active:shadow-neu-pressed'
                  }`
                }
              >
                <Settings size={18} strokeWidth={2} />
              </NavLink>
            )}
          </div>
        </div>
      </aside>

      {confirmandoSalir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-espresso-950/50 p-4">
          {/* El scroll va en el div de adentro, no en el Card: Chrome no
              recorta la barra de scroll a las esquinas redondeadas cuando
              overflow y border-radius estan en el mismo elemento -- se veia
              un pedacito de barra recta saliendose de la curva. */}
          <Card className="max-h-[90vh] w-full max-w-sm overflow-hidden">
            <div className="max-h-[90vh] overflow-y-auto p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display font-bold text-ink">Cerrar sesion</h2>
                <button
                  onClick={() => setConfirmandoSalir(false)}
                  className="rounded p-1 text-muted hover:bg-porcelain-200"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mb-4 text-sm text-muted">Seguro que quieres cerrar tu sesion?</p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmandoSalir(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" className="flex-1" onClick={logout}>
                  <LogOut size={16} />
                  Cerrar sesion
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div
          // z-40: por debajo de los modales (z-50) pero por encima de
          // cualquier cosa sticky/absolute dentro de una pagina (insignias de
          // "seleccionado" en tarjetas, barras de seleccion multiple...). Con
          // z-10 empataba con esas y, al hacer scroll, la insignia terminaba
          // pintandose ENCIMA de esta barra en vez de quedar tapada por ella.
          className="sticky top-0 z-40 flex items-center gap-3 border-b border-porcelain-200 bg-porcelain-100 px-4 pb-3 md:hidden"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menu"
            className="shrink-0 rounded-lg p-2 text-ink shadow-neu-sm active:shadow-neu-pressed"
          >
            <Menu size={20} />
          </button>
          <p className="truncate font-display text-sm font-bold text-ink">
            {profile?.nombre || 'Rosa Delicias'}
          </p>
        </div>
        <div
          className="mx-auto max-w-6xl px-4 pt-6 md:px-10 md:pt-8"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        >
          <Outlet />
        </div>
      </main>
      </div>
    </div>
  );
}
