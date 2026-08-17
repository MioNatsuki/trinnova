// frontend/src/components/emision/Monitoreo.jsx
import { useState, useEffect, useRef } from 'react';
import api from '../../api/auth';
import './Monitoreo.css';

export default function Monitoreo({ jobId, onComplete }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);
  const intervalRef = useRef(null);
  
  // Cargar estado inicial
  useEffect(() => {
    if (jobId) {
      cargarEstado();
      iniciarPolling();
    }
    
    return () => {
      detenerPolling();
    };
  }, [jobId]);
  
  const cargarEstado = async () => {
    try {
      const res = await api.get(`/emision/jobs/${jobId}/estado`);
      setJob(res.data);
      setLoading(false);
      
      // Si está completado, detener polling
      if (res.data.status === 'completed' || res.data.status === 'failed' || res.data.status === 'cancelled') {
        detenerPolling();
        if (res.data.status === 'completed') {
          onComplete?.();
        }
      }
    } catch (error) {
      console.error('Error cargando estado:', error);
      setLoading(false);
    }
  };
  
  const iniciarPolling = () => {
    detenerPolling();
    intervalRef.current = setInterval(cargarEstado, 3000);
  };
  
  const detenerPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  const handleCancelar = async () => {
    if (!window.confirm('¿Cancelar esta emisión?')) return;
    
    try {
      await api.post(`/emision/jobs/${jobId}/cancelar`);
      cargarEstado();
    } catch (error) {
      console.error('Error cancelando:', error);
    }
  };
  
  if (loading) {
    return (
      <div className="monitoreo-card">
        <div className="monitoreo-loading">Cargando estado...</div>
      </div>
    );
  }
  
  if (!job) {
    return null;
  }
  
  const { status, total_registros, procesados, progreso, estimado_restante } = job;
  const isActive = status === 'processing' || status === 'pending';
  const isComplete = status === 'completed' || status === 'failed' || status === 'cancelled';
  
  const statusMessages = {
    pending: '⏳ En cola...',
    processing: `⚙️ Procesando (${progreso}%)`,
    completed: '✅ Completado',
    failed: '❌ Fallido',
    cancelled: '🚫 Cancelado'
  };
  
  return (
    <div className="monitoreo-card">
      <div className="monitoreo-header">
        <div className="monitoreo-info">
          <h3>Emisión en curso</h3>
          <span className="monitoreo-status">{statusMessages[status] || status}</span>
        </div>
        {isActive && (
          <button className="btn-cancelar" onClick={handleCancelar}>
            Cancelar
          </button>
        )}
      </div>
      
      {/* Barra de progreso */}
      <div className="monitoreo-progreso">
        <div className="progreso-bar">
          <div 
            className="progreso-fill" 
            style={{ width: `${progreso}%` }}
          />
        </div>
        <div className="progreso-texto">
          <span>{procesados.toLocaleString()} / {total_registros.toLocaleString()} registros</span>
          <span>{progreso}%</span>
        </div>
      </div>
      
      {/* Detalles */}
      <div className="monitoreo-detalles">
        <div className="detalle-item">
          <span className="detalle-label">Estado</span>
          <span className="detalle-valor">{job.status}</span>
        </div>
        {estimado_restante && isActive && (
          <div className="detalle-item">
            <span className="detalle-label">Tiempo estimado</span>
            <span className="detalle-valor">{estimado_restante}</span>
          </div>
        )}
        {isComplete && job.completed_at && (
          <div className="detalle-item">
            <span className="detalle-label">Finalizado</span>
            <span className="detalle-valor">
              {new Date(job.completed_at).toLocaleString()}
            </span>
          </div>
        )}
        {job.ultimo_pk_procesado && (
          <div className="detalle-item">
            <span className="detalle-label">Última cuenta</span>
            <span className="detalle-valor">{job.ultimo_pk_procesado}</span>
          </div>
        )}
        {job.error_msg && (
          <div className="detalle-item error">
            <span className="detalle-label">Error</span>
            <span className="detalle-valor">{job.error_msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}