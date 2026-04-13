// frontend/src/pages/analisis/CargarPadron.jsx
import { useState, useEffect } from 'react';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Analisis.css';

export default function CargarPadron() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');
  const [preview, setPreview]   = useState(null);   // {headers, rows}
  const [versiones, setVersiones] = useState([]);
  const [loadingVer, setLoadingVer] = useState(false);

  // Cargar versiones cuando cambia el proyecto
  useEffect(() => {
    if (!proyectoSlug) { setVersiones([]); return; }
    setLoadingVer(true);
    api.get(`/analisis/${proyectoSlug}/versiones`)
      .then(r => setVersiones(r.data))
      .catch(() => setVersiones([]))
      .finally(() => setLoadingVer(false));
  }, [proyectoSlug]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setError('');
    setResult(null);
    setPreview(null);

    // Preview: solo para CSV podemos leerlo en el cliente sin la librería xlsx
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const lines = ev.target.result.split('\n').filter(l => l.trim());
          // Detectar separador: coma, punto y coma o tabulación
          const first = lines[0];
          const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
          const headers = first.split(sep).map(h => h.replace(/^"|"$/g, '').trim());
          const rows = lines.slice(1, 6).map(l =>
            l.split(sep).map(c => c.replace(/^"|"$/g, '').trim())
          );
          setPreview({ headers: headers, rows, total_cols: headers.length });
        } catch {
          // ignore preview error
        }
      };
      reader.readAsText(f, 'utf-8');
    } else {
      // Para Excel mostramos solo el nombre — el preview real vendrá del servidor
      setPreview({ excel: true, name: f.name });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) {
      const fakeEvent = { target: { files: [f] } };
      handleFileChange(fakeEvent);
    }
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
      // Recargar versiones
      const ver = await api.get(`/analisis/${proyectoSlug}/versiones`);
      setVersiones(ver.data);
      // Mostrar preview del servidor si no la tenemos
      if (!preview?.headers && res.data.preview?.length) {
        const serverHeaders = Object.keys(res.data.preview[0]);
        const serverRows = res.data.preview.map(r => serverHeaders.map(h => r[h] ?? ''));
        setPreview({ headers: serverHeaders, rows: serverRows, total_cols: serverHeaders.length });
      }
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

      <ProyectoSelector
        proyectos={proyectos}
        value={proyectoSlug}
        onChange={setProyectoSlug}
      />

      {proyectoSlug && (
        <div className="analisis-content">
          <div className="cp-grid">
            {/* Panel izquierdo: formulario de carga */}
            <div className="cargar-card">
              <form onSubmit={handleSubmit}>
                {/* Zona de drop */}
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

                {/* Vista previa columnas detectadas - con scroll controlado */}
                {preview && !preview.excel && preview.headers && (
                  <div className="preview-section">
                    <div className="preview-header">
                      <span className="preview-title">Vista previa</span>
                      <span className="preview-badge">{preview.total_cols} columnas detectadas</span>
                    </div>
                    <div className="table-container-preview">
                      <table className="data-table">
                        <thead>
                          <tr>
                            {preview.headers.map((h, i) => <th key={i}>{h}</th>)}
                          </tr>
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

                {preview?.excel && (
                  <div className="preview-section preview-section--excel">
                    📊 Archivo Excel seleccionado: <strong>{preview.name}</strong>
                    <br />
                    <small style={{ color: 'var(--clr-muted)' }}>La vista previa se mostrará tras importar.</small>
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

              {/* Resultado de la importación */}
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

            {/* Panel derecho: historial de versiones */}
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

      {/* Estilos adicionales inline solo para ajustes específicos */}
      <style>{`
        .table-container-preview {
          max-height: 280px;
          overflow: auto;
        }
        .table-container-preview table {
          min-width: 500px;
        }
        .table-container-preview th,
        .table-container-preview td {
          white-space: nowrap;
          padding: 6px 10px;
        }
        .cargar-card {
          overflow-y: auto;
          max-height: calc(100vh - 200px);
        }
        .analisis-content {
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }
      `}</style>
    </div>
  );
}
