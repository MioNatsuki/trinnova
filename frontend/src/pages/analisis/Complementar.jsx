// frontend/src/pages/analisis/Complementar.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard';
import './Analisis.css';

const LIMIT = 20;

// Columnas internas a ocultar de la vista del padrón
const COLS_OCULTAS = new Set(['id_comp']);

export default function Complementar() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const navigate = useNavigate();

  const [data, setData]         = useState({ rows: [], columnas_editables: [], total: 0, pk: null });
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [editedRows, setEditedRows] = useState({});
  const [message, setMessage]   = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [columnasPadron, setColumnasPadron] = useState([]);

  // Modal de confirmación para "Guardar y generar análisis"
  const [showGenModal, setShowGenModal] = useState(false);
  const [genInfo, setGenInfo]   = useState(null); // { previo: N }

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));
  const isDirty = pendingCount > 0;

  const loadData = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const res = await api.get(`/analisis/${proyectoSlug}/complementar`, {
        params: { page, limit: LIMIT, search: search || undefined },
      });
      setData(res.data);
      setEditedRows({});
      setPendingCount(0);

      if (res.data.rows.length > 0 && res.data.pk) {
        const editables = new Set(res.data.columnas_editables);
        const pk = res.data.pk;
        const todasCols = Object.keys(res.data.rows[0]);
        const padronCols = todasCols.filter(
          col => col !== pk && !editables.has(col) && !COLS_OCULTAS.has(col)
        );
        setColumnasPadron(padronCols);
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error cargando datos.');
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, search]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { setPage(1); }, [proyectoSlug, search]);

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleCellEdit = (pkValue, field, value) => {
    setEditedRows(prev => {
      const updated = {
        ...prev,
        [pkValue]: { ...(prev[pkValue] || {}), [field]: value },
      };
      setPendingCount(Object.keys(updated).length);
      return updated;
    });
  };

  // ── Guardar cambios (solo tabla_complementaria) ──
  const handleSave = async () => {
    if (Object.keys(editedRows).length === 0) return;
    setSaving(true);
    const payload = Object.entries(editedRows).map(([pk_value, campos]) => ({
      pk_value,
      campos_complementarios: campos,
    }));
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
      showMsg('success', res.data.message);
      setEditedRows({});
      setPendingCount(0);
      loadData();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  // ── Iniciar flujo "Guardar y generar análisis" ──
  const handleGuardarYGenerar = async () => {
    // Primero verificar cuántos registros hay en analisis para advertir si se sobreescribirán
    try {
      const stats = await api.get(`/analisis/${proyectoSlug}/estadisticas`);
      setGenInfo({ previo: stats.data.analisis || 0 });
    } catch {
      setGenInfo({ previo: 0 });
    }
    setShowGenModal(true);
  };

  // ── Confirmar: guardar complemento y luego generar análisis ──
  const handleConfirmGenerar = async () => {
    setShowGenModal(false);
    setSaving(true);

    // 1. Guardar complemento si hay cambios pendientes
    if (Object.keys(editedRows).length > 0) {
      const payload = Object.entries(editedRows).map(([pk_value, campos]) => ({
        pk_value,
        campos_complementarios: campos,
      }));
      try {
        await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
        setEditedRows({});
        setPendingCount(0);
      } catch (err) {
        showMsg('error', 'Error al guardar complemento: ' + (err.response?.data?.detail || ''));
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setGenerating(true);

    // 2. Generar análisis
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/generar-analisis`);
      showMsg('success', res.data.message);
      loadData();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al generar análisis.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(draftSearch);
    setPage(1);
  };

  const renderEditableCell = (row, col) => {
    const pkValue = row[data.pk];
    const currentValue = editedRows[pkValue]?.[col] ?? (row[col] ?? '');
    const isDirtyCell = editedRows[pkValue]?.[col] !== undefined;
    return (
      <input
        type="text"
        defaultValue={String(row[col] ?? '')}
        value={isDirtyCell ? String(currentValue) : undefined}
        onChange={e => handleCellEdit(pkValue, col, e.target.value)}
        className={`editable-cell ${isDirtyCell ? 'editable-cell--dirty' : ''}`}
        title={col}
      />
    );
  };

  const safeStr = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  if (!proyectoSlug) {
    return (
      <div className="analisis-container">
        <div className="analisis-header"><h1>Complementar información</h1></div>
        <ProyectoSelector proyectos={proyectos} value={proyectoSlug} onChange={setProyectoSlug} />
      </div>
    );
  }

  return (
    <>
      {/* Guarda de cambios no guardados al navegar fuera */}
      <UnsavedChangesGuard isDirty={isDirty} />

      <div className="analisis-container">
        <div className="analisis-header">
          <h1>Complementar información</h1>
          <div className="analisis-actions">
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Buscar cuenta, nombre, calle…"
                value={draftSearch}
                onChange={e => setDraftSearch(e.target.value)}
                className="search-input"
              />
              <button type="submit" className="btn-secondary btn-sm">Buscar</button>
              {search && (
                <button type="button" className="btn-secondary btn-sm"
                  onClick={() => { setSearch(''); setDraftSearch(''); }}>
                  Limpiar
                </button>
              )}
            </form>

            {/* Botón 1: solo guarda en tabla_complementaria */}
            <button
              onClick={handleSave}
              disabled={saving || generating || pendingCount === 0}
              className="btn-save"
              title="Guarda los cambios en tabla_complementaria sin tocar tabla_analisis"
            >
              {saving ? 'Guardando…' : `Guardar cambios ${pendingCount > 0 ? `(${pendingCount})` : ''}`}
            </button>

            {/* Botón 2: guarda + reconstruye tabla_analisis */}
            <button
              onClick={handleGuardarYGenerar}
              disabled={saving || generating}
              className="btn-primary"
              title="Guarda los cambios y reconstruye tabla_analisis completa"
            >
              {generating ? 'Generando análisis…' : '⚡ Guardar y generar análisis'}
            </button>
          </div>
        </div>

        <ProyectoSelector proyectos={proyectos} value={proyectoSlug} onChange={setProyectoSlug} />

        {message && <div className={`message ${message.type}`}>{message.text}</div>}

        {loading ? (
          <div className="analisis-loading">Cargando…</div>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    {/* PK fija */}
                    <th style={{ minWidth: 90, position: 'sticky', left: 0, background: '#f8f9fa', zIndex: 2 }}>
                      {data.pk ? data.pk.replace(/_/g, ' ') : 'ID'}
                    </th>
                    {/* Columnas del padrón (solo lectura) */}
                    {columnasPadron.map(col => (
                      <th key={col} style={{ minWidth: 120 }}>
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                    {/* Encabezado agrupador para columnas editables */}
                    {data.columnas_editables.length > 0 && (
                      <th
                        colSpan={data.columnas_editables.length}
                        style={{
                          background: '#e8f0f9', color: '#2b5fa8',
                          textAlign: 'center', fontSize: 10, letterSpacing: 1,
                          borderLeft: '2px solid #4a7fb5',
                        }}
                      >
                        ✏️ COMPLEMENTARIA (editable)
                      </th>
                    )}
                  </tr>
                  {data.columnas_editables.length > 0 && (
                    <tr>
                      <th style={{ background: '#f8f9fa', position: 'sticky', left: 0, zIndex: 2 }} />
                      {columnasPadron.map(col => (
                        <th key={col} style={{ background: '#f8f9fa', padding: '2px 14px' }} />
                      ))}
                      {data.columnas_editables.map((col, i) => (
                        <th key={col} style={{
                          minWidth: 130, background: '#eef3f9', color: '#2b5fa8',
                          borderLeft: i === 0 ? '2px solid #4a7fb5' : undefined,
                        }}>
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={1 + columnasPadron.length + data.columnas_editables.length}
                          style={{ textAlign: 'center', padding: 40, color: 'var(--clr-muted)' }}>
                        {search ? 'Sin resultados.' : 'No hay registros en el padrón.'}
                      </td>
                    </tr>
                  ) : (
                    data.rows.map(row => {
                      const pkVal = row[data.pk];
                      const isDirtyRow = !!editedRows[pkVal];
                      return (
                        <tr key={pkVal} className={isDirtyRow ? 'row-dirty' : ''}>
                          <td className="pk-cell"
                              style={{ position: 'sticky', left: 0, background: isDirtyRow ? '#fffbea' : '#fff', zIndex: 1 }}>
                            {safeStr(pkVal)}
                          </td>
                          {columnasPadron.map(col => (
                            <td key={col} style={{ whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}
                                title={safeStr(row[col])}>
                              {safeStr(row[col])}
                            </td>
                          ))}
                          {data.columnas_editables.map((col, i) => (
                            <td key={col} style={{ borderLeft: i === 0 ? '2px solid #4a7fb5' : undefined }}>
                              {renderEditableCell(row, col)}
                            </td>
                          ))}
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
          </>
        )}
      </div>

      {/* Modal de confirmación para generar análisis */}
      {showGenModal && (
        <div className="modal-overlay" onClick={() => setShowGenModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">⚡ Generar análisis</h2>
            {genInfo?.previo > 0 ? (
              <p className="modal-body">
                Tabla análisis ya tiene <strong>{genInfo.previo.toLocaleString()}</strong> registros.
                Este proceso los <strong>eliminará y reconstruirá</strong> desde cero
                uniendo padrón con complementaria.
                {pendingCount > 0 && (
                  <span style={{ display: 'block', marginTop: 8, color: 'var(--clr-orange)', fontWeight: 500 }}>
                    También se guardarán los {pendingCount} cambios pendientes en complementaria.
                  </span>
                )}
              </p>
            ) : (
              <p className="modal-body">
                Se generará tabla_analisis desde el JOIN de padrón y complementaria.
                {pendingCount > 0 && (
                  <span style={{ display: 'block', marginTop: 8, color: 'var(--clr-orange)', fontWeight: 500 }}>
                    También se guardarán los {pendingCount} cambios pendientes en complementaria.
                  </span>
                )}
              </p>
            )}
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleConfirmGenerar}>
                Confirmar y generar
              </button>
              <button className="btn-secondary" onClick={() => setShowGenModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .row-dirty { background: #fffbea !important; }
        .editable-cell--dirty { border-color: var(--clr-orange) !important; background: #fffbea; }
        .btn-sm { padding: 6px 12px; font-size: 12px; }
        .data-table th { white-space: nowrap; }

        /* Modal */
        .modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
        }
        .modal-box {
          background: var(--clr-white);
          border-radius: var(--radius);
          padding: 28px 32px;
          max-width: 480px; width: 90%;
          box-shadow: var(--shadow-md);
        }
        .modal-title {
          font-size: 17px; font-weight: 600;
          color: var(--clr-text); margin-bottom: 14px;
        }
        .modal-body {
          font-size: 13.5px; color: var(--clr-text);
          line-height: 1.6; margin-bottom: 22px;
        }
        .modal-actions {
          display: flex; gap: 10px; justify-content: flex-end;
        }
        .btn-secondary {
          padding: 8px 18px;
          border: 1px solid var(--clr-border);
          border-radius: 7px;
          background: var(--clr-white);
          font-size: 13px; font-weight: 500;
          font-family: 'Outfit', sans-serif;
          cursor: pointer;
          transition: background .15s;
        }
        .btn-secondary:hover { background: var(--clr-bg); }
      `}</style>
    </>
  );
}
