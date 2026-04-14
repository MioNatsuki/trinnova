// frontend/src/pages/Proyectos.jsx
// Dashboard de proyectos disponibles para el usuario.
// Muestra tarjetas con acceso directo a Análisis, Plantillas y Emisión.

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProyecto } from '../hooks/useProyecto';
import './Proyectos.css';

// Íconos SVG inline
const Icon = ({ d, d2, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ICONS = {
  upload:   { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2: "M17 8l-5-5-5 5M12 3v12" },
  edit:     { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", d2: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" },
  broom:    { d: "M3 21l9-9", d2: "M12.22 6.22L20 4l-2.22 7.78-9 9L4 17z" },
  template: { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", d2: "M14 2v6h6M16 13H8M16 17H8M10 9H8" },
  plus:     { d: "M12 5v14M5 12h14" },
  print:    { d: "M6 9V2h12v7", d2: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" },
  settings: { d: "M12 20h9", d2: "M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" },
  folder:   { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" },
};

// Colores por slug para el acento de cada tarjeta
const SLUG_COLORS = {
  licencias_gdl:      { bg: '#f0fdf4', border: '#bbf7d0', accent: '#16a34a' },
  apa_tlajomulco:     { bg: '#eff6ff', border: '#bfdbfe', accent: '#2563eb' },
  predial_gdl:        { bg: '#fff7ed', border: '#fed7aa', accent: '#ea580c' },
  predial_tlajomulco: { bg: '#faf5ff', border: '#e9d5ff', accent: '#7c3aed' },
  estado:             { bg: '#eff6ff', border: '#bfdbfe', accent: '#1d4ed8' },
  pensiones:          { bg: '#f8fafc', border: '#e2e8f0', accent: '#475569' },
};

const DEFAULT_COLOR = { bg: '#f8fafc', border: '#e2e8f0', accent: '#4a7fb5' };

export default function Proyectos() {
  const { user } = useAuth();
  const { setProyectoSlug } = useProyecto();
  const navigate = useNavigate();

  const rol = user?.rol || 'auxiliar';
  const isAnalista  = rol === 'analista' || rol === 'superadmin';
  const canEmision  = true;

  const proyectos = user?.proyectos || [];

  // Navegar y establecer proyecto activo
  const irA = (slug, ruta) => {
    setProyectoSlug(slug);
    navigate(ruta);
  };

  if (proyectos.length === 0) {
    return (
      <div className="proyectos-page">
        <div className="proyectos-header">
          <h1>Proyectos</h1>
        </div>
        <div className="proyectos-empty">
          <div className="proyectos-empty-icon">
            <Icon {...ICONS.folder} size={48} />
          </div>
          <p>No tienes proyectos asignados.</p>
          <span>Contacta al administrador para que te asigne acceso a un proyecto.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="proyectos-page">
      <div className="proyectos-header">
        <h1>Proyectos</h1>
        <span className="proyectos-count">{proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} disponible{proyectos.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="proyectos-grid">
        {proyectos.map(proyecto => {
          const colores = SLUG_COLORS[proyecto.slug] || DEFAULT_COLOR;

          return (
            <div
              key={proyecto.id}
              className="proyecto-card"
              style={{
                '--card-bg':     colores.bg,
                '--card-border': colores.border,
                '--card-accent': colores.accent,
              }}
            >
              {/* Cabecera de tarjeta */}
              <div className="proyecto-card-header">
                <div className="proyecto-card-icon">
                  <Icon {...ICONS.folder} size={22} />
                </div>
                <div className="proyecto-card-info">
                  <h2 className="proyecto-card-nombre">{proyecto.nombre}</h2>
                  <span className="proyecto-card-slug">{proyecto.slug}</span>
                </div>
              </div>

              {/* Secciones de acciones */}
              <div className="proyecto-card-sections">

                {/* ANÁLISIS */}
                {isAnalista && (
                  <div className="proyecto-section">
                    <div className="proyecto-section-label">
                      <Icon {...ICONS.edit} size={13} />
                      Análisis
                    </div>
                    <div className="proyecto-section-actions">
                      <button onClick={() => irA(proyecto.slug, '/analisis/cargar')} className="proyecto-action-btn">
                        <Icon {...ICONS.upload} size={14} />
                        Cargar Padrón
                      </button>
                      <button onClick={() => irA(proyecto.slug, '/analisis/complementar')} className="proyecto-action-btn">
                        <Icon {...ICONS.edit} size={14} />
                        Complementar
                      </button>
                      <button onClick={() => irA(proyecto.slug, '/analisis/limpieza')} className="proyecto-action-btn">
                        <Icon {...ICONS.broom} size={14} />
                        Limpieza y análisis
                      </button>
                    </div>
                  </div>
                )}

                {/* PLANTILLAS */}
                {isAnalista && (
                  <div className="proyecto-section">
                    <div className="proyecto-section-label">
                      <Icon {...ICONS.template} size={13} />
                      Plantillas
                    </div>
                    <div className="proyecto-section-actions">
                      <button onClick={() => irA(proyecto.slug, '/plantillas')} className="proyecto-action-btn">
                        <Icon {...ICONS.template} size={14} />
                        Dashboard Plantillas
                      </button>
                      <button onClick={() => irA(proyecto.slug, '/plantillas/crear')} className="proyecto-action-btn">
                        <Icon {...ICONS.plus} size={14} />
                        Subir / Crear
                      </button>
                    </div>
                  </div>
                )}

                {/* EMISIÓN */}
                {canEmision && (
                  <div className="proyecto-section">
                    <div className="proyecto-section-label">
                      <Icon {...ICONS.print} size={13} />
                      Emisión
                    </div>
                    <div className="proyecto-section-actions">
                      <button onClick={() => irA(proyecto.slug, '/emision/preparacion')} className="proyecto-action-btn">
                        <Icon {...ICONS.settings} size={14} />
                        Preparación
                      </button>
                      <button onClick={() => irA(proyecto.slug, '/emision/emitir')} className="proyecto-action-btn">
                        <Icon {...ICONS.print} size={14} />
                        Emisión
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}