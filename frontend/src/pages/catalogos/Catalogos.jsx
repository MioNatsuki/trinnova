// frontend/src/pages/catalogos/Catalogos.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import api from '../../api/auth';
import './Catalogos.css';

const TABS = [
  { id: 'documentos', label: 'Documentos', icon: '📄' },
  { id: 'notificadores', label: 'Notificadores', icon: '👤' },
  { id: 'zonas', label: 'Zonas', icon: '📍' }
];

export default function Catalogos() {
  const { user } = useAuth();
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const [activeTab, setActiveTab] = useState('documentos');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({});
  const [message, setMessage] = useState(null);
  
  const isSuperadmin = user?.rol === 'superadmin';
  const isAnalista = user?.rol === 'analista' || isSuperadmin;
  
  // Obtener proyecto_id desde slug
  const proyectoActual = proyectos.find(p => p.slug === proyectoSlug);
  const proyectoId = proyectoActual?.id;
  
  useEffect(() => {
    if (proyectoId) {
      cargarItems();
    }
  }, [activeTab, proyectoId]);
  
  const cargarItems = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/catalogos/${activeTab}`, {
        params: { proyecto_id: proyectoId }
      });
      setItems(res.data || []);
    } catch (error) {
      showMessage('error', error.response?.data?.detail || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  };
  
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };
  
  const handleCreate = () => {
    setEditingItem(null);
    setForm({ id_proyecto: proyectoId });
    setShowModal(true);
  };
  
  const handleEdit = (item) => {
    setEditingItem(item);
    setForm({ ...item });
    setShowModal(true);
  };
  
  const handleDelete = async (item) => {
    if (!window.confirm(`¿Desactivar ${item.nombre || item.nombre_documento || item.nombre_zona}?`)) return;
    
    try {
      await api.delete(`/catalogos/${activeTab}/${item.id}`);
      showMessage('success', 'Elemento desactivado correctamente');
      cargarItems();
    } catch (error) {
      showMessage('error', error.response?.data?.detail || 'Error al eliminar');
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const payload = { ...form };
      if (editingItem) {
        await api.put(`/catalogos/${activeTab}/${editingItem.id}`, payload);
        showMessage('success', 'Actualizado correctamente');
      } else {
        await api.post(`/catalogos/${activeTab}`, payload);
        showMessage('success', 'Creado correctamente');
      }
      setShowModal(false);
      cargarItems();
    } catch (error) {
      showMessage('error', error.response?.data?.detail || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };
  
  // Obtener campos del formulario según tab
  const getFormFields = () => {
    switch (activeTab) {
      case 'documentos':
        return [
          { name: 'nombre_documento', label: 'Nombre del Documento', type: 'text', required: true },
          { name: 'identificador_documento', label: 'Identificador (N, R, A, etc.)', type: 'text', required: true }
        ];
      case 'notificadores':
        return [
          { name: 'nombre', label: 'Nombre del Notificador', type: 'text', required: true },
          { name: 'acronimo', label: 'Acrónimo', type: 'text', required: true }
        ];
      case 'zonas':
        return [
          { name: 'nombre_zona', label: 'Nombre de la Zona', type: 'text', required: true },
          { name: 'clave_zona', label: 'Clave de la Zona', type: 'text', required: true },
          { name: 'descripcion', label: 'Descripción', type: 'textarea', required: false }
        ];
      default:
        return [];
    }
  };
  
  // Obtener columnas de la tabla según tab
  const getTableColumns = () => {
    switch (activeTab) {
      case 'documentos':
        return [
          { key: 'nombre_documento', label: 'Nombre' },
          { key: 'identificador_documento', label: 'Identificador' },
          { key: 'activo', label: 'Estado', render: (v) => v ? '✅ Activo' : '❌ Inactivo' }
        ];
      case 'notificadores':
        return [
          { key: 'nombre', label: 'Nombre' },
          { key: 'acronimo', label: 'Acrónimo' },
          { key: 'activo', label: 'Estado', render: (v) => v ? '✅ Activo' : '❌ Inactivo' }
        ];
      case 'zonas':
        return [
          { key: 'nombre_zona', label: 'Nombre' },
          { key: 'clave_zona', label: 'Clave' },
          { key: 'descripcion', label: 'Descripción' },
          { key: 'activo', label: 'Estado', render: (v) => v ? '✅ Activo' : '❌ Inactivo' }
        ];
      default:
        return [];
    }
  };
  
  const columns = getTableColumns();
  const fields = getFormFields();
  
  return (
    <div className="catalogos-page">
      <div className="catalogos-header">
        <h1>Catálogos</h1>
        <div className="catalogos-actions">
          <ProyectoSelector 
            proyectos={proyectos} 
            value={proyectoSlug} 
            onChange={setProyectoSlug} 
          />
          {isAnalista && proyectoId && (
            <button className="btn-primary" onClick={handleCreate}>
              + Nuevo
            </button>
          )}
        </div>
      </div>
      
      {/* Tabs */}
      <div className="catalogos-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      
      {/* Mensaje */}
      {message && (
        <div className={`catalogos-message ${message.type}`}>
          {message.text}
        </div>
      )}
      
      {/* Tabla */}
      <div className="catalogos-table-wrapper">
        <table className="catalogos-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key}>{col.label}</th>
              ))}
              {isAnalista && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} className="loading-cell">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="empty-cell">No hay registros</td></tr>
            ) : (
              items.map(item => (
                <tr key={item.id}>
                  {columns.map(col => (
                    <td key={col.key}>
                      {col.render ? col.render(item[col.key]) : item[col.key] || '—'}
                    </td>
                  ))}
                  {isAnalista && (
                    <td className="actions-cell">
                      <button className="btn-edit" onClick={() => handleEdit(item)}>✏️</button>
                      <button className="btn-delete" onClick={() => handleDelete(item)}>🗑️</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-catalogo" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingItem ? 'Editar' : 'Nuevo'} {TABS.find(t => t.id === activeTab)?.label}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form">
              {fields.map(field => (
                <div key={field.name} className="form-group">
                  <label>{field.label} {field.required && '*'}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={form[field.name] || ''}
                      onChange={e => setForm({ ...form, [field.name]: e.target.value })}
                      rows={3}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={form[field.name] || ''}
                      onChange={e => setForm({ ...form, [field.name]: e.target.value })}
                      required={field.required}
                    />
                  )}
                </div>
              ))}
              
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm" disabled={loading}>
                  {loading ? 'Guardando...' : editingItem ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}