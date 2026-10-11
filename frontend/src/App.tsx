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
import Orders from './pages/orders/Orders';
import Expenses from './pages/expenses/Expenses';
import Reports from './pages/reports/Reports';
import Transactions from './pages/transactions/Transactions';
import Costs from './pages/costs/Costs';
import Settings from './pages/settings/Settings';

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
          <Route
            path="/pos"
            element={
              <ProtectedRoute roles={['ADMIN', 'CAJERO']}>
                <POS />
              </ProtectedRoute>
            }
          />
          <Route path="/clientes" element={<Clients />} />
          <Route
            path="/cobros"
            element={
              <ProtectedRoute roles={['ADMIN', 'CAJERO', 'CONTABILIDAD']}>
                <Cobros />
              </ProtectedRoute>
            }
          />
          <Route
            path="/productos"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <Products />
              </ProtectedRoute>
            }
          />
          <Route path="/ventas" element={<Sales />} />
          <Route path="/pedidos" element={<Orders />} />
          <Route
            path="/gastos"
            element={
              <ProtectedRoute roles={['ADMIN', 'CONTABILIDAD']}>
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reportes"
            element={
              <ProtectedRoute roles={['ADMIN', 'CONTABILIDAD']}>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transacciones"
            element={
              <ProtectedRoute roles={['ADMIN', 'CONTABILIDAD']}>
                <Transactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/costos"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <Costs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracion"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
