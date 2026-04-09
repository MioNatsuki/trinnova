// frontend/src/pages/analisis/Complementar.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/auth';
import './Analisis.css';

export default function Complementar() {
  const { user } = useAuth();
  const [data, setData] = useState({ rows: [], columnas_editables: [], total: 0, pk: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editedRows, setEditedRows] = useState({});
  const [message, setMessage] = useState(null);

  const proyectoSlug = user?.proyectos?.[0]?.slug;

  const loadData = async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const response = await api.get(`/analisis/${proyectoSlug}/complementar`, {
        params: { page, limit: 20, search: search || undefined }
      });
      setData(response.data);
      setEditedRows({});
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, search, proyectoSlug]);

  const handleCellEdit = (row, field, value) => {
    setEditedRows(prev => ({
      ...prev,
      [row[data.pk]]: {
        ...(prev[row[data.pk]] || {}),
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (Object.keys(editedRows).length === 0) return;
    
    setSaving(true);
    const payload = Object.entries(editedRows).map(([pkValue, campos]) => ({
      pk_value: pkValue,
      campos_complementarios: campos
    }));
    
    try {
      await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
      setMessage({ type: 'success', text: 'Complemento guardado correctamente' });
      setEditedRows({});
      loadData();
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const renderValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  if (loading) return <div className="analisis-loading">Cargando...</div>;

  return (
    <div className="analisis-container">
      <div className="analisis-header">
        <h1>Complementar Información</h1>
        <div className="analisis-actions">
          <input
            type="text"
            placeholder="Buscar por cuenta, propietario o calle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <button 
            onClick={handleSave} 
            disabled={saving || Object.keys(editedRows).length === 0}
            className="btn-save"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cuenta/ID</th>
              <th>Propietario</th>
              <th>Dirección</th>
              {data.columnas_editables.map(col => (
                <th key={col}>{col.replace(/_/g, ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row[data.pk]}>
                <td className="pk-cell">{renderValue(row[data.pk])}</td>
                <td>{renderValue(row.propietario || row.nombre || row.nombre_razon_social)}</td>
                <td>{renderValue(row.calle || row.domicilio || row.ubicacion)}</td>
                {data.columnas_editables.map(col => (
                  <td key={col}>
                    <input
                      type="text"
                      defaultValue={renderValue(row[col])}
                      onChange={(e) => handleCellEdit(row, col, e.target.value)}
                      className="editable-cell"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button 
          onClick={() => setPage(p => Math.max(1, p-1))}
          disabled={page === 1}
        >
          Anterior
        </button>
        <span>Página {page} de {Math.ceil(data.total / 20)}</span>
        <button 
          onClick={() => setPage(p => p+1)}
          disabled={page >= Math.ceil(data.total / 20)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}