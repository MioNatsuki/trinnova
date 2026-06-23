// frontend/src/pages/plantillas/PlantillasCrear.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import { useNavigationGuard } from '../../context/NavigationGuardContext';
import './Plantillas.css';

const Icon = ({ d, d2, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  upload:   { d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2:"M17 8l-5-5-5 5M12 3v12" },
  back:     { d:"M19 12H5M12 19l-7-7 7-7" },
  check:    { d:"M20 6L9 17l-5-5" },
  preview:  { d:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", d2:"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" },
  previewOff: { d:"M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94", d2:"M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" },
  download: { d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2:"M7 10l5 5 5-5M12 15V3" },
  close:    { d:"M18 6L6 18M6 6l12 12" },
  refresh:  { d:"M23 4v6h-6", d2:"M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" },
};

const DATOS_EJEMPLO = {
  pensiones: {
    'nombre':          'JUAN PÉREZ GONZÁLEZ',
    'prestamo':        '12345',
    'adeudo':          '$45,678.90',
    'afiliado_calle':  'Av. Revolución 123, Col. Centro, Guadalajara, Jalisco',
    'afiliado_colonia':'Centro',
    'afiliado_cp':     '44100',
    'ultimo_abono':    '15/enero/2025',
    'estatus':         'Activo',
    'afiliado_telefono':'33-1234-5678',
    'aval_nombre':     'ROBERTO LÓPEZ MARTÍNEZ',
    'aval_calle':      'Calle Independencia 456, Col. Moderna',
    'garantia_direccion':'Calle Principal S/N, Zona Centro',
    'num_convenio':    'CONV-2024-089',
    'fecha_convenio':  '10/diciembre/2024',
    'demanda':         'Demanda Civil 456/2024',
    'juzgado':         'Juzgado 3ro de lo Civil',
    'expediente':      'EXP-2024-0123',
    'estatus_despacho':'En proceso',
    'estatus_prestamo':'Activo',
    'tipo_prestamo':   'Personal',
    'dependencia':     'ISSSTE',
    'afiliado_municipio':'Guadalajara',
    'codebar':         '|| 1234567890 ||',
  },
  apa_tlajomulco: {
    'propietario': 'MARÍA GARCÍA LÓPEZ',
    'clave_APA':   'A-56789',
    'saldo':       '$12,345.67',
    'calle':       'Calle Hidalgo 456, Col. Centro, Tlajomulco de Zúñiga',
    'exterior':    '456',
    'interior':    'A',
    'poblacion':   'Tlajomulco de Zúñiga',
    'localidad':   'Centro',
    'tipo_servicio':'Doméstico',
    'adeudo_agua': '$8,900.00',
    'fecha_lectura':'15/enero/2025',
    'periodo_desde':'01/noviembre/2024',
    'periodo_hasta':'31/diciembre/2024',
    'gastos':      '$450.00',
    'descuento':   '$100.00',
    'recargos':    '$250.00',
    'tipo_predio': 'Casa Habitación',
    'cuenta':      '123456',
    'medidor':     'MED-001',
    'codebar':     '|| APATLAJ 56789 ||',
  },
  predial_tlajomulco: {
    'cuenta':           'PRED-00123',
    'domicilio':        'Calle Independencia 789, Col. Centro, Tlajomulco',
    'no_ext':           '789',
    'no_int':           '',
    'saldo':            '$8,900.00',
    'impuesto':         '$6,200.00',
    'recargos':         '$1,500.00',
    'total_multas':     '$800.00',
    'total_gastos':     '$400.00',
    'gastos_requerimiento':'$200.00',
    'municipio':        'Tlajomulco de Zúñiga',
    'poblacion':        'Centro',
    'colonia_3':        'Centro',
    'control_req':      'REQ-2024-001',
    'axo_req':          '2024',
    'folio_req':        'FOL-001',
    'cve_catastral':    'CAT-12345',
    'valor_fiscal':     '$450,000.00',
    'terreno':          '120 m²',
    'construccion':     '85 m²',
    'codebar':          '|| PREDTLAJ 00123 ||',
  },
  licencias_gdl: {
    'propietario':   'RESTAURANTE EL SOL S.A. DE C.V.',
    'licencia':      'LIC-2024-001',
    'total':         '$23,456.00',
    'ubicacion':     'Av. Juárez 1500, Col. Americana, Guadalajara',
    'numext_ubic':   '1500',
    'numint_ubic':   'Local 3',
    'colonia_ubic':  'Americana',
    'actividad':     'Restaurante con venta de bebidas alcohólicas',
    'fecemi':        '01/enero/2025',
    'derechos':      '$18,000.00',
    'recargos':      '$3,456.00',
    'multas':        '$2,000.00',
    'gastos':        '$0.00',
    'recaud':        'REC-01',
    'cveproceso':    'PROC-2024-001',
    'axoreq':        '2024',
    'folioreq':      'FOL-001',
    'zona':          'Zona 1',
    'subzona':       'Subzona A',
    'descripcion':   'Licencia para venta de bebidas alcohólicas',
    'codebar':       '|| LICGDL 2024001 ||',
  },
  predial_gdl: {
    'propietariotitular_n': 'ANA LAURA HERNÁNDEZ',
    'cuenta_n':             'GDL-98765',
    'saldo2025':            '$15,200.00',
    'calle':                'Calle Morelos 234, Col. Centro, Guadalajara',
    'num_exterior':         '234',
    'num_interior':         '',
    'colonia':              'Centro',
    'incp':                 '$500.00',
    'gastos':               '$350.00',
    'multas':               '$0.00',
    'saldomulta':           '$0.00',
    'axo':                  '2025',
    'bimestre':             '1',
    'clavecatastral':       'CAT-GDL-98765',
    'valor_fiscal':         '$780,000.00',
    'terreno':              '200 m²',
    'construccion':         '150 m²',
    'zona':                 'Zona Centro',
    'subzona':              'A',
    'codebar':              '|| PREDGDL 98765 ||',
  },
  estado: {
    'nombre_razon_social':            'EMPRESA EJEMPLO S.A. DE C.V.',
    'credito':                        'CRED-2024-056',
    'importe_historico_determinado':  '$156,789.00',
    'calle_numero':                   'Blvd. Principal 500, Col. Empresarial, Zapopan, Jalisco',
    'colonia':                        'Empresarial',
    'cp':                             '45010',
    'municipio':                      'Zapopan',
    'rfc':                            'EEJ900101ABC',
    'fecha_recepcion':                '15 de octubre de 2024',
    'fecha_documento_determinante':   '1 de octubre de 2024',
    'fecha_notificacion':             '20 de octubre de 2024',
    'exigible':                       '15 de noviembre de 2024',
    'concepto':                       'Impuesto Sobre la Renta Ejercicio 2023',
    'tipo_credito':                   'ISR',
    'tipo_cartera':                   'Activa',
    'coordinadora':                   'Coord. Zona Metropolitana',
    'area_asignacion':                'Área de Cobranza',
    'autoridad_determinante':         'SAT',
    'expediente_procedencia':         'EXP-SAT-2024-001',
    'codebar':                        '|| EDO CRED2024056 ||',
  },
};

export default function PlantillasCrear() {
  const { proyectoSlug, proyectos, setProyectoSlug } = useProyecto();
  const { setDirty } = useNavigationGuard();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [selectedSlug,  setSelectedSlug]  = useState(proyectoSlug || '');
  const [nombre,        setNombre]        = useState('');
  const [descripcion,   setDesc]          = useState('');
  const [loading,       setLoading]       = useState(false);
  const [message,       setMessage]       = useState(null);
  const [result,        setResult]        = useState(null);
  const [mapEdits,      setMapEdits]      = useState({});
  const [camposDisp,    setCamposDisp]    = useState([]);
  const [file,          setFile]          = useState(null);
  const [editando,      setEditando]      = useState(null);
  
  // Vista previa — toggle ON/OFF
  const [previewOn,     setPreviewOn]     = useState(false);
  const [previewHtml,   setPreviewHtml]   = useState(null);
  const [previewLoading,setPreviewLoading]= useState(false);
  
  const fileRef = useRef();

  const proyectoActual = proyectos.find(p => p.slug === selectedSlug);

  const showMsg = useCallback((type, text, duration = 6000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), duration);
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
            if (r.data.rows?.length > 0)
              setCamposDisp(Object.keys(r.data.rows[0]).filter(c => !c.startsWith('_')));
          })
          .catch(() => setCamposDisp([]));
      });
  }, [selectedSlug]);

  // Cargar plantilla para edición
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    
    const cargar = async () => {
      try {
        const res = await api.get(`/plantillas/${editId}`);
        if (cancelled) return;
        const p = res.data;
        
        setEditando(p);
        setSelectedSlug(p.proyecto_slug);
        setProyectoSlug(p.proyecto_slug);
        setNombre(p.nombre);
        setDesc(p.descripcion || '');
        
        if (p.campos?.length > 0) {
          const edits = {};
          p.campos.forEach(c => { edits[c.placeholder] = c.campo_bd; });
          setMapEdits(edits);
        }
      } catch (err) {
        console.error('[PlantillasCrear] Error cargando:', err);
        if (!cancelled) showMsg('error', 'Error al cargar la plantilla.');
      }
    };
    
    cargar();
    return () => { cancelled = true; };
  }, [editId]);

  // ── Subir .docx ────────────────────────────────────────────────────────────
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

  // ── Guardar mapeo ──────────────────────────────────────────────────────────
  const handleGuardarMapeo = async () => {
    const plantillaId = result?.id || editando?.id;
    if (!plantillaId) return;
    
    const campos = Object.entries(mapEdits)
      .filter(([, v]) => v)
      .map(([placeholder, campo_bd], orden) => ({ placeholder, campo_bd, orden }));
    
    if (campos.length === 0) {
      showMsg('error', 'Mapea al menos un campo antes de guardar.');
      return;
    }
    
    try {
      await api.post(`/plantillas/${plantillaId}/mapear`, { campos });
      setDirty(false);
      showMsg('success', `${campos.length} campos mapeados.`);
      setTimeout(() => navigate('/plantillas'), 1200);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error guardando mapeo.');
    }
  };

  // ── Vista previa toggle ────────────────────────────────────────────────────
  const handleTogglePreview = async () => {
    const plantillaId = result?.id || editando?.id;
    if (!plantillaId) {
      showMsg('error', 'Guarda la plantilla primero.');
      return;
    }
    
    const nuevoEstado = !previewOn;
    setPreviewOn(nuevoEstado);
    setPreviewLoading(true);
    setPreviewHtml(null);  // Ya no usaremos HTML
    
    try {
      const payload = nuevoEstado
        ? { placeholders: DATOS_EJEMPLO[selectedSlug] || {}, preview_on: true }
        : { placeholders: {}, preview_on: false };
      
      // Llamar al NUEVO endpoint de PDF
      const res = await api.post(
        `/plantillas/${plantillaId}/preview-pdf`,
        payload,
        { timeout: 30000 }  // Timeout más largo para conversión
      );
      
      if (res.data.success && res.data.pdf_base64) {
        // Crear URL de datos para el PDF
        const pdfDataUrl = `data:application/pdf;base64,${res.data.pdf_base64}`;
        setPreviewHtml(pdfDataUrl);  // Reutilizamos el estado pero para PDF
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error generando vista previa.');
      setPreviewOn(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Descargar .docx ────────────────────────────────────────────────────────
  const handleDownload = () => {
    const plantillaId = result?.id || editando?.id;
    if (!plantillaId) return;
    
    const token = localStorage.getItem('access_token');
    const url = `http://localhost:8000/api/v1/plantillas/${plantillaId}/descargar`;
    
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error('Error descargando');
        return r.blob();
      })
      .then(blob => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${nombre || 'plantilla'}.docx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        a.remove();
      })
      .catch(() => showMsg('error', 'Error descargando el archivo.'));
  };

  // ────────────────────────────────────────────────────────────────────────────
  // PANTALLA INICIAL — Elegir proyecto y subir archivo
  // ────────────────────────────────────────────────────────────────────────────
  if (!editId && !result && !editando) {
    return (
      <div className="pl-page">
        <div className="pl-header">
          <div>
            <h1 className="pl-title">Nueva Plantilla</h1>
            <p className="pl-subtitle">
              Sube un documento Word con placeholders <code>{'{{campo}}'}</code>
            </p>
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
          <p style={{ fontSize: 12, color: 'var(--clr-muted)', marginTop: 6 }}>
            La plantilla se asociará a este proyecto/padrón.
          </p>
        </div>

        {selectedSlug && (
          <>
            <div className="pl-upload-form">
              <div className="pl-form-row">
                <div className="pl-field">
                  <label className="pl-label">Nombre *</label>
                  <input className="pl-input" value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="Ej: Requerimiento 2025" />
                </div>
                <div className="pl-field">
                  <label className="pl-label">Descripción</label>
                  <input className="pl-input" value={descripcion}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Opcional" />
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
                  <>
                    <div className="pl-drop-icon pl-drop-icon--ok">✓</div>
                    <p className="pl-drop-filename">{file.name}</p>
                    <p className="pl-drop-hint">Haz clic para cambiar el archivo</p>
                  </>
                ) : (
                  <>
                    <div className="pl-drop-icon">📄</div>
                    <p className="pl-drop-text">Arrastra aquí o haz clic para seleccionar</p>
                    <p className="pl-drop-hint">Solo archivos .docx (tamaño Oficio México recomendado)</p>
                  </>
                )}
              </div>

              <div className="pl-upload-info">
                <h4>📋 Campos disponibles para este proyecto ({camposDisp.length})</h4>
                <div className="pl-campos-preview">
                  {camposDisp.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
                      Cargando campos...
                    </span>
                  )}
                  {camposDisp.slice(0, 60).map(c => (
                    <span key={c} className="pl-campo-chip">
                      <code>{`{{${c}}}`}</code>
                    </span>
                  ))}
                  {camposDisp.length > 60 && (
                    <span className="pl-campo-chip pl-campo-chip--more">
                      +{camposDisp.length - 60} más
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--clr-muted)', marginTop: 8 }}>
                  Usa estos placeholders en tu documento Word entre dobles llaves. 
                  El sistema los detectará automáticamente al subir el archivo.
                </p>
              </div>

              <button className="pl-btn pl-btn--primary pl-btn--full"
                onClick={handleUpload}
                disabled={loading || !file || !nombre.trim() || !selectedSlug}>
                {loading ? 'Procesando…' : 'Subir y extraer campos'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PANTALLA POST-SUBIDA — Mapeo de placeholders
  // ────────────────────────────────────────────────────────────────────────────
  if (result || editando) {
    const plantillaId = result?.id || editando?.id;
    const placeholders = result?.placeholders || 
      (editando?.campos?.map(c => c.placeholder.replace(/[{}]/g, '')) || []);
    const mapeoAuto = result?.mapeo_automatico || {};

    return (
      <div className="pl-page">
        <div className="pl-header">
          <div>
            <h1 className="pl-title">
              {editando ? `Editando: ${nombre}` : 'Mapeo de campos'}
            </h1>
            <p className="pl-subtitle">
              Proyecto: <strong>{proyectoActual?.nombre}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pl-btn" onClick={() => navigate('/plantillas')}>
              <Icon {...ICONS.back} size={14} /> Volver
            </button>
          </div>
        </div>

        {message && <div className={`pl-message pl-message--${message.type}`}>{message.text}</div>}

        {/* Barra de acciones */}
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          background: 'var(--clr-white)', padding: '12px 16px',
          borderRadius: 'var(--radius)', border: '1px solid var(--clr-border)',
          marginBottom: 16,
        }}>
          <button className="pl-btn" onClick={handleDownload} title="Descargar .docx para editar en Word">
            <Icon {...ICONS.download} size={14} /> Descargar .docx
          </button>
          
          <button
            className={`pl-btn ${previewOn ? 'pl-btn--active' : ''}`}
            onClick={handleTogglePreview}
            disabled={previewLoading}
            title={previewOn ? 'Mostrar placeholders' : 'Mostrar con datos de ejemplo'}
            style={previewOn ? {
              background: '#eef3f9',
              borderColor: 'var(--clr-accent)',
              color: 'var(--clr-accent)',
              fontWeight: 600,
            } : {}}
          >
            <Icon {...(previewOn ? ICONS.preview : ICONS.previewOff)} size={14} />
            {previewLoading ? 'Cargando...' : previewOn ? 'Vista previa: ON' : 'Vista previa: OFF'}
          </button>
          
          {previewOn && (
            <span style={{ fontSize: 11, color: '#276749', background: '#c6f6d5', padding: '3px 8px', borderRadius: 4, fontWeight: 500 }}>
              Modo datos de ejemplo — textos largos en rojo
            </span>
          )}
          {!previewOn && previewHtml && (
            <span style={{ fontSize: 11, color: '#975a16', background: '#fefcbf', padding: '3px 8px', borderRadius: 4, fontWeight: 500 }}>
              Modo placeholders — verifica placeholders de cada campo
            </span>
          )}
        </div>

        {/* Vista previa */}
        {previewHtml && (
        <div style={{
          background: 'var(--clr-white)',
          border: '1px solid var(--clr-border)',
          borderRadius: 'var(--radius)',
          marginBottom: 16,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 16px', borderBottom: '1px solid var(--clr-border)',
            background: previewOn ? '#f0fff4' : '#fffbeb',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text)' }}>
              {previewOn 
                ? '👁️ Vista previa con datos de ejemplo' 
                : '📍 Plantilla base — Placeholders resaltados en amarillo'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <a 
                href={previewHtml} 
                download={`preview_${nombre || 'plantilla'}.pdf`}
                style={{
                  padding: '4px 12px',
                  fontSize: 11,
                  background: 'var(--clr-accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                📥 Descargar PDF
              </a>
              <button
                onClick={() => { setPreviewHtml(null); setPreviewOn(false); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--clr-muted)', fontSize: 16, padding: 4,
                }}
                title="Cerrar vista previa"
              >
                <Icon {...ICONS.close} size={14} />
              </button>
            </div>
          </div>
          
          {/* Visor de PDF nativo del navegador */}
          <div style={{ height: '80vh', width: '100%' }}>
            <embed
              src={previewHtml}
              type="application/pdf"
              width="100%"
              height="100%"
              style={{ border: 'none' }}
            />
          </div>
        </div>
      )}

        {/* Tabla de mapeo */}
        <div className="pl-mapeo-section">
          {result?.mensaje && !editando && (
            <div className="pl-mapeo-success">
              <Icon {...ICONS.check} size={18} />
              <span>{result.mensaje}</span>
            </div>
          )}
          <h3 className="pl-mapeo-title">
            {editando ? 'Mapeo de campos actual' : 'Asignar placeholders a columnas'}
          </h3>
          <p className="pl-mapeo-desc">
            {placeholders.length || Object.keys(mapEdits).length || 0} placeholders detectados.
            {(!placeholders || placeholders.length === 0) && Object.keys(mapEdits).length === 0 && (
              <> Asegúrate de que tu documento Word contenga <code>{'{{campo}}'}</code>.</>
            )}
          </p>
          
          {Object.keys(mapEdits).length === 0 && (!placeholders || placeholders.length === 0) ? (
            <div className="pl-mapeo-empty">
              No se encontraron placeholders <code>{'{{campo}}'}</code> en el documento.
              <br />
              Agrega placeholders en Word y vuelve a subir el archivo.
            </div>
          ) : (
            <div className="pl-map-grid">
              <div className="pl-map-grid-header">
                <span>Placeholder</span>
                <span>Campo en base de datos</span>
                <span>Estado</span>
              </div>
              {(placeholders.length > 0 ? placeholders.map(ph => {
                const key = `{{${ph}}}`;
                return { key, ph };
              }) : Object.keys(mapEdits).map(key => ({ key, ph: key.replace(/[{}]/g, '') })))
              .map(({ key, ph }) => {
                const val = mapEdits[key] || '';
                const autoMapped = !!mapeoAuto[ph];
                return (
                  <div key={ph} className="pl-map-row">
                    <span className="pl-map-ph">{key}</span>
                    <select className="pl-select pl-map-select" value={val}
                      onChange={e => setMapEdits(prev => ({ ...prev, [key]: e.target.value }))}>
                      <option value="">— Sin mapear —</option>
                      {camposDisp.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
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
            <button className="pl-btn" onClick={() => {
              setDirty(false);
              navigate('/plantillas');
            }}>
              Cancelar
            </button>
            <button className="pl-btn pl-btn--primary" onClick={handleGuardarMapeo}>
              💾 Guardar mapeo y finalizar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}