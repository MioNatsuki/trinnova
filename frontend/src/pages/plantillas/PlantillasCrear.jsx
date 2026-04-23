// frontend/src/pages/plantillas/PlantillasCrear.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import { useNavigationGuard } from '../../context/NavigationGuardContext';
import './Plantillas.css';

import {
  DocumentEditorContainerComponent,
  Toolbar,
} from '@syncfusion/ej2-react-documenteditor';
DocumentEditorContainerComponent.Inject(Toolbar);

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
  barcode:{ d:"M6 4h2v16H6zM3 4h1v16H3zM11 4h1v16h-1zM14 4h2v16h-2zM18 4h1v16h-1zM21 4h1v16h-1z" },
};

export default function PlantillasCrear() {
  const { proyectoSlug, proyectos, setProyectoSlug } = useProyecto();
  const { setDirty } = useNavigationGuard();
  const navigate = useNavigate();

  const [modo,          setModo]         = useState(null);       // null | 'upload' | 'editor'
  const [selectedSlug,  setSelectedSlug] = useState(proyectoSlug || '');
  const [nombre,        setNombre]       = useState('');
  const [descripcion,   setDesc]         = useState('');
  const [loading,       setLoading]      = useState(false);
  const [message,       setMessage]      = useState(null);
  const [result,        setResult]       = useState(null);
  const [mapEdits,      setMapEdits]     = useState({});
  const [camposDisp,    setCamposDisp]   = useState([]);

  const [file,          setFile]         = useState(null);
  const fileRef = useRef();
  const editorRef = useRef(null);

  const proyectoActual = proyectos.find(p => p.slug === selectedSlug);

  // Guard: dirty si hay nombre escrito pero sin guardar
  useEffect(() => {
    setDirty(!!nombre && !result, 'Tienes una plantilla sin guardar.');
    return () => setDirty(false);
  }, [nombre, result, setDirty]);

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  // Cargar campos de tabla_temporal via analisis (primera fila del padrón)
  useEffect(() => {
    if (!selectedSlug) return;
    api.get(`/plantillas/${selectedSlug}/campos-temporales-slug`)
      .then(r => setCamposDisp(r.data?.campos || []))
      .catch(() => {
        // fallback: usar analisis
        api.get(`/analisis/${selectedSlug}/analisis`, { params: { limit: 1 } })
          .then(r => {
            if (r.data.rows?.length > 0) {
              setCamposDisp(Object.keys(r.data.rows[0]).filter(c => !c.startsWith('_')));
            }
          })
          .catch(() => setCamposDisp([]));
      });
  }, [selectedSlug]);

  // ── Subir .docx ───────────────────────────────────────────────────────────
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

    try {
      const res = await api.post('/plantillas/subir', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { proyecto_id: proy.id, nombre, descripcion },
      });
      setResult(res.data);
      const edits = {};
      Object.entries(res.data.mapeo_automatico || {}).forEach(([ph, campo]) => {
        edits[`{{${ph}}}`] = campo || '';
      });
      setMapEdits(edits);
      if (res.data.campos_disponibles?.length) setCamposDisp(res.data.campos_disponibles);
      showMsg('success', res.data.mensaje);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al subir.');
    } finally { setLoading(false); }
  };

  const handleGuardarMapeo = async () => {
    if (!result?.id) return;
    const campos = Object.entries(mapEdits)
      .filter(([, v]) => v)
      .map(([placeholder, campo_bd], orden) => ({ placeholder, campo_bd, orden }));
    try {
      await api.post(`/plantillas/${result.id}/mapear`, { campos });
      setDirty(false);
      showMsg('success', `${campos.length} campos mapeados. ¡Plantilla lista!`);
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error guardando mapeo.');
    }
  };

  // ── Editor Syncfusion ─────────────────────────────────────────────────────
  const configureEditorPage = () => {
    const editor = editorRef.current?.documentEditor;
    if (!editor) return;
    // Esperar a que el editor esté listo
    setTimeout(() => {
      try {
        const sectionFormat = editor.selection?.sectionFormat;
        if (!sectionFormat) return;
        // Oficio México: 21.59cm × 34.01cm → puntos (1cm = 28.3465pt)
        sectionFormat.pageWidth  = 612;   // 21.59cm ≈ 612pt
        sectionFormat.pageHeight = 963;   // 34.01cm ≈ 963pt
        sectionFormat.leftMargin   = 56.7;
        sectionFormat.rightMargin  = 56.7;
        sectionFormat.topMargin    = 56.7;
        sectionFormat.bottomMargin = 56.7;
        // Fuente por defecto
        const charFormat = editor.selection?.characterFormat;
        if (charFormat) {
          charFormat.fontFamily = 'Calibri';
          charFormat.fontSize   = 11;
        }
      } catch (e) { /* ignora si el editor aún no inicializó */ }
    }, 500);
  };

  const insertText = (text) => {
    const editor = editorRef.current?.documentEditor;
    if (editor) editor.editor?.insertText(text);
  };

  // Insertar barcode dinámico como placeholder de texto
  const insertBarcode = () => {
    insertText('{{codebar}}');
  };

  const handleGuardarEditor = async () => {
    if (!nombre.trim() || !selectedSlug) {
      showMsg('error', 'Escribe el nombre y selecciona el proyecto.');
      return;
    }
    const proy = proyectos.find(p => p.slug === selectedSlug);
    if (!proy) return;

    // Extraer placeholders del editor
    let placeholders = [];
    try {
      const editor = editorRef.current?.documentEditor;
      if (editor) {
        const sfdt = editor.serialize();
        const text = JSON.stringify(sfdt);
        const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)];
        placeholders = [...new Set(matches.map(m => m[1]))];
      }
    } catch {}

    setLoading(true);
    try {
      const res = await api.post('/plantillas/', {
        id_proyecto: proy.id,
        nombre,
        descripcion,
        origen: 'editor',
      });
      const plantillaId = res.data.id;

      // Guardar mapeo automático de placeholders
      if (placeholders.length > 0) {
        const campos = placeholders
          .filter(ph => camposDisp.includes(ph))
          .map((ph, orden) => ({ placeholder: `{{${ph}}}`, campo_bd: ph, orden }));
        if (campos.length > 0) {
          await api.post(`/plantillas/${plantillaId}/mapear`, { campos });
        }
      }

      setDirty(false);
      showMsg('success', `Plantilla "${nombre}" creada con ${placeholders.length} placeholders.`);
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally { setLoading(false); }
  };

  // ── Pantalla inicial ──────────────────────────────────────────────────────
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
              <div className="pl-modo-icon"><Icon {...ICONS.upload} size={32} /></div>
              <h3>Subir .docx</h3>
              <p>Sube un documento Word existente. El sistema detecta automáticamente los placeholders <code>{'{{campo}}'}</code> y sugiere el mapeo.</p>
              <div className="pl-modo-hint">Recomendado si ya tienes el diseño en Word</div>
            </div>
            <div className="pl-modo-card" onClick={() => setModo('editor')}>
              <div className="pl-modo-icon"><Icon {...ICONS.edit} size={32} /></div>
              <h3>Crear desde cero</h3>
              <p>Editor integrado con tamaño Oficio México (21.59×34.01 cm), fuente Calibri 11, inserción de imágenes y código de barras dinámico.</p>
              <div className="pl-modo-hint">Editor Syncfusion · Word-like</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Modo SUBIR ────────────────────────────────────────────────────────────
  if (modo === 'upload') {
    return (
      <div className="pl-page">
        <div className="pl-header">
          <div>
            <h1 className="pl-title">Subir Plantilla .docx</h1>
            <p className="pl-subtitle">Proyecto: <strong>{proyectoActual?.nombre}</strong></p>
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
                <label className="pl-label">Nombre *</label>
                <input className="pl-input" value={nombre}
                  onChange={e => setNombre(e.target.value)} placeholder="Ej: Requerimiento 2025" />
              </div>
              <div className="pl-field">
                <label className="pl-label">Descripción</label>
                <input className="pl-input" value={descripcion}
                  onChange={e => setDesc(e.target.value)} placeholder="Opcional" />
              </div>
            </div>

            <label className="pl-label">Archivo .docx *</label>
            <div className={`pl-drop-zone ${file ? 'pl-drop-zone--has-file' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDrop={e => { e.preventDefault(); setFile(e.dataTransfer.files[0] || null); }}
              onDragOver={e => e.preventDefault()}>
              <input type="file" accept=".docx" ref={fileRef} style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0] || null)} />
              {file ? (
                <><div className="pl-drop-icon pl-drop-icon--ok">✓</div>
                  <p className="pl-drop-filename">{file.name}</p>
                  <p className="pl-drop-hint">Haz clic para cambiar</p></>
              ) : (
                <><div className="pl-drop-icon">📄</div>
                  <p className="pl-drop-text">Arrastra aquí o haz clic</p>
                  <p className="pl-drop-hint">Solo archivos .docx · Tamaño Oficio México recomendado</p>
                  <p className="pl-drop-hint">Usa <code>{'{{campo}}'}</code> en el documento</p></>
              )}
            </div>

            <div className="pl-upload-info">
              <h4>Campos disponibles ({camposDisp.length}):</h4>
              <div className="pl-campos-preview">
                {camposDisp.slice(0, 40).map(c => (
                  <span key={c} className="pl-campo-chip"><code>{`{{${c}}}`}</code></span>
                ))}
                {camposDisp.length > 40 && <span className="pl-campo-chip pl-campo-chip--more">+{camposDisp.length - 40} más</span>}
              </div>
            </div>

            <button className="pl-btn pl-btn--primary pl-btn--full" onClick={handleUpload}
              disabled={loading || !file || !nombre.trim()}>
              {loading ? 'Procesando…' : '⬆️ Subir y extraer campos'}
            </button>
          </div>
        ) : (
          <div className="pl-mapeo-section">
            <div className="pl-mapeo-success">
              <Icon {...ICONS.check} size={18} />
              <span>{result.mensaje}</span>
            </div>

            <h3 className="pl-mapeo-title">Mapeo de campos</h3>
            <p className="pl-mapeo-desc">
              {result.placeholders?.length || 0} placeholders detectados.
              Asocia cada uno con el campo de <code>tabla_temporal</code>.
            </p>

            {!result.placeholders?.length ? (
              <div className="pl-mapeo-empty">
                No se encontraron placeholders <code>{'{{campo}}'}</code>. Verifica el formato del .docx.
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
              <button className="pl-btn" onClick={() => { setDirty(false); navigate('/plantillas'); }}>
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

  // ── Modo EDITOR (Syncfusion) ──────────────────────────────────────────────
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
          <span>📐 Oficio México · 21.59 × 34.01 cm</span>
          <span>🔤 Calibri 11 por defecto</span>
          <span>💡 Usa <code>{'{{campo}}'}</code> para campos dinámicos</span>
        </div>

        {/* Barra de campos disponibles para insertar */}
        <div className="pl-editor-campos">
          <span className="pl-editor-campos-label">Insertar campo:</span>
          <div className="pl-editor-campos-list">
            <button className="pl-campo-chip pl-campo-chip--btn pl-campo-chip--barcode"
              onClick={insertBarcode} title="Insertar código de barras dinámico">
              📊 {'{{codebar}}'}
            </button>
            {camposDisp.slice(0, 25).map(c => (
              <button key={c} className="pl-campo-chip pl-campo-chip--btn"
                onClick={() => insertText(`{{${c}}}`)}>
                {`{{${c}}}`}
              </button>
            ))}
            {camposDisp.length > 25 && (
              <span className="pl-campo-chip pl-campo-chip--more">+{camposDisp.length - 25} más</span>
            )}
          </div>
        </div>

        {/* Editor Syncfusion */}
        <div className="pl-editor-container">
          <DocumentEditorContainerComponent
            ref={editorRef}
            height="100%"
            width="100%"
            enableToolbar={true}
            showPropertiesPane={true}
            serviceUrl="https://ej2services.syncfusion.com/production/web-services/api/documenteditor/"
            created={configureEditorPage}
            documentEditorSettings={{
              fontFamilies: ['Calibri', 'Arial', 'Times New Roman', 'Courier New', 'Verdana'],
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}