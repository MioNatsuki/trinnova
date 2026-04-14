// frontend/src/pages/analisis/Complementar.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Analisis.css';

const LIMIT = 20;

// Columnas del padrón que NO queremos mostrar en la tabla (pk se muestra aparte, ids internos, etc.)
const COLS_OCULTAS = new Set(['id_comp']);

export default function Complementar() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  const [data, setData]         = useState({ rows: [], columnas_editables: [], total: 0, pk: null });
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  // editedRows: { [pk_value]: { campo: valor, ... } }
  const [editedRows, setEditedRows] = useState({});
  const [message, setMessage]   = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Columnas del padrón derivadas de los datos recibidos (excluye editables y ocultas)
  const [columnasPadron, setColumnasPadron] = useState([]);

  const totalPages = Math.max(1, Math.ceil(data.total / LIMIT));

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

      // Derivar columnas del padrón a partir de la primera fila
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
      showMessage('error', err.response?.data?.detail || 'Error cargando datos.');
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, search]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reset page cuando cambia proyecto o búsqueda
  useEffect(() => { setPage(1); }, [proyectoSlug, search]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
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

  const handleSave = async () => {
    if (Object.keys(editedRows).length === 0) return;
    setSaving(true);
    const payload = Object.entries(editedRows).map(([pk_value, campos]) => ({
      pk_value,
      campos_complementarios: campos,
    }));
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
      showMessage('success', res.data.message);
      setEditedRows({});
      setPendingCount(0);
      loadData();
    } catch (err) {
      showMessage('error', err.response?.data?.detail || 'Error al guardar.');
    } finally {
      setSaving(false);
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
    const isDirty = editedRows[pkValue]?.[col] !== undefined;

    return (
      <input
        type="text"
        defaultValue={String(row[col] ?? '')}
        value={isDirty ? String(currentValue) : undefined}
        onChange={e => handleCellEdit(pkValue, col, e.target.value)}
        className={`editable-cell ${isDirty ? 'editable-cell--dirty' : ''}`}
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

  const totalCols = 1 + columnasPadron.length + data.columnas_editables.length; // pk + padrón + editables

  return (
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
          <button
            onClick={handleSave}
            disabled={saving || pendingCount === 0}
            className="btn-save"
          >
            {saving ? 'Guardando…' : `Guardar cambios ${pendingCount > 0 ? `(${pendingCount})` : ''}`}
          </button>
        </div>
      </div>

      <ProyectoSelector proyectos={proyectos} value={proyectoSlug} onChange={setProyectoSlug} />

      {message && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      {loading ? (
        <div className="analisis-loading">Cargando…</div>
      ) : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  {/* PK */}
                  <th style={{ minWidth: 80, position: 'sticky', left: 0, background: '#f8f9fa', zIndex: 2 }}>
                    {data.pk ? data.pk.replace(/_/g, ' ') : 'ID'}
                  </th>

                  {/* Columnas del padrón (solo lectura) */}
                  {columnasPadron.map(col => (
                    <th key={col} style={{ minWidth: 120 }}>
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}

                  {/* Divisor visual entre padrón y complementaria */}
                  {data.columnas_editables.length > 0 && (
                    <th
                      colSpan={data.columnas_editables.length}
                      style={{
                        background: '#e8f0f9',
                        color: '#2b5fa8',
                        textAlign: 'center',
                        fontSize: 10,
                        letterSpacing: 1,
                        borderLeft: '2px solid #4a7fb5',
                      }}
                    >
                      ✏️ COMPLEMENTARIA (editable)
                    </th>
                  )}
                </tr>

                {/* Segunda fila de headers para columnas editables */}
                {data.columnas_editables.length > 0 && (
                  <tr>
                    {/* espacio pk + padrón */}
                    <th style={{ background: '#f8f9fa', position: 'sticky', left: 0, zIndex: 2 }} />
                    {columnasPadron.map(col => (
                      <th key={col} style={{ background: '#f8f9fa', padding: '2px 14px' }} />
                    ))}
                    {data.columnas_editables.map(col => (
                      <th
                        key={col}
                        style={{
                          minWidth: 130,
                          background: '#eef3f9',
                          color: '#2b5fa8',
                          borderLeft: col === data.columnas_editables[0] ? '2px solid #4a7fb5' : undefined,
                        }}
                      >
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>

              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols}
                        style={{ textAlign: 'center', padding: 40, color: 'var(--clr-muted)' }}>
                      {search ? 'Sin resultados para la búsqueda.' : 'No hay registros en el padrón.'}
                    </td>
                  </tr>
                ) : (
                  data.rows.map(row => {
                    const pkVal = row[data.pk];
                    const isDirtyRow = !!editedRows[pkVal];
                    return (
                      <tr key={pkVal} className={isDirtyRow ? 'row-dirty' : ''}>
                        {/* PK */}
                        <td className="pk-cell" style={{ position: 'sticky', left: 0, background: isDirtyRow ? '#fffbea' : '#fff', zIndex: 1 }}>
                          {safeStr(pkVal)}
                        </td>

                        {/* Columnas padrón (solo lectura) */}
                        {columnasPadron.map(col => (
                          <td key={col} style={{ whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }} title={safeStr(row[col])}>
                            {safeStr(row[col])}
                          </td>
                        ))}

                        {/* Columnas complementaria (editables) */}
                        {data.columnas_editables.map((col, i) => (
                          <td
                            key={col}
                            style={{ borderLeft: i === 0 ? '2px solid #4a7fb5' : undefined }}
                          >
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

      <style>{`
        .row-dirty { background: #fffbea !important; }
        .editable-cell--dirty { border-color: var(--clr-orange) !important; background: #fffbea; }
        .btn-sm { padding: 6px 12px; font-size: 12px; }
        .data-table th { white-space: nowrap; }
      `}</style>
    </div>
  );
}