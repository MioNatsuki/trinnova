// frontend/src/pages/plantillas/PlantillasDashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import { useAuth } from '../../context/AuthContext';
import './Plantillas.css';

const Icon = ({ d, d2, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  edit:   { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", d2: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" },
  trash:  { d: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" },
  map:    { d: "M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7" },
  filter: { d: "M22 3H2l8 9.46V19l4 2V12.46L22 3z" },
  doc:    { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", d2: "M14 2v6h6M16 13H8M16 17H8M10 9H8" },
  sync:   { d: "M23 4v6h-6", d2: "M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" },
  preview: { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", d2: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" },
  close:  { d: "M18 6L6 18M6 6l12 12" },
  download: { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2: "M7 10l5 5 5-5M12 15V3" },
};

const ORIGEN_BADGE = {
  upload: { label: 'Subida', bg: '#e9d5ff', color: '#6b21a8' },
  editor: { label: 'Editor', bg: '#bfdbfe', color: '#1e40af' },
};

export default function PlantillasDashboard() {
  const { proyectoSlug, proyectos, setProyectoSlug } = useProyecto();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [plantillas,   setPlantillas]   = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [filtroSlug,   setFiltroSlug]   = useState(proyectoSlug || '');
  const [filtroActiva, setFiltroActiva] = useState('true');
  const [busqueda,     setBusqueda]     = useState('');
  const [message,      setMessage]      = useState(null);
  const [editModal,    setEditModal]    = useState(null);
  const [editForm,     setEditForm]     = useState({ nombre: '', descripcion: '', activa: true });
  const [editSaving,   setEditSaving]   = useState(false);
  const [mapModal,     setMapModal]     = useState(null);
  const [mapData,      setMapData]      = useState({ campos_actuales: [], campos_disponibles: [] });
  const [mapEdits,     setMapEdits]     = useState({});
  const [mapSaving,    setMapSaving]    = useState(false);
  
  // Preview modal states
  const [previewModal, setPreviewModal] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPdf, setPreviewPdf] = useState(null);
  const [previewOn, setPreviewOn] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  const isAnalista = user?.rol === 'analista' || user?.rol === 'superadmin';
  const isSuperadmin = user?.rol === 'superadmin';

  const loadPlantillas = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtroSlug) {
        const proy = proyectos.find(p => p.slug === filtroSlug);
        if (proy) params.proyecto_id = proy.id;
      }
      if (filtroActiva !== '') params.activa = filtroActiva === 'true';
      const res = await api.get('/plantillas/', { params });
      setPlantillas(res.data);
    } catch { showMsg('error', 'Error cargando plantillas.'); }
    finally { setLoading(false); }
  }, [filtroSlug, filtroActiva, proyectos]);

  useEffect(() => { loadPlantillas(); }, [loadPlantillas]);

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // ============================================================
  // NUEVA FUNCIÓN: Sincronizar plantillas (solo superadmin)
  // ============================================================
  const handleSync = async () => {
    if (!window.confirm('¿Sincronizar plantillas desde archivos HTML?\nEsto actualizará la base de datos con los placeholders de los archivos.')) return;
    
    setSyncLoading(true);
    try {
      const res = await api.post('/plantillas/sincronizar');
      showMsg('success', 
        `Sincronización completada: ${res.data.resultados.creadas} creadas, ${res.data.resultados.actualizadas} actualizadas, ${res.data.resultados.total_archivos} archivos procesados.`
      );
      loadPlantillas();
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error sincronizando plantillas.');
    } finally {
      setSyncLoading(false);
    }
  };

  // ============================================================
  // NUEVA FUNCIÓN: Preview de plantilla con PDF
  // ============================================================
  const openPreview = async (p) => {
    setPreviewModal(p);
    setPreviewPdf(null);
    setPreviewOn(false);
    setPreviewLoading(true);
    
    try {
      const res = await api.post(`/plantillas/${p.id}/preview`, {
        placeholders: {},
        preview_on: false
      });
      if (res.data.success && res.data.pdf_base64) {
        setPreviewPdf(res.data.pdf_base64);
        setPreviewOn(res.data.preview_on);
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error generando preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const togglePreviewMode = async () => {
    if (!previewModal) return;
    const nuevoEstado = !previewOn;
    setPreviewLoading(true);
    
    try {
      const res = await api.post(`/plantillas/${previewModal.id}/preview`, {
        placeholders: nuevoEstado ? getDatosEjemplo(previewModal.proyecto_slug) : {},
        preview_on: nuevoEstado
      });
      if (res.data.success && res.data.pdf_base64) {
        setPreviewPdf(res.data.pdf_base64);
        setPreviewOn(res.data.preview_on);
      }
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error cambiando modo preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Función auxiliar para datos de ejemplo según proyecto
  const getDatosEjemplo = (slug) => {
    const ejemplos = {
      'apa_tlajomulco': {
        'clave_apa': 'APA-12345',
        'propietario_nombre': 'JUAN PÉREZ GONZÁLEZ',
        'domicilio': 'Calle Hidalgo 456, Col. Centro',
        'saldo': '$12,345.67',
        'adeudo_agua': '$8,900.00',
        'recargos': '$250.00',
        'actualizacion': '$150.00',
        'total_adeudo': '$12,345.67'
      },
      'estado': {
        'credito': 'CRED-2024-056',
        'nombre_razon_social': 'EMPRESA EJEMPLO S.A. DE C.V.',
        'importe_historico_determinado': '$156,789.00',
        'calle_numero': 'Blvd. Principal 500',
        'colonia': 'Empresarial',
        'codigo_postal': '45010',
        'municipio': 'Zapopan',
        'rfc': 'EEJ900101ABC'
      },
      'pensiones': {
        'nombre': 'JUAN PÉREZ GONZÁLEZ',
        'prestamo': '12345',
        'adeudo': '$45,678.90',
        'ultimo_abono': '15/01/2025',
        'aval_nombre': 'ROBERTO LÓPEZ MARTÍNEZ'
      },
      'predial_gdl': {
        'propietario': 'ANA LAURA HERNÁNDEZ',
        'cuenta': 'GDL-98765',
        'saldo': '$15,200.00',
        'folio_req': 'FOL-001',
        'axo_req': '2025'
      },
      'predial_tlajomulco': {
        'cuenta': 'PRED-00123',
        'domicilio': 'Calle Independencia 789',
        'total_adeudo': '$8,900.00',
        'nombre_contribuyente': 'MARÍA GARCÍA LÓPEZ'
      }
    };
    return ejemplos[slug] || {};
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/plantillas/${p.id}`);
      showMsg('success', `Plantilla "${p.nombre}" eliminada.`);
      loadPlantillas();
    } catch (err) { showMsg('error', err.response?.data?.detail || 'Error.'); }
  };

  const openEdit = (p) => {
    setEditModal(p);
    setEditForm({
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      activa: p.activa
    });
  };

  const handleEditSave = async () => {
    setEditSaving(true);
    try {
      await api.put(`/plantillas/${editModal.id}`, editForm);
      showMsg('success', 'Plantilla actualizada.');
      setEditModal(null);
      loadPlantillas();
    } catch (err) { showMsg('error', err.response?.data?.detail || 'Error.'); }
    finally { setEditSaving(false); }
  };

  const openMapeo = async (p) => {
    setMapModal(p);
    setMapEdits({});
    try {
      const res = await api.get(`/plantillas/${p.id}/preview-mapeo`);
      setMapData(res.data);
      const edits = {};
      res.data.campos_actuales.forEach(c => { edits[c.placeholder] = c.campo_bd; });
      setMapEdits(edits);
    } catch { setMapData({ campos_actuales: [], campos_disponibles: [] }); }
  };

  const handleMapSave = async () => {
    setMapSaving(true);
    const campos = Object.entries(mapEdits)
      .filter(([, v]) => v)
      .map(([placeholder, campo_bd], orden) => ({ placeholder, campo_bd, orden }));
    try {
      await api.post(`/plantillas/${mapModal.id}/mapear`, { campos });
      showMsg('success', `${campos.length} campos guardados.`);
      setMapModal(null);
      loadPlantillas();
    } catch (err) { showMsg('error', err.response?.data?.detail || 'Error.'); }
    finally { setMapSaving(false); }
  };

  const plantillasFiltradas = plantillas.filter(p =>
    !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const fmtDate = iso => iso
    ? new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'medium' }) : '—';

  return (
    <div className="pl-page">

      {/* CABECERA */}
      <div className="pl-header">
        <div>
          <h1 className="pl-title">Plantillas</h1>
          <p className="pl-subtitle">Gestión de plantillas de correspondencia HTML</p>
        </div>
        {/* QUITADO: botón "Nueva plantilla" */}
        {/* QUITADO: botón "Subir versión" */}
        {isSuperadmin && (
          <button className="pl-btn pl-btn--sync" onClick={handleSync} disabled={syncLoading}>
            <Icon {...ICONS.sync} size={15} />
            {syncLoading ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        )}
      </div>

      {/* FILTROS */}
      <div className="pl-filters">
        <div className="pl-filter-group">
          <Icon {...ICONS.filter} size={13} />
          <select className="pl-select" value={filtroSlug} onChange={e => setFiltroSlug(e.target.value)}>
            <option value="">Todos los proyectos</option>
            {proyectos.map(p => <option key={p.id} value={p.slug}>{p.nombre}</option>)}
          </select>
        </div>
        <select className="pl-select" value={filtroActiva} onChange={e => setFiltroActiva(e.target.value)}>
          <option value="">Todas (activas e inactivas)</option>
          <option value="true">Activas</option>
          <option value="false">Inactivas</option>
        </select>
        <input className="pl-search" type="text" placeholder="Buscar por nombre…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {message && <div className={`pl-message pl-message--${message.type}`}>{message.text}</div>}

      {/* TABLA */}
      {loading ? (
        <div className="pl-loading">Cargando plantillas…</div>
      ) : plantillasFiltradas.length === 0 ? (
        <div className="pl-empty">
          <Icon {...ICONS.doc} size={40} />
          <p>No hay plantillas{filtroSlug ? ' para este proyecto' : ''}.</p>
          <p className="pl-empty-hint">
            {isSuperadmin && 'Usa el botón "Sincronizar" para importar plantillas desde archivos HTML.'}
            {!isSuperadmin && 'Contacta al administrador para agregar plantillas.'}
          </p>
        </div>
      ) : (
        <div className="pl-table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Proyecto</th>
                <th>Archivo</th>
                <th>Campos</th>
                <th>Estado</th>
                <th>Creada</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plantillasFiltradas.map(p => {
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="pl-name">{p.nombre}</div>
                      {p.descripcion && <div className="pl-desc">{p.descripcion}</div>}
                    </td>
                    <td><span className="pl-project-tag">{p.proyecto_nombre}</span></td>
                    <td>
                      <span className="pl-filename" style={{ fontSize: 11, color: 'var(--clr-muted)', fontFamily: 'monospace' }}>
                        {p.nombre_archivo || '—'}
                      </span>
                    </td>
                    <td><span className="pl-campos-count">{p.total_campos} campo{p.total_campos !== 1 ? 's' : ''}</span></td>
                    <td>
                      <span className={`pl-status ${p.activa ? 'active' : 'inactive'}`}>
                        {p.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="pl-muted">{fmtDate(p.created_at)}</td>
                    <td>
                      <div className="pl-actions">
                        {/* NUEVO: Botón Preview */}
                        <button className="pl-icon-btn" title="Vista previa" onClick={() => openPreview(p)}>
                          <Icon {...ICONS.preview} size={14} />
                        </button>
                        <button className="pl-icon-btn" title="Mapeo de campos" onClick={() => openMapeo(p)}>
                          <Icon {...ICONS.map} size={14} />
                        </button>
                        {isAnalista && <>
                          <button className="pl-icon-btn" title="Editar" onClick={() => openEdit(p)}>
                            <Icon {...ICONS.edit} size={14} />
                          </button>
                          <button className="pl-icon-btn pl-icon-btn--danger" title="Eliminar"
                            onClick={() => handleDelete(p)}>
                            <Icon {...ICONS.trash} size={14} />
                          </button>
                        </>}
                        {/* QUITADO: botón "Subir versión" */}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL PREVIEW */}
      {previewModal && (
        <div className="pl-overlay" onClick={() => { setPreviewModal(null); setPreviewPdf(null); }}>
          <div className="pl-modal pl-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="pl-modal-header">
              <h3>
                <Icon {...ICONS.preview} size={16} style={{ marginRight: 8 }} />
                Vista previa: {previewModal.nombre}
              </h3>
              <button className="pl-modal-close" onClick={() => { setPreviewModal(null); setPreviewPdf(null); }}>✕</button>
            </div>
            
            <div className="pl-modal-toolbar" style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 24px', borderBottom: '1px solid var(--clr-border)',
              background: '#f8f9fa'
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button 
                  className={`pl-btn ${previewOn ? 'pl-btn--active' : ''}`}
                  onClick={togglePreviewMode}
                  disabled={previewLoading}
                  style={previewOn ? {
                    background: '#eef3f9',
                    borderColor: 'var(--clr-accent)',
                    color: 'var(--clr-accent)',
                    fontWeight: 600,
                  } : {}}
                >
                  {previewOn ? 'Datos de ejemplo' : 'Placeholders'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--clr-muted)' }}>
                  {previewOn 
                    ? 'Mostrando datos de ejemplo' 
                    : 'Mostrando placeholders resaltados'}
                </span>
              </div>
              {previewPdf && (
                <a 
                  href={`data:application/pdf;base64,${previewPdf}`}
                  download={`preview_${previewModal.nombre}.pdf`}
                  className="pl-btn"
                >
                  <Icon {...ICONS.download} size={14} /> Descargar PDF
                </a>
              )}
            </div>

            <div className="pl-modal-body" style={{ padding: 0, height: '75vh', overflow: 'hidden' }}>
              {previewLoading ? (
                <div style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', color: 'var(--clr-muted)'
                }}>
                  <span>Generando PDF... ⏳</span>
                </div>
              ) : previewPdf ? (
                <embed
                  src={`data:application/pdf;base64,${previewPdf}`}
                  type="application/pdf"
                  width="100%"
                  height="100%"
                  style={{ border: 'none' }}
                />
              ) : (
                <div style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  height: '100%', flexDirection: 'column', gap: 12,
                  color: 'var(--clr-muted)'
                }}>
                  <Icon {...ICONS.doc} size={40} />
                  <p>No se pudo generar la vista previa</p>
                  <p style={{ fontSize: 13 }}>Verifica que la plantilla tenga placeholders válidos</p>
                </div>
              )}
            </div>

            <div className="pl-modal-footer">
              <button className="pl-btn" onClick={() => { setPreviewModal(null); setPreviewPdf(null); }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR - Sin cambios */}
      {editModal && (
        <div className="pl-overlay" onClick={() => { if (editSaving) return; if (window.confirm('¿Descartar cambios?')) setEditModal(null);}}>
          <div className="pl-modal" onClick={e => e.stopPropagation()}>
            <div className="pl-modal-header">
              <h3>Editar plantilla</h3>
              <button className="pl-modal-close" onClick={() => setEditModal(null)}>✕</button>
            </div>
            <div className="pl-modal-body">
              <label className="pl-label">Nombre *</label>
              <input className="pl-input" value={editForm.nombre}
                onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              <label className="pl-label">Descripción</label>
              <textarea className="pl-textarea" rows={3} value={editForm.descripcion}
                onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))} />
              <label className="pl-label">Estado</label>
              <select className="pl-select" value={String(editForm.activa)}
                onChange={e => setEditForm(f => ({ ...f, activa: e.target.value === 'true' }))}>
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
              </select>
            </div>
            <div className="pl-modal-footer">
              <button className="pl-btn" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="pl-btn pl-btn--primary" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MAPEO - Sin cambios */}
      {mapModal && (
        <div className="pl-overlay" onClick={() => { if (mapSaving) return; setMapModal(null);}}>
          <div className="pl-modal pl-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="pl-modal-header">
              <h3>Mapeo de campos — {mapModal.nombre}</h3>
              <button className="pl-modal-close" onClick={() => setMapModal(null)}>✕</button>
            </div>
            <p className="pl-modal-hint">
              Asocia cada placeholder <code>{'{{campo}}'}</code> con un campo de la base de datos.
            </p>
            <div className="pl-map-grid" style={{ maxHeight: 400, overflowY: 'auto' }}>
              <div className="pl-map-grid-header">
                <span>Placeholder</span><span>Campo en BD</span>
              </div>
              {Object.keys(mapEdits).length === 0 ? (
                <p className="pl-map-empty">Sin placeholders.</p>
              ) : (
                Object.entries(mapEdits).map(([ph, campo]) => (
                  <div key={ph} className="pl-map-row">
                    <span className="pl-map-ph">{ph}</span>
                    <select className="pl-select pl-map-select" value={campo || ''}
                      onChange={e => setMapEdits(prev => ({ ...prev, [ph]: e.target.value }))}>
                      <option value="">— Sin mapear —</option>
                      {mapData.campos_disponibles.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
            <div className="pl-modal-footer">
              <button className="pl-btn" onClick={() => setMapModal(null)}>Cancelar</button>
              {isAnalista && (
                <button className="pl-btn pl-btn--primary" onClick={handleMapSave} disabled={mapSaving}>
                  {mapSaving ? 'Guardando…' : 'Guardar mapeo'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}