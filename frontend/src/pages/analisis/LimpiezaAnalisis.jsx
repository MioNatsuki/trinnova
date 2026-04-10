// frontend/src/pages/analisis/LimpiezaAnalisis.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Analisis.css';

const LIMIT = 25;

const VIABILIDAD_LABELS = {
  viable:    { label: 'Viable',     cls: 'badge-viable' },
  no_viable: { label: 'No viable',  cls: 'badge-no-viable' },
  pendiente: { label: 'Pendiente',  cls: 'badge-pendiente' },
};

export default function LimpiezaAnalisis() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  const [data, setData]           = useState({ rows: [], total: 0, pk: null });
  const [loading, setLoading]     = useState(false);
  const [page, setPage]           = useState(1);
  const [filtroVia, setFiltroVia] = useState('');
  const [busqueda, setBusqueda]   = useState('');
  const [draftBusq, setDraftBusq] = useState('');
  const [selected, setSelected]   = useState(new Set());
  const [message, setMessage]     = useState(null);
  const [ejecutando, setEjecutando] = useState(false);
  const [stats, setStats]         = useState(null);
  const [ndMotivo, setNdMotivo]   = useState('');
  const [showNdInput, setShowNdInput] = useState(false);

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));

  const loadData = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (filtroVia) params.viabilidad = filtroVia;
      if (busqueda)  params.busqueda   = busqueda;
      const res = await api.get(`/analisis/${proyectoSlug}/analisis`, { params });
      setData(res.data);
      setSelected(new Set());
    } catch (err) {
      showMessage('error', err.response?.data?.detail || 'Error cargando análisis.');
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, filtroVia, busqueda]);

  const loadStats = useCallback(async () => {
    if (!proyectoSlug) return;
    try {
      const res = await api.get(`/analisis/${proyectoSlug}/estadisticas`);
      setStats(res.data);
    } catch { /* silencioso */ }
  }, [proyectoSlug]);

  useEffect(() => { loadData(); loadStats(); }, [loadData, loadStats]);
  useEffect(() => { setPage(1); }, [proyectoSlug, filtroVia, busqueda]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const toggleSelect = (pkVal) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(pkVal) ? next.delete(pkVal) : next.add(pkVal);
      return next;
    });
  };

  const toggleAll = (e) => {
    if (e.target.checked) {
      setSelected(new Set(data.rows.map(r => r[data.pk])));
    } else {
      setSelected(new Set());
    }
  };

  const ejecutarAccion = async (accion, valor = null) => {
    if (selected.size === 0) { showMessage('error', 'Selecciona al menos un registro.'); return; }
    setEjecutando(true);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/acciones-manuales`, {
        ids:    Array.from(selected),
        accion,
        valor,
      });
      showMessage('success', res.data.message);
      loadData();
      loadStats();
    } catch (err) {
      showMessage('error', err.response?.data?.detail || 'Error ejecutando acción.');
    } finally {
      setEjecutando(false);
    }
  };

  const ejecutarLimpieza = async (tipo) => {
    if (!window.confirm(`¿Ejecutar "${tipo === 'calles' ? 'Normalizar calles' : 'Limpiar espacios'}" sobre todos los registros?`)) return;
    setEjecutando(true);
    try {
      const endpoint = tipo === 'calles'
        ? `/analisis/${proyectoSlug}/limpieza/normalizar-calles`
        : `/analisis/${proyectoSlug}/limpieza/limpiar-espacios`;
      const res = await api.post(endpoint);
      showMessage('success', res.data.message);
      loadData();
    } catch (err) {
      showMessage('error', err.response?.data?.detail || 'Error en limpieza.');
    } finally {
      setEjecutando(false);
    }
  };

  const handleNdConfirm = async () => {
    if (!ndMotivo.trim()) { showMessage('error', 'Escribe el motivo.'); return; }
    await ejecutarAccion('quitar_nd', ndMotivo);
    setNdMotivo('');
    setShowNdInput(false);
  };

  const safeStr = (v) => v !== null && v !== undefined ? String(v) : '';

  if (!proyectoSlug) {
    return (
      <div className="analisis-container">
        <div className="analisis-header"><h1>Limpieza y análisis</h1></div>
        <ProyectoSelector proyectos={proyectos} value={proyectoSlug} onChange={setProyectoSlug} />
      </div>
    );
  }

  return (
    <div className="analisis-container">
      <div className="analisis-header">
        <h1>Limpieza y análisis</h1>
      </div>

      <ProyectoSelector proyectos={proyectos} value={proyectoSlug} onChange={setProyectoSlug} />

      {/* Tarjetas de estadísticas */}
      {stats && (
        <div className="stats-cards">
          <div className="stat-card">
            <span className="stat-num">{stats.padron?.toLocaleString()}</span>
            <span className="stat-lbl">En padrón</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">{stats.analisis?.toLocaleString()}</span>
            <span className="stat-lbl">En análisis</span>
          </div>
          <div className="stat-card stat-card--green">
            <span className="stat-num">{stats.viable?.toLocaleString()}</span>
            <span className="stat-lbl">Viables</span>
          </div>
          <div className="stat-card stat-card--red">
            <span className="stat-num">{stats.no_viable?.toLocaleString()}</span>
            <span className="stat-lbl">No viables</span>
          </div>
          <div className="stat-card stat-card--amber">
            <span className="stat-num">{stats.pendiente?.toLocaleString()}</span>
            <span className="stat-lbl">Pendientes</span>
          </div>
        </div>
      )}

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {/* Herramientas de limpieza automática */}
      <div className="limpieza-tools">
        <h3>Herramientas de limpieza automática</h3>
        <div className="tools-grid">
          <button onClick={() => ejecutarLimpieza('calles')} disabled={ejecutando}>
            🧹 Normalizar calles
          </button>
          <button onClick={() => ejecutarLimpieza('espacios')} disabled={ejecutando}>
            ✂️ Limpiar espacios extra
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--clr-muted)', marginTop: 10 }}>
          La normalización de calles aplica expresiones regulares sobre todo el padrón
          (Av. → Avenida, Blvd. → Boulevard, Gpe. → Guadalupe, etc.)
        </p>
      </div>

      {/* Acciones manuales */}
      <div className="acciones-manuales">
        <h3>Acciones manuales
          {selected.size > 0 && (
            <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 8, color: 'var(--clr-muted)' }}>
              — {selected.size} seleccionados
            </span>
          )}
        </h3>
        <div className="actions-grid">
          <button
            onClick={() => ejecutarAccion('viable')}
            disabled={ejecutando || selected.size === 0}
            className="btn-viable"
          >
            ✓ Marcar Viables
          </button>
          <button
            onClick={() => ejecutarAccion('no_viable')}
            disabled={ejecutando || selected.size === 0}
            className="btn-no-viable"
          >
            ✗ Marcar No Viables
          </button>
          <button
            onClick={() => ejecutarAccion('quitar_pagada')}
            disabled={ejecutando || selected.size === 0}
            className="btn-pagada"
          >
            💰 Quitar Pagadas
          </button>
          <button
            onClick={() => setShowNdInput(v => !v)}
            disabled={ejecutando || selected.size === 0}
            className="btn-nd"
          >
            📋 Quitar ND
          </button>
        </div>

        {showNdInput && (
          <div className="nd-input-row">
            <input
              type="text"
              value={ndMotivo}
              onChange={e => setNdMotivo(e.target.value)}
              placeholder="Motivo (ej: Convenio, ND, Pagado externo…)"
              className="search-input"
              style={{ flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && handleNdConfirm()}
            />
            <button onClick={handleNdConfirm} className="btn-save" disabled={ejecutando}>
              Confirmar
            </button>
            <button onClick={() => { setShowNdInput(false); setNdMotivo(''); }}
                    className="btn-secondary btn-sm">
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="filtros-analisis">
        <select value={filtroVia} onChange={e => setFiltroVia(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="viable">Solo Viables</option>
          <option value="no_viable">Solo No Viables</option>
          <option value="pendiente">Solo Pendientes</option>
        </select>
        <form onSubmit={e => { e.preventDefault(); setBusqueda(draftBusq); }}
              style={{ display: 'flex', gap: 8, flex: 1 }}>
          <input
            type="text"
            placeholder="Buscar por cuenta, propietario, calle…"
            value={draftBusq}
            onChange={e => setDraftBusq(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--clr-border)', borderRadius: 8, fontSize: 13 }}
          />
          <button type="submit" className="btn-secondary btn-sm">Buscar</button>
          {busqueda && (
            <button type="button" className="btn-secondary btn-sm"
              onClick={() => { setBusqueda(''); setDraftBusq(''); }}>
              Limpiar
            </button>
          )}
        </form>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="analisis-loading">Cargando…</div>
      ) : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={data.rows.length > 0 && selected.size === data.rows.length}
                      ref={el => {
                        if (el) el.indeterminate = selected.size > 0 && selected.size < data.rows.length;
                      }}
                    />
                  </th>
                  <th>ID / Clave</th>
                  <th>Nombre</th>
                  <th>Dirección</th>
                  <th style={{ textAlign: 'right' }}>Adeudo</th>
                  <th style={{ textAlign: 'center' }}>Viabilidad</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--clr-muted)' }}>
                      {busqueda || filtroVia ? 'Sin resultados para los filtros aplicados.' : 'No hay registros en tabla_analisis.'}
                    </td>
                  </tr>
                ) : (
                  data.rows.map(row => {
                    const pk = row[data.pk];
                    const via = row.viabilidad || 'pendiente';
                    const via_info = VIABILIDAD_LABELS[via] || VIABILIDAD_LABELS.pendiente;
                    return (
                      <tr
                        key={pk}
                        className={selected.has(pk) ? 'selected' : ''}
                        onClick={() => toggleSelect(pk)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(pk)}
                            onChange={() => toggleSelect(pk)}
                          />
                        </td>
                        <td className="pk-cell">{safeStr(pk)}</td>
                        <td>{safeStr(row._nombre_display)}</td>
                        <td>{safeStr(row._calle_display)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {typeof row._adeudo_display === 'number'
                            ? `$${row._adeudo_display.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={via_info.cls}>{via_info.label}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              ← Anterior
            </button>
            <span>Página {page} de {totalPages} · {data.total.toLocaleString()} registros</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              Siguiente →
            </button>
          </div>

          <div className="stats-info">
            Total: {data.total.toLocaleString()} · Seleccionados: {selected.size}
          </div>
        </>
      )}

      <style>{`
        .stats-cards {
          display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .stat-card {
          flex: 1; min-width: 100px; background: var(--clr-white);
          border: 1px solid var(--clr-border); border-radius: var(--radius);
          padding: 16px 20px; display: flex; flex-direction: column; gap: 4px;
          box-shadow: var(--shadow-sm);
        }
        .stat-card--green { border-left: 3px solid var(--clr-green); }
        .stat-card--red   { border-left: 3px solid var(--clr-red); }
        .stat-card--amber { border-left: 3px solid var(--clr-orange); }
        .stat-num { font-size: 28px; font-weight: 300; color: var(--clr-text); }
        .stat-lbl { font-size: 11px; color: var(--clr-muted); }

        .nd-input-row {
          display: flex; gap: 8px; margin-top: 12px; align-items: center;
        }
        .btn-secondary {
          background: var(--clr-white); border: 1px solid var(--clr-border);
          border-radius: 7px; font-size: 13px; font-family: 'Outfit', sans-serif;
          color: var(--clr-muted); padding: 8px 14px; cursor: pointer;
          transition: all .15s;
        }
        .btn-secondary:hover { background: var(--clr-bg); color: var(--clr-text); }
        .btn-sm { padding: 6px 12px !important; font-size: 12px !important; }
      `}</style>
    </div>
  );
}