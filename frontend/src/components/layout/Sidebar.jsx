import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const menuItems = {
  superadmin: [
    { path: '/', label: 'Inicio', icon: '🏠' },
    { path: '/proyectos', label: 'Proyectos', icon: '📁' },
    { path: '/usuarios', label: 'Usuarios', icon: '👥' },
  ],
  analista: [
    { path: '/', label: 'Inicio', icon: '🏠' },
    { path: '/analisis/cargar', label: 'Cargar Padrón', icon: '📤' },
    { path: '/analisis/complementar', label: 'Complementar', icon: '✏️' },
    { path: '/analisis/limpieza', label: 'Limpieza y análisis', icon: '🧹' },
    { path: '/plantillas', label: 'Dashboard Plantillas', icon: '📄' },
    { path: '/plantillas/crear', label: 'Subir/Crear Plantilla', icon: '➕' },
    { path: '/emision/preparacion', label: 'Preparación', icon: '⚙️' },
    { path: '/emision/emitir', label: 'Emisión', icon: '🖨️' },
  ],
  auxiliar: [
    { path: '/', label: 'Inicio', icon: '🏠' },
    { path: '/emision/preparacion', label: 'Preparación', icon: '⚙️' },
    { path: '/emision/emitir', label: 'Emisión', icon: '🖨️' },
  ],
};

function Sidebar() {
  const { user } = useAuth();
  const role = user?.rol || 'auxiliar';
  const items = menuItems[role] || menuItems.auxiliar;

  return (
    <aside className="sidebar">
      <nav>
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;