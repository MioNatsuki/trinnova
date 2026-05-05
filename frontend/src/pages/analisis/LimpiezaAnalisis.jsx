// frontend/src/pages/analisis/LimpiezaAnalisis.jsx
import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import { useNavigationGuard } from '../../context/NavigationGuardContext';
import './LimpiezaAnalisis.css';

const LIMIT = 50;

// ── Columnas de fecha exactas por proyecto ──────────────────────────────────
const FECHA_COLS_POR_PROYECTO = {
  pensiones:          new Set(['ultimo_abono','fecha_alta','ultima_aportacion','fecha_convenio','fecha_asignacion']),
  apa_tlajomulco:     new Set(['fecha_lectura']),
  licencias_gdl:      new Set(['fecemi']),
  predial_gdl:        new Set([]),
  predial_tlajomulco: new Set([]),
  estado:             new Set(['fecha_recepcion','fecha_documento_determinante','fecha_notificacion','exigible']),
};

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const FORMATO_FECHA = {
  estado: 'es-long', apa_tlajomulco: 'dd/mm/yyyy', predial_tlajomulco: 'dd/mm/yyyy',
  predial_gdl: 'dd/mm/yyyy', licencias_gdl: 'dd/mm/yyyy', pensiones: 'dd/mes/yyyy',
};

function formatDateForProject(val, slug) {
  if (!val) return val;
  const s = String(val).trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.substring(0,10)+'T00:00:00');
  else d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const day = String(d.getDate()).padStart(2,'0');
  const mon = String(d.getMonth()+1).padStart(2,'0');
  const mes = MESES_ES[d.getMonth()];
  const year = d.getFullYear();
  const fmt = FORMATO_FECHA[slug] || 'dd/mm/yyyy';
  if (fmt === 'es-long')     return `${parseInt(day)} de ${mes} de ${year}`;
  if (fmt === 'dd/mes/yyyy') return `${day}/${mes}/${year}`;
  return `${day}/${mon}/${year}`;
}

function isRFCCol(col)    { return col === 'rfc'; }
function isColoniaCol(col){ return ['colonia','colonia_ubic','ubic_colonia','afiliado_colonia','aval_colonia','colonia_3'].includes(col); }
function isCalleCol(col)  { return ['calle','calle_numero','ubicacion','domicilio','afiliado_calle','aval_calle'].includes(col); }
function isCPCol(col)     { return col === 'cp' || col === 'afiliado_cp' || col === 'aval_cp'; }
function isPhoneCol(col)  { return ['afiliado_telefono','afiliado_celular','afiliado_lada','aval_telefono','aval_celular','aval_lada'].includes(col); }

const today = new Date(); today.setHours(0,0,0,0);
const EPOCH_ERROR = new Date('1900-01-02');

function detectErrors(val, col, slug) {
  const s = val !== null && val !== undefined ? String(val).trim() : '';
  if (s === '') {
    if (isColoniaCol(col)) return 'Colonia vacía';
    if (isCalleCol(col))   return 'Calle/domicilio vacío';
    if (isCPCol(col))      return 'CP vacío';
    return null;
  }
  if (isRFCCol(col)) {
    const len = s.replace(/\s/g,'').length;
    if (len < 12 || len > 13) return `RFC inválido (${len} chars, esperado 12-13)`;
    return null;
  }
  if (FECHA_COLS_POR_PROYECTO[slug]?.has(col)) {
    let d = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(s.substring(0,10)+'T00:00:00');
    else if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
      const [dd,mm,yyyy] = s.substring(0,10).split('/');
      d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    }
    if (d && !isNaN(d.getTime())) {
      if (d <= EPOCH_ERROR) return 'Fecha inválida (época 1900)';
      if (d > today)        return 'Fecha futura';
    }
    return null;
  }
  if (/[ÃÂ§Â¡Â©Ã¼Ã³Ã±Ã©Ã­Ã¡]/u.test(s)) return 'Posible error de codificación';
  if (isPhoneCol(col)) {
    const digits = s.replace(/\D/g,'');
    if (digits.length > 0 && ![8,10,13].includes(digits.length))
      return `Teléfono inválido (${digits.length} dígitos)`;
  }
  return null;
}

