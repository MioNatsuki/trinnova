// frontend/src/components/emision/ModalConfiguracion.jsx
import { useState, useEffect } from 'react';
import api from '../../api/auth';
import './ModalConfiguracion.css';

export default function ModalConfiguracion({
  proyectoSlug,
  plantillas,
  programas,
  cuentasSeleccionadas = [],
  onClose,
  onConfirm
}) {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    id_plantilla: '',
    nombre_job: '',
    modo: 'lotes',
    cuentas_por_lote: 50,
    orden_impresion_inicial: 1,
    programa: 'todos',
    usar_cuentas_seleccionadas: false
  });
  const [error, setError] = useState('');
  
  // Cuando se selecciona una plantilla, cargar sus placeholders
  const [placeholders, setPlaceholders] = useState([]);
  
  useEffect(() => {
    if (config.id_plantilla) {
      cargarPlaceholders(config.id_plantilla);
    }
  }, [config.id_plantilla]);
  
  const cargarPlaceholders = async (plantillaId) => {
    try {
      const res = await api.get(`/plantillas/${plantillaId}/placeholders`);
      setPlaceholders(res.data.placeholders || []);
    } catch (error) {
      console.error('Error cargando placeholders:', error);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Preparar datos
      const payload = {
        id_plantilla: parseInt(config.id_plantilla),
        nombre_job: config.nombre_job || undefined,
        modo: config.modo,
        cuentas_por_lote: config.cuentas_por_lote,
        orden_impresion_inicial: config.orden_impresion_inicial,
        filtros: {}
      };
      
      // Filtro de programa
      if (config.programa && config.programa !== 'todos') {
        payload.filtros.programa = config.programa;
      }
      
      // Filtro de cuentas seleccionadas
      if (config.usar_cuentas_seleccionadas && cuentasSeleccionadas.length > 0) {
        payload.filtros.ids = cuentasSeleccionadas;
      }
      
      // Enviar al backend
      const res = await api.post(`/emision/${proyectoSlug}/preparar`, payload);
      
      if (res.data.success) {
        onConfirm(res.data);
      } else {
        setError(res.data.message || 'Error al preparar la emisión');
      }
    } catch (error) {
      setError(error.response?.data?.detail || 'Error al preparar la emisión');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-emision" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configurar Emisión</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          {/* Nombre del Job */}
          <div className="form-group">
            <label>Nombre del Job (opcional)</label>
            <input
              type="text"
              placeholder="Ej: Emisión Predial Agosto 2026"
              value={config.nombre_job}
              onChange={e => setConfig({ ...config, nombre_job: e.target.value })}
            />
          </div>
          
          {/* Plantilla */}
          <div className="form-group">
            <label>Plantilla *</label>
            <select
              required
              value={config.id_plantilla}
              onChange={e => setConfig({ ...config, id_plantilla: e.target.value })}
            >
              <option value="">Seleccionar plantilla...</option>
              {plantillas.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.total_campos} campos)
                </option>
              ))}
            </select>
          </div>
          
          {/* Placeholders (información) */}
          {placeholders.length > 0 && (
            <div className="form-group placeholders-info">
              <label>Campos requeridos ({placeholders.length})</label>
              <div className="placeholders-list">
                {placeholders.slice(0, 10).map(p => (
                  <span key={p.placeholder} className="placeholder-tag">
                    {p.placeholder}
                  </span>
                ))}
                {placeholders.length > 10 && (
                  <span className="placeholder-tag placeholder-more">
                    +{placeholders.length - 10} más
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Modo */}
          <div className="form-group">
            <label>Modo de emisión *</label>
            <div className="modo-options">
              <label className={`modo-option ${config.modo === 'lotes' ? 'active' : ''}`}>
                <input
                  type="radio"
                  value="lotes"
                  checked={config.modo === 'lotes'}
                  onChange={e => setConfig({ ...config, modo: e.target.value })}
                />
                <div className="modo-info">
                  <strong>Lotes</strong>
                  <span>1 PDF por cuenta</span>
                </div>
              </label>
              <label className={`modo-option ${config.modo === 'paquetes' ? 'active' : ''}`}>
                <input
                  type="radio"
                  value="paquetes"
                  checked={config.modo === 'paquetes'}
                  onChange={e => setConfig({ ...config, modo: e.target.value })}
                />
                <div className="modo-info">
                  <strong>Paquetes</strong>
                  <span>Varias cuentas por PDF</span>
                </div>
              </label>
            </div>
          </div>
          
          {/* Cuentas por lote/paquete */}
          <div className="form-group">
            <label>Cuentas por {config.modo === 'lotes' ? 'lote' : 'paquete'}</label>
            <input
              type="number"
              min={1}
              max={500}
              value={config.cuentas_por_lote}
              onChange={e => setConfig({ 
                ...config, 
                cuentas_por_lote: parseInt(e.target.value) || 50 
              })}
            />
            <small className="form-hint">
              {config.modo === 'lotes' 
                ? 'Número de cuentas procesadas en cada lote (1-500)'
                : 'Número de cuentas por paquete PDF (1-500)'
              }
            </small>
          </div>
          
          {/* Orden de impresión inicial */}
          <div className="form-group">
            <label>Orden de impresión inicial</label>
            <input
              type="number"
              min={1}
              value={config.orden_impresion_inicial}
              onChange={e => setConfig({ 
                ...config, 
                orden_impresion_inicial: parseInt(e.target.value) || 1 
              })}
            />
            <small className="form-hint">
              Número desde el cual comenzarán los nombres de los archivos (ej: 00001)
            </small>
          </div>
          
          {/* Filtro de programa */}
          <div className="form-group">
            <label>Filtrar por programa</label>
            <select
              value={config.programa}
              onChange={e => setConfig({ ...config, programa: e.target.value })}
            >
              <option value="todos">Todos los programas</option>
              {programas.map(p => (
                <option key={p.id} value={p.slug}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          
          {/* Usar cuentas seleccionadas */}
          {cuentasSeleccionadas.length > 0 && (
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.usar_cuentas_seleccionadas}
                  onChange={e => setConfig({ 
                    ...config, 
                    usar_cuentas_seleccionadas: e.target.checked 
                  })}
                />
                Usar solo las {cuentasSeleccionadas.length} cuentas seleccionadas
              </label>
            </div>
          )}
          
          {error && <div className="form-error">{error}</div>}
          
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-confirm" disabled={loading}>
              {loading ? 'Preparando...' : 'Preparar Emisión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}