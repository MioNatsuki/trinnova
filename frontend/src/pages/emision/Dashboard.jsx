// frontend/src/pages/emision/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import SeleccionCuentas from './SeleccionCuentas';
import ModalConfiguracion from './ModalConfiguracion';
import Monitoreo from './Monitoreo';
import Historial from './Historial';
import api from '../../api/auth';
import './Dashboard.css';

export default function DashboardEmision() {
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
  const [loading, setLoading] = useState(false);
  const [estadisticas, setEstadisticas] = useState(null);
  const [jobActivo, setJobActivo] = useState(null);
  const [jobsRecientes, setJobsRecientes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedCuentas, setSelectedCuentas] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [programas, setProgramas] = useState([]);
  
  // Cargar datos iniciales
  useEffect(() => {
    if (proyectoSlug) {
      cargarDatos();
      cargarJobsRecientes();
    }
  }, [proyectoSlug]);
  
  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Cargar estadísticas
      const statsRes = await api.get(`/emision/${proyectoSlug}/estadisticas-emision`);
      setEstadisticas(statsRes.data);
      
      // Cargar plantillas
      const plantillasRes = await api.get(`/emision/${proyectoSlug}/plantillas`);
      setPlantillas(plantillasRes.data || []);
      
      // Cargar programas
      const programasRes = await api.get(`/emision/${proyectoSlug}/programas`);
      setProgramas(programasRes.data || []);
      
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const cargarJobsRecientes = async () => {
    try {
      const res = await api.get('/emision/jobs', {
        params: { page: 1, limit: 10 }
      });
      setJobsRecientes(res.data.jobs || []);
      
      // Verificar si hay un job en progreso
      const activo = res.data.jobs?.find(j => j.status === 'processing' || j.status === 'pending');
      if (activo) {
        setJobActivo(activo);
      }
    } catch (error) {
      console.error('Error cargando jobs:', error);
    }
  };
  
  const handlePrepararEmision = (config) => {
    // Preparar emisión con los datos seleccionados
    setShowModal(false);
    // Recargar datos después de crear el job
    setTimeout(() => {
      cargarJobsRecientes();
    }, 1000);
  };
  
  return (
    <div className="emision-dashboard">
      {/* Cabecera */}
      <div className="emision-header">
        <h1>Emisión de Documentos</h1>
        <div className="emision-header-actions">
          <ProyectoSelector 
            proyectos={proyectos} 
            value={proyectoSlug} 
            onChange={setProyectoSlug} 
          />
          <button 
            className="btn-primary"
            onClick={() => setShowModal(true)}
            disabled={!proyectoSlug || loading}
          >
            Nueva Emisión
          </button>
        </div>
      </div>
      
      {/* Estadísticas rápidas */}
      {estadisticas && (
        <div className="emision-stats">
          <div className="stat-card">
            <span className="stat-number">{estadisticas.total_viables?.toLocaleString() || 0}</span>
            <span className="stat-label">Registros Viables</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{estadisticas.total_pendientes?.toLocaleString() || 0}</span>
            <span className="stat-label">Pendientes</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{estadisticas.total_no_viables?.toLocaleString() || 0}</span>
            <span className="stat-label">No Viables</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">{estadisticas.total_general?.toLocaleString() || 0}</span>
            <span className="stat-label">Total Registros</span>
          </div>
        </div>
      )}
      
      {/* Monitoreo en tiempo real */}
      {jobActivo && (
        <Monitoreo 
          jobId={jobActivo.id} 
          onComplete={() => {
            setJobActivo(null);
            cargarJobsRecientes();
          }}
        />
      )}
      
      {/* Selección de cuentas (si hay proyecto) */}
      {proyectoSlug && (
        <SeleccionCuentas 
          proyectoSlug={proyectoSlug}
          onSelect={(cuentas) => setSelectedCuentas(cuentas)}
          selectedCount={selectedCuentas.length}
        />
      )}
      
      {/* Historial de emisiones */}
      <Historial 
        jobs={jobsRecientes}
        onRefresh={cargarJobsRecientes}
        proyectoSlug={proyectoSlug}
      />
      
      {/* Modal de configuración */}
      {showModal && (
        <ModalConfiguracion
          proyectoSlug={proyectoSlug}
          plantillas={plantillas}
          programas={programas}
          cuentasSeleccionadas={selectedCuentas}
          onClose={() => setShowModal(false)}
          onConfirm={handlePrepararEmision}
        />
      )}
    </div>
  );
}