// frontend/src/pages/analisis/LimpiezaAnalisis.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import './LimpiezaAnalisis.css';

const LIMIT = 50;

// ── Reglas de detección de errores ──────────────────────────────────────────
// Cada regla recibe (valor, colName, allRow) y devuelve string con motivo o null

const today = new Date();
today.setHours(0, 0, 0, 0);
const EPOCH_ERROR = new Date('1900-01-02');

function isDateCol(col) {
  return /fecha|abono|aportacion|alta|fec|convenio|asignacion|emision/i.test(col);
}
function isExtIntCol(col) {
  return /num.*ext|ext.*num|n.*ext|no.*ext|num.*int|int.*num|n.*int|no.*int|exterior|interior/i.test(col);
}
function isPhoneCol(col) {
  return /telefono|celular|lada|tel|cel/i.test(col);
}
function isNumericOnlyCol(col) {
  return /^(cp|codigo_postal|afiliado_cp|aval_cp|zona|subzona|folio|cvereq|axoreq|recaud|cuenta$|afiliado$|prestamo$|licencia$|credito$)/i.test(col);
}
function isGastosCol(col) {
  return /gastos|cobro|ejecucion|notif|multa(?!_virtual)|actualizacion/i.test(col);
}

const DATE_FORMATS_DETECT = [
  /^\d{4}-\d{2}-\d{2}/, /^\d{2}\/\d{2}\/\d{4}/, /^\d{2}-\d{2}-\d{4}/
];

function parseAnyDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  // Check for zero-date patterns
  if (/^0+[-/]0+[-/]0+/.test(s)) return 'zero';
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function detectErrors(val, col, row) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  const reasons = [];

  // 1. Fecha futura, cero, o 1900
  if (isDateCol(col)) {
    const d = parseAnyDate(s);
    if (d === 'zero') reasons.push('Fecha en cero');
    else if (d instanceof Date) {
      if (d <= EPOCH_ERROR) reasons.push('Fecha inválida (1900)');
      else if (d > today) reasons.push('Fecha futura');
    }
  }

  // 2. Número exterior/interior parece fecha
  if (isExtIntCol(col) && DATE_FORMATS_DETECT.some(r => r.test(s))) {
    reasons.push('Número con formato de fecha');
  }

  // 3. Gastos en cero o vacío
  if (isGastosCol(col)) {
    const n = parseFloat(s);
    if (!isNaN(n) && n === 0) reasons.push('Gasto en cero');
  }

  // 4. Caracteres mal codificados (mojibake típico)
  if (/[ÃÂ§Â¡Â©Ã¼Ã³Ã±Ã©Ã­Ã¡]/u.test(s)) {
    reasons.push('Posible error de codificación (tildes/caracteres)');
  }

  // 5. Palabras cortadas: texto corto que termina en consonante inusual sin vocal final
  if (typeof val === 'string' && s.length > 3 && s.length < 8
    && /[bcdfghjklmnpqrstvwxyz]$/i.test(s)
    && !/\d/.test(s)
    && !isNumericOnlyCol(col)) {
    reasons.push('Posible texto cortado');
  }

  // 6. Letras donde solo deberían ir números
  if (isNumericOnlyCol(col) && /[a-zA-Z]/.test(s)) {
    reasons.push('Letras en campo numérico');
  }

  // 7. Teléfono con longitud incorrecta
  if (isPhoneCol(col)) {
    const digits = s.replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 8 && digits.length !== 10 && digits.length !== 13) {
      reasons.push(`Teléfono inválido (${digits.length} dígitos, esperado 8, 10 o 13)`);
    }
  }

  return reasons.length > 0 ? reasons.join(' · ') : null;
}

// ── Íconos SVG inline ───────────────────────────────────────────────────────

