// frontend/src/pages/analisis/Complementar.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import UnsavedChangesGuard from '../../components/UnsavedChangesGuard';
import './Analisis.css';

const LIMIT = 20;
const COLS_OCULTAS = new Set(['id_comp']);

export default function Complementar() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  const [data, setData]               = useState({ rows: [], columnas_editables: [], total: 0, pk: null });
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [editedRows, setEditedRows]   = useState({});
  const [message, setMessage]         = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [columnasPadron, setColumnasPadron] = useState([]);

  const [showGenModal, setShowGenModal] = useState(false);
  const [genInfo, setGenInfo]           = useState(null);

  // CSV masivo
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile]           = useState(null);
  const [csvLoading, setCsvLoading]     = useState(false);
  const [csvResult, setCsvResult]       = useState(null);
  const csvInputRef = useRef();

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
        // columnas_editables viene del backend y ya incluye "programa" (el backend lo añade).
        // columnasPadron = columnas de la fila que NO son pk, ni editables, ni ocultas.
        const editablesSet = new Set(res.data.columnas_editables);
        const pk = res.data.pk;
        const todasCols = Object.keys(res.data.rows[0]);
        const padronCols = todasCols.filter(
          col => col !== pk && !editablesSet.has(col) && !COLS_OCULTAS.has(col)
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
      const updated = { ...prev, [pkValue]: { ...(prev[pkValue] || {}), [field]: value } };
      setPendingCount(Object.keys(updated).length);
      return updated;
    });
  };

  const handleSave = async () => {
    if (Object.keys(editedRows).length === 0) return;
    setSaving(true);
    const payload = Object.entries(editedRows).map(([pk_value, campos]) => ({
      pk_value, campos_complementarios: campos,
    }));
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
      showMsg('success', res.data.message);
      setEditedRows({});
      setPendingCount(0);
      loadData();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally { setSaving(false); }
  };

  const handleGuardarYGenerar = async () => {
    try {
      const stats = await api.get(`/analisis/${proyectoSlug}/estadisticas`);
      setGenInfo({ previo: stats.data.analisis || 0 });
    } catch { setGenInfo({ previo: 0 }); }
    setShowGenModal(true);
  };

  const handleConfirmGenerar = async () => {
    setShowGenModal(false);
    setSaving(true);
    if (Object.keys(editedRows).length > 0) {
      const payload = Object.entries(editedRows).map(([pk_value, campos]) => ({
        pk_value, campos_complementarios: campos,
      }));
      try {
        await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
        setEditedRows({}); setPendingCount(0);
      } catch (err) {
        showMsg('error', 'Error al guardar: ' + (err.response?.data?.detail || ''));
        setSaving(false); return;
      }
    }
    setSaving(false);
    setGenerating(true);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/generar-analisis`);
      showMsg('success', res.data.message);
      loadData();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al generar análisis.');
    } finally { setGenerating(false); }
  };

  const handleCsvComplementar = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    const formData = new FormData();
    formData.append('file', csvFile);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/cargar-complemento-csv`, formData,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setCsvResult(res.data);
      loadData();
    } catch (err) {
      setCsvResult({ success: false, message: err.response?.data?.detail || 'Error.', procesados: 0, errores: [] });
    } finally { setCsvLoading(false); }
  };

  // columnas_editables ya viene del backend; el backend es responsable de incluir "programa".
  // NO manipulamos el array aquí para evitar duplicados.
  const columnasEditables = data.columnas_editables;

  const renderEditableCell = (row, col) => {
    const pkValue = row[data.pk];
    const isDirtyCell = editedRows[pkValue]?.[col] !== undefined;
    const value = isDirtyCell ? String(editedRows[pkValue][col]) : String(row[col] ?? '');
    return (
      <input
        type="text"
        value={value}
        onChange={e => handleCellEdit(pkValue, col, e.target.value)}
        className={`comp-cell-input ${isDirtyCell ? 'comp-cell-input--dirty' : ''}`}
        title={col}
      />
    );
  };

  const safeStr = v => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

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
      <UnsavedChangesGuard isDirty={isDirty} />

      <div className="analisis-container">
        <div className="analisis-header">
          <h1>Complementar información</h1>
          <div className="analisis-actions">
            <form onSubmit={e => { e.preventDefault(); setSearch(draftSearch); setPage(1); }}
              style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Buscar…" value={draftSearch}
                onChange={e => setDraftSearch(e.target.value)} className="search-input" />
              <button type="submit" className="btn-secondary btn-sm">Buscar</button>
              {search && (
                <button type="button" className="btn-secondary btn-sm"
                  onClick={() => { setSearch(''); setDraftSearch(''); }}>Limpiar</button>
              )}
            </form>

            <button onClick={() => { setCsvFile(null); setCsvResult(null); setShowCsvModal(true); }}
              className="btn-secondary">
              📂 CSV masivo
            </button>

            <button onClick={handleSave} disabled={saving || generating || pendingCount === 0}
              className="btn-save">
              {saving ? 'Guardando…' : `Guardar${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </button>

            <button onClick={handleGuardarYGenerar} disabled={saving || generating}
              className="btn-primary">
              {generating ? 'Generando…' : '⚡ Guardar y generar análisis'}
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
                    <th className="comp-th comp-th--pk">
                      {data.pk ? data.pk.replace(/_/g, ' ') : 'ID'}
                    </th>
                    {columnasPadron.map(col => (
                      <th key={col} className="comp-th">{col.replace(/_/g, ' ')}</th>
                    ))}
                    {columnasEditables.length > 0 && (
                      <th colSpan={columnasEditables.length} className="comp-th--group">
                        ✏️ COMPLEMENTARIA (editable)
                      </th>
                    )}
                  </tr>
                  {columnasEditables.length > 0 && (
                    <tr>
                      <th className="comp-th2 comp-th2--pk" />
                      {columnasPadron.map(col => <th key={col} className="comp-th2" />)}
                      {columnasEditables.map((col, i) => (
                        <th key={col} className={`comp-th2 comp-th2--editable${i === 0 ? ' comp-th2--first' : ''}`}>
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={1 + columnasPadron.length + columnasEditables.length}
                        className="analisis-empty">
                        {search ? 'Sin resultados.' : 'No hay registros. Carga un padrón primero.'}
                      </td>
                    </tr>
                  ) : data.rows.map(row => {
                    const pkValue = row[data.pk];
                    return (
                      <tr key={pkValue}>
                        <td className="comp-td comp-td--pk">{safeStr(pkValue)}</td>
                        {columnasPadron.map(col => (
                          <td key={col} className="comp-td" title={safeStr(row[col])}>
                            {safeStr(row[col])}
                          </td>
                        ))}
                        {columnasEditables.map((col, i) => (
                          <td key={col} className={`comp-td comp-td--editable${i === 0 ? ' comp-td--first' : ''}`}>
                            {renderEditableCell(row, col)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.total > LIMIT && (
              <div className="comp-pagination">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Anterior</button>
                <span>Página {page} de {totalPages} · {data.total.toLocaleString()} registros</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal generar análisis */}
      {showGenModal && (
        <div className="comp-overlay" onClick={() => setShowGenModal(false)}>
          <div className="comp-modal" onClick={e => e.stopPropagation()}>
            <h3>⚡ Generar análisis</h3>
            {genInfo?.previo > 0 && (
              <p className="comp-modal-warn">
                ⚠️ Se sobreescribirán <strong>{genInfo.previo.toLocaleString()}</strong> registros.
              </p>
            )}
            <p className="comp-modal-desc">Se reconstruirá tabla_analisis con padrón + complementaria.</p>
            <div className="comp-modal-footer">
              <button className="btn-secondary" onClick={() => setShowGenModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleConfirmGenerar}>Confirmar y generar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CSV masivo */}
      {showCsvModal && (
        <div className="comp-overlay" onClick={() => setShowCsvModal(false)}>
          <div className="comp-modal" onClick={e => e.stopPropagation()}>
            <h3>📂 Complementar masivamente</h3>
            <p className="comp-modal-desc">
              El archivo debe incluir la PK del proyecto y las columnas a actualizar:<br />
              <code>{data.pk || 'cuenta'}, {columnasEditables.join(', ')}</code>
            </p>
            <div className="comp-csv-drop"
              onClick={() => csvInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); setCsvFile(e.dataTransfer.files[0] || null); }}
              onDragOver={e => e.preventDefault()}>
              <input type="file" accept=".csv,.xlsx,.xls" ref={csvInputRef}
                style={{ display: 'none' }} onChange={e => setCsvFile(e.target.files[0] || null)} />
              {csvFile ? <><span>✓</span><p>{csvFile.name}</p></> : <><span>📄</span><p>Arrastra o haz clic</p></>}
            </div>
            {csvResult && (
              <div className={`comp-csv-result ${csvResult.success ? 'ok' : 'err'}`}>
                <p>{csvResult.message}</p>
                {csvResult.errores?.slice(0, 5).map((e, i) => <p key={i} style={{ fontSize: 12 }}>• {e}</p>)}
              </div>
            )}
            <div className="comp-modal-footer">
              <button className="btn-primary" onClick={handleCsvComplementar} disabled={!csvFile || csvLoading}>
                {csvLoading ? 'Procesando…' : 'Cargar'}
              </button>
              <button className="btn-secondary" onClick={() => setShowCsvModal(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .table-container{flex:1;overflow:auto;min-height:0;background:var(--clr-white);border:1px solid var(--clr-border);border-radius:var(--radius);}
        .analisis-loading,.analisis-empty{padding:60px;text-align:center;color:var(--clr-muted);font-size:14px;}
        .comp-th{padding:10px 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;color:var(--clr-muted);border-bottom:1px solid var(--clr-border);white-space:nowrap;background:#f8f9fa;position:sticky;top:0;z-index:3;}
        .comp-th--pk{min-width:90px;position:sticky;left:0;top:0;z-index:5;background:#f8f9fa;}
        .comp-th--group{background:#e8f0f9;color:#2b5fa8;text-align:center;font-size:10px;letter-spacing:1px;border-left:2px solid #4a7fb5;padding:6px;position:sticky;top:0;z-index:3;}
        .comp-th2{padding:4px 12px;background:#f8f9fa;border-bottom:1px solid var(--clr-border);position:sticky;top:38px;z-index:3;}
        .comp-th2--pk{position:sticky;left:0;top:38px;z-index:5;background:#f8f9fa;}
        .comp-th2--editable{min-width:130px;background:#eef3f9;color:#2b5fa8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;}
        .comp-th2--first{border-left:2px solid #4a7fb5;}
        .comp-td{padding:7px 12px;font-size:12.5px;color:var(--clr-text);white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--clr-border);background:#fff;}
        .comp-td--pk{position:sticky;left:0;z-index:1;font-weight:600;border-right:1px solid #e2e8f0;background:#fff;}
        .comp-td--editable{padding:3px 6px;}
        .comp-td--first{border-left:2px solid #4a7fb5;}
        .comp-cell-input{width:100%;border:1px solid transparent;border-radius:4px;padding:4px 8px;font-size:12.5px;font-family:'Outfit',sans-serif;background:transparent;outline:none;transition:border-color .15s,background .15s;}
        .comp-cell-input:focus{border-color:var(--clr-accent);background:#fff;box-shadow:0 0 0 2px rgba(74,127,181,.15);}
        .comp-cell-input--dirty{background:#fffde7!important;border-color:#f6c90e!important;}
        .comp-pagination{flex-shrink:0;display:flex;justify-content:center;align-items:center;gap:16px;padding:12px 0 0;font-size:13px;color:var(--clr-muted);}
        .comp-pagination button{padding:6px 14px;border:1px solid var(--clr-border);background:var(--clr-white);border-radius:6px;font-size:12px;cursor:pointer;font-family:'Outfit',sans-serif;}
        .comp-pagination button:hover:not(:disabled){background:var(--clr-active-bg);border-color:var(--clr-accent);}
        .comp-pagination button:disabled{opacity:.4;cursor:not-allowed;}
        .comp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000;}
        .comp-modal{background:var(--clr-white);border-radius:var(--radius);padding:28px 32px;max-width:560px;width:90%;box-shadow:var(--shadow-md);}
        .comp-modal h3{font-size:17px;font-weight:600;margin-bottom:14px;color:var(--clr-text);}
        .comp-modal-warn{color:#c05621;background:#fffaf0;padding:10px 14px;border-radius:8px;border:1px solid #fbd38d;font-size:13px;margin-bottom:12px;}
        .comp-modal-desc{font-size:13px;color:var(--clr-muted);line-height:1.7;margin-bottom:14px;}
        .comp-modal-desc code{background:#eef3f9;padding:2px 6px;border-radius:4px;font-size:12px;color:var(--clr-accent);}
        .comp-modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}
        .comp-csv-drop{border:2px dashed var(--clr-border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;margin:14px 0;color:var(--clr-muted);font-size:13px;display:flex;flex-direction:column;align-items:center;gap:8px;transition:border-color .2s,background .2s;}
        .comp-csv-drop:hover{border-color:var(--clr-accent);background:var(--clr-accent-lt);}
        .comp-csv-result{padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:8px;}
        .comp-csv-result.ok{background:#c6f6d5;color:#276749;border:1px solid #9ae6b4;}
        .comp-csv-result.err{background:#fed7d7;color:#9b2c2c;border:1px solid #feb2b2;}
      `}</style>
    </>
  );
}