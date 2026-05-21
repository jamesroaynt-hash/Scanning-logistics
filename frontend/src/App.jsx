/**
 * App — routing + auth gate.
 * Unauthenticated users are bounced to /login; everything else is
 * wrapped in the Layout shell.
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Scan from './pages/Scan.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Search from './pages/Search.jsx';
import History from './pages/History.jsx';
import Inventory from './pages/Inventory.jsx';
import Scanned from './pages/Scanned.jsx';

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/scan" replace /> : <Login />}
      />
      <Route
        path="/scan"
        element={
          <Protected>
            <Scan />
          </Protected>
        }
      />
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/search"
        element={
          <Protected>
            <Search />
          </Protected>
        }
      />
      <Route
        path="/history"
        element={
          <Protected>
            <History />
          </Protected>
        }
      />
      <Route
        path="/inventory"
        element={
          <Protected>
            <Inventory />
          </Protected>
        }
      />
      <Route
        path="/scanned"
        element={
          <Protected>
            <Scanned />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/scan" replace />} />
    </Routes>
  );
}
