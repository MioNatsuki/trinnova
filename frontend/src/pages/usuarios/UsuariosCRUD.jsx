import { useState, useEffect } from 'react';
import api from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import './UsuariosCRUD.css';

const ROL_STYLE = {
  superadmin: { bg: '#fed7d7', color: '#9b2c2c' },
  analista:   { bg: '#c6f6d5', color: '#276749' },
  auxiliar:   { bg: '#feebc8', color: '#9c4221' },
};

export default function UsuariosCRUD() {
  const { user: currentUser } = useAuth();
  const [usuarios,  setUsuarios]  = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [roles,     setRoles]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser,  setEditUser]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState('');

  const emptyForm = {
    nombre: '', apellidos: '', correo: '',
    password: '', id_rol: '', proyectos: [],
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { cargar(); }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const [u, p, r] = await Promise.all([
        api.get('/usuarios/'),
        api.get('/proyectos/'),
        api.get('/roles/'),
      ]);
      setUsuarios(u.data);
      setProyectos(p.data);
      setRoles(r.data);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditUser(null);
    setForm(emptyForm);
    setFormErr('');
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditUser(u);
    // Obtener ids de proyectos del usuario (slugs → ids)
    const ids = proyectos
      .filter(p => u.proyectos.includes(p.slug))
      .map(p => p.id);
    setForm({
      nombre: u.nombre, apellidos: u.apellidos,
      correo: u.correo, password: '',
      id_rol: roles.find(r => r.nombre === u.rol)?.id || '',
      proyectos: ids,
    });
    setFormErr('');
    setShowModal(true);
  };

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleProyectos = e => {
    const sel = [...e.target.options]
      .filter(o => o.selected)
      .map(o => parseInt(o.value));
    setForm(f => ({ ...f, proyectos: sel }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setFormErr('');
    try {
      const payload = { ...form, id_rol: parseInt(form.id_rol) };
      if (!payload.password) delete payload.password;
      if (editUser) {
        await api.put(`/usuarios/${editUser.id}`, payload);
      } else {
        await api.post('/usuarios/', payload);
      }
      setShowModal(false);
      cargar();
    } catch (err) {
      setFormErr(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (u.id === currentUser.id) {
      alert('No puedes eliminar tu propio usuario');
      return;
    }
    if (!window.confirm(`¿Desactivar a ${u.nombre} ${u.apellidos}?`)) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      cargar();
    } catch {
      alert('Error al eliminar');
    }
  };

  if (loading) return <div className="uc-loading">Cargando usuarios...</div>;

  return (
    <div className="uc-root">

      {/* Cabecera */}
      <div className="uc-header">
        <h2 className="uc-title">Gestión de Usuarios</h2>
        <button className="uc-btn-add" onClick={openCreate}>+ Nuevo usuario</button>
      </div>

      {/* Tabla */}
      <div className="uc-table-wrap">
        <table className="uc-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Proyectos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => {
              const rs = ROL_STYLE[u.rol] || { bg: '#e2e8f0', color: '#4a5568' };
              return (
                <tr key={u.id}>
                  <td>
                    <div className="uc-name">{u.nombre} {u.apellidos}</div>
                  </td>
                  <td className="uc-muted">{u.correo}</td>
                  <td>
                    <span className="uc-badge" style={{ background: rs.bg, color: rs.color }}>
                      {u.rol}
                    </span>
                  </td>
                  <td>
                    <div className="uc-tags">
                      {u.proyectos.length === 0
                        ? <span className="uc-muted" style={{fontSize:11}}>—</span>
                        : u.proyectos.map(slug => (
                            <span key={slug} className="uc-tag">{slug.replace(/_/g, ' ')}</span>
                          ))
                      }
                    </div>
                  </td>
                  <td>
                    <span className={`uc-status ${u.activo ? 'active' : 'inactive'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="uc-actions">
                      <button className="uc-btn-icon" title="Editar" onClick={() => openEdit(u)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                      </button>
                      {u.id !== currentUser.id && (
                        <button className="uc-btn-icon danger" title="Desactivar" onClick={() => handleDelete(u)}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="uc-overlay" onClick={() => setShowModal(false)}>
          <div className="uc-modal" onClick={e => e.stopPropagation()}>
            <div className="uc-modal-header">
              <h3>{editUser ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button className="uc-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="uc-form">
              <div className="uc-form-row">
                <div className="uc-field">
                  <label>Nombre *</label>
                  <input name="nombre" value={form.nombre} onChange={handleChange} required />
                </div>
                <div className="uc-field">
                  <label>Apellidos *</label>
                  <input name="apellidos" value={form.apellidos} onChange={handleChange} required />
                </div>
              </div>

              <div className="uc-form-row">
                <div className="uc-field">
                  <label>Correo *</label>
                  <input type="email" name="correo" value={form.correo} onChange={handleChange} required />
                </div>
                <div className="uc-field">
                  <label>Contraseña {!editUser && '*'}</label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    required={!editUser}
                    placeholder={editUser ? 'Dejar vacío para no cambiar' : ''}
                  />
                </div>
              </div>

              <div className="uc-form-row">
                <div className="uc-field">
                  <label>Rol *</label>
                  <select name="id_rol" value={form.id_rol} onChange={handleChange} required>
                    <option value="">Seleccionar rol</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.nombre}</option>
                    ))}
                  </select>
                </div>
                <div className="uc-field">
                  <label>Proyectos asignados</label>
                  <select multiple value={form.proyectos} onChange={handleProyectos} className="uc-select-multi">
                    {proyectos.map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                  <span className="uc-hint">Ctrl + clic para selección múltiple</span>
                </div>
              </div>

              {formErr && <p className="uc-form-error">{formErr}</p>}

              <div className="uc-modal-footer">
                <button type="button" className="uc-btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="uc-btn-save" disabled={saving}>
                  {saving ? 'Guardando...' : editUser ? 'Guardar cambios' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}