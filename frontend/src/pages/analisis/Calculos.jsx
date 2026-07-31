// frontend/src/pages/analisis/Calculos.jsx

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Calculos.css';

export default function Calculos() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const [loading, setLoading] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [data, setData] = useState({ rows: [], total: 0, pk: null });
  const [inpcInfo, setInpcInfo] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [message, setMessage] = useState(null);
  
  // Paginación
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalRegistros, setTotalRegistros] = useState(0);
  
  const esEstado = proyectoSlug === 'estado';
  
  const [filtros, setFiltros] = useState({
    fecha_emision: new Date().toISOString().split('T')[0],
    visita: '',
    pmo: '',
    id_documento: '',
    id_notificador: ''
  });

  // ============================================================
  // Cargar datos de tabla_analisis CON PAGINACIÓN
  // ============================================================
  const loadData = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const res = await api.get(`/analisis/${proyectoSlug}/analisis`, {
        params: { 
          page: page, 
          limit: limit
        }
      });
      setData(res.data);
      setTotalRegistros(res.data.total || 0);
    } catch (err) {
      console.error('Error cargando datos:', err);
      showMessage('error', err.response?.data?.detail || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, limit]);

  // ============================================================
  // Cargar último INPC (solo para Estado)
  // ============================================================
  const loadUltimoInpc = useCallback(async () => {
    if (!esEstado) {
      setInpcInfo(null);
      return;
    }
    try {
      const res = await api.get('/calculos/inpc/ultimo');
      if (res.data.success) {
        setInpcInfo(res.data.data);
      } else {
        setInpcInfo(null);
      }
    } catch (err) {
      console.error('Error cargando INPC:', err);
      setInpcInfo(null);
    }
  }, [esEstado]);

  // ============================================================
  // Sincronizar INPC (solo para Estado)
  // ============================================================
  const handleSyncInpc = async () => {
    if (!esEstado) {
        showMessage('error', 'El botón de INPC solo está disponible para el proyecto Estado');
        return;
    }
    
    if (!window.confirm('¿Sincronizar datos del INPC desde el INEGI?\nEsto puede tomar varios segundos.')) return;
    
    setSincronizando(true);
    setMessage(null);
    try {
        const res = await api.post('/calculos/inpc/sincronizar', null, {
            params: { historico: true }
        });
        if (res.data.success) {
            showMessage('success', `✅ ${res.data.mensaje}`);
            await loadUltimoInpc();
        } else {
            showMessage('error', res.data.mensaje || 'Error al sincronizar');
        }
    } catch (err) {
        showMessage('error', err.response?.data?.detail || 'Error al sincronizar INPC');
    } finally {
        setSincronizando(false);
    }
};

  // ============================================================
  // Calcular UNA fila específica
  // ============================================================
  const calcularFila = async (pkValue, row) => {
    setCalculando(true);
    setMessage(null);
    try {
      const payload = {
        pk_value: pkValue,
        campos: row,
        fecha_emision: filtros.fecha_emision || new Date().toISOString().split('T')[0],
        visita: filtros.visita || row.visita || '',
        pmo: filtros.pmo || row.pmo || ''
      };

      // Usar el endpoint de analisis (está en analisis.py)
      const res = await api.post(`/analisis/${proyectoSlug}/calcular-fila`, payload);
      
      if (res.data.success) {
        // Actualizar la fila en el estado
        setData(prev => ({
          ...prev,
          rows: prev.rows.map(r => 
            String(r[prev.pk]) === String(pkValue) 
              ? { ...r, ...res.data.data }
              : r
          )
        }));
        showMessage('success', `✅ Fila ${pkValue} calculada correctamente`);
        // Recargar para actualizar todo
        await loadData();
      } else {
        showMessage('error', res.data.error || 'Error al calcular');
      }
    } catch (err) {
      console.error('Error al calcular fila:', err);
      showMessage('error', err.response?.data?.detail || 'Error al calcular');
    } finally {
      setCalculando(false);
    }
  };

  // ============================================================
  // Calcular TODAS las filas (sin importar la página)
  // ============================================================
  const calcularTodas = async () => {
    if (totalRegistros === 0) {
      showMessage('error', 'No hay datos para calcular');
      return;
    }
    
    if (!window.confirm(`¿Calcular todas las ${totalRegistros} filas? Esto puede tomar varios segundos.`)) return;
    
    setCalculando(true);
    setMessage(null);
    
    try {
      // Este endpoint trabaja sobre TODA la tabla_analisis
      const res = await api.post(`/analisis/${proyectoSlug}/calcular-todas`, null, {
        params: {
          fecha_emision: filtros.fecha_emision || new Date().toISOString().split('T')[0],
          visita: filtros.visita || '',
          pmo: filtros.pmo || ''
        }
      });
      
      if (res.data.success) {
        showMessage('success', `✅ ${res.data.mensaje}`);
        // Recargar datos para mostrar los cambios
        await loadData();
      } else {
        showMessage('error', res.data.error || 'Error al calcular');
      }
    } catch (err) {
      console.error('Error al calcular todas:', err);
      showMessage('error', err.response?.data?.detail || 'Error al calcular todas las filas');
    } finally {
      setCalculando(false);
    }
  };

  // ============================================================
  // Mostrar mensajes
  // ============================================================
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ============================================================
  // Efectos
  // ============================================================
  useEffect(() => {
    if (proyectoSlug) {
      loadData();
      loadUltimoInpc();
    }
  }, [proyectoSlug, page, limit, loadData, loadUltimoInpc]);

  // ============================================================
  // Renderizado de columnas según proyecto
  // ============================================================
  const renderColumnas = useMemo(() => {
    if (proyectoSlug === 'estado') {
      return [
        { key: 'credito', label: 'Crédito' },
        { key: 'nombre_razon_social', label: 'Nombre' },
        { key: 'importe_historico_determinado', label: 'Importe Histórico' },
        { key: 'fecha_notificacion', label: 'Fecha Notificación' },
        { key: 'fecha_requerimiento', label: 'Fecha Requerimiento' },
        { key: 'proximo_inpc', label: 'Próximo INPC' },
        { key: 'inpc_notificacion', label: 'INPC Notificación' },
        { key: 'inpc_requerimiento', label: 'INPC Requerimiento' },
        { key: 'factor_actualizacion', label: 'Factor' },
        { key: 'importe_actualizacion', label: 'Actualización' },
        { key: 'total_multa_actualizada', label: 'Total Actualizado' },
        { key: 'importe_letra', label: 'Importe en Letra' },
        { key: 'codebar', label: 'Código de Barras' },
      ];
    } else if (proyectoSlug === 'apa_tlajomulco') {
      return [
        { key: 'clave_apa', label: 'Clave APA' },
        { key: 'propietario_nombre', label: 'Propietario' },
        { key: 'total_adeudo', label: 'Total Adeudo' },
        { key: 'domicilio', label: 'Domicilio' },
        { key: 'firma', label: 'Firma' },
        { key: 'codebar', label: 'Código de Barras' },
      ];
    } else if (proyectoSlug === 'predial_gdl' || proyectoSlug === 'predial_tlajomulco') {
      return [
        { key: 'cuenta', label: 'Cuenta' },
        { key: 'propietario', label: 'Propietario' },
        { key: 'saldo', label: 'Saldo' },
        { key: 'codebar', label: 'Código de Barras' },
      ];
    } else if (proyectoSlug === 'pensiones') {
      return [
        { key: 'prestamo', label: 'Préstamo' },
        { key: 'nombre', label: 'Nombre' },
        { key: 'adeudo', label: 'Adeudo' },
        { key: 'codebar', label: 'Código de Barras' },
      ];
    } else {
      return [
        { key: data.pk || 'id', label: 'ID' },
        { key: 'codebar', label: 'Código de Barras' },
      ];
    }
  }, [proyectoSlug, data.pk]);

  // Calcular total de páginas
  const totalPages = Math.max(1, Math.ceil(totalRegistros / limit));

  // ============================================================
  // Renderizado
  // ============================================================
  return (
    <div className="calculos-page">
      {/* ===== HEADER ===== */}
      <div className="calculos-header">
        <div className="calculos-title-row">
          <h1>Cálculos</h1>
          <div className="calculos-actions">
            {esEstado && (
              <button 
                className="btn-sync-inpc"
                onClick={handleSyncInpc}
                disabled={sincronizando}
              >
                {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar INPC'}
              </button>
            )}
            <button 
              className="btn-calc-all"
              onClick={calcularTodas}
              disabled={calculando || totalRegistros === 0}
            >
              {calculando ? '⏳ Calculando...' : '📊 Calcular Todas'}
            </button>
          </div>
        </div>

        {esEstado && inpcInfo && (
          <div className="inpc-banner">
            <span className="inpc-label">📊 INPC más reciente:</span>
            <span className="inpc-value">{inpcInfo.periodo} = {inpcInfo.valor}</span>
          </div>
        )}
        {esEstado && !inpcInfo && (
          <div className="inpc-banner inpc-warning">
            <span>⚠️ No hay datos de INPC. Sincroniza primero con el botón "Sincronizar INPC"</span>
          </div>
        )}
      </div>

      {/* ===== FILTROS ===== */}
      <div className="calculos-filtros">
        <ProyectoSelector 
          proyectos={proyectos} 
          value={proyectoSlug} 
          onChange={setProyectoSlug} 
        />
        
        <div className="filtros-grid">
          <div className="filtro-group">
            <label>Fecha Emisión:</label>
            <input 
              type="date" 
              value={filtros.fecha_emision}
              onChange={e => setFiltros(prev => ({...prev, fecha_emision: e.target.value}))}
            />
          </div>
          <div className="filtro-group">
            <label>Visita:</label>
            <input 
              type="text" 
              value={filtros.visita}
              onChange={e => setFiltros(prev => ({...prev, visita: e.target.value.toUpperCase()}))}
              placeholder="Última visita"
              maxLength={10}
            />
          </div>
          <div className="filtro-group">
            <label>PMO:</label>
            <input 
              type="text" 
              value={filtros.pmo}
              onChange={e => setFiltros(prev => ({...prev, pmo: e.target.value.toUpperCase()}))}
              placeholder="Último PMO"
              maxLength={10}
            />
          </div>
          <div className="filtro-group">
            <label>ID Documento:</label>
            <input 
              type="number" 
              value={filtros.id_documento}
              onChange={e => setFiltros(prev => ({...prev, id_documento: e.target.value}))}
              placeholder="Catálogo documentos"
            />
          </div>
          <div className="filtro-group">
            <label>ID Notificador:</label>
            <input 
              type="number" 
              value={filtros.id_notificador}
              onChange={e => setFiltros(prev => ({...prev, id_notificador: e.target.value}))}
              placeholder="Catálogo notificadores"
            />
          </div>
        </div>
      </div>

      {/* ===== MENSAJES ===== */}
      {message && (
        <div className={`calculos-message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* ===== TABLA CON SCROLL ===== */}
      {loading ? (
        <div className="calculos-loading">Cargando datos...</div>
      ) : (
        <>
          <div className="calculos-table-wrapper">
            <table className="calculos-table">
              <thead>
                <tr>
                  {renderColumnas.map(col => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                  <th className="col-acciones">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={renderColumnas.length + 1} className="calculos-empty">
                      {proyectoSlug 
                        ? 'No hay datos en la tabla de análisis. Genera el análisis primero.'
                        : 'Selecciona un proyecto para ver los datos.'}
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row, idx) => {
                    const pkValue = row[data.pk];
                    return (
                      <tr key={idx}>
                        {renderColumnas.map(col => {
                          let value = row[col.key];
                          if (typeof value === 'number') {
                            value = value.toLocaleString('es-MX', { 
                              minimumFractionDigits: 2, 
                              maximumFractionDigits: 2 
                            });
                          }
                          if (col.key === 'codebar' && value) {
                            return (
                              <td key={col.key} className="col-codebar">
                                <span className="codebar-text">{value}</span>
                              </td>
                            );
                          }
                          if (col.key === 'importe_letra' && value) {
                            return (
                              <td key={col.key} className="col-letra" title={value}>
                                {value.length > 50 ? value.substring(0, 50) + '...' : value}
                              </td>
                            );
                          }
                          return <td key={col.key}>{value || '—'}</td>;
                        })}
                        <td className="col-acciones">
                          <button 
                            className="btn-calc-fila"
                            onClick={() => calcularFila(pkValue, row)}
                            disabled={calculando}
                            title="Calcular esta fila"
                          >
                            🔄
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ===== PAGINACIÓN ===== */}
          {totalRegistros > 0 && (
            <div className="calculos-pagination">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1}
              >
                ← Anterior
              </button>
              <span>Página {page} de {totalPages}</span>
              <select
                value={limit}
                onChange={e => { 
                  setLimit(Number(e.target.value)); 
                  setPage(1); 
                }}
                className="calculos-page-size"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                disabled={page >= totalPages}
              >
                Siguiente →
              </button>
              <span className="calculos-total-registros">
                Total: {totalRegistros.toLocaleString()} registro{totalRegistros !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}