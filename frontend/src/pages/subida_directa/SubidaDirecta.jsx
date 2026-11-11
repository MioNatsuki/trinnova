// frontend/src/pages/subida_directa/SubidaDirecta.jsx
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import AdvertenciaModal from './AdvertenciaModal';
import WizardSubidaDirecta from './WizardSubidaDirecta';
import './SubidaDirecta.css';

/**
 * Página raíz del módulo Subida Directa.
 *
 * Flujo:
 *   1. Muestra modal de advertencia (3s para confirmar).
 *   2. Si confirma, muestra el wizard de 3 pasos.
 *   3. Si cancela, redirige a /proyectos.
 *
 * El usuario puede estar en la página sin proyecto seleccionado; en ese caso
 * se muestra el ProyectoSelector y el modal no aparece hasta que haya uno.
 */
export default function SubidaDirecta() {
  const location = useLocation();
  const navigate = useNavigate();
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  const [acepto, setAcepto] = useState(false);

  // Si vino desde Proyectos con un proyecto preseleccionado
  useEffect(() => {
    if (location.state?.proyectoSlug) {
      setProyectoSlug(location.state.proyectoSlug);
    }
  }, [location.state, setProyectoSlug]);

  // Si no hay proyecto todavía, mostrar solo el selector
  if (!proyectoSlug) {
    return (
      <div className="sd-page">
        <div className="sd-header">
          <h1 className="sd-title">Subida Directa</h1>
          <p className="sd-subtitle">
            Emite documentos desde un archivo ya listo, sin pasar por Análisis.
          </p>
        </div>

        <ProyectoSelector
          proyectos={proyectos}
          value={proyectoSlug}
          onChange={setProyectoSlug}
        />

        <div className="sd-empty-state">
          Selecciona un proyecto para comenzar.
        </div>
      </div>
    );
  }

  // Modal de advertencia
  if (!acepto) {
    return (
      <AdvertenciaModal
        onCancel={() => navigate('/proyectos')}
        onConfirm={() => setAcepto(true)}
      />
    );
  }

  // Wizard
  return (
    <WizardSubidaDirecta
      proyectoSlug={proyectoSlug}
      proyectos={proyectos}
      onChangeProyecto={(slug) => {
        // Si cambia de proyecto, volver a mostrar la advertencia
        setProyectoSlug(slug);
        setAcepto(false);
      }}
    />
  );
}