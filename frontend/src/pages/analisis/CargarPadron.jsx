// frontend/src/pages/analisis/CargarPadron.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/auth';
import './Analisis.css';

export default function CargarPadron() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState('');
  const [proyectos, setProyectos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  // Cargar proyectos del usuario
  useEffect(() => {
    if (user?.proyectos && user.proyectos.length > 0) {
      setProyectos(user.proyectos);
      if (user.proyectos.length === 1) {
        setProyectoSeleccionado(user.proyectos[0].slug);
      }
    } else {
      // Si no hay proyectos en el usuario, intentar cargar desde API
      cargarProyectos();
    }
  }, [user]);

  const cargarProyectos = async () => {
    try {
      const response = await api.get('/proyectos/');
      setProyectos(response.data);
    } catch (err) {
      console.error('Error cargando proyectos:', err);
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    setError('');
    setPreview(null);
    
    // Vista previa del archivo
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    try {
      // Leer primeras filas para preview
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        const lines = content.split('\n').slice(0, 6);
        const headers = lines[0].split(',');
        const rows = lines.slice(1).map(line => line.split(','));
        
        setPreview({
          headers: headers.slice(0, 8),
          rows: rows.slice(0, 5).map(row => row.slice(0, 8))
        });
      };
      reader.readAsText(selectedFile);
    } catch (err) {
      console.error('Error leyendo preview:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Selecciona un archivo');
      return;
    }
    
    if (!proyectoSeleccionado && proyectos.length === 0) {
      setError('No tienes proyectos asignados. Contacta al administrador.');
      return;
    }
    
    if (!proyectoSeleccionado && proyectos.length > 0) {
      setError('Selecciona un proyecto');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post(`/analisis/${proyectoSeleccionado}/cargar-padron`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al cargar el archivo');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <div className="analisis-loading">Cargando usuario...</div>;
  }

  return (
    <div className="analisis-container">
      <h1>Cargar Padrón</h1>
      
      {/* Selector de proyecto */}
      {proyectos.length > 0 && (
        <div className="proyecto-selector">
          <label>Proyecto:</label>
          <select 
            value={proyectoSeleccionado} 
            onChange={(e) => setProyectoSeleccionado(e.target.value)}
            required
          >
            <option value="">Selecciona un proyecto</option>
            {proyectos.map(proy => (
              <option key={proy.id || proy.slug} value={proy.slug}>
                {proy.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {proyectos.length === 0 && (
        <div className="error-message">
          ⚠️ No tienes proyectos asignados. Contacta al administrador.
        </div>
      )}

      <div className="cargar-card">
        <form onSubmit={handleSubmit}>
          <div className="file-zone">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              id="file-input"
              style={{ display: 'none' }}
            />
            <label htmlFor="file-input" className="file-label">
              📁 {file ? file.name : 'Seleccionar archivo CSV o Excel'}
            </label>
            <p className="file-hint">Formatos soportados: CSV, Excel (.xlsx, .xls)</p>
          </div>
          
          {/* Preview del archivo */}
          {preview && (
            <div className="preview-table">
              <h4>Vista previa (primeras 5 filas)</h4>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      {preview.headers.map((header, i) => (
                        <th key={i}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading || !file || !proyectoSeleccionado}
            className="btn-submit"
          >
            {loading ? 'Cargando...' : 'Subir padrón'}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}

        {result && (
          <div className={`result-message ${result.success ? 'success' : 'error'}`}>
            <h3>{result.message}</h3>
            {result.success && (
              <>
                <p>✅ Registros importados: <strong>{result.total_registros}</strong></p>
                <p>📊 Columnas detectadas: {result.columnas?.length || 0}</p>
                {result.columnas && result.columnas.length > 0 && (
                  <details>
                    <summary>Ver columnas</summary>
                    <ul>
                      {result.columnas.slice(0, 20).map(col => (
                        <li key={col}>{col}</li>
                      ))}
                      {result.columnas.length > 20 && <li>... y {result.columnas.length - 20} más</li>}
                    </ul>
                  </details>
                )}
                {result.errores && result.errores.length > 0 && (
                  <div className="warnings">
                    <p>⚠️ Advertencias: {result.errores.length}</p>
                    <ul>
                      {result.errores.slice(0, 5).map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .proyecto-selector {
          background: var(--clr-white);
          border-radius: var(--radius);
          padding: 16px 20px;
          margin-bottom: 20px;
          border: 1px solid var(--clr-border);
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .proyecto-selector label {
          font-weight: 600;
          color: var(--clr-text);
        }
        .proyecto-selector select {
          padding: 8px 16px;
          border: 1px solid var(--clr-border);
          border-radius: 8px;
          font-size: 14px;
          min-width: 250px;
        }
        .preview-table {
          margin: 20px 0;
        }
        .preview-table h4 {
          margin-bottom: 12px;
          font-size: 14px;
        }
        .table-wrapper {
          overflow-x: auto;
          max-height: 300px;
        }
        .preview-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .preview-table th,
        .preview-table td {
          border: 1px solid var(--clr-border);
          padding: 8px;
          text-align: left;
        }
        .preview-table th {
          background: #f8f9fa;
          font-weight: 600;
        }
        .file-hint {
          font-size: 12px;
          color: var(--clr-muted);
          margin-top: 8px;
        }
        .btn-submit {
          background: var(--clr-accent);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          margin-top: 16px;
        }
        .btn-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .warnings {
          margin-top: 16px;
          padding: 12px;
          background: #fff3cd;
          border-radius: 8px;
          color: #856404;
        }
        details {
          margin-top: 12px;
        }
        details summary {
          cursor: pointer;
          color: var(--clr-accent);
        }
        details ul {
          margin-top: 8px;
          margin-left: 20px;
          max-height: 150px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
}