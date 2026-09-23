// frontend/src/pages/emision/EmisionEspecial.jsx
import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import Monitoreo from './Monitoreo';
import './EmisionEspecial.css';

export default function EmisionEspecial() {
  const location = useLocation();
  const navigate = useNavigate();
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  const [query, setQuery]               = useState('');
  const [draftQuery, setDraftQuery]     = useState('');
  const [loading, setLoading]           = useState(false);
  const [resultados, setResultados]     = useState([]);
  const [selected, setSelected]         = useState(new Set());
  const [message, setMessage]           = useState(null);
  const [showModal, setShowModal]       = useState(false);
  const [preparando, setPreparando]     = useState(false);
  const [jobActivo, setJobActivo]       = useState(null);

  // Configuración del job
  const [config, setConfig] = useState({
    nombre_job: '',
    cuentas_por_lote: 50,
    orden_impresion_inicial: 1,
  });

  useEffect(() => {
    if (location.state?.proyectoSlug) {
      setProyectoSlug(location.state.proyectoSlug);
    }
  }, [location.state, setProyectoSlug]);

  // Reset al cambiar proyecto
  useEffect(() => {
    setResultados([]);
    setSelected(new Set());
    setQuery('');
    setDraftQuery('');
  }, [proyectoSlug]);

  const showMsg = useCallback((type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  // ---------- Buscar ----------
  const buscar = useCallback(async (q) => {
    if (!proyectoSlug || !q.trim()) return;
    setLoading(true);
    try {
      const res = await api.get(`/emision/${proyectoSlug}/emision-especial/buscar`, {
        params: { q: q.trim(), limit: 200 }
      });
      setResultados(res.data.resultados || []);
      if ((res.data.resultados || []).length === 0) {
        showMsg('error', 'Sin resultados para esa búsqueda.');
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error en la búsqueda.');
      setResultados([]);
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, showMsg]);

  const handleSearch = (e) => {
    e.preventDefault();
    setQuery(draftQuery);
    buscar(draftQuery);
  };

  const limpiar = () => {
    setQuery('');
    setDraftQuery('');
    setResultados([]);
    setSelected(new Set());
  };

  // ---------- Selección ----------
  const toggle = (codebar) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(codebar)) n.delete(codebar);
      else n.add(codebar);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === resultados.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(resultados.map(r => r.codebar)));
    }
  };

  const todosSeleccionados = resultados.length > 0 && selected.size === resultados.length;

  // ---------- Preparar reimpresión ----------
  const handlePreparar = async () => {
    if (selected.size === 0) {
      showMsg('error', 'Selecciona al menos un codebar.');
      return;
    }
    setPreparando(true);
    try {
      const res = await api.post(`/emision/${proyectoSlug}/emision-especial/preparar`, {
        codebars: Array.from(selected),
        nombre_job: config.nombre_job || undefined,
        cuentas_por_lote: config.cuentas_por_lote,
        orden_impresion_inicial: config.orden_impresion_inicial,
      });

      if (res.data.success) {
        showMsg('success', res.data.message);
        setShowModal(false);
        setSelected(new Set());
        setJobActivo({ id: res.data.job_id });
      } else {
        showMsg('error', res.data.message || 'Error al preparar.');
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al preparar la reimpresión.');
    } finally {
      setPreparando(false);
    }
  };

  // ---------- Render ----------
  if (!proyectoSlug) {
    return (
      <div className="ee-page">
        <div className="ee-header">
          <h1>Emisión Especial</h1>
        </div>
        <ProyectoSelector
          proyectos={proyectos}
          value={proyectoSlug}
          onChange={setProyectoSlug}
        />
        <div className="ee-empty-state">
          Selecciona un proyecto para comenzar.
        </div>
      </div>
    );
  }

  return (
    <div className="ee-page">

      {/* HEADER */}
      <div className="ee-header">
        <div>
          <h1>Emisión Especial</h1>
          <p className="ee-subtitle">
            Reimprime documentos ya emitidos buscando por código de barras o cuenta.
          </p>
        </div>
        <ProyectoSelector
          proyectos={proyectos}
          value={proyectoSlug}
          onChange={setProyectoSlug}
        />
      </div>

      {/* BUSCADOR */}
      <form className="ee-search-form" onSubmit={handleSearch}>
        <div className="ee-search-input-wrap">
          <span className="ee-search-icon">🔍</span>
          <input
            type="text"
            className="ee-search-input"
            placeholder="Escanea o escribe el código de barras, o busca por cuenta…"
            value={draftQuery}
            onChange={e => setDraftQuery(e.target.value)}
            autoFocus
          />
          {draftQuery && (
            <button type="button" className="ee-search-clear" onClick={limpiar}>✕</button>
          )}
        </div>
        <button type="submit" className="ee-search-btn" disabled={loading || !draftQuery.trim()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {message && (
        <div className={`ee-message ee-message--${message.type}`}>
          {message.text}
        </div>
      )}

      {/* MONITOREO SI HAY JOB ACTIVO */}
      {jobActivo && (
        <Monitoreo
          jobId={jobActivo.id}
          onComplete={() => setJobActivo(null)}
        />
      )}

      {/* TABLA DE RESULTADOS */}
      {resultados.length > 0 && (
        <>
          <div className="ee-toolbar">
            <span className="ee-count">
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
            </span>
            {selected.size > 0 && (
              <span className="ee-selected-badge">
                {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
              </span>
            )}
            <button
              className="ee-btn ee-btn--primary"
              disabled={selected.size === 0}
              onClick={() => setShowModal(true)}
            >
              Reimprimir seleccionados ({selected.size})
            </button>
          </div>

          <div className="ee-table-wrapper">
            <table className="ee-table">
              <thead>
                <tr>
                  <th className="ee-th ee-th--check">
                    <input
                      type="checkbox"
                      checked={todosSeleccionados}
                      onChange={toggleAll}
                      ref={el => {
                        if (el) el.indeterminate = selected.size > 0 && selected.size < resultados.length;
                      }}
                    />
                  </th>
                  <th className="ee-th">Codebar</th>
                  <th className="ee-th">Cuenta</th>
                  <th className="ee-th">Nombre</th>
                  <th className="ee-th">Orden</th>
                  <th className="ee-th">Fecha registro</th>
                  <th className="ee-th">Estatus</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, idx) => {
                  const isSel = selected.has(r.codebar);
                  const nombre = r.nombre || r.propietario
                    || r.nombre_razon_social || r.propietariotitular_n || '—';

                  return (
                    <tr key={r.codebar || idx} className={isSel ? 'ee-tr--sel' : ''}>
                      <td className="ee-td ee-td--check">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggle(r.codebar)}
                        />
                      </td>
                      <td className="ee-td ee-td--codebar">{r.codebar}</td>
                      <td className="ee-td ee-td--pk">{r.cuenta || r.credito
                        || r.licencia || r.prestamo || r.clave_APA || r.cuenta_n || '—'}</td>
                      <td className="ee-td">{nombre}</td>
                      <td className="ee-td">{r.orden_impresion ?? '—'}</td>
                      <td className="ee-td">{r.fecha_registro
                        ? new Date(r.fecha_registro).toLocaleString('es-MX', {
                            dateStyle: 'short', timeStyle: 'short'
                          })
                        : '—'}</td>
                      <td className="ee-td">
                        <span className="ee-status">{r.estatus || '—'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ESTADO VACÍO */}
      {!loading && resultados.length === 0 && query && (
        <div className="ee-empty">
          <p>No se encontraron resultados para <strong>{query}</strong>.</p>
          <span>Prueba con otro código de barras o con la cuenta.</span>
        </div>
      )}

      {!loading && resultados.length === 0 && !query && (
        <div className="ee-empty-hint">
          <p>Ingresa un código de barras o una cuenta para comenzar.</p>
          <span>Solo se buscan documentos que ya fueron emitidos previamente.</span>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN */}
      {showModal && (
        <div className="ee-overlay" onClick={(e) => {
          if (e.target !== e.currentTarget) return;
          if (config.nombre_job) {
            if (window.confirm('¿Cerrar sin preparar la reimpresión?')) setShowModal(false);
          } else {
            setShowModal(false);
          }
        }}>
          <div className="ee-modal" onClick={e => e.stopPropagation()}>
            <div className="ee-modal-header">
              <h3>Confirmar Reimpresión</h3>
              <button className="ee-modal-close" onClick={() => {
                if (config.nombre_job) {
                  if (window.confirm('¿Cerrar sin preparar la reimpresión?')) setShowModal(false);
                } else setShowModal(false);
              }}>✕</button>
            </div>

            <div className="ee-modal-body">
              <div className="ee-modal-resumen">
                <span className="ee-modal-resumen-num">{selected.size}</span>
                <span className="ee-modal-resumen-label">
                  documento{selected.size !== 1 ? 's' : ''} a reimprimir
                </span>
              </div>

              <label className="ee-label">Nombre del job (opcional)</label>
              <input
                type="text"
                className="ee-input"
                placeholder="Ej: Reimpresión por pérdida - Lote 5"
                value={config.nombre_job}
                onChange={e => setConfig({ ...config, nombre_job: e.target.value })}
              />

              <label className="ee-label">Cuentas por lote</label>
              <input
                type="number"
                className="ee-input"
                min="1"
                max="500"
                value={config.cuentas_por_lote}
                onChange={e => setConfig({
                  ...config,
                  cuentas_por_lote: parseInt(e.target.value) || 50
                })}
              />

              <label className="ee-label">Orden de impresión inicial</label>
              <input
                type="number"
                className="ee-input"
                min="1"
                value={config.orden_impresion_inicial}
                onChange={e => setConfig({
                  ...config,
                  orden_impresion_inicial: parseInt(e.target.value) || 1
                })}
              />

              <p className="ee-modal-note">
                Los PDFs se generarán con los datos guardados en el histórico.
                No se modifica el registro original.
              </p>
            </div>

            <div className="ee-modal-footer">
              <button
                className="ee-btn"
                onClick={() => setShowModal(false)}
                disabled={preparando}
              >
                Cancelar
              </button>
              <button
                className="ee-btn ee-btn--primary"
                onClick={handlePreparar}
                disabled={preparando}
              >
                {preparando ? 'Preparando…' : 'Reimprimir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}