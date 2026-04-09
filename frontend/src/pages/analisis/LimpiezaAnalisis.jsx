// frontend/src/pages/analisis/LimpiezaAnalisis.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/auth';
import './Analisis.css';

export default function LimpiezaAnalisis() {
  const { user } = useAuth();
  const [data, setData] = useState({ rows: [], total: 0, pk: null });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filtroViabilidad, setFiltroViabilidad] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [message, setMessage] = useState(null);
  const [ejecutando, setEjecutando] = useState(false);

  const proyectoSlug = user?.proyectos?.[0]?.slug;

  const loadData = async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filtroViabilidad) params.viabilidad = filtroViabilidad;
      if (busqueda) params.busqueda = busqueda;
      
      const response = await api.get(`/analisis/${proyectoSlug}/analisis`, { params });
      setData(response.data);
      setSelectedRows(new Set());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, filtroViabilidad, busqueda, proyectoSlug]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(new Set(data.rows.map(row => row[data.pk])));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (pkValue) => {
    const newSet = new Set(selectedRows);
    if (newSet.has(pkValue)) {
      newSet.delete(pkValue);
    } else {
      newSet.add(pkValue);
    }
    setSelectedRows(newSet);
  };

  const ejecutarAccion = async (accion, valor = null) => {
    if (selectedRows.size === 0) {
      setMessage({ type: 'error', text: 'Selecciona al menos un registro' });
      return;
    }

    setEjecutando(true);
    try {
      await api.post(`/analisis/${proyectoSlug}/acciones-manuales`, {
        ids: Array.from(selectedRows),
        accion: accion,
        valor: valor
      });
      setMessage({ type: 'success', text: `Acción ejecutada en ${selectedRows.size} registros` });
      setSelectedRows(new Set());
      loadData();
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al ejecutar acción' });
    } finally {
      setEjecutando(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const ejecutarLimpieza = async (tipo) => {
    if (!confirm(`¿Ejecutar limpieza de ${tipo}?`)) return;
    
    setEjecutando(true);
    try {
      const endpoint = tipo === 'calles' 
        ? `/analisis/${proyectoSlug}/limpieza/normalizar-calles`
        : `/analisis/${proyectoSlug}/limpieza/limpiar-espacios`;
      
      const response = await api.post(endpoint);
      setMessage({ type: 'success', text: response.data.message });
      loadData();
    } catch (error) {
      setMessage({ type: 'error', text: 'Error en limpieza' });
    } finally {
      setEjecutando(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const getViabilidadClass = (viabilidad) => {
    switch (viabilidad) {
      case 'viable': return 'badge-viable';
      case 'no_viable': return 'badge-no-viable';
      default: return 'badge-pendiente';
    }
  };

  const getViabilidadText = (viabilidad) => {
    switch (viabilidad) {
      case 'viable': return 'Viable';
      case 'no_viable': return 'No Viable';
      default: return 'Pendiente';
    }
  };

  if (loading) return <div className="analisis-loading">Cargando...</div>;

  return (
    <div className="analisis-container">
      <div className="analisis-header">
        <h1>Limpieza y Análisis</h1>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Herramientas de limpieza automática */}
      <div className="limpieza-tools">
        <h3>Herramientas de limpieza</h3>
        <div className="tools-grid">
          <button onClick={() => ejecutarLimpieza('calles')} disabled={ejecutando}>
            🧹 Normalizar calles
          </button>
          <button onClick={() => ejecutarLimpieza('espacios')} disabled={ejecutando}>
            🧹 Limpiar espacios extra
          </button>
        </div>
      </div>

      {/* Acciones manuales */}
      <div className="acciones-manuales">
        <h3>Acciones manuales</h3>
        <div className="actions-grid">
          <button 
            onClick={() => ejecutarAccion('viable')} 
            disabled={ejecutando || selectedRows.size === 0}
            className="btn-viable"
          >
            ✓ Marcar como Viables ({selectedRows.size})
          </button>
          <button 
            onClick={() => ejecutarAccion('no_viable')} 
            disabled={ejecutando || selectedRows.size === 0}
            className="btn-no-viable"
          >
            ✗ Marcar como No Viables ({selectedRows.size})
          </button>
          <button 
            onClick={() => ejecutarAccion('quitar_pagada')} 
            disabled={ejecutando || selectedRows.size === 0}
            className="btn-pagada"
          >
            💰 Quitar Pagadas
          </button>
          <button 
            onClick={() => {
              const motivo = prompt('Motivo (ND, Convenio, etc.):');
              if (motivo) ejecutarAccion('quitar_nd', motivo);
            }} 
            disabled={ejecutando || selectedRows.size === 0}
            className="btn-nd"
          >
            📋 Quitar ND
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="filtros-analisis">
        <select 
          value={filtroViabilidad} 
          onChange={(e) => setFiltroViabilidad(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="viable">Solo Viables</option>
          <option value="no_viable">Solo No Viables</option>
          <option value="pendiente">Solo Pendientes</option>
        </select>
        
        <input
          type="text"
          placeholder="Buscar por cuenta, propietario o calle..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* Tabla de resultados */}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <input 
                  type="checkbox" 
                  onChange={handleSelectAll}
                  checked={selectedRows.size === data.rows.length && data.rows.length > 0}
                />
              </th>
              <th>Cuenta/ID</th>
              <th>Propietario</th>
              <th>Dirección</th>
              <th>Adeudo</th>
              <th>Viabilidad</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => (
              <tr key={row[data.pk]} className={selectedRows.has(row[data.pk]) ? 'selected' : ''}>
                <td>
                  <input 
                    type="checkbox" 
                    checked={selectedRows.has(row[data.pk])}
                    onChange={() => handleSelectRow(row[data.pk])}
                  />
                </td>
                <td>{row[data.pk]}</td>
                <td>{row.propietario || row.nombre || row.nombre_razon_social}</td>
                <td>{row.calle || row.domicilio || row.ubicacion}</td>
                <td>
                  ${(row.adeudo_total || row.adeudo || row.saldo || row.total || 0).toLocaleString()}
                </td>
                <td>
                  <span className={getViabilidadClass(row.viabilidad)}>
                    {getViabilidadText(row.viabilidad)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
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

      <div className="stats-info">
        Total de registros: {data.total} | 
        Seleccionados: {selectedRows.size}
      </div>
    </div>
  );
}