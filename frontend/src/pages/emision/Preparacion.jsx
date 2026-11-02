// frontend/src/pages/emision/Preparacion.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Preparacion.css';

// ============================================================
// HELPERS
// ============================================================

const VIABILIDAD_CFG = {
  viable:    { label: 'Viable',    cls: 'ok',    icon: '✓' },
  no_viable: { label: 'No viable', cls: 'danger',icon: '⚠' },
  pendiente: { label: 'Pendiente', cls: 'warn',  icon: '⏳' },
};

const fmtValor = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    return v.toLocaleString('es-MX', { maximumFractionDigits: 2 });
  }
  const s = String(v);
  return s.length > 80 ? s.substring(0, 80) + '…' : s;
};

// ============================================================
// COMPONENTE
// ============================================================

export default function Preparacion() {
  const location = useLocation();
  const navigate = useNavigate();
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  // ---------- Estado ----------
  const [loading, setLoading]         = useState(false);
  const [rows, setRows]               = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [limit]                       = useState(50);
  const [pk, setPk]                   = useState('id');
  const [columnasDinamica, setColumnasDinamica] = useState([]);

  const [selected, setSelected]       = useState(new Set());
  const [ordenMap, setOrdenMap]       = useState({});
  const [message, setMessage]         = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtroViabilidad, setFiltroViabilidad] = useState('');

  const [csvLoading, setCsvLoading]   = useState(false);
  const [guardando, setGuardando]     = useState(false);
  const [csvCargado, setCsvCargado]   = useState(false);
  const [showSinCsv, setShowSinCsv]   = useState(false);
  const [showTodas, setShowTodas]     = useState(false);
  const [todas, setTodas]             = useState({ loading: false, rows: [], error: null });
  const [descartadas, setDescartadas] = useState(new Set());
  const [todasQuery, setTodasQuery]   = useState('');

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile]           = useState(null);
  const [csvResult, setCsvResult]       = useState(null);

  // ---------- Efecto de proyecto desde navegación ----------
  useEffect(() => {
    if (location.state?.proyectoSlug) {
      setProyectoSlug(location.state.proyectoSlug);
    }
  }, [location.state, setProyectoSlug]);

  // ---------- Reset al cambiar de proyecto ----------
  useEffect(() => {
    setSelected(new Set());
    setOrdenMap({});
    setPage(1);
    setSearchInput('');
    setSearchQuery('');
    setFiltroViabilidad('');
  }, [proyectoSlug]);

  const fileInputRef = useRef();

  // ---------- Mensajes ----------
  const showMsg = useCallback((type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  // ---------- Cargar datos ----------
  const cargar = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const params = { page, limit };
      if (searchQuery) params.search = searchQuery;
      if (filtroViabilidad) params.viabilidad = filtroViabilidad;

      const res = await api.get(`/emision/${proyectoSlug}/preparacion`, { params });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
      setPk(res.data.pk || 'id');

      // Columnas dinámicas con prefijo d_
      const cols = (res.data.columnas_dinamica || []).map(c => `d_${c}`);
      setColumnasDinamica(cols);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error cargando datos.');
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, limit, searchQuery, filtroViabilidad, showMsg]);

  useEffect(() => { cargar(); }, [cargar]);

  // ---------- Selección ----------
  const toggle = useCallback((pkVal) => {
      setSelected(prev => {
          const n = new Set(prev);
          const key = String(pkVal);
          if (n.has(key)) n.delete(key);
          else n.add(key);
          return n;
      });
  }, []);

  // Persistir ordenMap en localStorage
  useEffect(() => {
      if (!proyectoSlug) return;
      if (Object.keys(ordenMap).length > 0) {
          localStorage.setItem(
              `trinnova_orden_${proyectoSlug}`,
              JSON.stringify(ordenMap)
          );
      } else {
          localStorage.removeItem(`trinnova_orden_${proyectoSlug}`);
      }
  }, [ordenMap, proyectoSlug]);

  // Restaurar ordenMap al montar / cambiar proyecto
  useEffect(() => {
      if (!proyectoSlug) return;
      const saved = localStorage.getItem(`trinnova_orden_${proyectoSlug}`);
      if (saved) {
          try {
              setOrdenMap(JSON.parse(saved));
          } catch {
              setOrdenMap({});
          }
      }
  }, [proyectoSlug]);

  const pageKeys = useMemo(
    () => rows.map(r => String(r[pk] ?? '')).filter(Boolean), [rows, pk]);
  const selEnPagina = pageKeys.filter(k => selected.has(k)).length;
  const todosPaginaSel = pageKeys.length > 0 && selEnPagina === pageKeys.length;
  const algunoPaginaSel = selEnPagina > 0 && !todosPaginaSel;

  // Marca/desmarca solo la página visible
  const handleSelectPage = () => {
    setSelected(prev => {
      const n = new Set(prev);
      if (todosPaginaSel) pageKeys.forEach(k => n.delete(k));
      else pageKeys.forEach(k => n.add(k));
      return n;
    });
  };

  const abrirTodas = async () => {
    setShowTodas(true);
    setDescartadas(new Set());
    setTodasQuery('');
    setTodas({ loading: true, rows: [], error: null });
    try {
      const res = await api.get(`/emision/${proyectoSlug}/preparacion/todas`);
      setTodas({ loading: false, rows: res.data.rows || [], error: null });
    } catch (err) {
      setTodas({ loading: false, rows: [],
        error: err.response?.data?.detail || 'No se pudo cargar el resumen.' });
    }
  };

  const resumenTodas = useMemo(() => {
    const r = { viable: 0, no_viable: 0, pendiente: 0 };
    todas.rows.forEach(x => { r[x.viabilidad] = (r[x.viabilidad] || 0) + 1; });
    return r;
  }, [todas.rows]);

  const descartarPorViabilidad = (v) =>
    setDescartadas(prev => {
      const n = new Set(prev);
      todas.rows.forEach(x => { if (x.viabilidad === v) n.add(x.pk); });
      return n;
    });

  const toggleDescarte = (k) =>
    setDescartadas(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  const listaModal = useMemo(() => {
    const q = todasQuery.trim().toLowerCase();
    const base = q
      ? todas.rows.filter(x =>
          x.pk.toLowerCase().includes(q) || String(x.nombre || '').toLowerCase().includes(q))
      : todas.rows.filter(x => x.viabilidad !== 'viable');
    return { total: base.length, visibles: base.slice(0, 200) };
  }, [todas.rows, todasQuery]);

  const aEmitir = todas.rows.length - descartadas.size;

  const confirmarTodas = () => {
    setSelected(new Set(todas.rows.filter(x => !descartadas.has(x.pk)).map(x => x.pk)));
    setShowTodas(false);
    showMsg('success', `${aEmitir.toLocaleString('es-MX')} cuentas seleccionadas.`);
  };

  // ---------- Orden ----------
  const setOrden = (pkVal, val) => {
    const key = String(pkVal);
    setOrdenMap(prev => {
      const n = { ...prev };
      if (val === '' || val === null || val === undefined) {
        delete n[key];
      } else {
        const num = parseInt(val, 10);
        n[key] = isNaN(num) ? '' : num;
      }
      return n;
    });
  };

  // ---------- CSV ----------
  const openCsvModal = () => {
    setCsvFile(null);
    setCsvResult(null);
    setShowCsvModal(true);
  };

  const closeCsvModal = () => {
    if (csvLoading) return;
    if (csvFile && !csvResult &&
        !window.confirm('Tienes un archivo seleccionado sin cargar. ¿Cerrar de todas formas?')) {
      return;
    }
    setShowCsvModal(false);
    setCsvFile(null);
    setCsvResult(null);
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    const fd = new FormData();
    fd.append('file', csvFile);
    try {
      const res = await api.post(
        `/emision/${proyectoSlug}/seleccionar-cuentas-csv`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      const ids = (res.data.ids || []).map(String);
      const om = {};
      Object.entries(res.data.orden_map || {}).forEach(([k, v]) => {
        om[String(k)] = parseInt(v, 10);
      });
      setSelected(new Set(ids));
      setOrdenMap(om);
      setCsvCargado(true);

      const conOrden = Object.keys(om).length;
      setCsvResult({
        success: true,
        message: `${ids.length} cuentas cargadas desde el archivo.` +
                 (conOrden ? ` ${conOrden} con orden asignado.` : ''),
      });
      setTimeout(() => {
        setShowCsvModal(false);
        setCsvResult(null);
        setCsvFile(null);
      }, 1500);
    } catch (err) {
      setCsvResult({
        success: false,
        message: err.response?.data?.detail || 'Error leyendo archivo.',
      });
    } finally {
      setCsvLoading(false);
    }
  };

  // ---------- Continuar ----------
  const continuar = async () => {
    if (selected.size === 0) {
      showMsg('error', 'Selecciona al menos una cuenta.');
      return;
    }

    setGuardando(true);
    try {
      const res = await api.post(
        `/emision/${proyectoSlug}/preparar-tabla-temporal`,
        {
          ids: Array.from(selected),
          orden_map: ordenMap,
        }
      );

      if (res.data.errores > 0) {
        showMsg('error',
          `Se insertaron ${res.data.insertados} de ${selected.size}. ` +
          `${res.data.errores} tuvieron problemas. Revisa errores.`);
      } else {
        showMsg('success', res.data.message);
        localStorage.removeItem(`trinnova_orden_${proyectoSlug}`);
        setTimeout(() => {
          navigate('/emision/emitir', { state: { proyectoSlug } });
        }, 800);
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al preparar.');
    } finally {
      setGuardando(false);
      setShowSinCsv(false);
    }
  };

  const intentarContinuar = () => {
    if (selected.size === 0) {
      showMsg('error', 'Selecciona al menos una cuenta.');
      return;
    }
    if (!csvCargado && Object.keys(ordenMap).length === 0) {
      setShowSinCsv(true);
      return;
    }
    continuar();
  };

  // ---------- Columnas a mostrar ----------
  const columnasMostrar = useMemo(() => {
    const cols = [];
    cols.push({ key: 'orden',       label: 'Orden' });
    cols.push({ key: pk,            label: 'Cuenta',            isPk: true });
    cols.push({ key: '_nombre_display', label: 'Nombre' });
    cols.push({ key: '_calle_display',  label: 'Domicilio' });

    columnasDinamica.forEach(c => {
      if (c === 'd_codebar') return;
      cols.push({ key: c, label: c.replace(/^d_/, '').replace(/_/g, ' ') });
    });

    cols.push({ key: 'viabilidad',  label: 'Viabilidad' });
    cols.push({ key: '_tiene_calculo', label: 'Cálculo' });

    return cols;
  }, [pk, columnasDinamica]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // ---------- Render ----------
  if (!proyectoSlug) {
    return (
      <div className="prep-page">
        <div className="prep-header">
          <h1>Preparación de Emisión</h1>
        </div>
        <ProyectoSelector
          proyectos={proyectos}
          value={proyectoSlug}
          onChange={setProyectoSlug}
        />
        <div className="prep-empty-state">
          Selecciona un proyecto para comenzar.
        </div>
      </div>
    );
  }

  return (
    <div className="prep-page">

      {/* HEADER */}
      <div className="prep-header">
        <h1>Preparación de Emisión</h1>
        <div className="prep-header-actions">
          <ProyectoSelector
            proyectos={proyectos}
            value={proyectoSlug}
            onChange={setProyectoSlug}
          />

          <button className="prep-btn" onClick={openCsvModal}
            title="Cargar cuentas y orden de impresión desde CSV o Excel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            Cargar CSV
          </button>

          <button
            className="prep-btn prep-btn--primary"
            onClick={intentarContinuar}
            disabled={guardando || selected.size === 0}
          >
            {guardando
              ? 'Guardando…'
              : `Continuar con Emisión (${selected.size})`}
          </button>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="prep-toolbar">
        <form
          className="prep-search-form"
          onSubmit={e => {
            e.preventDefault();
            setPage(1);
            setSearchQuery(searchInput);
          }}
        >
          <input
            type="text"
            placeholder="Buscar por cuenta, nombre o domicilio…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="prep-search-input"
          />
          <button type="submit" className="prep-search-btn">Buscar</button>
          {searchQuery && (
            <button
              type="button"
              className="prep-search-clear"
              onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(1); }}
            >✕</button>
          )}
        </form>

        <select
          value={filtroViabilidad}
          onChange={e => { setFiltroViabilidad(e.target.value); setPage(1); }}
          className="prep-select"
        >
          <option value="">Todas las viabilidades</option>
          <option value="viable">Solo viables</option>
          <option value="no_viable">Solo no viables</option>
          <option value="pendiente">Solo pendientes</option>
        </select>

        {selected.size > 0 && (
          <span className="prep-selected-badge">
            {selected.size.toLocaleString('es-MX')} seleccionada{selected.size !== 1 ? 's' : ''}
            {' · '}
            <a href="#limpiar" onClick={e => { e.preventDefault(); setSelected(new Set()); }}>limpiar</a>
          </span>
        )}
        <button className="prep-btn prep-btn--todas" onClick={abrirTodas}>
          Emitir TODAS
        </button>
      </div>

      {/* MENSAJES */}
      {message && (
        <div className={`prep-message prep-message--${message.type}`}>
          {message.text}
        </div>
      )}

      {/* TABLA */}
      <div className="prep-table-wrapper">
        <table className="prep-table">
          <thead>
            <tr>
              <th className="prep-th prep-th--check">
                <input
                  type="checkbox"
                  checked={todosPaginaSel}
                  onChange={handleSelectPage}
                  ref={el => { if (el) el.indeterminate = algunoPaginaSel; }}
                />
              </th>
              {columnasMostrar.map(col => (
                <th key={col.key} className="prep-th">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnasMostrar.length + 1} className="prep-empty">Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columnasMostrar.length + 1} className="prep-empty">
                {searchQuery || filtroViabilidad
                  ? 'Sin resultados para los filtros actuales.'
                  : 'No hay cuentas para este proyecto.'}
              </td></tr>
            ) : rows.map(r => {
              const pkVal = String(r[pk] ?? '');
              const isSel = selected.has(pkVal);
              const viab = r.viabilidad || 'pendiente';
              const cfg = VIABILIDAD_CFG[viab] || VIABILIDAD_CFG.pendiente;
              const tieneCalculo = r._tiene_calculo;

              return (
                <tr
                  key={String(pkVal)}
                  className={isSel ? 'prep-tr--sel' : ''}
                >
                  <td className="prep-td prep-td--check">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(pkVal)}
                    />
                  </td>

                  {columnasMostrar.map(col => {
                    if (col.key === 'orden') {
                      return (
                        <td key={col.key} className="prep-td prep-td--orden">
                          <input
                            type="number"
                            min="1"
                            className="prep-orden-input"
                            value={ordenMap[pkVal] ?? ''}
                            onChange={e => setOrden(pkVal, e.target.value)}
                            placeholder="—"
                          />
                        </td>
                      );
                    }

                    if (col.key === 'viabilidad') {
                      return (
                        <td key={col.key} className="prep-td">
                          <span
                            className={`prep-badge prep-badge--${cfg.cls}`}
                            title={viab !== 'viable' ? 'Esta cuenta no es viable. Puedes continuar, pero ten en cuenta el riesgo.' : ''}
                          >
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                      );
                    }

                    if (col.key === '_tiene_calculo') {
                      return (
                        <td key={col.key} className="prep-td">
                          {tieneCalculo ? (
                            <span className="prep-badge prep-badge--ok">✓ Calculado</span>
                          ) : (
                            <span
                              className="prep-badge prep-badge--warn"
                              title="Esta cuenta no tiene cálculos en tabla_dinamica. Ejecuta 'Calcular Todas' antes de emitir."
                            >
                              ⚠ Sin cálculo
                            </span>
                          )}
                        </td>
                      );
                    }

                    if (col.isPk) {
                      return (
                        <td key={col.key} className="prep-td prep-td--pk">
                          {String(r[col.key] ?? '—')}
                        </td>
                      );
                    }

                    const val = r[col.key];
                    return (
                      <td key={col.key} className="prep-td" title={String(val ?? '')}>
                        {fmtValor(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PAGINACIÓN */}
      {total > 0 && (
        <div className="prep-pagination">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >← Anterior</button>
          <span>Página {page} de {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >Siguiente →</button>
          <span className="prep-total">{total.toLocaleString()} registros</span>
        </div>
      )}

      {/* MODAL EMITIR TODAS */}
      {showTodas && (
        <div className="prep-overlay" onClick={() => setShowTodas(false)}>
          <div className="prep-modal prep-modal--todas" onClick={e => e.stopPropagation()}>
            <h3>Emitir TODAS las cuentas</h3>

            {todas.loading ? <p>Cargando cuentas…</p>
            : todas.error ? <p className="prep-message prep-message--error">{todas.error}</p>
            : (<>
              <p>
                Seleccionaste <strong>{todas.rows.length.toLocaleString('es-MX')}</strong> cuentas:{' '}
                <strong>{resumenTodas.viable.toLocaleString('es-MX')}</strong> viables y{' '}
                <strong>{(resumenTodas.no_viable + resumenTodas.pendiente).toLocaleString('es-MX')}</strong> no viables
                {resumenTodas.pendiente > 0 && ` (${resumenTodas.pendiente.toLocaleString('es-MX')} pendientes de evaluar)`}.
              </p>

              <div className="prep-todas-actions">
                {resumenTodas.no_viable > 0 && (
                  <button className="prep-btn" onClick={() => descartarPorViabilidad('no_viable')}>
                    Descartar no viables ({resumenTodas.no_viable.toLocaleString('es-MX')})
                  </button>
                )}
                {resumenTodas.pendiente > 0 && (
                  <button className="prep-btn" onClick={() => descartarPorViabilidad('pendiente')}>
                    Descartar pendientes ({resumenTodas.pendiente.toLocaleString('es-MX')})
                  </button>
                )}
                {descartadas.size > 0 && (
                  <button className="prep-btn" onClick={() => setDescartadas(new Set())}>
                    Incluir todas de nuevo
                  </button>
                )}
              </div>

              <input
                className="prep-search-input"
                style={{ width: '100%', marginBottom: 8 }}
                placeholder="Buscar cuenta o nombre para descartar manualmente…"
                value={todasQuery}
                onChange={e => setTodasQuery(e.target.value)}
              />
              <div className="prep-todas-hint">
                {todasQuery.trim() ? 'Coincidencias' : 'No viables y pendientes'}:{' '}
                {listaModal.total.toLocaleString('es-MX')}
                {listaModal.total > 200 && ' (mostrando 200; afina la búsqueda)'}
                {' · '}desmarca para descartar
              </div>

              <div className="prep-todas-list">
                {listaModal.visibles.map(x => {
                  const fuera = descartadas.has(x.pk);
                  const cfg = VIABILIDAD_CFG[x.viabilidad] || VIABILIDAD_CFG.pendiente;
                  return (
                    <label key={x.pk} className={`prep-todas-row ${fuera ? 'prep-todas-row--out' : ''}`}>
                      <input type="checkbox" checked={!fuera} onChange={() => toggleDescarte(x.pk)} />
                      <span>{x.pk}</span>
                      <span style={{ flex: 1 }}>{x.nombre || '—'}</span>
                      <span className={`prep-badge prep-badge--${cfg.cls}`}>{cfg.icon} {cfg.label}</span>
                    </label>
                  );
                })}
                {listaModal.total === 0 && <div className="prep-empty">Sin resultados.</div>}
              </div>

              <p style={{ marginTop: 12 }}>
                Se seleccionarán <strong>{aEmitir.toLocaleString('es-MX')}</strong> cuentas
                {descartadas.size > 0 && <> ({descartadas.size.toLocaleString('es-MX')} descartadas)</>}.
              </p>
            </>)}

            <div className="prep-modal-actions">
              <button className="prep-btn" onClick={() => setShowTodas(false)}>Cancelar</button>
              <button className="prep-btn prep-btn--primary"
                      onClick={confirmarTodas}
                      disabled={todas.loading || !!todas.error || aEmitir === 0}>
                Seleccionar {aEmitir.toLocaleString('es-MX')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ADVERTENCIA SIN CSV */}
      {showSinCsv && (
        <div className="prep-overlay" onClick={() => setShowSinCsv(false)}>
          <div className="prep-modal" onClick={e => e.stopPropagation()}>
            <h3>¿Emitir sin CSV?</h3>
            <p>
              No cargaste un CSV con las cuentas y su orden de impresión. Si continúas,
              se emitirán las <strong>{selected.size.toLocaleString('es-MX')}</strong> cuentas
              seleccionadas en el orden por defecto (por clave ascendente).
            </p>
            <div className="prep-modal-actions">
              <button className="prep-btn" onClick={() => { setShowSinCsv(false); openCsvModal(); }}>
                Cargar CSV
              </button>
              <button className="prep-btn prep-btn--primary" onClick={continuar}>
                Continuar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CARGA CSV */}
      {showCsvModal && (
        <div className="prep-overlay" onClick={closeCsvModal}>
          <div className="prep-modal prep-modal--csv" onClick={e => e.stopPropagation()}>
            <div className="prep-modal-head">
              <h3>Cargar cuentas desde CSV / Excel</h3>
              <button className="prep-modal-x" onClick={closeCsvModal}>✕</button>
            </div>
            <p className="prep-modal-desc">
              Columnas aceptadas: <code>{pk}</code> (requerida; también se acepta{' '}
              <code>prestamo</code>, <code>cuenta</code>…) ·{' '}
              <code>orden_impresion</code> (opcional)
            </p>

            <div
              className="prep-csv-drop"
              onClick={() => fileInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); setCsvFile(e.dataTransfer.files[0] || null); }}
              onDragOver={e => e.preventDefault()}
            >
              <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={e => setCsvFile(e.target.files[0] || null)} />
              {csvFile
                ? <><span className="prep-csv-ok">✓</span><span>{csvFile.name}</span></>
                : <><span className="prep-csv-ok">📂</span><span>Arrastra aquí o haz clic</span></>}
            </div>

            {csvResult && (
              <div className={`prep-csv-result ${csvResult.success ? 'ok' : 'err'}`}>
                {csvResult.message}
              </div>
            )}

            <div className="prep-modal-actions">
              <button className="prep-btn" onClick={closeCsvModal} disabled={csvLoading}>
                Cerrar
              </button>
              <button className="prep-btn prep-btn--primary" onClick={handleCsvUpload}
                disabled={!csvFile || csvLoading}>
                {csvLoading ? 'Cargando…' : 'Cargar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}