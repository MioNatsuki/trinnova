// frontend/src/components/emision/Historial.jsx
import { useState } from 'react';
import api from '../../api/auth';
import './Historial.css';

export default function Historial({ jobs, onRefresh, proyectoSlug }) {
  const [expanded, setExpanded] = useState(false);
  
  const handleRefresh = async () => {
    onRefresh?.();
  };
  
  const getStatusBadge = (status) => {
    const badges = {
      pending: <span className="badge-pending">⏳ Pendiente</span>,
      processing: <span className="badge-processing">⚙️ Procesando</span>,
      completed: <span className="badge-completed">✅ Completado</span>,
      failed: <span className="badge-failed">❌ Fallido</span>,
      cancelled: <span className="badge-cancelled">🚫 Cancelado</span>
    };
    return badges[status] || status;
  };
  
  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleString('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  };
  
  const formatDuration = (job) => {
    if (!job.started_at) return '—';
    const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
    const seconds = Math.max(0, Math.floor((end - new Date(job.started_at).getTime()) / 1000));
    return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  };
  const displayJobs = expanded ? jobs : jobs?.slice(0, 5);
  
  if (!jobs || jobs.length === 0) {
    return (
      <div className="historial-card">
        <div className="historial-header">
          <h3>Historial de Emisiones</h3>
          <button className="btn-refresh" onClick={handleRefresh}>
            🔄
          </button>
        </div>
        <div className="historial-empty">
          <p>No hay emisiones registradas</p>
          <span>Las emisiones aparecerán aquí una vez que comiences</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="historial-card">
      <div className="historial-header">
        <h3>Historial de Emisiones</h3>
        <div className="historial-actions">
          <span className="historial-count">{jobs.length} emisiones</span>
          <button className="btn-refresh" onClick={handleRefresh}>
            🔄
          </button>
        </div>
      </div>
      
      <div className="historial-tabla-wrapper">
        <table className="historial-tabla">
          <thead>
            <tr>
              <th>Job</th>
              <th>Estado</th>
              <th>Progreso</th>
              <th>Registros</th>
              <th>Fecha</th>
              <th>Tiempo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {displayJobs.map(job => (
              <tr key={job.id}>
                <td>
                  <div className="job-nombre">{job.nombre_job || `Job #${job.id}`}</div>
                  <div className="job-id">ID: {job.id}</div>
                </td>
                <td>{getStatusBadge(job.status)}</td>
                <td>
                  <div className="job-progreso">
                    <div className="job-progreso-bar">
                      <div 
                        className="job-progreso-fill" 
                        style={{ width: `${job.progreso || 0}%` }}
                      />
                    </div>
                    <span className="job-progreso-texto">{job.progreso || 0}%</span>
                  </div>
                </td>
                <td>
                  {job.procesados || 0} / {job.total_registros || 0}
                </td>
                <td className="job-fecha">{formatDate(job.created_at)}</td>
                <td>{formatDuration(job)}</td>
                <td>
                  {job.status === 'processing' && (
                    <button 
                      className="btn-ver"
                      onClick={async () => { if (window.confirm("¿Cancelar esta emisión?")) { await api.post(`/emision/jobs/${job.id}/cancelar`); onRefresh?.(); } }}
                    >
                      Cancelar
                    </button>
                  )}
                  {job.ruta_zip && (
                    <a 
                      href="#" 
                      className="btn-descargar"
                      onClick={(e) => {
                        e.preventDefault();
                        alert('Descarga de archivos (próximamente)');
                      }}
                    >
                      📁
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {jobs.length > 5 && (
        <div className="historial-footer">
          <button 
            className="btn-ver-mas"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Ver menos ↑' : `Ver más (${jobs.length - 5} restantes) ↓`}
          </button>
        </div>
      )}
    </div>
  );
}