import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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

const SItem = ({ to, iconKey, label, sub = false }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className={({ isActive }) =>
      `sidebar-item${sub ? ' sidebar-sub-item' : ''}${isActive ? ' active' : ''}`
    }
  >
    <span className="sidebar-item-icon"><Icon {...ICONS[iconKey]} /></span>
    {label}
  </NavLink>
);

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const rol = user?.rol || 'auxiliar';

  const isSuperadmin = rol === 'superadmin';
  const isAnalista   = rol === 'analista' || isSuperadmin;
  // Auxiliar también ve emisión
  const canEmision   = true;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      {/* INICIO */}
      <SItem to="/" iconKey="home" label="Inicio" />

      {/* PROYECTOS */}
      <div className="sidebar-section-label">Proyectos</div>
      <SItem to="/proyectos" iconKey="folder" label="Proyectos" />

      {/* ANÁLISIS — analista y superadmin */}
      {isAnalista && (
        <>
          <div className="sidebar-section-label">Análisis</div>
          <SItem to="/analisis/cargar"       iconKey="upload"   label="Cargar Padrón"       sub />
          <SItem to="/analisis/complementar" iconKey="edit"     label="Complementar"        sub />
          <SItem to="/analisis/limpieza"     iconKey="broom"    label="Limpieza y análisis" sub />
        </>
      )}

      {/* PLANTILLAS — analista y superadmin */}
      {isAnalista && (
        <>
          <div className="sidebar-section-label">Plantillas</div>
          <SItem to="/plantillas"       iconKey="template" label="Dashboard Plantillas" sub />
          <SItem to="/plantillas/crear" iconKey="plus"     label="Subir / Crear"        sub />
        </>
      )}

      {/* EMISIÓN — todos los roles */}
      {canEmision && (
        <>
          <div className="sidebar-section-label">Emisión</div>
          <SItem to="/emision/preparacion" iconKey="settings" label="Preparación" sub />
          <SItem to="/emision/emitir"      iconKey="print"    label="Emisión"     sub />
        </>
      )}

      {/* CATÁLOGOS — superadmin */}
      {isSuperadmin && (
        <>
          <div className="sidebar-section-label">Catálogos</div>
          <SItem to="/catalogo/documentos" iconKey="catalog" label="Catálogo Documentos" sub />
          <SItem to="/catalogo/zonas"      iconKey="map"     label="Catálogo Zonas"      sub />
        </>
      )}

      {/* ADMINISTRACIÓN — superadmin */}
      {isSuperadmin && (
        <>
          <div className="sidebar-section-label">Administración</div>
          <SItem to="/usuarios" iconKey="users" label="Usuarios" sub />
        </>
      )}

      {/* FOOTER */}
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
