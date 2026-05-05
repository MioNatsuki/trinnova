// frontend/src/pages/analisis/Complementar.jsx
import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import { useNavigationGuard } from '../../context/NavigationGuardContext';
import './Analisis.css';

const COLS_OCULTAS = new Set(['id_comp']);

const SortIcon = ({ col, sortCol, sortDir }) => {
  if (sortCol !== col) return <span style={{opacity:.35,fontSize:9}}>⇅</span>;
  return <span style={{fontSize:9}}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
};

// Componente memoizado para celdas editables
const EditableCell = memo(({ value, isDirty, col, onChange }) => (
  <input
    type="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`comp-cell-input ${isDirty ? 'comp-cell-input--dirty' : ''}`}
    title={col}
  />
));

export default function Complementar() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const { setDirty } = useNavigationGuard();

  const [limit, setLimit]             = useState(20);
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
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile]           = useState(null);
  const [csvLoading, setCsvLoading]     = useState(false);
  const [csvResult, setCsvResult]       = useState(null);
  const [sortCol, setSortCol]           = useState(null);
  const [sortDir, setSortDir]           = useState('asc');

  const csvInputRef = useRef();

  const totalPages = Math.max(1, Math.ceil(data.total / limit));

  // NavigationGuard para modales
  const openCsvModal = useCallback(() => {
    setCsvFile(null);
    setCsvResult(null);
    setShowCsvModal(true);
    setDirty(true, 'Tienes un modal de carga CSV abierto.');
  }, [setDirty]);

  const closeCsvModal = useCallback(() => {
    if (csvLoading) return;
    setShowCsvModal(false);
    setDirty(false);
  }, [csvLoading, setDirty]);

  const openGenModal = useCallback(async () => {
    try {
      const stats = await api.get(`/analisis/${proyectoSlug}/estadisticas`);
      setGenInfo({ previo: stats.data.analisis || 0 });
    } catch { setGenInfo({ previo: 0 }); }
    setShowGenModal(true);
    setDirty(true, 'Tienes el modal de generar análisis abierto.');
  }, [proyectoSlug, setDirty]);

  const closeGenModal = useCallback(() => {
    setShowGenModal(false);
    setDirty(false);
  }, [setDirty]);

  useEffect(() => {
    setDirty(pendingCount > 0 || showCsvModal || showGenModal,
      pendingCount > 0
        ? `Tienes ${pendingCount} registro(s) con cambios sin guardar en Complementar.`
        : 'Tienes un modal abierto en Complementar.');
    return () => setDirty(false);
  }, [pendingCount, showCsvModal, showGenModal, setDirty]);

  const loadData = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const params = { page, limit, search: search || undefined };
      if (sortCol) { params.sort_col = sortCol; params.sort_dir = sortDir; }
      const res = await api.get(`/analisis/${proyectoSlug}/complementar`, { params });
      setData(res.data);
      if (res.data.rows.length > 0 && res.data.pk) {
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
  }, [proyectoSlug, page, limit, search, sortCol, sortDir]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (proyectoSlug) {
      setEditedRows({});
      setPendingCount(0);
      setDirty(false);
      loadData();
    }
  }, [proyectoSlug]);

  const showMsg = useCallback((type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }, []);

  const handleSort = useCallback((col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }, [sortCol]);

  const handleCellEdit = useCallback((pkValue, field, value) => {
    setEditedRows(prev => {
      const currentValue = prev[pkValue]?.[field];
      if (currentValue === value) return prev;
      const updated = { ...prev, [pkValue]: { ...(prev[pkValue] || {}), [field]: value } };
      return updated;
    });
  }, []);

  // Actualizar pendingCount cuando cambia editedRows
  useEffect(() => {
    const count = Object.keys(editedRows).length;
    setPendingCount(count);
    if (count > 0) {
      setDirty(true, `Tienes ${count} registro(s) con cambios sin guardar en Complementar.`);
    } else if (!showCsvModal && !showGenModal) {
      setDirty(false);
    }
  }, [editedRows, setDirty, showCsvModal, showGenModal]);

  const handleSave = useCallback(async () => {
    if (Object.keys(editedRows).length === 0) return;
    setSaving(true);
    const payload = Object.entries(editedRows).map(([pk_value, campos]) => ({
      pk_value, campos_complementarios: campos,
    }));
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
      showMsg('success', res.data.message || 'Guardado correctamente.');
      setEditedRows({});
      setPendingCount(0);
      setDirty(false);
      loadData();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally { setSaving(false); }
  }, [editedRows, proyectoSlug, showMsg, setDirty, loadData]);

  const handleConfirmGenerar = useCallback(async () => {
    closeGenModal();
    setSaving(true);
    if (Object.keys(editedRows).length > 0) {
      const payload = Object.entries(editedRows).map(([pk_value, campos]) => ({
        pk_value, campos_complementarios: campos,
      }));
      try {
        await api.post(`/analisis/${proyectoSlug}/guardar-complemento`, payload);
        setEditedRows({}); setPendingCount(0);
      } catch (err) {
        showMsg('error', 'Error: ' + (err.response?.data?.detail || ''));
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
  }, [editedRows, proyectoSlug, showMsg, loadData, closeGenModal]);

  const handleCsvComplementar = useCallback(async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    const formData = new FormData();
    formData.append('file', csvFile);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/cargar-complemento-csv`, formData,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setCsvResult(res.data);
      setTimeout(() => {
        closeCsvModal();
        setCsvResult(null);
        setCsvFile(null);
      }, 1500);
      loadData();
    } catch (err) {
      setCsvResult({ success: false, message: err.response?.data?.detail || 'Error.', procesados: 0, errores: [] });
    } finally { setCsvLoading(false); }
  }, [csvFile, proyectoSlug, loadData, closeCsvModal]);

  const columnasEditables = data.columnas_editables;
  const columnasPadronVisible = useMemo(() => columnasPadron, [columnasPadron]);

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
      <div className="analisis-container">
        <div className="analisis-header">
          <h1>Complementar información</h1>
          <div className="analisis-actions">
            <form onSubmit={e => { e.preventDefault(); setSearch(draftSearch); setPage(1); }}
              style={{ display: 'flex', gap: 6 }}>
              <input type="text" placeholder="Buscar…" value={draftSearch}
                onChange={e => setDraftSearch(e.target.value)} className="search-input" />
              <button type="submit" className="btn-primary btn-sm">Buscar</button>
              {search && (
                <button type="button" className="btn-save btn-sm"
                  onClick={() => { setSearch(''); setDraftSearch(''); }}>✕ Limpiar</button>
              )}
            </form>

            <button onClick={openCsvModal} className="btn-save">📂 CSV masivo</button>

            <button onClick={handleSave}
              disabled={saving || generating || pendingCount === 0}
              className="btn-save">
              {saving ? 'Guardando…' : `Guardar${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </button>

            <button onClick={openGenModal}
              disabled={saving || generating}
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
                    <th className="comp-th comp-th--pk" style={{cursor:'pointer'}}
                      onClick={() => handleSort(data.pk)}>
                      {data.pk ? data.pk.replace(/_/g, ' ') : 'ID'}&nbsp;
                      <SortIcon col={data.pk} sortCol={sortCol} sortDir={sortDir} />
                    </th>
                    {columnasPadronVisible.map(col => (
                      <th key={col} className="comp-th" style={{cursor:'pointer'}}
                        onClick={() => handleSort(col)}>
                        {col.replace(/_/g, ' ')}&nbsp;
                        <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                      </th>
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
                      {columnasPadronVisible.map(col => <th key={col} className="comp-th2" />)}
                      {columnasEditables.map((col, i) => (
                        <th key={col} className={`comp-th2 comp-th2--editable${i === 0 ? ' comp-th2--first' : ''}`}
                          style={{cursor:'pointer'}} onClick={() => handleSort(col)}>
                          {col.replace(/_/g, ' ')}&nbsp;
                          <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={1 + columnasPadronVisible.length + columnasEditables.length} className="analisis-empty">
                        {search ? 'Sin resultados.' : 'No hay registros. Carga un padrón primero.'}
                      </td>
                    </tr>
                  ) : data.rows.map(row => {
                    const pkValue = row[data.pk];
                    return (
                      <tr key={pkValue}>
                        <td className="comp-td comp-td--pk">{safeStr(pkValue)}</td>
                        {columnasPadronVisible.map(col => (
                          <td key={col} className="comp-td" title={safeStr(row[col])}>
                            {safeStr(row[col])}
                          </td>
                        ))}
                        {columnasEditables.map((col, i) => {
                          const isDirtyCell = editedRows[pkValue]?.[col] !== undefined;
                          const value = isDirtyCell ? String(editedRows[pkValue][col]) : String(row[col] ?? '');
                          return (
                            <td key={col} className={`comp-td comp-td--editable${i === 0 ? ' comp-td--first' : ''}`}>
                              <EditableCell
                                value={value}
                                isDirty={isDirtyCell}
                                col={col}
                                onChange={(newVal) => handleCellEdit(pkValue, col, newVal)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data.total > 0 && (
              <div className="comp-pagination">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Anterior</button>
                <span>Página {page} de {totalPages}</span>
                <select
                  value={limit}
                  onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                  style={{ padding: '6px 8px', border: '1px solid var(--clr-border)', borderRadius: 6, fontSize: 12, fontFamily: 'Outfit, sans-serif' }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal generar análisis */}
      {showGenModal && (
        <div className="comp-overlay" onClick={closeGenModal}>
          <div className="comp-modal" onClick={e => e.stopPropagation()}>
            <div className="comp-modal-header">
              <h3>⚡ Generar análisis</h3>
              <button className="comp-modal-x" onClick={closeGenModal}>✕</button>
            </div>
            {genInfo?.previo > 0 && (
              <p className="comp-modal-warn">⚠️ Se sobreescribirán <strong>{genInfo.previo.toLocaleString()}</strong> registros.</p>
            )}
            <p className="comp-modal-desc">Se reconstruirá tabla_analisis (padrón + complementaria).</p>
            <div className="comp-modal-footer">
              <button className="btn-save" onClick={closeGenModal}>Cancelar</button>
              <button className="btn-primary" onClick={handleConfirmGenerar}>Confirmar y generar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal CSV masivo */}
      {showCsvModal && (
        <div className="comp-overlay" onClick={closeCsvModal}>
          <div className="comp-modal" onClick={e => e.stopPropagation()}>
            <div className="comp-modal-header">
              <h3>📂 Complementar masivamente</h3>
              <button className="comp-modal-x" onClick={closeCsvModal}>✕</button>
            </div>
            <p className="comp-modal-desc">
              El archivo debe incluir la PK y las columnas a actualizar:<br />
              <code>{data.pk || 'cuenta'}, {columnasEditables.join(', ')}</code>
            </p>
            <div className="comp-csv-drop"
              onClick={() => csvInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); setCsvFile(e.dataTransfer.files[0] || null); }}
              onDragOver={e => e.preventDefault()}>
              <input type="file" accept=".csv,.xlsx,.xls" ref={csvInputRef} style={{ display: 'none' }}
                onChange={e => setCsvFile(e.target.files[0] || null)} />
              {csvFile
                ? <><span style={{fontSize:24}}>✓</span><p>{csvFile.name}</p></>
                : <><span style={{fontSize:24}}>📂</span><p>Arrastra aquí o haz clic para seleccionar</p></>}
            </div>
            {csvResult && (
              <div className={`comp-csv-result ${csvResult.success ? 'ok' : 'err'}`}>
                <p>{csvResult.message}</p>
                {csvResult.errores?.length > 0 && (
                  <ul>{csvResult.errores.slice(0,5).map((e,i)=><li key={i}>{e}</li>)}</ul>
                )}
              </div>
            )}
            <div className="comp-modal-footer">
              <button className="btn-save" onClick={closeCsvModal}>Cancelar</button>
              <button className="btn-primary" onClick={handleCsvComplementar}
                disabled={!csvFile || csvLoading}>
                {csvLoading ? 'Procesando…' : 'Subir y complementar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .comp-th{padding:8px 12px;background:#f8f9fa;border-bottom:1px solid var(--clr-border);position:sticky;top:0;z-index:3;font-size:11px;font-weight:600;color:var(--clr-muted);text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;}
        .comp-th--pk{position:sticky;left:0;top:0;z-index:5;background:#f8f9fa;}
        .comp-th--group{padding:4px 12px;background:#eef3f9;border-bottom:1px solid #c3d9f0;text-align:center;font-size:11px;font-weight:700;color:#2b5fa8;position:sticky;top:0;z-index:3;}
        .comp-th2{padding:4px 12px;background:#f8f9fa;border-bottom:1px solid var(--clr-border);position:sticky;top:38px;z-index:3;}
        .comp-th2--pk{position:sticky;left:0;top:38px;z-index:5;background:#f8f9fa;}
        .comp-th2--editable{min-width:150px;background:#eef3f9;color:#2b5fa8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;}
        .comp-th2--first{border-left:2px solid #4a7fb5;}
        .comp-td{padding:7px 12px;font-size:12.5px;color:var(--clr-text);white-space:normal;word-wrap:break-word;overflow-wrap:break-word;max-width:350px;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid var(--clr-border);background:#fff;vertical-align:top;}
        .comp-td--pk{position:sticky;left:0;z-index:1;font-weight:600;border-right:1px solid #e2e8f0;background:#fff;}
        .comp-td--editable{padding:3px 6px;}
        .comp-td--first{border-left:2px solid #4a7fb5;}
        .comp-cell-input{width:100%;min-width:140px;border:1px solid transparent;border-radius:4px;padding:4px 8px;font-size:12.5px;font-family:'Outfit',sans-serif;background:transparent;outline:none;transition:border-color .15s,background .15s;}
        .comp-cell-input:focus{border-color:var(--clr-accent);background:#fff;box-shadow:0 0 0 2px rgba(74,127,181,.15);}
        .comp-cell-input--dirty{background:#fffde7!important;border-color:#f6c90e!important;}
        .comp-pagination{flex-shrink:0;display:flex;justify-content:center;align-items:center;gap:16px;padding:12px 0 0;font-size:13px;color:var(--clr-muted);}
        .comp-pagination button{padding:6px 14px;border:1px solid var(--clr-border);background:var(--clr-white);border-radius:6px;font-size:12px;cursor:pointer;font-family:'Outfit',sans-serif;}
        .comp-pagination button:hover:not(:disabled){background:var(--clr-active-bg);border-color:var(--clr-accent);}
        .comp-pagination button:disabled{opacity:.4;cursor:not-allowed;}
        .comp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:1000;}
        .comp-modal{background:var(--clr-white);border-radius:var(--radius);max-width:520px;width:90%;box-shadow:var(--shadow-md);overflow:hidden;}
        .comp-modal-header{display:flex;justify-content:space-between;align-items:center;padding:18px 24px;border-bottom:1px solid var(--clr-border);}
        .comp-modal-header h3{font-size:16px;font-weight:600;color:var(--clr-text);margin:0;}
        .comp-modal-x{background:none;border:none;font-size:16px;color:var(--clr-muted);cursor:pointer;padding:0;line-height:1;}
        .comp-modal-x:hover{color:var(--clr-text);}
        .comp-modal-warn{color:#c05621;background:#fffaf0;padding:10px 14px;border-radius:8px;border:1px solid #fbd38d;font-size:13px;margin:14px 24px 0;}
        .comp-modal-desc{font-size:13px;color:var(--clr-muted);line-height:1.7;padding:14px 24px 0;}
        .comp-modal-desc code{background:#eef3f9;padding:2px 6px;border-radius:4px;font-size:12px;color:var(--clr-accent);}
        .comp-modal-footer{display:flex;gap:10px;justify-content:flex-end;padding:16px 24px;border-top:1px solid var(--clr-border);margin-top:16px;}
        .comp-csv-drop{border:2px dashed var(--clr-border);border-radius:var(--radius);padding:24px;text-align:center;cursor:pointer;margin:14px 24px;color:var(--clr-muted);font-size:13px;display:flex;flex-direction:column;align-items:center;gap:8px;transition:border-color .2s,background .2s;}
        .comp-csv-drop:hover{border-color:var(--clr-accent);background:var(--clr-accent-lt);}
        .comp-csv-result{padding:10px 14px;border-radius:8px;font-size:13px;margin:0 24px 14px;}
        .comp-csv-result.ok{background:#c6f6d5;color:#276749;border:1px solid #9ae6b4;}
        .comp-csv-result.err{background:#fed7d7;color:#9b2c2c;border:1px solid #feb2b2;}
      `}</style>
    </>
  );
}