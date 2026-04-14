// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/auth/Login';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Proyectos from './pages/Proyectos';
import UsuariosCRUD from './pages/usuarios/UsuariosCRUD';
import CargarPadron from './pages/analisis/CargarPadron';
import Complementar from './pages/analisis/Complementar';
import LimpiezaAnalisis from './pages/analisis/LimpiezaAnalisis';

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
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />

        {/* Proyectos — visible para todos los roles */}
        <Route path="proyectos" element={<Proyectos />} />

        {/* Administración — solo superadmin */}
        {isSuperadmin && (
          <Route path="usuarios" element={<UsuariosCRUD />} />
        )}

        {/* Análisis — analista y superadmin */}
        {canAnalisis && (
          <>
            <Route path="analisis/cargar"       element={<CargarPadron />} />
            <Route path="analisis/complementar" element={<Complementar />} />
            <Route path="analisis/limpieza"     element={<LimpiezaAnalisis />} />
          </>
        )}

        {/* Plantillas — analista y superadmin (próxima fase) */}
        {isAnalista && (
          <>
            <Route path="plantillas"       element={<div style={{ padding: 24 }}>Dashboard Plantillas — próximamente</div>} />
            <Route path="plantillas/crear" element={<div style={{ padding: 24 }}>Subir / Crear Plantilla — próximamente</div>} />
          </>
        )}

        {/* Emisión — todos los roles (próxima fase) */}
        <Route path="emision/preparacion" element={<div style={{ padding: 24 }}>Preparación de Emisión — próximamente</div>} />
        <Route path="emision/emitir"      element={<div style={{ padding: 24 }}>Emisión de documentos — próximamente</div>} />

        {/* Catálogos — superadmin (próxima fase) */}
        {isSuperadmin && (
          <>
            <Route path="catalogo/documentos" element={<div style={{ padding: 24 }}>Catálogo Documentos — próximamente</div>} />
            <Route path="catalogo/zonas"      element={<div style={{ padding: 24 }}>Catálogo Zonas — próximamente</div>} />
          </>
        )}

        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
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