const Icon = ({ d, d2, size=16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d}/>{d2 && <path d={d2}/>}
  </svg>
);

const ICONS = {
  spaces:    {d:"M4 6h16M4 12h16M4 18h7",d2:"M15 18l4-4m0 0l4 4m-4-4v8"},
  streets:   {d:"M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3"},
  upload:    {d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",d2:"M17 8l-5-5-5 5M12 3v12"},
  search:    {d:"M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0"},
  chevron:   {d:"M6 9l6 6 6-6"},
  save:      {d:"M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z",d2:"M17 21v-8H7v8M7 3v5h8"},
  sortUp:    {d:"M12 5l-7 7h14z"},
  sortDown:  {d:"M12 19l7-7H5z"},
  sortNone:  {d:"M12 5l-4 4h8zM12 19l4-4H8z"},
};

const MemoizedCell = memo(({ 
  pkVal, col, rawVal, proyectoSlug, editedCells, editingCell, 
  onDoubleClick, onChange, onBlur 
}) => {
  const err = detectErrors(rawVal, col, proyectoSlug);
  const isDirty = editedCells[pkVal]?.[col] !== undefined;
  const isEditing = editingCell?.pkVal === pkVal && editingCell?.col === col;
  let displayVal = String(rawVal ?? '');
  
  if (FECHA_COLS_POR_PROYECTO[proyectoSlug]?.has(col) && rawVal) {
    displayVal = formatDateForProject(String(rawVal), proyectoSlug);
  }

  return (
    <td
      className={`la-td ${err ? 'la-td--error' : ''} ${isDirty ? 'la-td--dirty' : ''}`}
      title={err ? `⚠ ${err}` : 'Doble clic para editar'}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(pkVal, col); }}
      onClick={(e) => e.stopPropagation()}
    >
      {isEditing ? (
        <input
          autoFocus
          className="la-cell-input"
          defaultValue={String(editedCells[pkVal]?.[col] ?? rawVal ?? '')}
          onChange={(e) => onChange(pkVal, col, e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') onBlur();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          {err && <span className="la-err-dot" title={err}>!</span>}
          <span className="la-cell-val">{displayVal}</span>
        </>
      )}
    </td>
  );
});

const VIABILIDAD_CONFIG = {
  viable:    {label:'Viable',   bg:'#c6f6d5',color:'#276749',dot:'#38a169'},
  no_viable: {label:'No viable',bg:'#fed7d7',color:'#9b2c2c',dot:'#e53e3e'},
  pendiente: {label:'Pendiente',bg:'#feebc8',color:'#9c4221',dot:'#ed8936'},
};

function SortIcon({ col, sortCol, sortDir }) {
  if (sortCol !== col) return <Icon {...ICONS.sortNone} size={10} />;
  return sortDir === 'asc' ? <Icon {...ICONS.sortUp} size={10} /> : <Icon {...ICONS.sortDown} size={10} />;
}

export default function LimpiezaAnalisis() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const { setDirty } = useNavigationGuard();

  const [programas,   setProgramas]   = useState([]);
  const [programa,    setPrograma]    = useState('todos');
  const [data,        setData]        = useState({rows:[], total:0, pk:null});
  const [loading,     setLoading]     = useState(false);
  const [page,        setPage]        = useState(1);
  const [filtroVia,   setFiltroVia]   = useState('');
  const [busqueda,    setBusqueda]    = useState('');
  const [draftBusq,   setDraftBusq]   = useState('');
  const [selected,    setSelected]    = useState(new Set());
  const [message,     setMessage]     = useState(null);
  const [ejecutando,  setEjecutando]  = useState(false);
  const [stats,       setStats]       = useState(null);
  const [ndMotivo,    setNdMotivo]    = useState('');
  const [showNdInput, setShowNdInput] = useState(false);

  // Edición inline
  const [editedCells,  setEditedCells]  = useState({});
  const [savingCells,  setSavingCells]  = useState(false);
  const [editingCell,  setEditingCell]  = useState(null);

  // Ordenamiento
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [pageSize, setPageSize] = useState(50);

  // CSV
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile,      setCsvFile]      = useState(null);
  const [csvLoading,   setCsvLoading]   = useState(false);
  const [csvResult,    setCsvResult]    = useState(null);
  const csvInputRef = useRef();

  const openCsvModal = useCallback(() => {
    setCsvFile(null);
    setCsvResult(null);
    setShowCsvModal(true);
    setDirty(true, 'Tienes un modal de carga CSV abierto.');
  }, [setDirty]);

  const closeCsvModal = useCallback(() => {
    if (csvLoadingRef.current) return;
    if (csvFile && !csvResult) {
      if (!window.confirm('¿Cerrar sin cargar el archivo?')) return;
    }
    setShowCsvModal(false);
    setCsvFile(null);
    setCsvResult(null);
    setDirty(false);
  }, [csvFile, csvResult, setDirty]);

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
  const pendingCellCount = Object.keys(editedCells).length;

  // Guard navegación
  useEffect(() => {
    const dirty = pendingCellCount > 0 || ejecutando || showCsvModal;
    setDirty(dirty, dirty ? 'Tienes cambios o una operación en progreso en Limpieza y Análisis.' : '');
    return () => setDirty(false);
  }, [pendingCellCount, ejecutando, showCsvModal, setDirty]);

  useEffect(() => {
    if (!proyectoSlug) { setProgramas([]); setPrograma('todos'); return; }
    api.get(`/analisis/${proyectoSlug}/programas`)
      .then(r => setProgramas(r.data || []))
      .catch(() => setProgramas([]));
  }, [proyectoSlug]);

  // Limpiar ediciones y selección cuando cambia de proyecto
  useEffect(() => {
    setEditedCells({});
    setSelected(new Set());
  }, [proyectoSlug]);

  const showMsg = useCallback((type, text) => {
    setMessage({type,text});
    setTimeout(()=>setMessage(null),5000);
  }, []);

  const loadData = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const params = { page, limit: pageSize };
      if (filtroVia)            params.viabilidad = filtroVia;
      if (busqueda)             params.busqueda   = busqueda;
      if (programa !== 'todos') params.programa   = programa;
      if (sortCol)              { params.sort_col = sortCol; params.sort_dir = sortDir; }
      const res = await api.get(`/analisis/${proyectoSlug}/analisis`, { params });
      setData(res.data);
      setSelected(new Set());
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error cargando análisis.');
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, pageSize, filtroVia, busqueda, programa, sortCol, sortDir, showMsg]);

  const loadStats = useCallback(async () => {
    if (!proyectoSlug) return;
    try {
      const res = await api.get(`/analisis/${proyectoSlug}/estadisticas`);
      setStats(res.data);
    } catch {}
  }, [proyectoSlug]);

  useEffect(() => { loadData(); loadStats(); }, [loadData, loadStats]);
  useEffect(() => { setPage(1); }, [proyectoSlug, filtroVia, busqueda, programa, sortCol, sortDir, pageSize]);

  // Selección
  const toggleSelect = pkVal => setSelected(prev => {
    const n = new Set(prev); n.has(pkVal) ? n.delete(pkVal) : n.add(pkVal); return n;
  });
  const toggleAll = e => e.target.checked
    ? setSelected(new Set(data.rows.map(r=>r[data.pk])))
    : setSelected(new Set());

  // Ordenamiento — incluyendo columnas fijas
  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  // Edición inline
  const handleCellDblClick = useCallback((pkVal, col) => {
    setEditingCell({pkVal, col});
  }, []);
  
  const handleCellChange = useCallback((pkVal, col, value) => {
    setEditedCells(prev => {
      const currentValue = prev[pkVal]?.[col];
      if (currentValue === value) return prev;
      return {...prev, [pkVal]: {...(prev[pkVal]||{}), [col]: value}};
    });
  }, []);

  const handleCellBlur = () => setEditingCell(null);

  const handleSaveCells = async () => {
    if (pendingCellCount === 0) return;
    setSavingCells(true);
    try {
      const payload = Object.entries(editedCells).map(([pk_value, campos]) => ({pk_value, campos}));
      await api.post(`/analisis/${proyectoSlug}/actualizar-analisis`, payload);
      showMsg('success', `${pendingCellCount} registro(s) guardados.`);
      setEditedCells({});
      loadData(); loadStats();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally {
      setSavingCells(false);
    }
  };

  // Acciones
  const ejecutarAccion = async (accion, valor=null) => {
    if (selected.size===0) { showMsg('error','Selecciona al menos un registro.'); return; }
    setEjecutando(true);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/acciones-manuales`,
        {ids:Array.from(selected), accion, valor});
      showMsg('success', res.data.message);
      loadData(); loadStats();
    } catch (err) {
      showMsg('error', err.response?.data?.detail||'Error.');
    } finally {
      setEjecutando(false);
    }
  };

  const ejecutarLimpieza = async tipo => {
    if (!window.confirm(`¿Ejecutar "${tipo==='calles'?'Normalizar calles':'Limpiar espacios'}"?`)) return;
    setEjecutando(true);
    try {
      const endpoint = tipo==='calles'
        ? `/analisis/${proyectoSlug}/limpieza/normalizar-calles`
        : `/analisis/${proyectoSlug}/limpieza/limpiar-espacios`;
      const res = await api.post(endpoint);
      showMsg('success', res.data.message);
      loadData();
    } catch (err) {
      showMsg('error', err.response?.data?.detail||'Error en limpieza.');
    } finally {
      setEjecutando(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    const formData = new FormData();
    formData.append('file', csvFile);
    try {
      const res = await api.post(`/analisis/${proyectoSlug}/cargar-viabilidad-csv`, formData,
        {headers:{'Content-Type':'multipart/form-data'}});
      setCsvResult(res.data);

      setTimeout(() => {
        setShowCsvModal(false);
        setCsvResult(null);
        setCsvFile(null);
      }, 1500);

      await loadData();
      await loadStats();
    } catch (err) {
      setCsvResult({success:false, message:err.response?.data?.detail||'Error.', procesados:0, errores:[]});
    } finally {
      setCsvLoading(false);
    }
  };

  const allCols = useMemo(() =>
    data.rows.length > 0 ? Object.keys(data.rows[0]).filter(c=>!c.startsWith('_')) : [],
    [data.rows]
  );
  const normalCols = useMemo(() => allCols.filter(c=>c!=='viabilidad'&&c!=='estatus_pago'), [allCols]);

  if (!proyectoSlug) {
    return (
      <div className="la-page">
        <div className="la-header"><h1 className="la-title">Limpieza y Análisis</h1></div>
        <div className="la-no-project">
          <p>Selecciona un proyecto para continuar.</p>
          <select className="la-select" value="" onChange={e=>setProyectoSlug(e.target.value)}>
            <option value="">— Proyecto —</option>
            {proyectos.map(p=><option key={p.id} value={p.slug}>{p.nombre}</option>)}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="la-page">

      {/* TOOLBAR */}
      <div className="la-toolbar">
        <div className="la-dropdowns">
          <div className="la-select-wrap">
            <span className="la-select-label">Proyecto:</span>
            <div className="la-dropdown">
              <select className="la-select" value={proyectoSlug}
                onChange={e=>{setProyectoSlug(e.target.value);setPrograma('todos');}}>
                {proyectos.map(p=><option key={p.id} value={p.slug}>{p.nombre}</option>)}
              </select>
              <span className="la-chevron"><Icon {...ICONS.chevron} size={14}/></span>
            </div>
          </div>
          <div className="la-select-wrap">
            <span className="la-select-label">Programa:</span>
            <div className="la-dropdown">
              <select className="la-select" value={programa} onChange={e=>setPrograma(e.target.value)}>
                <option value="todos">Todos</option>
                {programas.map(p=><option key={p.id} value={p.slug}>{p.nombre}</option>)}
              </select>
              <span className="la-chevron"><Icon {...ICONS.chevron} size={14}/></span>
            </div>
          </div>
          <form className="la-search-form" onSubmit={e=>{e.preventDefault();setBusqueda(draftBusq);setPage(1);}}>
            <span className="la-search-icon"><Icon {...ICONS.search} size={14}/></span>
            <input className="la-search-input" type="text" placeholder="Buscar…"
              value={draftBusq} onChange={e=>setDraftBusq(e.target.value)}/>
            {busqueda&&<button type="button" className="la-search-clear"
              onClick={()=>{setBusqueda('');setDraftBusq('');}}>✕</button>}
          </form>
        </div>

        <div className="la-tools">
          <button className="la-tool-btn" onClick={()=>ejecutarLimpieza('espacios')} disabled={ejecutando}
            title="Elimina espacios duplicados y espacios al inicio/fin">
            <Icon {...ICONS.spaces}/><span>Espacios</span>
          </button>
          <button className="la-tool-btn" onClick={()=>ejecutarLimpieza('calles')} disabled={ejecutando}
            title="Normaliza abreviaturas: Av. → Avenida, Gpe → Guadalupe…">
            <Icon {...ICONS.streets}/><span>Calles</span>
          </button>
          <button className="la-tool-btn la-tool-btn--warning"
            onClick={()=>ejecutarAccion('quitar_pagada')}
            disabled={ejecutando||selected.size===0}
            title="Marca seleccionados como No viable (Pagada). Siguen visibles.">
            💰<span>Pagadas</span>
          </button>
          <button className="la-tool-btn la-tool-btn--warning"
            onClick={()=>setShowNdInput(v=>!v)}
            disabled={ejecutando||selected.size===0}
            title="Marca seleccionados como No viable (No Deudor). Siguen visibles.">
            📋<span>ND</span>
          </button>
          <button className="la-tool-btn la-tool-btn--accent"
            onClick={openCsvModal}
            title="Carga viabilidad/pagos masivo desde CSV o Excel">
            <Icon {...ICONS.upload}/><span>Cargar CSV</span>
          </button>
          {pendingCellCount>0&&(
            <button className="la-tool-btn la-tool-btn--save" onClick={handleSaveCells}
              disabled={savingCells} title={`Guardar ${pendingCellCount} celda(s) editada(s)`}>
              <Icon {...ICONS.save}/><span>{savingCells?'Guardando…':`Guardar (${pendingCellCount})`}</span>
            </button>
          )}
        </div>
      </div>

      {showNdInput&&(
        <div className="la-nd-row">
          <input type="text" value={ndMotivo} onChange={e=>setNdMotivo(e.target.value)}
            placeholder="Motivo ND…" className="la-nd-input"
            onKeyDown={e=>{if(e.key==='Enter'&&ndMotivo.trim()){ejecutarAccion('quitar_nd',ndMotivo);setNdMotivo('');setShowNdInput(false);}}}/>
          <button className="la-btn la-btn--viable"
            onClick={()=>{ejecutarAccion('quitar_nd',ndMotivo);setNdMotivo('');setShowNdInput(false);}}
            disabled={!ndMotivo.trim()||ejecutando}>Confirmar</button>
          <button className="la-btn la-btn--ghost" onClick={()=>{setShowNdInput(false);setNdMotivo('');}}>Cancelar</button>
        </div>
      )}

      {/* STATS */}
      {stats&&(
        <div className="la-stats">
          {[{label:'Padrón',val:stats.padron,cls:''},{label:'Análisis',val:stats.analisis,cls:''},
            {label:'Viables',val:stats.viable,cls:'green'},{label:'No viables',val:stats.no_viable,cls:'red'},
            {label:'Pendientes',val:stats.pendiente,cls:'amber'}].map(s=>(
            <div key={s.label} className={`la-stat la-stat--${s.cls||'neutral'}`}>
              <span className="la-stat-num">{(s.val??0).toLocaleString()}</span>
              <span className="la-stat-lbl">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ACCIONES */}
      <div className="la-actions-row">
        <select className="la-filter-select" value={filtroVia} onChange={e=>setFiltroVia(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="viable">Viables</option>
          <option value="no_viable">No viables</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <div className="la-action-btns">
          <button onClick={()=>ejecutarAccion('viable')} disabled={ejecutando||selected.size===0}
            className="la-btn la-btn--viable">✓ Viable</button>
          <button onClick={()=>ejecutarAccion('no_viable')} disabled={ejecutando||selected.size===0}
            className="la-btn la-btn--novia">✗ No viable</button>
        </div>
        {selected.size>0&&<span className="la-selected-count">{selected.size} seleccionados</span>}
        {pendingCellCount>0&&<span className="la-dirty-count">⚠️ {pendingCellCount} sin guardar</span>}
      </div>

      {message&&<div className={`la-message la-message--${message.type}`}>{message.text}</div>}

      {/* TABLA */}
      {loading ? (
        <div className="la-loading">Cargando datos…</div>
      ) : (
        <div className="la-table-wrapper">
          <table className="la-table">
            <thead>
              <tr>
                <th className="la-th la-th--check la-th--sticky-check">
                  <input type="checkbox" onChange={toggleAll}
                    checked={data.rows.length>0&&selected.size===data.rows.length}
                    ref={el=>{if(el)el.indeterminate=selected.size>0&&selected.size<data.rows.length;}}/>
                </th>

                {normalCols.map(col=>(
                  <th key={col} className="la-th la-th--sortable" onClick={()=>handleSort(col)}>
                    <span className="la-th-inner">
                      <span>{col.replace(/_/g,' ')}</span>
                      <SortIcon col={col} sortCol={sortCol} sortDir={sortDir}/>
                    </span>
                  </th>
                ))}

                <th className="la-th la-th--sticky la-th--via la-th--sortable"
                  onClick={()=>handleSort('viabilidad')}>
                  <span className="la-th-inner">
                    <span>Viabilidad</span>
                    <SortIcon col="viabilidad" sortCol={sortCol} sortDir={sortDir}/>
                  </span>
                </th>

                <th className="la-th la-th--sticky la-th--pago la-th--sortable"
                  onClick={()=>handleSort('estatus_pago')}>
                  <span className="la-th-inner">
                    <span>Pago</span>
                    <SortIcon col="estatus_pago" sortCol={sortCol} sortDir={sortDir}/>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length===0 ? (
                <tr><td colSpan={normalCols.length+3} className="la-empty">
                  {busqueda?'Sin resultados.':'No hay registros. Genera el análisis primero.'}
                </td></tr>
              ) : data.rows.map(row=>{
                const pkVal = row[data.pk];
                const isSelected = selected.has(pkVal);
                const pagoBadge = row['estatus_pago'];

                return (
                  <tr key={pkVal}
                    className={`la-tr ${isSelected?'la-tr--selected':''}`}
                    onClick={()=>toggleSelect(pkVal)}>

                    <td className="la-td la-td--check la-td--sticky-check" onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={()=>toggleSelect(pkVal)}/>
                    </td>

                    {normalCols.map(col => (
                      <MemoizedCell
                        key={col}
                        pkVal={pkVal}
                        col={col}
                        rawVal={editedCells[pkVal]?.[col] !== undefined ? editedCells[pkVal][col] : row[col]}
                        proyectoSlug={proyectoSlug}
                        editedCells={editedCells}
                        editingCell={editingCell}
                        onDoubleClick={handleCellDblClick}
                        onChange={handleCellChange}
                        onBlur={handleCellBlur}
                      />
                    ))}

                    <td className="la-td la-td--sticky la-td--via" onClick={e=>e.stopPropagation()}>
                      {(()=>{
                        const v = row['viabilidad']||'pendiente';
                        const cfg = VIABILIDAD_CONFIG[v]||VIABILIDAD_CONFIG.pendiente;
                        return (
                          <span className="la-badge" style={{background:cfg.bg,color:cfg.color}}>
                            <span className="la-badge-dot" style={{background:cfg.dot}}/>
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </td>

                    <td className="la-td la-td--sticky la-td--pago" onClick={e=>e.stopPropagation()}>
                      {pagoBadge
                        ? <span className="la-pago-badge">{pagoBadge}</span>
                        : <span className="la-pago-empty">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* PAGINACIÓN */}
      {!loading&&data.total>0&&(
        <div className="la-pagination">
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>← Anterior</button>
          <span>Página {page} de {totalPages} · {data.total.toLocaleString()} registros</span>
          <select value={pageSize}
            onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}
            style={{padding:'5px 8px',border:'1px solid var(--clr-border)',borderRadius:6,fontSize:12,fontFamily:'Outfit,sans-serif'}}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}>Siguiente →</button>
        </div>
      )}

      {/* MODAL CSV */}
      {showCsvModal&&(
        <div className="la-modal-overlay" onClick={closeCsvModal}>
          <div className="la-modal" onClick={e=>e.stopPropagation()}>
            <div className="la-modal-head">
              <h2 className="la-modal-title">Cargar viabilidad / pagos masivo</h2>
              <button className="la-modal-x" onClick={closeCsvModal}>✕</button>
            </div>
            <p className="la-modal-desc">
              Columnas aceptadas: <code>{data.pk||'cuenta'}</code> (requerida) · <code>viabilidad</code> (viable / no_viable / pendiente) · <code>estatus_pago</code> · <code>fecha_pago</code> · <code>monto_pago</code> · <code>observaciones</code> · <code>programa</code>
            </p>
            <div className="la-csv-drop" onClick={()=>csvInputRef.current?.click()}
              onDrop={e=>{e.preventDefault();setCsvFile(e.dataTransfer.files[0]||null);}}
              onDragOver={e=>e.preventDefault()}>
              <input type="file" accept=".csv,.xlsx,.xls" ref={csvInputRef} style={{display:'none'}}
                onChange={e=>setCsvFile(e.target.files[0]||null)}/>
              {csvFile
                ?<><span className="la-csv-ok">✓</span><p>{csvFile.name}</p></>
                :<><Icon {...ICONS.upload} size={28}/><p>Arrastra aquí o haz clic</p></>}
            </div>
            {csvResult&&(
              <div className={`la-modal-result ${csvResult.success?'ok':'err'}`}>
                <p>{csvResult.message}</p>
                {csvResult.errores?.length>0&&(
                  <ul>{csvResult.errores.slice(0,5).map((e,i)=><li key={i}>{e}</li>)}</ul>
                )}
              </div>
            )}
            <div className="la-modal-actions">
              <button className="la-btn la-btn--ghost" onClick={closeCsvModal}>Cerrar</button>
              <button className="la-btn la-btn--primary" onClick={handleCsvUpload}
                disabled={!csvFile||csvLoading}>{csvLoading?'Cargando…':'Cargar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
