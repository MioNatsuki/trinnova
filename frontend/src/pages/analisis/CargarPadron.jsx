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

              {/* Vista previa columnas detectadas */}
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

                    {/* Columnas mapeadas */}
                    {result.columnas_bd?.length > 0 && (
                      <details className="cp-details">
                        <summary>Columnas mapeadas ({result.columnas_bd.length})</summary>
                        <div className="cp-tags">
                          {result.columnas_bd.map(c => <span key={c} className="cp-tag">{c}</span>)}
                        </div>
                      </details>
                    )}

                    {/* Advertencias */}
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
      )}

      <style>{`
        .cp-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 900px) { .cp-grid { grid-template-columns: 1fr; } }

        .drop-zone {
          border: 2px dashed var(--clr-border);
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all .2s;
          margin-bottom: 20px;
          background: var(--clr-bg);
        }
        .drop-zone:hover, .drop-zone--has-file {
          border-color: var(--clr-accent);
          background: var(--clr-accent-lt);
        }
        .drop-zone__icon { font-size: 32px; margin-bottom: 10px; }
        .drop-zone__icon--ok { color: var(--clr-green); }
        .drop-zone__text  { font-size: 14px; color: var(--clr-text); margin-bottom: 6px; }
        .drop-zone__filename { font-size: 14px; font-weight: 600; color: var(--clr-accent); margin-bottom: 4px; }
        .drop-zone__hint  { font-size: 12px; color: var(--clr-muted); }

        .preview-section {
          background: var(--clr-bg);
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 16px;
          font-size: 12px;
        }
        .preview-section--excel { color: var(--clr-text); line-height: 1.6; }
        .preview-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .preview-title  { font-size: 13px; font-weight: 600; color: var(--clr-text); }
        .preview-badge  {
          font-size: 11px; padding: 2px 8px; border-radius: 20px;
          background: var(--clr-active-bg); color: var(--clr-active-tx); font-weight: 600;
        }

        .cp-error {
          background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px;
          padding: 10px 14px; font-size: 13px; color: var(--clr-red); margin-bottom: 14px;
        }

        .cp-result { border-radius: var(--radius); padding: 20px; margin-top: 20px; }
        .cp-result--ok  { background: #f0fff4; border: 1px solid #9ae6b4; }
        .cp-result--err { background: #fff5f5; border: 1px solid #feb2b2; }
        .cp-result__title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--clr-text); }

        .cp-stats { display: flex; gap: 20px; margin-bottom: 14px; flex-wrap: wrap; }
        .cp-stat  { display: flex; flex-direction: column; gap: 2px; }
        .cp-stat__num   { font-size: 24px; font-weight: 300; color: var(--clr-text); }
        .cp-stat__label { font-size: 11px; color: var(--clr-muted); }

        .cp-details { font-size: 12px; margin-top: 8px; }
        .cp-details summary { cursor: pointer; color: var(--clr-accent); font-weight: 500; padding: 4px 0; }
        .cp-details--warn summary { color: var(--clr-orange); }
        .cp-tags  { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
        .cp-tag   {
          background: var(--clr-active-bg); color: var(--clr-active-tx);
          padding: 2px 8px; border-radius: 4px; font-size: 11px;
        }
        .cp-errores { margin: 8px 0 0 16px; display: flex; flex-direction: column; gap: 3px; }
        .cp-errores li { color: var(--clr-red); }

        /* Versiones */
        .versiones-panel {
          background: var(--clr-white);
          border: 1px solid var(--clr-border);
          border-radius: var(--radius);
          padding: 20px;
        }
        .versiones-title {
          font-size: 14px; font-weight: 600; color: var(--clr-text);
          margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--clr-border);
        }
        .versiones-list { display: flex; flex-direction: column; gap: 10px; }

        /* Contenedor de tabla preview con scroll limitado */
        .table-container-preview {
          max-height: 300px;
          overflow-x: auto;
          overflow-y: auto;
          border: 1px solid var(--clr-border);
          border-radius: 6px;
        }
        .table-container-preview .data-table {
          width: 100%;
          table-layout: auto;
        }

        .version-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: 8px;
          border: 1px solid var(--clr-border); background: var(--clr-bg);
          position: relative;
        }
        .version-item--latest {
          border-color: var(--clr-accent);
          background: var(--clr-accent-lt);
        }
        .version-badge {
          width: 36px; height: 36px; border-radius: 50%;
          background: var(--clr-white); border: 1px solid var(--clr-border);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600; color: var(--clr-accent);
          flex-shrink: 0;
        }
        .version-body { flex: 1; min-width: 0; }
        .version-file { font-size: 12px; font-weight: 500; color: var(--clr-text); truncate; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .version-meta { font-size: 11px; color: var(--clr-muted); margin-top: 2px; }
        .version-latest-badge {
          font-size: 10px; padding: 2px 7px; border-radius: 20px;
          background: var(--clr-accent); color: white; font-weight: 600; flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
