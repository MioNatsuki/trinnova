import { useAuth } from '../context/AuthContext';

function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1>Bienvenido, {user?.nombre}</h1>
      <p>Rol: {user?.rol}</p>
      <p>Proyectos asignados: {user?.proyectos?.map(p => p.nombre).join(', ')}</p>
    </div>
  );
}

export default Dashboard;