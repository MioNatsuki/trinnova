// frontend/src/components/layout/Sidebar.jsx
import { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useNavigationGuard } from '../../context/NavigationGuardContext';

const Icon = ({ d, d2 }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>{d2 && <path d={d2}/>}
  </svg>
);

const ICONS = {
  home:     { d:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", d2:"M9 22V12h6v10" },
  folder:   { d:"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" },
  upload:   { d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2:"M17 8l-5-5-5 5M12 3v12" },
  edit:     { d:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", d2:"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" },
  broom:    { d:"M3 21l9-9", d2:"M12.22 6.22L20 4l-2.22 7.78-9 9L4 17z" },
  template: { d:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", d2:"M14 2v6h6M16 13H8M16 17H8M10 9H8" },
  plus:     { d:"M12 5v14M5 12h14" },
  print:    { d:"M6 9V2h12v7", d2:"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" },
  settings: { d:"M12 20h9", d2:"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" },
  users:    { d:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", d2:"M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
  catalog:  { d:"M4 19.5A2.5 2.5 0 0 1 6.5 17H20", d2:"M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" },
  map:      { d:"M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4", d2:"M8 2v16M16 6v16" },
  logout:   { d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", d2:"M16 17l5-5-5-5M21 12H9" },
};

// Componente SItem con NavigationGuard integrado
const SItem = ({ to, iconKey, label, sub = false, exact = false }) => {
  const { isDirty, confirmNavigation } = useNavigationGuard();
  const navigate = useNavigate();

  const handleClick = useCallback((e) => {
    e.preventDefault();
    if (isDirty) {
      confirmNavigation(() => navigate(to));
    } else {
      navigate(to);
    }
  }, [isDirty, confirmNavigation, navigate, to]);

  return (
    <NavLink
      to={to}
      end={exact || to === '/'}
      onClick={handleClick}
      className={({ isActive }) =>
        `sidebar-item${sub ? ' sidebar-sub-item' : ''}${isActive ? ' active' : ''}`
      }
    >
      <span className="sidebar-item-icon"><Icon {...ICONS[iconKey]} /></span>
      {label}
    </NavLink>
  );
};

const Section = ({ label, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="sidebar-section">
      <div
        className="sidebar-section-label"
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer' }}
      >
        {label} {open ? '▾' : '▸'}
      </div>
      {open && <div className="sidebar-sub-items">{children}</div>}
    </div>
  );
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { isDirty, confirmNavigation } = useNavigationGuard();
  const navigate = useNavigate();
  const rol = user?.rol || 'auxiliar';

  const isSuperadmin = rol === 'superadmin';
  const isAnalista   = rol === 'analista' || isSuperadmin;
  const canEmision   = true;

  const handleLogout = useCallback(async () => {
    if (isDirty) {
      confirmNavigation(async () => {
        await logout();
        navigate('/login');
      });
    } else {
      await logout();
      navigate('/login');
    }
  }, [isDirty, confirmNavigation, logout, navigate]);

  return (
    <aside className="sidebar">
      <SItem to="/" iconKey="home" label="Inicio" exact />

      <Section label="Proyectos">
        <SItem to="/proyectos" iconKey="folder" label="Proyectos" exact />
      </Section>

      {isAnalista && (
        <Section label="Análisis">
          <SItem to="/analisis/cargar"       iconKey="upload"   label="Cargar Padrón"       sub exact />
          <SItem to="/analisis/complementar" iconKey="edit"     label="Complementar"        sub exact />
          <SItem to="/analisis/limpieza"     iconKey="broom"    label="Limpieza y análisis" sub exact />
          <SItem to="/analisis/calculos"     iconKey="settings" label="Cálculos"            sub exact />
        </Section>
      )}

      {isAnalista && (
        <Section label="Plantillas">
          <SItem to="/plantillas"       iconKey="template" label="Dashboard Plantillas" sub exact />
          <SItem to="/plantillas/crear" iconKey="plus"     label="Subir / Crear"        sub exact />
        </Section>
      )}

      {canEmision && (
        <Section label="Emisión">
          <SItem to="/emision/preparacion" iconKey="settings" label="Preparación" sub exact />
          <SItem to="/emision/emitir"      iconKey="print"    label="Emisión"     sub exact />
        </Section>
      )}

      {isSuperadmin && (
        <Section label="Catálogos">
          <SItem to="/catalogo/documentos" iconKey="catalog" label="Catálogo Documentos" sub exact />
          <SItem to="/catalogo/zonas"      iconKey="map"     label="Catálogo Zonas"      sub exact />
        </Section>
      )}

      {isSuperadmin && (
        <Section label="Administración">
          <SItem to="/usuarios" iconKey="users" label="Usuarios" sub exact />
        </Section>
      )}

      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={handleLogout}>
          <span className="sidebar-item-icon"><Icon {...ICONS.logout} /></span>
          Cerrar sesión
        </button>
        <div style={{ fontSize: 11, color: 'var(--clr-muted)', marginTop: 4 }}>
          {user?.nombre} {user?.apellidos}
          <span style={{ display: 'block', textTransform: 'capitalize', opacity: .7 }}>{rol}</span>
        </div>
      </div>
    </aside>
  );
}