const Icon = ({ d, d2, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  spaces:  { d:"M4 6h16M4 12h16M4 18h7", d2:"M15 18l4-4m0 0l4 4m-4-4v8" },
  streets: { d:"M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3" },
  upload:  { d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2:"M17 8l-5-5-5 5M12 3v12" },
  search:  { d:"M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0" },
  filter:  { d:"M22 3H2l8 9.46V19l4 2V12.46L22 3z" },
  chevron: { d:"M6 9l6 6 6-6" },
};

const VIABILIDAD_CONFIG = {
  viable:    { label: 'Viable',    bg: '#c6f6d5', color: '#276749', dot: '#38a169' },
  no_viable: { label: 'No viable', bg: '#fed7d7', color: '#9b2c2c', dot: '#e53e3e' },
  pendiente: { label: 'Pendiente', bg: '#feebc8', color: '#9c4221', dot: '#ed8936' },
};

// ── Componente principal ────────────────────────────────────────────────────

export default function LimpiezaAnalisis() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  const [programas,     setProgramas]     = useState([]);
  const [programa,      setPrograma]      = useState('todos');

  const [data,          setData]          = useState({ rows: [], total: 0, pk: null });
  const [loading,       setLoading]       = useState(false);
  const [page,          setPage]          = useState(1);
  const [filtroVia,     setFiltroVia]     = useState('');
  const [busqueda,      setBusqueda]      = useState('');
  const [draftBusq,     setDraftBusq]     = useState('');
  const [selected,      setSelected]      = useState(new Set());
  const [message,       setMessage]       = useState(null);
  const [ejecutando,    setEjecutando]    = useState(false);
  const [stats,         setStats]         = useState(null);
  const [ndMotivo,      setNdMotivo]      = useState('');
  const [showNdInput,   setShowNdInput]   = useState(false);

  // CSV masivo
  const [showCsvModal,  setShowCsvModal]  = useState(false);
  const [csvFile,       setCsvFile]       = useState(null);
  const [csvLoading,    setCsvLoading]    = useState(false);
  const [csvResult,     setCsvResult]     = useState(null);
  const csvInputRef = useRef();

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));

  // ── Cargar programas cuando cambia proyecto ───────────────────────────────
  useEffect(() => {
    if (!proyectoSlug) { setProgramas([]); setPrograma('todos'); return; }
    api.get(`/analisis/${proyectoSlug}/programas`)
      .then(r => setProgramas(r.data || []))
      .catch(() => setProgramas([]));
  }, [proyectoSlug]);

  // ── Cargar datos ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (filtroVia)              params.viabilidad = filtroVia;
      if (busqueda)               params.busqueda   = busqueda;
      if (programa !== 'todos')   params.programa   = programa;
      const res = await api.get(`/analisis/${proyectoSlug}/analisis`, { params });
      setData(res.data);
      setSelected(new Set());
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error cargando análisis.');
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, filtroVia, busqueda, programa]);

  const loadStats = useCallback(async () => {
    if (!proyectoSlug) return;
    try {
      const res = await api.get(`/analisis/${proyectoSlug}/estadisticas`);
      setStats(res.data);
    } catch { /* silencioso */ }
  }, [proyectoSlug]);

  useEffect(() => { loadData(); loadStats(); }, [loadData, loadStats]);
  useEffect(() => { setPage(1); }, [proyectoSlug, filtroVia, busqueda, programa]);

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ── Selección ─────────────────────────────────────────────────────────────
  const toggleSelect = (pkVal) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(pkVal) ? next.delete(pkVal) : next.add(pkVal);
      return next;
    });
  };
  const toggleAll = (e) => {
    if (e.target.checked) setSelected(new Set(data.rows.map(r => r[data.pk])));
    else setSelected(new Set());
  };

  // ── Acciones manuales ─────────────────────────────────────────────────────
  const ejecutarAccion = async (accion, valor = null) => {
    if (selected.size === 0) { showMsg('error', 'Selecciona al menos un registro.'); return; }
    setEjecutando(true);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/acciones-manuales`,
        { ids: Array.from(selected), accion, valor });
      showMsg('success', res.data.message);
      loadData(); loadStats();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error ejecutando acción.');
    } finally { setEjecutando(false); }
  };

  // ── Limpieza ──────────────────────────────────────────────────────────────
  const ejecutarLimpieza = async (tipo) => {
    if (!window.confirm(`¿Ejecutar "${tipo === 'calles' ? 'Normalizar calles' : 'Limpiar espacios'}" sobre toda la tabla?`)) return;
    setEjecutando(true);
    try {
      const endpoint = tipo === 'calles'
        ? `/analisis/${proyectoSlug}/limpieza/normalizar-calles`
        : `/analisis/${proyectoSlug}/limpieza/limpiar-espacios`;
      const res = await api.post(endpoint);
      showMsg('success', res.data.message);
      loadData();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error en limpieza.');
    } finally { setEjecutando(false); }
  };

  // ── CSV masivo ────────────────────────────────────────────────────────────
  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    const formData = new FormData();
    formData.append('file', csvFile);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/cargar-viabilidad-csv`, formData,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setCsvResult(res.data);
      loadData(); loadStats();
    } catch (err) {
      setCsvResult({ success: false, message: err.response?.data?.detail || 'Error al cargar CSV.', procesados: 0, errores: [] });
    } finally { setCsvLoading(false); }
  };

  const safeStr = (v) => v !== null && v !== undefined ? String(v) : '';

  // ── Columnas de la tabla ──────────────────────────────────────────────────
  const allCols = data.rows.length > 0 ? Object.keys(data.rows[0]).filter(c => !c.startsWith('_')) : [];

  if (!proyectoSlug) {
    return (
      <div className="la-page">
        <div className="la-header">
          <h1 className="la-title">Limpieza y Análisis</h1>
        </div>
        <div className="la-no-project">
          <p>Selecciona un proyecto para continuar.</p>
          <select className="la-select" value="" onChange={e => setProyectoSlug(e.target.value)}>
            <option value="">— Proyecto —</option>
            {proyectos.map(p => <option key={p.id} value={p.slug}>{p.nombre}</option>)}
          </select>
        </div>
      </div>
    );
  }

  const proyectoActual = proyectos.find(p => p.slug === proyectoSlug);

  return (
    <div className="la-page">

      {/* ── TOOLBAR ─────────────────────────────────────────────────────── */}
      <div className="la-toolbar">

        {/* Dropdowns izquierda */}
        <div className="la-dropdowns">
          {/* Proyecto */}
          <div className="la-select-wrap">
            <span className="la-select-label">Proyecto:</span>
            <div className="la-dropdown">
              <select className="la-select" value={proyectoSlug}
                onChange={e => { setProyectoSlug(e.target.value); setPrograma('todos'); }}>
                {proyectos.map(p => <option key={p.id} value={p.slug}>{p.nombre}</option>)}
              </select>
              <span className="la-chevron"><Icon {...ICONS.chevron} size={14} /></span>
            </div>
          </div>

          {/* Programa */}
          <div className="la-select-wrap">
            <span className="la-select-label">Programa:</span>
            <div className="la-dropdown">
              <select className="la-select" value={programa} onChange={e => setPrograma(e.target.value)}>
                <option value="todos">Todos</option>
                {programas.map(p => <option key={p.id} value={p.slug}>{p.nombre}</option>)}
              </select>
              <span className="la-chevron"><Icon {...ICONS.chevron} size={14} /></span>
            </div>
          </div>

          {/* Barra de búsqueda */}
          <form className="la-search-form" onSubmit={e => { e.preventDefault(); setBusqueda(draftBusq); setPage(1); }}>
            <span className="la-search-icon"><Icon {...ICONS.search} size={14} /></span>
            <input
              className="la-search-input"
              type="text"
              placeholder="Buscar…"
              value={draftBusq}
              onChange={e => setDraftBusq(e.target.value)}
            />
            {busqueda && (
              <button type="button" className="la-search-clear"
                onClick={() => { setBusqueda(''); setDraftBusq(''); }}>✕</button>
            )}
          </form>
        </div>

        {/* Iconos herramientas derecha */}
        <div className="la-tools">
          <button className="la-tool-btn" onClick={() => ejecutarLimpieza('espacios')} disabled={ejecutando}
            title="Limpiar espacios extras">
            <Icon {...ICONS.spaces} />
            <span>Espacios</span>
          </button>
          <button className="la-tool-btn" onClick={() => ejecutarLimpieza('calles')} disabled={ejecutando}
            title="Normalizar calles (regex)">
            <Icon {...ICONS.streets} />
            <span>Calles</span>
          </button>
          <button className="la-tool-btn la-tool-btn--accent" onClick={() => { setCsvFile(null); setCsvResult(null); setShowCsvModal(true); }}
            title="Cargar viabilidad/pagos desde CSV">
            <Icon {...ICONS.upload} />
            <span>Cargar CSV</span>
          </button>
        </div>
      </div>

      {/* ── STATS ───────────────────────────────────────────────────────── */}
      {stats && (
        <div className="la-stats">
          {[
            { label: 'Padrón',     val: stats.padron,     cls: '' },
            { label: 'Análisis',   val: stats.analisis,   cls: '' },
            { label: 'Viables',    val: stats.viable,     cls: 'green' },
            { label: 'No viables', val: stats.no_viable,  cls: 'red' },
            { label: 'Pendientes', val: stats.pendiente,  cls: 'amber' },
          ].map(s => (
            <div key={s.label} className={`la-stat la-stat--${s.cls || 'neutral'}`}>
              <span className="la-stat-num">{(s.val ?? 0).toLocaleString()}</span>
              <span className="la-stat-lbl">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── ACCIONES / FILTROS ──────────────────────────────────────────── */}
      <div className="la-actions-row">

        {/* Filtro viabilidad */}
        <select className="la-filter-select" value={filtroVia} onChange={e => setFiltroVia(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="viable">Viables</option>
          <option value="no_viable">No viables</option>
          <option value="pendiente">Pendientes</option>
        </select>

        {/* Botones de acción masiva */}
        <div className="la-action-btns">
          <button onClick={() => ejecutarAccion('viable')}
            disabled={ejecutando || selected.size === 0} className="la-btn la-btn--viable">
            ✓ Viable
          </button>
          <button onClick={() => ejecutarAccion('no_viable')}
            disabled={ejecutando || selected.size === 0} className="la-btn la-btn--novia">
            ✗ No viable
          </button>
          <button onClick={() => ejecutarAccion('quitar_pagada')}
            disabled={ejecutando || selected.size === 0} className="la-btn la-btn--pagada">
            💰 Pagada
          </button>
          <button onClick={() => setShowNdInput(v => !v)}
            disabled={ejecutando || selected.size === 0} className="la-btn la-btn--nd">
            📋 ND
          </button>
        </div>

        {selected.size > 0 && (
          <span className="la-selected-count">{selected.size} seleccionados</span>
        )}
      </div>

      {/* Input motivo ND */}
      {showNdInput && (
        <div className="la-nd-row">
          <input type="text" value={ndMotivo} onChange={e => setNdMotivo(e.target.value)}
            placeholder="Motivo ND…" className="la-nd-input"
            onKeyDown={e => {
              if (e.key === 'Enter' && ndMotivo.trim()) {
                ejecutarAccion('quitar_nd', ndMotivo);
                setNdMotivo(''); setShowNdInput(false);
              }
            }}
          />
          <button className="la-btn la-btn--viable"
            onClick={() => { ejecutarAccion('quitar_nd', ndMotivo); setNdMotivo(''); setShowNdInput(false); }}
            disabled={!ndMotivo.trim() || ejecutando}>
            Confirmar
          </button>
          <button className="la-btn la-btn--ghost" onClick={() => { setShowNdInput(false); setNdMotivo(''); }}>
            Cancelar
          </button>
        </div>
      )}

      {message && <div className={`la-message la-message--${message.type}`}>{message.text}</div>}

      {/* ── TABLA ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="la-loading">Cargando datos…</div>
      ) : (
        <div className="la-table-wrapper">
          <table className="la-table">
            <thead>
              <tr>
                {/* Checkbox */}
                <th className="la-th la-th--check la-th--sticky-check">
                  <input type="checkbox" onChange={toggleAll}
                    checked={data.rows.length > 0 && selected.size === data.rows.length}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < data.rows.length; }}
                  />
                </th>

                {/* Columnas normales (scrollables) */}
                {allCols.filter(c => c !== 'viabilidad').map(col => (
                  <th key={col} className="la-th">{col.replace(/_/g, ' ')}</th>
                ))}

                {/* Columna fija: Viabilidad */}
                <th className="la-th la-th--sticky la-th--via">Viabilidad</th>

                {/* Columna fija: Pagos */}
                <th className="la-th la-th--sticky la-th--pago">Pago</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={allCols.length + 3} className="la-empty">
                    {busqueda ? 'Sin resultados para la búsqueda.' : 'No hay registros en tabla_analisis. Genera el análisis primero.'}
                  </td>
                </tr>
              ) : (
                data.rows.map(row => {
                  const pkVal = row[data.pk];
                  const isSelected = selected.has(pkVal);
                  return (
                    <tr key={pkVal} className={`la-tr ${isSelected ? 'la-tr--selected' : ''}`}
                      onClick={() => toggleSelect(pkVal)}>
                      <td className="la-td la-td--check la-td--sticky-check" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected}
                          onChange={() => toggleSelect(pkVal)} />
                      </td>

                      {/* Celdas normales con detección de error */}
                      {allCols.filter(c => c !== 'viabilidad').map(col => {
                        const val = row[col];
                        const err = detectErrors(val, col, row);
                        return (
                          <td key={col}
                            className={`la-td ${err ? 'la-td--error' : ''}`}
                            title={err ? `⚠ ${err}` : undefined}
                          >
                            {err && <span className="la-err-dot" title={err}>!</span>}
                            <span className="la-cell-val">{safeStr(val)}</span>
                          </td>
                        );
                      })}

                      {/* Viabilidad — columna fija */}
                      <td className="la-td la-td--sticky la-td--via"
                        onClick={e => e.stopPropagation()}>
                        {(() => {
                          const v = row['viabilidad'] || 'pendiente';
                          const cfg = VIABILIDAD_CONFIG[v] || VIABILIDAD_CONFIG.pendiente;
                          return (
                            <span className="la-badge"
                              style={{ background: cfg.bg, color: cfg.color }}>
                              <span className="la-badge-dot" style={{ background: cfg.dot }} />
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Pago — columna fija (placeholder, se rellena desde tabla_pagos) */}
                      <td className="la-td la-td--sticky la-td--pago"
                        onClick={e => e.stopPropagation()}>
                        <span className="la-pago-empty">—</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PAGINACIÓN ──────────────────────────────────────────────────── */}
      {!loading && data.total > 0 && (
        <div className="la-pagination">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Anterior</button>
          <span>Página {page} de {totalPages} · {data.total.toLocaleString()} registros</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente →</button>
        </div>
      )}

      {/* ── MODAL CSV MASIVO ────────────────────────────────────────────── */}
      {showCsvModal && (
        <div className="la-modal-overlay" onClick={() => setShowCsvModal(false)}>
          <div className="la-modal" onClick={e => e.stopPropagation()}>
            <h2 className="la-modal-title">Cargar viabilidad / pagos masivo</h2>
            <p className="la-modal-desc">
              Sube un CSV o Excel con las columnas:<br />
              <code>cuenta</code> (o la PK del proyecto) · <code>viabilidad</code> · <code>estatus_pago</code> · <code>fecha_pago</code> · <code>monto_pago</code> · <code>observaciones</code> · <code>programa</code><br />
              Todas las columnas son opcionales excepto la PK.
            </p>
            <div className="la-csv-drop"
              onClick={() => csvInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setCsvFile(f); }}
              onDragOver={e => e.preventDefault()}>
              <input type="file" accept=".csv,.xlsx,.xls" ref={csvInputRef} style={{ display: 'none' }}
                onChange={e => setCsvFile(e.target.files[0] || null)} />
              {csvFile
                ? <><span className="la-csv-ok">✓</span><p>{csvFile.name}</p></>
                : <><Icon {...ICONS.upload} size={28} /><p>Arrastra aquí o haz clic</p></>
              }
            </div>
            {csvResult && (
              <div className={`la-modal-result ${csvResult.success ? 'ok' : 'err'}`}>
                <p>{csvResult.message}</p>
                {csvResult.errores?.length > 0 && (
                  <ul>{csvResult.errores.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
                )}
              </div>
            )}
            <div className="la-modal-actions">
              <button className="la-btn la-btn--primary" onClick={handleCsvUpload}
                disabled={!csvFile || csvLoading}>
                {csvLoading ? 'Cargando…' : 'Cargar'}
              </button>
              <button className="la-btn la-btn--ghost" onClick={() => setShowCsvModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
