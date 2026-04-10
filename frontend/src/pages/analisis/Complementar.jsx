// frontend/src/pages/analisis/Complementar.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Analisis.css';

const LIMIT = 20;

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
      // Contar filas con cambios
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

  const renderCell = (row, col) => {
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
                  <th style={{ minWidth: 80 }}>ID / Clave</th>
                  <th style={{ minWidth: 160 }}>Nombre / Propietario</th>
                  <th style={{ minWidth: 180 }}>Dirección</th>
                  {data.columnas_editables.map(col => (
                    <th key={col} style={{ minWidth: 130 }}>
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={3 + data.columnas_editables.length}
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
                        <td className="pk-cell">{safeStr(pkVal)}</td>
                        <td>{safeStr(
                          row.propietario || row.nombre || row.nombre_razon_social ||
                          row.propietariotitular_n || ''
                        )}</td>
                        <td>{safeStr(
                          row.calle || row.domicilio || row.ubicacion ||
                          row.calle_numero || row.afiliado_calle || ''
                        )}</td>
                        {data.columnas_editables.map(col => (
                          <td key={col}>{renderCell(row, col)}</td>
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
      `}</style>
    </div>
  );
}
