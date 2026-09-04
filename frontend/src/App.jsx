// frontend/src/App.jsx - CORREGIDO

// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavigationGuardProvider } from './context/NavigationGuardContext'; 
import Login from './components/auth/Login';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Proyectos from './pages/Proyectos';
import UsuariosCRUD from './pages/usuarios/UsuariosCRUD';
import CargarPadron from './pages/analisis/CargarPadron';
import Complementar from './pages/analisis/Complementar';
import LimpiezaAnalisis from './pages/analisis/LimpiezaAnalisis';
import PlantillasDashboard from './pages/plantillas/PlantillasDashboard';
import Calculos from './pages/analisis/Calculos';
import Catalogos from './pages/catalogos/Catalogos';
import Bitacora from './pages/logs/Bitacora';
import DashboardEmision from './pages/emision/Dashboard';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#718096' }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  const rol = user?.rol;
  const isSuperadmin = rol === 'superadmin';
  const isAnalista   = rol === 'analista' || isSuperadmin;
  const canAnalisis  = isAnalista;

  return (
    <NavigationGuardProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />

          <Route path="proyectos" element={<Proyectos />} />

          {isSuperadmin && (
            <Route path="usuarios" element={<UsuariosCRUD />} />
          )}

          {canAnalisis && (
            <>
              <Route path="analisis/cargar"       element={<CargarPadron />} />
              <Route path="analisis/complementar" element={<Complementar />} />
              <Route path="analisis/limpieza"     element={<LimpiezaAnalisis />} />
              <Route path="analisis/calculos"     element={<Calculos />} />
            </>
          )}

          {isAnalista && (
            <Route path="plantillas" element={<PlantillasDashboard />} />
          )}

          {/* Emisión - disponible para todos los roles autenticados */}
          <Route path="emision" element={<DashboardEmision />} />

          {isSuperadmin && (
            <>
              <Route path="catalogos" element={<Catalogos />} />
              <Route path="catalogo/documentos" element={<Catalogos />} />
              <Route path="catalogo/zonas" element={<Catalogos />} />
              <Route path="catalogo/notificadores" element={<Catalogos />} />
              <Route path="bitacora" element={<Bitacora />} />
              <Route path="logs" element={<Bitacora />} />
            </>
          )}

          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </NavigationGuardProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;