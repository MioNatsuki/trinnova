import { useState, useEffect } from 'react';
import api from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import './UsuariosCRUD.css';

function UsuariosCRUD() {
  const { user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    apellidos: '',
    correo: '',
    password: '',
    id_rol: '',
    proyectos: [],
  });

  // Cargar datos
  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [usuariosRes, proyectosRes, rolesRes] = await Promise.all([
        api.get('/usuarios/'),
        api.get('/proyectos/'),
        api.get('/roles/'),
      ]);
      setUsuarios(usuariosRes.data);
      setProyectos(proyectosRes.data);
      setRoles(rolesRes.data);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleProyectosChange = (e) => {
    const options = e.target.options;
    const selected = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selected.push(parseInt(options[i].value));
      }
    }
    setFormData({ ...formData, proyectos: selected });
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      nombre: '',
      apellidos: '',
      correo: '',
      password: '',
      id_rol: '',
      proyectos: [],
    });
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormData({
      nombre: user.nombre,
      apellidos: user.apellidos,
      correo: user.correo,
      password: '',
      id_rol: user.id_rol || '',
      proyectos: user.proyectos_ids || [],
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await api.put(`/usuarios/${editingUser.id}`, formData);
      } else {
        await api.post('/usuarios/', formData);
      }
      setShowModal(false);
      cargarDatos();
    } catch (error) {
      console.error('Error guardando usuario:', error);
      alert(error.response?.data?.detail || 'Error al guardar');
    }
  };

  const handleDelete = async (user) => {
    if (user.id === currentUser.id) {
      alert('No puedes eliminar tu propio usuario');
      return;
    }
    if (window.confirm(`¿Eliminar usuario ${user.nombre} ${user.apellidos}?`)) {
      try {
        await api.delete(`/usuarios/${user.id}`);
        cargarDatos();
      } catch (error) {
        console.error('Error eliminando usuario:', error);
        alert('Error al eliminar usuario');
      }
    }
  };

  const getRolNombre = (rolId) => {
    const rol = roles.find(r => r.id === rolId);
    return rol ? rol.nombre : 'Desconocido';
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="usuarios-crud">
      <div className="header-actions">
        <h1>Gestión de Usuarios</h1>
        <button onClick={openCreateModal} className="btn-primary">
          + Nuevo Usuario
        </button>
      </div>

      <div className="table-container">
        <table className="usuarios-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nombre</th>
              <th>Apellidos</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Proyectos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.nombre}</td>
                <td>{user.apellidos}</td>
                <td>{user.correo}</td>
                <td>
                  <span className={`rol-badge rol-${user.rol}`}>
                    {user.rol}
                  </span>
                </td>
                <td>
                  <div className="proyectos-list">
                    {user.proyectos?.map(p => (
                      <span key={p} className="proyecto-tag">{p}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <span className={`status-badge ${user.activo ? 'active' : 'inactive'}`}>
                    {user.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="actions">
                  <button
                    onClick={() => openEditModal(user)}
                    className="btn-edit"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(user)}
                    className="btn-delete"
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre *</label>
                  <input
                    type="text"
                    name="nombre"
                    value={formData.nombre}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Apellidos *</label>
                  <input
                    type="text"
                    name="apellidos"
                    value={formData.apellidos}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Correo *</label>
                  <input
                    type="email"
                    name="correo"
                    value={formData.correo}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Contraseña {!editingUser && '*'}</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required={!editingUser}
                    placeholder={editingUser ? 'Dejar en blanco para no cambiar' : ''}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Rol *</label>
                  <select
                    name="id_rol"
                    value={formData.id_rol}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Seleccionar rol</option>
                    {roles.map(rol => (
                      <option key={rol.id} value={rol.id}>
                        {rol.nombre} - {rol.descripcion}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Proyectos Asignados</label>
                  <select
                    multiple
                    value={formData.proyectos}
                    onChange={handleProyectosChange}
                    className="proyectos-select"
                  >
                    {proyectos.map(proy => (
                      <option key={proy.id} value={proy.id}>
                        {proy.nombre}
                      </option>
                    ))}
                  </select>
                  <small>Ctrl+Click para múltiple selección</small>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)} className="btn-cancel">
                  Cancelar
                </button>
                <button type="submit" className="btn-save">
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsuariosCRUD;