// frontend/src/pages/emision/ModalConfiguracion.jsx
import { useState, useEffect } from 'react';
import api from '../../api/auth';
import './ModalConfiguracion.css';

export default function ModalConfiguracion({
  proyectoSlug,
  totalCuentas = 0,
  onClose,
  onConfirm
}) {
  const [loading, setLoading]             = useState(false);
  const [cargandoCat, setCargandoCat]     = useState(true);
  const [plantillas, setPlantillas]       = useState([]);
  const [programas, setProgramas]         = useState([]);
  const [error, setError]                 = useState('');
  const [confirmCerrar, setConfirmCerrar] = useState(false);

  const [config, setConfig] = useState({
    id_plantilla: '',
    nombre_job: '',
    modo: 'lotes',
    cuentas_por_lote: 50,
    orden_impresion_inicial: 1,
    programa: 'todos',
  });

  // Cargar catálogos al abrir
  useEffect(() => {
    if (!proyectoSlug) return;
    setCargandoCat(true);
    Promise.all([
      api.get(`/emision/${proyectoSlug}/plantillas`),
      api.get(`/emision/${proyectoSlug}/programas`),
    ])
      .then(([pl, pr]) => {
        setPlantillas(pl.data || []);
        setProgramas(pr.data || []);
      })
      .catch(err => {
        console.error('Error cargando catálogos:', err);
        setError('No se pudieron cargar plantillas o programas.');
      })
      .finally(() => setCargandoCat(false));
  }, [proyectoSlug]);

  // Bloqueo de cierre con cambios
  const handleOverlayClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (config.id_plantilla || config.nombre_job) {
      setConfirmCerrar(true);
    } else {
      onClose();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        id_plantilla: parseInt(config.id_plantilla),
        nombre_job: config.nombre_job || undefined,
        modo: config.modo,
        cuentas_por_lote: config.cuentas_por_lote,
        orden_impresion_inicial: config.orden_impresion_inicial,
        filtros: {},
      };

      const res = await api.post(`/emision/${proyectoSlug}/preparar`, payload);

      if (res.data.success) {
        onConfirm(res.data);
      } else {
        setError(res.data.message || 'Error al preparar la emisión');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al preparar la emisión');
    } finally {
      setLoading(false);
    }
  };

  const totalPaginasEstimadas = config.modo === 'paquetes'
    ? Math.ceil(totalCuentas / Math.max(1, config.cuentas_por_lote))
    : totalCuentas;

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-emision" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configurar Emisión</h2>
          <button className="modal-close" onClick={() => setConfirmCerrar(true)}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* Resumen de cuentas */}
          <div className="modal-resumen">
            <span className="modal-resumen-num">{totalCuentas.toLocaleString()}</span>
            <span className="modal-resumen-label">
              cuenta{totalCuentas !== 1 ? 's' : ''} en cola para emitir
            </span>
          </div>

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
            {cargandoCat ? (
              <div className="form-loading">Cargando plantillas…</div>
            ) : plantillas.length === 0 ? (
              <div className="form-empty">
                No hay plantillas activas. Sincroniza plantillas primero.
              </div>
            ) : (
              <select
                required
                value={config.id_plantilla}
                onChange={e => setConfig({ ...config, id_plantilla: e.target.value })}
              >
                <option value="">Seleccionar plantilla…</option>
                {plantillas.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.total_campos} campos)
                  </option>
                ))}
              </select>
            )}
          </div>

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

          {/* Cuentas por lote */}
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
                ? `Se procesarán ${totalCuentas} PDFs individuales en ${Math.ceil(totalCuentas / Math.max(1, config.cuentas_por_lote))} lote(s).`
                : `Se generarán ~${totalPaginasEstimadas} PDF(s) agrupados.`}
            </small>
          </div>

          {/* Orden inicial */}
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
              Número desde el cual comenzarán los nombres de archivo (ej. 00001)
            </small>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={() => setConfirmCerrar(true)}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-confirm"
              disabled={loading || !config.id_plantilla}
            >
              {loading ? 'Preparando…' : 'Comenzar Emisión'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal de confirmación de cierre */}
      {confirmCerrar && (
        <div className="confirm-overlay" onClick={() => setConfirmCerrar(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>¿Cerrar sin guardar?</h3>
            <p>Perderás los cambios de configuración que hayas hecho.</p>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setConfirmCerrar(false)}>
                Quedarme
              </button>
              <button className="btn-confirm" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}