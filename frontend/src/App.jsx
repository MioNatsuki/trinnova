// frontend/src/App.jsx

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';

import {
  AuthProvider,
  useAuth
} from './context/AuthContext';

import {
  NavigationGuardProvider
} from './context/NavigationGuardContext';

import Login from './components/auth/Login';
import Layout from './components/layout/Layout';

import Dashboard from './pages/Dashboard';
import Proyectos from './pages/Proyectos';

import UsuariosCRUD from './pages/usuarios/UsuariosCRUD';

import CargarPadron from './pages/analisis/CargarPadron';
import Complementar from './pages/analisis/Complementar';
import LimpiezaAnalisis from './pages/analisis/LimpiezaAnalisis';
import Calculos from './pages/analisis/Calculos';

import PlantillasDashboard from './pages/plantillas/PlantillasDashboard';

import Catalogos from './pages/catalogos/Catalogos';

import Bitacora from './pages/logs/Bitacora';

import DashboardEmision from './pages/emision/Dashboard';


function ProtectedRoute({ children }) {
  const {
    user,
    loading
  } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          padding: 60,
          textAlign: 'center',
          color: '#718096'
        }}
      >
        Cargando...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  return children;
}


function AppRoutes() {
  const { user } = useAuth();

  const rol = user?.rol;

  const isSuperadmin =
    rol === 'superadmin';

  const isAnalista =
    rol === 'analista' ||
    isSuperadmin;

  const canAnalisis =
    isAnalista;

  return (
    <NavigationGuardProvider>

      <Routes>

        {/* ======================================================
            LOGIN
            ====================================================== */}
        <Route
          path="/login"
          element={<Login />}
        />


        {/* ======================================================
            ÁREA PROTEGIDA
            ====================================================== */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >

          {/* Inicio */}
          <Route
            index
            element={<Dashboard />}
          />


          {/* ====================================================
              PROYECTOS
              ==================================================== */}
          <Route
            path="proyectos"
            element={<Proyectos />}
          />


          {/* ====================================================
              USUARIOS
              ==================================================== */}
          {isSuperadmin && (
            <Route
              path="usuarios"
              element={<UsuariosCRUD />}
            />
          )}


          {/* ====================================================
              ANÁLISIS
              ==================================================== */}
          {canAnalisis && (
            <>
              <Route
                path="analisis/cargar"
                element={<CargarPadron />}
              />

              <Route
                path="analisis/complementar"
                element={<Complementar />}
              />

              <Route
                path="analisis/limpieza"
                element={<LimpiezaAnalisis />}
              />

              <Route
                path="analisis/calculos"
                element={<Calculos />}
              />
            </>
          )}


          {/* ====================================================
              PLANTILLAS
              ==================================================== */}
          {isAnalista && (
            <Route
              path="plantillas"
              element={<PlantillasDashboard />}
            />
          )}


          {/* ====================================================
              EMISIÓN
              ====================================================

              El Sidebar y Proyectos.jsx utilizan:

                  /emision/preparacion
                  /emision/emitir

              Actualmente ambos procesos viven dentro de
              DashboardEmision.

              Mantenemos /emision como alias para evitar URLs
              huérfanas o enlaces antiguos.
              ==================================================== */}

          <Route
            path="emision"
            element={
              <Navigate
                to="/emision/preparacion"
                replace
              />
            }
          />

          <Route
            path="emision/preparacion"
            element={<DashboardEmision />}
          />

          <Route
            path="emision/emitir"
            element={<DashboardEmision />}
          />


          {/* ====================================================
              CATÁLOGOS / BITÁCORA
              ==================================================== */}
          {isSuperadmin && (
            <>
              <Route
                path="catalogos"
                element={<Catalogos />}
              />

              <Route
                path="catalogo/documentos"
                element={<Catalogos />}
              />

              <Route
                path="catalogo/zonas"
                element={<Catalogos />}
              />

              <Route
                path="catalogo/notificadores"
                element={<Catalogos />}
              />

              <Route
                path="bitacora"
                element={<Bitacora />}
              />

              <Route
                path="logs"
                element={<Bitacora />}
              />
            </>
          )}


          {/* ====================================================
              FALLBACK
              ==================================================== */}
          <Route
            path="*"
            element={
              <Navigate
                to="/"
                replace
              />
            }
          />

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