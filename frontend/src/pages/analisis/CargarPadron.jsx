// frontend/src/pages/analisis/CargarPadron.jsx
// FIX: preview de Excel en cliente usando SheetJS (xlsx ya disponible como dep)
import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Analisis.css';

export default function CargarPadron() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const [file, setFile]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');
  const [preview, setPreview]     = useState(null);   // {headers, rows, total_cols}
  const [versiones, setVersiones] = useState([]);
  const [loadingVer, setLoadingVer] = useState(false);

  useEffect(() => {
    if (!proyectoSlug) { setVersiones([]); return; }
    setLoadingVer(true);
    api.get(`/analisis/${proyectoSlug}/versiones`)
      .then(r => setVersiones(r.data))
      .catch(() => setVersiones([]))
      .finally(() => setLoadingVer(false));
  }, [proyectoSlug]);

  // ── Leer preview en cliente (CSV y Excel) ──────────────────────────────
  const convertExcelDate = (value) => {
  // Si no es número, devolver el valor original
  if (typeof value !== 'number') return value;
  
  // Los números de fecha en Excel están entre ~30000 y ~50000
  // (Ej: 45987 = 2025-11-15 aproximadamente)
  if (value < 1 || value > 100000) return value;
  
  // Excel cuenta días desde 1900-01-01 (con bug de 1900 como año bisiesto)
  // Para fechas desde 1900-03-01 en adelante
  const excelEpoch = new Date(1900, 0, 1);
  const millisecondsPerDay = 86400000;
  
  // Ajuste por el bug de Excel (considera 1900 como bisiesto)
  const daysOffset = value > 59 ? value - 1 : value;
  
  const date = new Date(excelEpoch.getTime() + (daysOffset - 1) * millisecondsPerDay);
  
  // Formatear como YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

// También puedes crear una versión más completa que intente detectar si es fecha
const tryConvertToDate = (value) => {
  // Si ya es string, intentar parsear
  if (typeof value === 'string') {
    // Si parece fecha ISO o formato común
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) {
      const [d, m, y] = value.split('/');
      return `${y}-${m}-${d}`;
    }
    return value;
  }
  
  // Si es número, intentar convertir como fecha Excel
  if (typeof value === 'number') {
    // Rango típico de fechas Excel (1900-2100)
    if (value > 30000 && value < 100000) {
      return convertExcelDate(value);
    }
    // Si es número pero no parece fecha, devolver como está
    return value;
  }
  
  return value;
};

