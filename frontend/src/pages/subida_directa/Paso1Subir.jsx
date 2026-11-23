// frontend/src/pages/subida_directa/Paso1Subir.jsx
import { useState, useCallback, useMemo, useRef, memo } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api/auth';
import ProyectoSelector from '../../components/ProyectoSelector';

// ── Detección de warnings (misma lógica que LimpiezaAnalisis) ──────────────
const FECHA_COLS_POR_PROYECTO = {
  pensiones: new Set(['ultimo_abono','fecha_alta','ultima_aportacion','fecha_convenio','fecha_asignacion']),
  apa_tlajomulco: new Set(['fecha_lectura']),
  licencias_gdl: new Set(['fecemi']),
  predial_gdl: new Set([]),
  predial_tlajomulco: new Set([]),
  estado: new Set(['fecha_recepcion','fecha_documento_determinante','fecha_notificacion','exigible']),
};

const today = new Date(); today.setHours(0,0,0,0);
const EPOCH_ERROR = new Date('1900-01-02');

function isRFCCol(c)    { return c === 'rfc'; }
function isColoniaCol(c){ return ['colonia','colonia_ubic','ubic_colonia','afiliado_colonia','aval_colonia','colonia_3'].includes(c); }
function isCalleCol(c)  { return ['calle','calle_numero','ubicacion','domicilio','afiliado_calle','aval_calle'].includes(c); }
function isCPCol(c)     { return c === 'cp' || c === 'afiliado_cp' || c === 'aval_cp'; }
function isPhoneCol(c)  { return ['afiliado_telefono','afiliado_celular','afiliado_lada','aval_telefono','aval_celular','aval_lada'].includes(c); }

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

// ── Celda editable ─────────────────────────────────────────────────────────
const CellEditable = memo(({
  filaIdx, col, rawVal, proyectoSlug,
  editedCells, editingCell, onChange, onDblClick, onBlur,
}) => {
  const err = detectErrors(rawVal, col, proyectoSlug);
  const isDirty = editedCells[filaIdx]?.[col] !== undefined;
  const isEditing = editingCell?.filaIdx === filaIdx && editingCell?.col === col;

  return (
    <td
      className={`sd-td ${err ? 'sd-td--error' : ''} ${isDirty ? 'sd-td--dirty' : ''}`}
      title={err ? `⚠ ${err}` : 'Doble clic para editar'}
      onDoubleClick={(e) => { e.stopPropagation(); onDblClick(filaIdx, col); }}
    >
      {isEditing ? (
        <input
          autoFocus
          className="sd-cell-input"
          defaultValue={String(editedCells[filaIdx]?.[col] ?? rawVal ?? '')}
          onChange={(e) => onChange(filaIdx, col, e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onBlur(); }}
        />
      ) : (
        <>
          {err && <span className="sd-err-dot" title={err}>!</span>}
          <span className="sd-cell-val">{String(rawVal ?? '')}</span>
        </>
      )}
    </td>
  );
});

