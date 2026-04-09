import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/auth/Login';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import UsuariosCRUD from './pages/usuarios/UsuariosCRUD';
import CargarPadron from './pages/analisis/CargarPadron';
import Complementar from './pages/analisis/Complementar';
import LimpiezaAnalisis from './pages/analisis/LimpiezaAnalisis';
// Eliminada la línea: import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="loading">Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  const isSuperadmin = user?.rol === 'superadmin';

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Dashboard />} />
        {isSuperadmin && (
          <>
            <Route path="usuarios" element={<UsuariosCRUD />} />
            <Route path="proyectos" element={<div>Próximamente</div>} />
            <Route path="analisis/cargar" element={<CargarPadron />} />
            <Route path="analisis/complementar" element={<Complementar />} />
            <Route path="analisis/limpieza" element={<LimpiezaAnalisis />} />
          </>
        )}
        {/* Rutas para analistas/auxiliares - próximas fases */}
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