// Modifica la función readPreview existente:
const readPreview = (f) => {
  const ext = f.name.split('.').pop().toLowerCase();

  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        const first = lines[0];
        const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
        const headers = first.split(sep).map(h => h.replace(/^"|"$/g, '').trim());
        const rows = lines.slice(1, 6).map(l =>
          l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())
        );
        setPreview({ headers, rows, total_cols: headers.length });
      } catch { /* ignore */ }
    };
    reader.readAsText(f, 'utf-8');

  } else {
    // Excel: usar SheetJS en el cliente para preview inmediato
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { 
          type: 'array', 
          sheetRows: 6,
          // Opcional: Configurar opciones para mejor detección de fechas
          cellDates: true,  // Intenta convertir fechas automáticamente
          dateNF: 'yyyy-mm-dd' // Formato de fecha deseado
        });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Obtener array de arrays: primera fila = headers, resto = datos
        const aoa = XLSX.utils.sheet_to_json(sheet, { 
          header: 1, 
          defval: '',
          raw: false  // IMPORTANTE: Obtener valores formateados en lugar de crudos
        });
        
        if (aoa.length === 0) return;
        
        const headers = aoa[0].map(h => String(h ?? '').trim());
        
        // Procesar las filas convirtiendo fechas
        const rows = aoa.slice(1, 6).map(row =>
          headers.map((_, i) => {
            let cellValue = row[i] ?? '';
            // Si es un objeto Date (cuando cellDates=true)
            if (cellValue instanceof Date) {
              return cellValue.toISOString().split('T')[0];
            }
            // Convertir a string y limpiar
            const strValue = String(cellValue).trim();
            // Intentar convertir números de fecha Excel
            const numValue = parseFloat(strValue);
            if (!isNaN(numValue) && strValue === String(numValue) && numValue > 30000 && numValue < 100000) {
              return convertExcelDate(numValue);
            }
            return strValue;
          })
        );
        
        setPreview({ headers, rows, total_cols: headers.length });
      } catch (err) {
        console.error('Error al leer Excel:', err);
        // Si falla SheetJS, mostrar al menos el nombre
        setPreview({ excel: true, name: f.name });
      }
    };
    reader.readAsArrayBuffer(f);
  }
};

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);
    setPreview(null);
    readPreview(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFileChange({ target: { files: [f] } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file)         { setError('Selecciona un archivo.'); return; }
    if (!proyectoSlug) { setError('Selecciona un proyecto.'); return; }

    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/analisis/${proyectoSlug}/cargar-padron`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      const ver = await api.get(`/analisis/${proyectoSlug}/versiones`);
      setVersiones(ver.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cargar el archivo.');
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className="analisis-container">
      <div className="analisis-header">
        <h1>Cargar Padrón</h1>
      </div>

      <ProyectoSelector proyectos={proyectos} value={proyectoSlug} onChange={setProyectoSlug} />

      {proyectoSlug && (
        <div className="analisis-content">
          <div className="cp-grid">
            {/* Panel izquierdo */}
            <div className="cargar-card">
              <form onSubmit={handleSubmit}>
                <div
                  className={`drop-zone ${file ? 'drop-zone--has-file' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => document.getElementById('file-input').click()}
                >
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    id="file-input"
                    style={{ display: 'none' }}
                  />
                  {file ? (
                    <>
                      <div className="drop-zone__icon drop-zone__icon--ok">✓</div>
                      <p className="drop-zone__filename">{file.name}</p>
                      <p className="drop-zone__hint">Haz clic para cambiar el archivo</p>
                    </>
                  ) : (
                    <>
                      <div className="drop-zone__icon">📂</div>
                      <p className="drop-zone__text">Arrastra aquí o haz clic para seleccionar</p>
                      <p className="drop-zone__hint">CSV, Excel (.xlsx, .xls)</p>
                    </>
                  )}
                </div>

                {/* Preview unificado CSV y Excel */}
                {preview && !preview.excel && preview.headers && (
                  <div className="preview-section">
                    <div className="preview-header">
                      <span className="preview-title">Vista previa</span>
                      <span className="preview-badge">{preview.total_cols} columnas detectadas</span>
                    </div>
                    <div className="table-container-preview">
                      <table className="data-table">
                        <thead>
                          <tr>{preview.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((row, i) => (
                            <tr key={i}>
                              {row.map((cell, j) => <td key={j}>{cell}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Fallback si SheetJS falló */}
                {preview?.excel && (
                  <div className="preview-section preview-section--excel">
                    📊 Archivo Excel seleccionado: <strong>{preview.name}</strong>
                    <br />
                    <small style={{ color: 'var(--clr-muted)' }}>No se pudo generar preview. Se importará correctamente.</small>
                  </div>
                )}

                {error && <div className="cp-error">{error}</div>}

                <button
                  type="submit"
                  className="btn-primary btn-full"
                  disabled={loading || !file || !proyectoSlug}
                >
                  {loading ? 'Importando…' : 'Importar padrón'}
                </button>
              </form>

              {result && (
                <div className={`cp-result ${result.success ? 'cp-result--ok' : 'cp-result--err'}`}>
                  <p className="cp-result__title">{result.message}</p>
                  {result.success && (
                    <div className="cp-result__body">
                      <div className="cp-stats">
                        <div className="cp-stat">
                          <span className="cp-stat__num">{result.total_registros}</span>
                          <span className="cp-stat__label">Registros procesados</span>
                        </div>
                        <div className="cp-stat">
                          <span className="cp-stat__num">{result.columnas_bd?.length || 0}</span>
                          <span className="cp-stat__label">Columnas mapeadas</span>
                        </div>
                        <div className="cp-stat">
                          <span className="cp-stat__num">{result.columnas_csv?.length || 0}</span>
                          <span className="cp-stat__label">Columnas en archivo</span>
                        </div>
                      </div>
                      {result.columnas_bd?.length > 0 && (
                        <details className="cp-details">
                          <summary>Columnas mapeadas ({result.columnas_bd.length})</summary>
                          <div className="cp-tags">
                            {result.columnas_bd.map(c => <span key={c} className="cp-tag">{c}</span>)}
                          </div>
                        </details>
                      )}
                      {result.errores?.length > 0 && (
                        <details className="cp-details cp-details--warn">
                          <summary>⚠️ {result.errores.length} advertencias</summary>
                          <ul className="cp-errores">
                            {result.errores.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Panel derecho: versiones */}
            <div className="versiones-panel">
              <h3 className="versiones-title">Historial de versiones</h3>
              {loadingVer ? (
                <p style={{ color: 'var(--clr-muted)', fontSize: 13 }}>Cargando…</p>
              ) : versiones.length === 0 ? (
                <p style={{ color: 'var(--clr-muted)', fontSize: 13 }}>
                  Aún no se han cargado padrones para este proyecto.
                </p>
              ) : (
                <div className="versiones-list">
                  {versiones.map((v, i) => (
                    <div key={v.id} className={`version-item ${i === 0 ? 'version-item--latest' : ''}`}>
                      <div className="version-badge">v{v.version}</div>
                      <div className="version-body">
                        <div className="version-file">{v.archivo_nombre || '—'}</div>
                        <div className="version-meta">
                          {v.total_registros?.toLocaleString()} registros · {fmtDate(v.created_at)}
                        </div>
                      </div>
                      {i === 0 && <span className="version-latest-badge">Más reciente</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .table-container-preview { max-height: 280px; overflow: auto; }
        .table-container-preview table { min-width: 500px; }
        .table-container-preview th,
        .table-container-preview td { white-space: nowrap; padding: 6px 10px; }
        .cargar-card { overflow-y: auto; max-height: calc(100vh - 200px); }
        .analisis-content { flex: 1; overflow-y: auto; min-height: 0; }
      `}</style>
    </div>
  );
}
