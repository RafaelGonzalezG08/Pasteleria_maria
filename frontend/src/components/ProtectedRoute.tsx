import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../store/auth.store';
import type { Role } from '../types';

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="font-display text-lg font-semibold text-ink">Acceso restringido</p>
        <p className="max-w-sm text-sm text-muted">
          Tu rol ({user.role}) no tiene permiso para ver esta seccion. Pidele a un administrador
          que ajuste tus permisos si crees que es un error.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
