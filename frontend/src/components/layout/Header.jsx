import { useAuth } from '../../context/AuthContext';

function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <div className="logo">
        <h1>TRINNOVA</h1>
        <span>PASIÓN POR LA EXCELENCIA</span>
      </div>
      <div className="user-info">
        <span>
          {user?.nombre} {user?.apellidos} ({user?.rol})
        </span>
        <button onClick={logout} className="logout-btn">
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}

export default Header;