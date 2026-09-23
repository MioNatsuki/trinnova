// frontend/src/pages/emision/Preparacion.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [showConfirmAll, setShowConfirmAll] = useState(false);

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
      if (n.has(pkVal)) n.delete(pkVal);
      else n.add(pkVal);
      return n;
    });
  }, []);

  const todosSeleccionados = rows.length > 0 && selected.size === rows.length;

  const handleSelectAll = () => {
    if (todosSeleccionados) {
      setSelected(new Set());
      return;
    }

    // Verificar si hay no viables
    const noViables = rows.filter(r => (r.viabilidad || 'pendiente') !== 'viable');
    if (noViables.length > 0) {
      setShowConfirmAll(true);
    } else {
      setSelected(new Set(rows.map(r => r[pk])));
    }
  };

  const confirmarSelectAll = () => {
    setSelected(new Set(rows.map(r => r[pk])));
    setShowConfirmAll(false);
  };

  // ---------- Orden ----------
  const setOrden = (pkVal, val) => {
    setOrdenMap(prev => {
      const n = { ...prev };
      if (val === '' || val === null || val === undefined) {
        delete n[pkVal];
      } else {
        n[pkVal] = parseInt(val) || '';
      }
      return n;
    });
  };

  // ---------- CSV ----------
  const handleCsv = async (file) => {
    if (!file) return;
    setCsvLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post(
        `/emision/${proyectoSlug}/seleccionar-cuentas-csv`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      const ids = res.data.ids || [];
      const om = res.data.orden_map || {};
      setSelected(new Set(ids));
      setOrdenMap(prev => ({ ...prev, ...om }));
      showMsg('success', `${ids.length} cuentas cargadas desde archivo.`);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error leyendo archivo.');
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
        // TODO: abrir modal de errores
      } else {
        showMsg('success', res.data.message);
        setTimeout(() => {
          navigate('/emision/emitir', { state: { proyectoSlug } });
        }, 800);
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al preparar.');
    } finally {
      setGuardando(false);
    }
  };

  // ---------- Columnas a mostrar ----------
  // Mostramos la PK y las columnas d_* (de tabla_dinamica) para dar visibilidad de los cálculos
  const columnasMostrar = useMemo(() => {
    const cols = [];
    // Orden, PK, nombre, domicilio, viabilidad, cálculo
    cols.push({ key: 'orden',        label: 'Orden' });
    cols.push({ key: pk,             label: 'Cuenta',          isPk: true });
    cols.push({ key: '_nombre_display', label: 'Nombre' });
    cols.push({ key: '_calle_display',  label: 'Domicilio' });

    // Todas las columnas d_*
    columnasDinamica.forEach(c => {
      // Omitir codebar temporal para no confundir en Preparación
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

          <label className="prep-btn">
            {csvLoading ? 'Cargando…' : '📂 Subir CSV/Excel'}
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleCsv(e.target.files[0])}
              disabled={csvLoading}
            />
          </label>

          <button
            className="prep-btn prep-btn--primary"
            onClick={continuar}
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
            {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>
        )}
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
                  checked={todosSeleccionados}
                  onChange={handleSelectAll}
                  ref={el => {
                    if (el) el.indeterminate = selected.size > 0 && selected.size < rows.length;
                  }}
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
              const pkVal = r[pk];
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
                    // Orden
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

                    // Viabilidad
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

                    // Cálculo
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

                    // PK
                    if (col.isPk) {
                      return (
                        <td key={col.key} className="prep-td prep-td--pk">
                          {String(r[col.key] ?? '—')}
                        </td>
                      );
                    }

                    // Cualquier otro campo
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

      {/* MODAL CONFIRMAR SELECCIONAR TODO CON NO VIABLES */}
      {showConfirmAll && (
        <div className="prep-overlay" onClick={() => setShowConfirmAll(false)}>
          <div className="prep-modal" onClick={e => e.stopPropagation()}>
            <h3>Confirmar selección</h3>
            <p>
              Estás a punto de seleccionar <strong>{rows.length}</strong> cuentas,
              de las cuales{' '}
              <strong>
                {rows.filter(r => (r.viabilidad || 'pendiente') !== 'viable').length}
              </strong>{' '}
              están marcadas como <strong>no viables</strong> o <strong>pendientes</strong>.
              <br /><br />
              ¿Deseas continuar?
            </p>
            <div className="prep-modal-actions">
              <button className="prep-btn" onClick={() => setShowConfirmAll(false)}>
                Cancelar
              </button>
              <button className="prep-btn prep-btn--primary" onClick={confirmarSelectAll}>
                Sí, seleccionar todas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}