// ── Componente principal ───────────────────────────────────────────────────
export default function Paso1Subir({
  proyectoSlug,
  proyectos,
  onChangeProyecto,
  archivoInicial,
  onSiguiente,
  onCancelar,
}) {
  const fileInputRef = useRef();

  const [archivo, setArchivo]         = useState(archivoInicial || null);
  const [preview, setPreview]         = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [editedCells, setEditedCells] = useState({}); // { filaIdx: { col: val } }
  const [editingCell, setEditingCell] = useState(null);
  const [dirtyGuardado, setDirtyGuardado] = useState(false);

  // ── Upload + preview ────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Formato no soportado. Usa CSV o Excel.');
      return;
    }

    setArchivo(file);
    setError('');
    setEditedCells({});
    setDirtyGuardado(false);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(
        `/${proyectoSlug}/subida-directa/preview`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setPreview(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo leer el archivo.');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug]);

  // ── Edición inline ──────────────────────────────────────────────────────
  const handleCellDblClick = useCallback((filaIdx, col) => {
    setEditingCell({ filaIdx, col });
  }, []);

  const handleCellChange = useCallback((filaIdx, col, value) => {
    setEditedCells((prev) => {
      const currentValue = prev[filaIdx]?.[col];
      if (currentValue === value) return prev;
      return { ...prev, [filaIdx]: { ...(prev[filaIdx] || {}), [col]: value } };
    });
    setDirtyGuardado(true);
  }, []);

  const handleCellBlur = useCallback(() => setEditingCell(null), []);

  const handleGuardar = useCallback(() => {
    // En el paso 1 el guardado es en memoria (aún no hay BD ad-hoc).
    // Consolidamos: marcamos como "guardado" y limpiamos el flag dirty.
    setDirtyGuardado(false);
  }, []);

  // ── Limpieza (Espacios / Calles) ────────────────────────────────────────
  const aplicarLimpieza = useCallback(async (accion) => {
    if (!preview) return;
    const etiqueta = accion === 'espacios' ? 'Limpiar espacios' : 'Normalizar calles';
    if (!window.confirm(`¿Ejecutar "${etiqueta}" sobre el preview?`)) return;

    setLoading(true);
    try {
      // La limpieza en el paso 1 se hace en cliente (sobre preview_filas)
      // para no tocar BD. En el paso 3, al crear-temporal, se corre también
      // del lado del servidor si el usuario quiere.
      // Aquí replicamos sólo el comportamiento visual: aplicamos regex en las
      // filas del preview y las reflejamos como ediciones inline.
      const nuevasEdiciones = { ...editedCells };
      const regexCalles = [
        [/\bAv\.?\b/gi, 'Avenida'], [/\bBlvd\.?\b/gi, 'Boulevard'],
        [/\bBlvrd\.?\b/gi, 'Boulevard'], [/\bProlong\.?\b/gi, 'Prolongación'],
        [/\bPriv\.?\b/gi, 'Privada'], [/\bFracc\.?\b/gi, 'Fraccionamiento'],
        [/\bCol\.?\b/gi, 'Colonia'], [/\bCda\.?\b/gi, 'Cerrada'],
        [/\bClle\.?\b/gi, 'Calle'], [/\bGpe\.?\b/gi, 'Guadalupe'],
        [/\bMz\.?\b/gi, 'Manzana'], [/\bLt\.?\b/gi, 'Lote'],
      ];

      preview.preview_filas.forEach((fila, filaIdx) => {
        Object.entries(fila).forEach(([col, val]) => {
          if (val == null) return;
          const original = String(val);
          let nuevo = original;

          if (accion === 'espacios') {
            nuevo = original.replace(/ {2,}/g, ' ').trim();
          } else {
            let tmp = original;
            regexCalles.forEach(([re, repl]) => { tmp = tmp.replace(re, repl); });
            nuevo = tmp.trim();
          }

          if (nuevo !== original) {
            nuevasEdiciones[filaIdx] = {
              ...(nuevasEdiciones[filaIdx] || {}),
              [col]: nuevo,
            };
          }
        });
      });

      setEditedCells(nuevasEdiciones);
      setDirtyGuardado(true);
    } finally {
      setLoading(false);
    }
  }, [preview, editedCells]);

  // ── Navegación ──────────────────────────────────────────────────────────
  const puedeSiguiente = preview && preview.columnas_archivo?.length > 0;

  const handleSiguiente = () => {
    if (!puedeSiguiente) return;

    // Consolidar ediciones inline en el preview antes de pasarlas al paso 2
    const previewEditado = {
      ...preview,
      preview_filas: preview.preview_filas.map((fila, filaIdx) => {
        const cambios = editedCells[filaIdx];
        return cambios ? { ...fila, ...cambios } : fila;
      }),
    };

    onSiguiente({
      file: archivo,
      previewData: previewEditado,
    });
  };

  // ── Conteo de warnings en el preview ────────────────────────────────────
  const warningsCount = useMemo(() => {
    if (!preview) return 0;
    let c = 0;
    preview.preview_filas.forEach((fila) => {
      Object.entries(fila).forEach(([col, val]) => {
        if (detectErrors(val, col, proyectoSlug)) c++;
      });
    });
    return c;
  }, [preview, proyectoSlug]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="sd-paso sd-paso--1">
      {/* Header del paso */}
      <div className="sd-paso-header">
        <div>
          <h2 className="sd-paso-title">Paso 1 — Subir archivo</h2>
          <p className="sd-paso-sub">
            Sube tu archivo (Excel o CSV) ya listo para impresión. Se revisarán
            los datos y podrás corregir celdas antes de continuar.
          </p>
        </div>
        <ProyectoSelector
          proyectos={proyectos}
          value={proyectoSlug}
          onChange={onChangeProyecto}
        />
      </div>

      {/* Drop zone */}
      {!archivo && (
        <div
          className="sd-drop-zone"
          onClick={() => fileInputRef.current?.click()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={(e) => e.preventDefault()}
        >
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0] || null)}
          />
          <div className="sd-drop-icon">📂</div>
          <p className="sd-drop-text">Arrastra aquí o haz clic para seleccionar</p>
          <p className="sd-drop-hint">CSV, Excel (.xlsx, .xls)</p>
        </div>
      )}

      {/* Mensaje de error */}
      {error && <div className="sd-message sd-message--error">{error}</div>}

      {/* Preview con tabla editable */}
      {archivo && (
        <div className="sd-archivo-info">
          <span className="sd-archivo-icon">📄</span>
          <span className="sd-archivo-name">{archivo.name}</span>
          <button
            type="button"
            className="sd-archivo-cambiar"
            onClick={() => { setArchivo(null); setPreview(null); setEditedCells({}); }}
          >
            Cambiar archivo
          </button>
        </div>
      )}

      {loading && (
        <div className="sd-loading">Procesando archivo…</div>
      )}

      {preview && !loading && (
        <>
          {/* Métricas */}
          <div className="sd-preview-stats">
            <div className="sd-stat">
              <span className="sd-stat-num">{preview.total_filas.toLocaleString()}</span>
              <span className="sd-stat-label">filas totales</span>
            </div>
            <div className="sd-stat">
              <span className="sd-stat-num">{preview.columnas_archivo.length}</span>
              <span className="sd-stat-label">columnas</span>
            </div>
            <div className="sd-stat sd-stat--warn">
              <span className="sd-stat-num">{warningsCount}</span>
              <span className="sd-stat-label">warnings en preview</span>
            </div>
            <div className="sd-stat sd-stat--dirty">
              <span className="sd-stat-num">{Object.keys(editedCells).length}</span>
              <span className="sd-stat-label">filas editadas</span>
            </div>
          </div>

          {/* Acciones de limpieza + guardar */}
          <div className="sd-toolbar">
            <button
              type="button"
              className="sd-btn"
              onClick={() => aplicarLimpieza('espacios')}
              disabled={loading}
              title="Elimina espacios duplicados y espacios al inicio/fin"
            >
              🧹 Limpiar espacios
            </button>
            <button
              type="button"
              className="sd-btn"
              onClick={() => aplicarLimpieza('calles')}
              disabled={loading}
              title="Normaliza abreviaturas: Av. → Avenida, Gpe → Guadalupe…"
            >
              🛣️ Normalizar calles
            </button>

            {dirtyGuardado && (
              <button
                type="button"
                className="sd-btn sd-btn--primary"
                onClick={handleGuardar}
              >
                💾 Guardar cambios
              </button>
            )}

            {!dirtyGuardado && Object.keys(editedCells).length > 0 && (
              <span className="sd-saved-badge">✓ Cambios guardados (en memoria)</span>
            )}
          </div>

          {/* Tabla editable (solo primeras 10 filas del preview) */}
          <div className="sd-table-wrap">
            <table className="sd-table">
              <thead>
                <tr>
                  <th className="sd-th sd-th--fila">#</th>
                  {preview.columnas_archivo.map((col) => (
                    <th key={col} className="sd-th">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.preview_filas.map((fila, filaIdx) => (
                  <tr key={filaIdx}>
                    <td className="sd-td sd-td--fila">{filaIdx + 2}</td>
                    {preview.columnas_archivo.map((col) => {
                      const raw = editedCells[filaIdx]?.[col] !== undefined
                        ? editedCells[filaIdx][col]
                        : fila[col];
                      return (
                        <CellEditable
                          key={col}
                          filaIdx={filaIdx}
                          col={col}
                          rawVal={raw}
                          proyectoSlug={proyectoSlug}
                          editedCells={editedCells}
                          editingCell={editingCell}
                          onChange={handleCellChange}
                          onDblClick={handleCellDblClick}
                          onBlur={handleCellBlur}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="sd-preview-hint">
            Mostrando las primeras 10 filas de {preview.total_filas.toLocaleString()}.
            Doble clic en una celda para editarla.
          </p>
        </>
      )}

      {/* Footer */}
      <div className="sd-footer">
        <button
          type="button"
          className="sd-btn sd-btn--ghost"
          onClick={onCancelar}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="sd-btn sd-btn--primary"
          onClick={handleSiguiente}
          disabled={!puedeSiguiente || loading}
        >
          Continuar al mapeo →
        </button>
      </div>
    </div>
  );
}
