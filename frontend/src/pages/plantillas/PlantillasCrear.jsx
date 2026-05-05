// frontend/src/pages/plantillas/PlantillasCrear.jsx
import { L10n, setCulture } from '@syncfusion/ej2-base';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import { useNavigationGuard } from '../../context/NavigationGuardContext';
import './Plantillas.css';

import {
  DocumentEditorContainerComponent,
  Toolbar,
} from '@syncfusion/ej2-react-documenteditor';
DocumentEditorContainerComponent.Inject(Toolbar);

// Traducción ES-MX
L10n.load({
  'es-MX': {
    'documenteditor': {
      'File': 'Archivo', 'Home': 'Inicio', 'Insert': 'Insertar',
      'Layout': 'Diseño', 'References': 'Referencias', 'Review': 'Revisar',
      'View': 'Vista', 'New': 'Nuevo', 'Open': 'Abrir', 'Save': 'Guardar',
      'Print': 'Imprimir', 'Undo': 'Deshacer', 'Redo': 'Rehacer',
      'Cut': 'Cortar', 'Copy': 'Copiar', 'Paste': 'Pegar',
      'Bold': 'Negrita', 'Italic': 'Cursiva', 'Underline': 'Subrayado',
      'Strikethrough': 'Tachado', 'Font': 'Fuente', 'FontSize': 'Tamaño',
      'FontColor': 'Color', 'AlignLeft': 'Izquierda', 'AlignCenter': 'Centro',
      'AlignRight': 'Derecha', 'Justify': 'Justificar', 'Bullets': 'Viñetas',
      'Numbering': 'Numeración', 'Table': 'Tabla', 'Image': 'Imagen',
      'Find': 'Buscar', 'Replace': 'Reemplazar', 'PageSetup': 'Configurar página',
      'Header': 'Encabezado', 'Footer': 'Pie de página', 'Zoom': 'Zoom',
      'Close': 'Cerrar', 'Download': 'Descargar', 'Ok': 'Aceptar', 'Cancel': 'Cancelar',
    }
  }
});
setCulture('es-MX');

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

// Datos de ejemplo para vista previa
const DATOS_EJEMPLO = {
  pensiones: {
    '{{nombre}}': 'JUAN PÉREZ GONZÁLEZ',
    '{{prestamo}}': '12345',
    '{{adeudo}}': '$45,678.90',
    '{{afiliado_calle}}': 'Av. Revolución 123',
    '{{afiliado_colonia}}': 'Centro',
    '{{ultimo_abono}}': '15/enero/2025',
    '{{estatus}}': 'Activo',
  },
  apa_tlajomulco: {
    '{{propietario}}': 'MARÍA GARCÍA LÓPEZ',
    '{{clave_APA}}': 'A-56789',
    '{{saldo}}': '$12,345.67',
    '{{calle}}': 'Calle Hidalgo 456',
  },
  predial_tlajomulco: {
    '{{domicilio}}': 'CALLE INDEPENDENCIA 789, COL. CENTRO',
    '{{cuenta}}': 'PRED-00123',
    '{{saldo}}': '$8,900.00',
  },
  licencias_gdl: {
    '{{propietario}}': 'RESTAURANTE EL SOL S.A. DE C.V.',
    '{{licencia}}': 'LIC-2024-001',
    '{{total}}': '$23,456.00',
    '{{ubicacion}}': 'Av. Juárez 1500',
  },
  predial_gdl: {
    '{{propietariotitular_n}}': 'ANA LAURA HERNÁNDEZ',
    '{{cuenta_n}}': 'GDL-98765',
    '{{saldo2025}}': '$15,200.00',
    '{{calle}}': 'Calle Morelos 234',
  },
  estado: {
    '{{nombre_razon_social}}': 'EMPRESA EJEMPLO S.A.',
    '{{credito}}': 'CRED-2024-056',
    '{{importe_historico_determinado}}': '$156,789.00',
    '{{calle_numero}}': 'Blvd. Principal 500',
  },
};

