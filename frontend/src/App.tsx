import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/pos/POS';
import Products from './pages/products/Products';
import Clients from './pages/clients/Clients';
import Cobros from './pages/cobros/Cobros';
import Sales from './pages/sales/Sales';
import Expenses from './pages/expenses/Expenses';
import Reports from './pages/reports/Reports';
import Transactions from './pages/transactions/Transactions';
import Costs from './pages/costs/Costs';
import Settings from './pages/settings/Settings';
import Inventario from './pages/inventario/Inventario';
import Recetas from './pages/recetas/Recetas';
import Produccion from './pages/produccion/Produccion';
import Compras from './pages/compras/Compras';
import Encargos from './pages/encargos/Encargos';
import type { Role } from './types';

/** Quien entra a cada pantalla (el backend aplica las mismas reglas). */
const CAJA: Role[] = ['ADMIN', 'CAJERO'];
const COCINA: Role[] = ['ADMIN', 'REPOSTERO'];
const SOLO_ADMIN: Role[] = ['ADMIN'];

function Protegida({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  return <ProtectedRoute roles={roles}>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<Protegida roles={CAJA}><POS /></Protegida>} />
          <Route path="/encargos" element={<Encargos />} />
          <Route path="/productos" element={<Products />} />
          <Route path="/inventario" element={<Protegida roles={COCINA}><Inventario /></Protegida>} />
          <Route path="/recetas" element={<Protegida roles={COCINA}><Recetas /></Protegida>} />
          <Route path="/produccion" element={<Protegida roles={COCINA}><Produccion /></Protegida>} />
          <Route path="/compras" element={<Protegida roles={SOLO_ADMIN}><Compras /></Protegida>} />
          <Route path="/clientes" element={<Protegida roles={CAJA}><Clients /></Protegida>} />
          <Route path="/cobros" element={<Protegida roles={CAJA}><Cobros /></Protegida>} />
          <Route path="/ventas" element={<Protegida roles={CAJA}><Sales /></Protegida>} />
          <Route path="/gastos" element={<Protegida roles={SOLO_ADMIN}><Expenses /></Protegida>} />
          <Route path="/reportes" element={<Protegida roles={SOLO_ADMIN}><Reports /></Protegida>} />
          <Route path="/transacciones" element={<Protegida roles={SOLO_ADMIN}><Transactions /></Protegida>} />
          <Route path="/costos" element={<Protegida roles={SOLO_ADMIN}><Costs /></Protegida>} />
          <Route path="/configuracion" element={<Protegida roles={SOLO_ADMIN}><Settings /></Protegida>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
