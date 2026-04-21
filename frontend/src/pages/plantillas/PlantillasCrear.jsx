// frontend/src/pages/plantillas/PlantillasCrear.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import './Plantillas.css';

import { registerLicense } from '@syncfusion/ej2-base';
registerLicense('Ngo9BigBOggjHTQxAR8/V1JHaF5cWWdCf1FpRmJGdld5fUVHYVZUTXxaS00DNHVRdkdlWXtccXVURGdfU0ZxXERWYEo=');

let DocumentEditorContainerComponent = null;
let Toolbar = null;
try {
  // Intenta importar si está instalado
  const mod = require('@syncfusion/ej2-react-documenteditor');
  DocumentEditorContainerComponent = mod.DocumentEditorContainerComponent;
  Toolbar = mod.Toolbar;
  DocumentEditorContainerComponent.Inject?.(Toolbar);
} catch {
  // Si no está instalado, usaremos el placeholder
}

const Icon = ({ d, d2, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  upload: { d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2:"M17 8l-5-5-5 5M12 3v12" },
  edit:   { d:"M12 20h9", d2:"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" },
  back:   { d:"M19 12H5M12 19l-7-7 7-7" },
  check:  { d:"M20 6L9 17l-5-5" },
};

// Tamaño Oficio México en px a 96dpi: 21.59cm × 34.01cm
const OFICIO_W_PX = Math.round((21.59 / 2.54) * 96);  // ≈ 816px
const OFICIO_H_PX = Math.round((34.01 / 2.54) * 96);  // ≈ 1284px

export default function PlantillasCrear() {
  const { proyectoSlug, proyectos, setProyectoSlug } = useProyecto();
  const navigate = useNavigate();

  const [modo, setModo]           = useState(null);        // null | 'upload' | 'editor'
  const [selectedSlug, setSelectedSlug] = useState(proyectoSlug || '');
  const [nombre, setNombre]       = useState('');
  const [descripcion, setDesc]    = useState('');
  const [loading, setLoading]     = useState(false);
  const [message, setMessage]     = useState(null);
  const [result, setResult]       = useState(null);        // resultado de subir plantilla
  const [mapEdits, setMapEdits]   = useState({});          // placeholder → campo seleccionado
  const [camposDisp, setCamposDisp] = useState([]);

  // Subir docx
  const [file, setFile]           = useState(null);
  const fileRef = useRef();

  const proyectoActual = proyectos.find(p => p.slug === selectedSlug);

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Cargar campos disponibles cuando se elige un proyecto
  useEffect(() => {
    if (!selectedSlug) return;
    api.get('/plantillas/').then(() => {}).catch(() => {});
    // Obtenemos los campos de tabla_temporal via endpoint genérico de análisis
    api.get(`/analisis/${selectedSlug}/analisis`, { params: { limit: 1 } })
      .then(r => {
        if (r.data.rows?.length > 0) {
          const cols = Object.keys(r.data.rows[0]).filter(c => !c.startsWith('_'));
          setCamposDisp(cols);
        }
      })
      .catch(() => setCamposDisp([]));
  }, [selectedSlug]);

  // ─── Subir .docx ──────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !nombre.trim() || !selectedSlug) {
      showMsg('error', 'Selecciona proyecto, escribe el nombre y adjunta el archivo.');
      return;
    }
    const proy = proyectos.find(p => p.slug === selectedSlug);
    if (!proy) { showMsg('error', 'Proyecto no encontrado.'); return; }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('proyecto_id', proy.id);
    formData.append('nombre', nombre);
    if (descripcion) formData.append('descripcion', descripcion);

    try {
      const res = await api.post('/plantillas/subir', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { proyecto_id: proy.id, nombre, descripcion },
      });
      setResult(res.data);
      // Pre-llenar mapeo automático
      const edits = {};
      Object.entries(res.data.mapeo_automatico || {}).forEach(([ph, campo]) => {
        edits[`{{${ph}}}`] = campo || '';
      });
      setMapEdits(edits);
      setCamposDisp(res.data.campos_disponibles || []);
      showMsg('success', res.data.mensaje);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al subir la plantilla.');
    } finally { setLoading(false); }
  };

  const handleGuardarMapeo = async () => {
    if (!result?.id) return;
    const campos = Object.entries(mapEdits)
      .filter(([, v]) => v)
      .map(([placeholder, campo_bd], orden) => ({ placeholder, campo_bd, orden }));
    try {
      await api.post(`/plantillas/${result.id}/mapear`, { campos });
      showMsg('success', `${campos.length} campos mapeados. ¡Plantilla lista!`);
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error guardando mapeo.');
    }
  };

  // ─── Editor Syncfusion ────────────────────────────────────────────────────
  const editorRef = useRef(null);

  const handleGuardarEditor = async () => {
    if (!nombre.trim() || !selectedSlug) {
      showMsg('error', 'Escribe el nombre y selecciona el proyecto.');
      return;
    }
    const proy = proyectos.find(p => p.slug === selectedSlug);
    if (!proy) return;

    setLoading(true);
    try {
      // 1. Crear plantilla
      const res = await api.post('/plantillas/', {
        id_proyecto: proy.id,
        nombre,
        descripcion,
        origen: 'editor',
      });
      showMsg('success', 'Plantilla creada. Puedes mapear los campos desde el Dashboard.');
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally { setLoading(false); }
  };

  // ─── Pantalla de selección inicial ────────────────────────────────────────
  if (!modo) {
    return (
      <div className="pl-page">
        <div className="pl-header">
          <div>
            <h1 className="pl-title">Nueva Plantilla</h1>
            <p className="pl-subtitle">Elige cómo quieres crear tu plantilla</p>
          </div>
          <button className="pl-btn" onClick={() => navigate('/plantillas')}>
            <Icon {...ICONS.back} size={14} /> Volver
          </button>
        </div>

        {message && <div className={`pl-message pl-message--${message.type}`}>{message.text}</div>}

        {/* Selector de proyecto */}
        <div className="pl-project-select-wrap">
          <label className="pl-label">Proyecto *</label>
          <select className="pl-select pl-select--lg" value={selectedSlug}
            onChange={e => { setSelectedSlug(e.target.value); setProyectoSlug(e.target.value); }}>
            <option value="">— Selecciona un proyecto —</option>
            {proyectos.map(p => <option key={p.id} value={p.slug}>{p.nombre}</option>)}
          </select>
        </div>

        {selectedSlug && (
          <div className="pl-modo-cards">
            <div className="pl-modo-card" onClick={() => setModo('upload')}>
              <div className="pl-modo-icon">
                <Icon {...ICONS.upload} size={32} />
              </div>
              <h3>Subir .docx</h3>
              <p>Sube un documento Word con placeholders <code>{'{{campo}}'}</code>. El sistema detecta automáticamente los campos y sugiere el mapeo.</p>
              <div className="pl-modo-hint">Recomendado si ya tienes el diseño listo</div>
            </div>

            <div className="pl-modo-card" onClick={() => setModo('editor')}>
              <div className="pl-modo-icon">
                <Icon {...ICONS.edit} size={32} />
              </div>
              <h3>Crear desde cero</h3>
              <p>Editor de texto con tamaño Oficio México (21.59×34.01 cm). Tipografía Calibri 11 por defecto. Inserta imágenes y campos dinámicos.</p>
              <div className="pl-modo-hint">Editor Syncfusion · combinar correspondencia</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Modo SUBIR ───────────────────────────────────────────────────────────
  if (modo === 'upload') {
    return (
      <div className="pl-page">
        <div className="pl-header">
          <div>
            <h1 className="pl-title">Subir Plantilla .docx</h1>
            <p className="pl-subtitle">
              Proyecto: <strong>{proyectos.find(p => p.slug === selectedSlug)?.nombre}</strong>
            </p>
          </div>
          <button className="pl-btn" onClick={() => { setModo(null); setResult(null); setFile(null); }}>
            <Icon {...ICONS.back} size={14} /> Volver
          </button>
        </div>

        {message && <div className={`pl-message pl-message--${message.type}`}>{message.text}</div>}

        {!result ? (
          <div className="pl-upload-form">
            <div className="pl-form-row">
              <div className="pl-field">
                <label className="pl-label">Nombre de la plantilla *</label>
                <input className="pl-input" value={nombre} onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Requerimiento de pago 2025" />
              </div>
              <div className="pl-field">
                <label className="pl-label">Descripción</label>
                <input className="pl-input" value={descripcion} onChange={e => setDesc(e.target.value)}
                  placeholder="Descripción opcional" />
              </div>
            </div>

            <label className="pl-label">Archivo .docx *</label>
            <div
              className={`pl-drop-zone ${file ? 'pl-drop-zone--has-file' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
              onDragOver={e => e.preventDefault()}
            >
              <input type="file" accept=".docx" ref={fileRef} style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0] || null)} />
              {file ? (
                <>
                  <div className="pl-drop-icon pl-drop-icon--ok">✓</div>
                  <p className="pl-drop-filename">{file.name}</p>
                  <p className="pl-drop-hint">Haz clic para cambiar el archivo</p>
                </>
              ) : (
                <>
                  <div className="pl-drop-icon">📄</div>
                  <p className="pl-drop-text">Arrastra aquí o haz clic para seleccionar</p>
                  <p className="pl-drop-hint">Solo archivos .docx · Tamaño Oficio México recomendado</p>
                  <p className="pl-drop-hint">Usa <code>{'{{campo}}'}</code> en tu documento para campos dinámicos</p>
                </>
              )}
            </div>

            <div className="pl-upload-info">
              <h4>Campos disponibles en este proyecto:</h4>
              <div className="pl-campos-preview">
                {camposDisp.slice(0, 30).map(c => (
                  <span key={c} className="pl-campo-chip"><code>{`{{${c}}}`}</code></span>
                ))}
                {camposDisp.length > 30 && <span className="pl-campo-chip pl-campo-chip--more">+{camposDisp.length - 30} más</span>}
              </div>
            </div>

            <button className="pl-btn pl-btn--primary pl-btn--full" onClick={handleUpload}
              disabled={loading || !file || !nombre.trim()}>
              {loading ? 'Procesando…' : '⬆️ Subir y extraer campos'}
            </button>
          </div>
        ) : (
          /* Resultado + mapeo */
          <div className="pl-mapeo-section">
            <div className="pl-mapeo-success">
              <Icon {...ICONS.check} size={20} />
              <span>{result.mensaje}</span>
            </div>

            <h3 className="pl-mapeo-title">Mapeo de campos</h3>
            <p className="pl-mapeo-desc">
              Se detectaron <strong>{result.placeholders?.length || 0}</strong> placeholders.
              Asocia cada uno con el campo correspondiente en <code>tabla_temporal</code>.
            </p>

            {result.placeholders?.length === 0 ? (
              <div className="pl-mapeo-empty">
                No se encontraron placeholders <code>{'{{campo}}'}</code> en el documento.
                Verifica que el archivo use ese formato.
              </div>
            ) : (
              <div className="pl-map-grid">
                <div className="pl-map-grid-header">
                  <span>Placeholder en .docx</span>
                  <span>Campo en tabla_temporal</span>
                  <span>Estado</span>
                </div>
                {result.placeholders.map(ph => {
                  const key = `{{${ph}}}`;
                  const val = mapEdits[key] || '';
                  const autoMapped = !!result.mapeo_automatico?.[ph];
                  return (
                    <div key={ph} className="pl-map-row">
                      <span className="pl-map-ph">{key}</span>
                      <select className="pl-select pl-map-select" value={val}
                        onChange={e => setMapEdits(prev => ({ ...prev, [key]: e.target.value }))}>
                        <option value="">— Sin mapear —</option>
                        {camposDisp.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className={`pl-map-status ${val ? (autoMapped ? 'auto' : 'manual') : 'empty'}`}>
                        {val ? (autoMapped ? '🤖 Auto' : '✏️ Manual') : '⚠️ Sin mapear'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pl-mapeo-actions">
              <button className="pl-btn" onClick={() => navigate('/plantillas')}>
                Omitir mapeo
              </button>
              <button className="pl-btn pl-btn--primary" onClick={handleGuardarMapeo}>
                Guardar mapeo y finalizar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Modo EDITOR (Syncfusion) ─────────────────────────────────────────────
  if (modo === 'editor') {
    return (
      <div className="pl-page pl-page--editor">
        <div className="pl-editor-header">
          <div className="pl-editor-meta">
            <input className="pl-input pl-input--inline" value={nombre}
              onChange={e => setNombre(e.target.value)} placeholder="Nombre de la plantilla *" />
            <input className="pl-input pl-input--inline" value={descripcion}
              onChange={e => setDesc(e.target.value)} placeholder="Descripción (opcional)" />
          </div>
          <div className="pl-editor-actions">
            <button className="pl-btn" onClick={() => setModo(null)}>
              <Icon {...ICONS.back} size={14} /> Volver
            </button>
            <button className="pl-btn pl-btn--primary" onClick={handleGuardarEditor} disabled={loading}>
              {loading ? 'Guardando…' : '💾 Guardar plantilla'}
            </button>
          </div>
        </div>

        {message && <div className={`pl-message pl-message--${message.type}`}>{message.text}</div>}

        <div className="pl-editor-info">
          <span>📐 Tamaño: Oficio México (21.59 × 34.01 cm)</span>
          <span>🔤 Fuente por defecto: Calibri 11</span>
          <span>💡 Usa <code>{'{{campo}}'}</code> para insertar campos dinámicos</span>
        </div>

        {/* Campos disponibles para arrastrar/insertar */}
        <div className="pl-editor-campos">
          <span className="pl-editor-campos-label">Campos disponibles:</span>
          <div className="pl-editor-campos-list">
            {camposDisp.slice(0, 20).map(c => (
              <button
                key={c}
                className="pl-campo-chip pl-campo-chip--btn"
                title={`Insertar {{${c}}}`}
                onClick={() => {
                  if (editorRef.current?.documentEditor) {
                    editorRef.current.documentEditor.editor.insertText(`{{${c}}}`);
                  }
                }}
              >
                {`{{${c}}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Editor Syncfusion o fallback */}
        <div className="pl-editor-container">
          {DocumentEditorContainerComponent ? (
            <DocumentEditorContainerComponent
              ref={editorRef}
              height="100%"
              width="100%"
              enableToolbar={true}
              serviceUrl="https://ej2services.syncfusion.com/production/web-services/api/documenteditor/"
              documentEditorSettings={{
                fontFamilies: ['Calibri', 'Arial', 'Times New Roman', 'Courier New'],
              }}
              created={() => {
                const editor = editorRef.current?.documentEditor;
                if (!editor) return;
                // Configurar página en Oficio México
                editor.selection.selectAll();
                const sectionFormat = editor.selection.sectionFormat;
                sectionFormat.pageWidth = 612;  // puntos: 21.59cm ≈ 612pt
                sectionFormat.pageHeight = 963; // puntos: 34.01cm ≈ 963pt
                sectionFormat.leftMargin  = 56.7;
                sectionFormat.rightMargin = 56.7;
                sectionFormat.topMargin   = 56.7;
                sectionFormat.bottomMargin = 56.7;
                // Fuente por defecto Calibri 11
                const charFormat = editor.selection.characterFormat;
                charFormat.fontFamily = 'Calibri';
                charFormat.fontSize   = 11;
              }}
            />
          ) : (
            // ── Fallback si Syncfusion no está instalado ──────────────────
            <div className="pl-editor-fallback">
              <div className="pl-editor-fallback-inner">
                <h3>Editor Syncfusion no instalado</h3>
                <p>Para usar el editor integrado instala el paquete:</p>
                <pre>npm install @syncfusion/ej2-react-documenteditor</pre>
                <p>Y registra tu clave de licencia en <code>main.jsx</code>:</p>
                <pre>{`import { registerLicense } from '@syncfusion/ej2-base';
registerLicense('TU_CLAVE_SYNCFUSION');`}</pre>
                <p style={{ marginTop: 16 }}>
                  Mientras tanto, puedes usar el modo <strong>Subir .docx</strong> para crear plantillas
                  con Microsoft Word o LibreOffice respetando el tamaño Oficio México (21.59×34.01 cm).
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <button className="pl-btn pl-btn--primary" onClick={() => setModo('upload')}>
                    Usar modo Subir .docx
                  </button>
                  <button className="pl-btn" onClick={() => setModo(null)}>Volver</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}