export default function PlantillasCrear() {
  const { proyectoSlug, proyectos, setProyectoSlug } = useProyecto();
  const { setDirty } = useNavigationGuard();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [modo, setModo] = useState(null);
  const [selectedSlug, setSelectedSlug] = useState(proyectoSlug || '');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [result, setResult] = useState(null);
  const [mapEdits, setMapEdits] = useState({});
  const [camposDisp, setCamposDisp] = useState([]);
  const [file, setFile] = useState(null);
  const [editandoPlantilla, setEditandoPlantilla] = useState(null);
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false);

  const fileRef = useRef();
  const editorRef = useRef(null);

  const proyectoActual = proyectos.find(p => p.slug === selectedSlug);

  const showMsg = useCallback((type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  }, []);

  // NavigationGuard
  useEffect(() => {
    setDirty(!!nombre && !result, 'Tienes una plantilla sin guardar.');
    return () => setDirty(false);
  }, [nombre, result, setDirty]);

  // Cargar campos disponibles
  useEffect(() => {
    if (!selectedSlug) return;
    api.get(`/plantillas/${selectedSlug}/campos-temporales-slug`)
      .then(r => setCamposDisp(r.data?.campos || []))
      .catch(() => {
        api.get(`/analisis/${selectedSlug}/analisis`, { params: { limit: 1 } })
          .then(r => {
            if (r.data.rows?.length > 0) {
              setCamposDisp(Object.keys(r.data.rows[0]).filter(c => !c.startsWith('_')));
            }
          })
          .catch(() => setCamposDisp([]));
      });
  }, [selectedSlug]);

  // Cargar plantilla para edición
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;

    const cargarPlantilla = async () => {
      setCargandoPlantilla(true);
      try {
        const res = await api.get(`/plantillas/${editId}`);
        const p = res.data;
        if (cancelled) return;

        setEditandoPlantilla(p);
        setModo('editor');
        setSelectedSlug(p.proyecto_slug);
        setProyectoSlug(p.proyecto_slug);
        setNombre(p.nombre);
        setDesc(p.descripcion || '');

        if (p.ruta_archivo) {
          try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(`http://localhost:8000/api/v1/plantillas/${p.id}/descargar`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (cancelled) return;

            const intentarAbrir = (intentos = 0) => {
              const editor = editorRef.current?.documentEditor;
              if (editor) {
                console.log('[PlantillasCrear] Abriendo blob, tamaño:', blob.size);
                editor.open(blob);
              } else if (intentos < 10) {
                setTimeout(() => intentarAbrir(intentos + 1), 300);
              } else {
                showMsg('error', 'Editor no disponible.');
              }
            };
            setTimeout(() => intentarAbrir(), 500);
          } catch (err) {
            console.error('[PlantillasCrear] Error descargando:', err);
            if (!cancelled) showMsg('error', 'No se pudo cargar el documento.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PlantillasCrear] Error:', err);
          showMsg('error', 'Error al cargar la plantilla.');
        }
      } finally {
        if (!cancelled) setCargandoPlantilla(false);
      }
    };

    cargarPlantilla();
    return () => { cancelled = true; };
  }, [editId]);

  // Configurar editor
  const configureEditorPage = useCallback(() => {
    const editor = editorRef.current?.documentEditor;
    if (!editor) return;
    setTimeout(() => {
      try {
        const sectionFormat = editor.selection?.sectionFormat;
        if (!sectionFormat) return;
        sectionFormat.pageWidth = 612;
        sectionFormat.pageHeight = 963;
        sectionFormat.leftMargin = 56.7;
        sectionFormat.rightMargin = 56.7;
        sectionFormat.topMargin = 56.7;
        sectionFormat.bottomMargin = 56.7;
        const charFormat = editor.selection?.characterFormat;
        if (charFormat) {
          charFormat.fontFamily = 'Calibri';
          charFormat.fontSize = 11;
        }
      } catch (e) { /* ignore */ }
    }, 500);
  }, []);

  const insertText = useCallback((text) => {
    const editor = editorRef.current?.documentEditor;
    if (editor) editor.editor?.insertText(text);
  }, []);

  const insertBarcode = useCallback(() => {
    insertText('{{codebar}}');
  }, [insertText]);

  // Insertar imagen
  const insertarImagen = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const editor = editorRef.current?.documentEditor;
        if (editor) editor.editor.insertImage(ev.target.result);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, []);

  // Vista previa
  const aplicarVistaPrevia = useCallback(() => {
    const editor = editorRef.current?.documentEditor;
    if (!editor) { showMsg('error', 'Editor no disponible.'); return; }

    const datos = DATOS_EJEMPLO[selectedSlug];
    if (!datos) { showMsg('error', 'No hay datos de ejemplo para este proyecto.'); return; }

    try {
      const sfdt = editor.serialize();
      let sfdtStr = JSON.stringify(sfdt);
      for (const [placeholder, valor] of Object.entries(datos)) {
        const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        sfdtStr = sfdtStr.replace(new RegExp(escaped, 'g'), valor);
      }
      editor.open(JSON.parse(sfdtStr));
      showMsg('success', 'Vista previa aplicada.');
    } catch (err) {
      console.error('[VistaPrevia] Error:', err);
      showMsg('error', 'Error: ' + err.message);
    }
  }, [selectedSlug, showMsg]);

  // Mail Merge
  const ejecutarMailMerge = useCallback(async () => {
    const editor = editorRef.current?.documentEditor;
    if (!editor || !selectedSlug) { showMsg('error', 'Editor o proyecto no disponible.'); return; }

    try {
      const res = await api.get(`/analisis/${selectedSlug}/analisis`, { params: { limit: 1 } });
      if (!res.data?.rows?.length) { showMsg('error', 'No hay datos. Carga un padrón primero.'); return; }

      const datosReales = res.data.rows[0];
      const sfdt = editor.serialize();
      let sfdtStr = JSON.stringify(sfdt);
      let reemplazos = 0;

      for (const [key, value] of Object.entries(datosReales)) {
        const placeholder = `{{${key}}}`;
        if (sfdtStr.includes(placeholder)) {
          const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escaped, 'g');
          reemplazos += (sfdtStr.match(regex) || []).length;
          sfdtStr = sfdtStr.replace(regex, String(value ?? ''));
        }
      }

      if (reemplazos > 0) {
        editor.open(JSON.parse(sfdtStr));
        showMsg('success', `${reemplazos} campos reemplazados.`);
      } else {
        showMsg('error', 'No se encontraron placeholders {{campo}} en el documento.');
      }
    } catch (err) {
      console.error('[MailMerge] Error:', err);
      showMsg('error', 'Error en combinación.');
    }
  }, [selectedSlug, showMsg]);

  // Subir .docx
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
      setDirty(false);
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
      showMsg('success', `${campos.length} campos mapeados.`);
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error guardando mapeo.');
    }
  };

  const handleGuardarEditor = async () => {
    if (!nombre.trim() || !selectedSlug) {
      showMsg('error', 'Escribe el nombre y selecciona el proyecto.');
      return;
    }
    const proy = proyectos.find(p => p.slug === selectedSlug);
    if (!proy) return;

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
        id_proyecto: proy.id, nombre, descripcion, origen: 'editor',
      });
      const plantillaId = res.data.id;
      if (placeholders.length > 0) {
        const campos = placeholders
          .filter(ph => camposDisp.includes(ph))
          .map((ph, orden) => ({ placeholder: `{{${ph}}}`, campo_bd: ph, orden }));
        if (campos.length > 0) {
          await api.post(`/plantillas/${plantillaId}/mapear`, { campos });
        }
      }
      setDirty(false);
      showMsg('success', `Plantilla "${nombre}" creada.`);
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally { setLoading(false); }
  };

  // ── PANTALLA INICIAL ──
  if (!modo && !cargandoPlantilla) {
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
              <p>Editor integrado con tamaño Oficio México, fuente Calibri 11, inserción de imágenes y código de barras dinámico.</p>
              <div className="pl-modo-hint">Editor Syncfusion · Word-like</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (cargandoPlantilla) {
    return <div className="pl-loading">Cargando plantilla para edición...</div>;
  }

  // ── MODO SUBIR ──
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
                <input className="pl-input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Requerimiento 2025" />
              </div>
              <div className="pl-field">
                <label className="pl-label">Descripción</label>
                <input className="pl-input" value={descripcion} onChange={e => setDesc(e.target.value)} placeholder="Opcional" />
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
                  <p className="pl-drop-hint">Solo archivos .docx</p></>
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
              disabled={loading || !file || !nombre.trim() || !selectedSlug}>
              {loading ? 'Procesando…' : 'Subir y extraer campos'}
            </button>
          </div>
        ) : (
          <div className="pl-mapeo-section">
            <div className="pl-mapeo-success">
              <Icon {...ICONS.check} size={18} />
              <span>{result.mensaje}</span>
            </div>
            <h3 className="pl-mapeo-title">Mapeo de campos</h3>
            <p className="pl-mapeo-desc">{result.placeholders?.length || 0} placeholders detectados.</p>
            {!result.placeholders?.length ? (
              <div className="pl-mapeo-empty">No se encontraron placeholders <code>{'{{campo}}'}</code>.</div>
            ) : (
              <div className="pl-map-grid">
                <div className="pl-map-grid-header"><span>Placeholder</span><span>Campo BD</span><span>Estado</span></div>
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
              <button className="pl-btn" onClick={() => { setDirty(false); navigate('/plantillas'); }}>Omitir mapeo</button>
              <button className="pl-btn pl-btn--primary" onClick={handleGuardarMapeo}>Guardar mapeo y finalizar</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MODO EDITOR ──
  if (modo === 'editor') {
    return (
      <div className="pl-page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-h) - 48px)', overflow: 'hidden' }}>
        <div className="pl-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="pl-btn" onClick={() => { setModo(null); }}>
              <Icon {...ICONS.back} size={14} /> Volver
            </button>
            <input className="pl-input" style={{ width: 220 }} value={nombre}
              onChange={e => { setNombre(e.target.value); if (e.target.value.trim()) setDirty(true, 'Plantilla sin guardar.'); }}
              placeholder="Nombre de plantilla *" />
            <input className="pl-input" style={{ width: 220 }} value={descripcion}
              onChange={e => setDesc(e.target.value)} placeholder="Descripción (opcional)" />
            <button className="pl-btn pl-btn--primary" onClick={handleGuardarEditor} disabled={loading || !nombre.trim()}>
              {loading ? 'Guardando…' : '💾 Guardar plantilla'}
            </button>
            <button className="pl-btn" onClick={insertBarcode} title="Insertar código de barras">
              <Icon {...ICONS.barcode} size={14} /> Barcode
            </button>
            <button className="pl-btn" onClick={insertarImagen} title="Insertar imagen">
              🖼️ Imagen
            </button>
            <button className="pl-btn" onClick={aplicarVistaPrevia} title="Vista previa con datos de ejemplo">
              👁️ Vista previa
            </button>
            <button className="pl-btn" onClick={ejecutarMailMerge} title="Combinar correspondencia con datos reales">
              📧 Mail Merge
            </button>
          </div>
          {message && <div className={`pl-message pl-message--${message.type}`} style={{ marginTop: 8 }}>{message.text}</div>}
        </div>

        <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', border: '1px solid var(--clr-border)', borderRadius: 8 }}>
            <DocumentEditorContainerComponent
            ref={editorRef}
            enableToolbar={true}
            locale="es-MX"
            height="100%"
            serviceUrl=""
            toolbarItems={[
              'New',
              'Open',
              'Separator',
              'Undo',
              'Redo',
              'Separator',
              'Image',
              'Table',
              'Hyperlink',
              'Bookmark',
              'TableOfContents',
              'Separator',
              'Header',
              'Footer',
              'PageSetup',
              'PageNumber',
              'Break',
              'Separator',
              'Find',
              'Separator',
              'Comments',
              'TrackChanges',
              'LocalClipboard',
              'RestrictEditing'
            ]}
            created={configureEditorPage}
            style={{ height: '100%' }}
          />
          </div>

          <div style={{
            width: 220, flexShrink: 0, background: 'var(--clr-white)',
            border: '1px solid var(--clr-border)', borderRadius: 8,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--clr-border)', fontSize: 12, fontWeight: 600, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '.3px' }}>
              Campos disponibles
              <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, textTransform: 'none', color: 'var(--clr-muted)' }}>
                Clic para insertar
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {camposDisp.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--clr-muted)', padding: '8px 4px' }}>
                  Sin campos. Selecciona un proyecto con datos cargados.
                </p>
              ) : (
                camposDisp.map(c => (
                  <button key={c}
                    onClick={() => insertText(`{{${c}}}`)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '5px 8px', marginBottom: 3,
                      border: '1px solid var(--clr-border)', borderRadius: 5,
                      background: '#f8f9fa', fontSize: 11.5,
                      fontFamily: 'monospace', cursor: 'pointer',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => e.target.style.background = '#eef3f9'}
                    onMouseLeave={e => e.target.style.background = '#f8f9fa'}
                    title={`Insertar {{${c}}}`}>
                    {`{{${c}}}`}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}