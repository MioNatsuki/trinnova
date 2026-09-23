// frontend/src/pages/emision/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import ModalConfiguracion from './ModalConfiguracion';
import Monitoreo from './Monitoreo';
import Historial from './Historial';
import api from '../../api/auth';
import './Dashboard.css';

export default function DashboardEmision() {
  const location = useLocation();
  const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();

  const [loading, setLoading]           = useState(false);
  const [rows, setRows]                 = useState([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [limit]                         = useState(50);
  const [pk, setPk]                     = useState('codebar');
  const [clave, setClave]               = useState('id');
  const [showModal, setShowModal]       = useState(false);
  const [jobActivo, setJobActivo]       = useState(null);
  const [jobsRecientes, setJobsRecientes] = useState([]);

  useEffect(() => {
    if (location.state?.proyectoSlug) {
      setProyectoSlug(location.state.proyectoSlug);
    }
  }, [location.state, setProyectoSlug]);

  // Reset al cambiar de proyecto
  useEffect(() => {
    setPage(1);
  }, [proyectoSlug]);

  // Cargar tabla_temporal
  const cargarTemporal = useCallback(async () => {
    if (!proyectoSlug) return;
    setLoading(true);
    try {
      const res = await api.get(`/emision/${proyectoSlug}/tabla-temporal`, {
        params: { page, limit }
      });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
      setPk(res.data.pk || 'codebar');
      setClave(res.data.clave || 'id');
    } catch (err) {
      console.error('Error cargando tabla_temporal:', err);
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, limit]);

  const cargarJobs = useCallback(async () => {
    try {
      const res = await api.get('/emision/jobs', { params: { page: 1, limit: 10 } });
      setJobsRecientes(res.data.jobs || []);
      const activo = (res.data.jobs || []).find(
        j => j.status === 'processing' || j.status === 'pending'
      );
      if (activo) setJobActivo(activo);
    } catch (err) {
      console.error('Error cargando jobs:', err);
    }
  }, []);

  useEffect(() => { cargarTemporal(); }, [cargarTemporal]);
  useEffect(() => { cargarJobs(); }, [cargarJobs]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Columnas dinámicas: mostramos codebar, clave, orden, nombre
  const columnas = [
    { key: 'orden_impresion', label: 'Orden' },
    { key: pk, label: 'Codebar', isPk: true },
    { key: clave, label: 'Cuenta', isClave: true },
    { key: '_nombre_display', label: 'Nombre' },
    { key: '_calle_display', label: 'Domicilio' },
  ];

  return (
    <div className="emision-dashboard">
      <div className="emision-header">
        <h1>Emisión</h1>
        <div className="emision-header-actions">
          <ProyectoSelector
            proyectos={proyectos}
            value={proyectoSlug}
            onChange={setProyectoSlug}
          />
          <button
            className="btn-primary"
            onClick={() => setShowModal(true)}
            disabled={!proyectoSlug || loading || total === 0}
          >
            {total === 0
              ? 'Nada para emitir'
              : `Comenzar Emisión (${total})`}
          </button>
        </div>
      </div>

      {jobActivo && (
        <Monitoreo
          jobId={jobActivo.id}
          onComplete={() => { setJobActivo(null); cargarJobs(); cargarTemporal(); }}
        />
      )}

      <div className="emision-table-wrapper">
        <table className="emision-table">
          <thead>
            <tr>
              {columnas.map(col => (
                <th key={col.key} className="emision-th">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnas.length} className="emision-empty">Cargando…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columnas.length} className="emision-empty">
                No hay registros en la cola. Realiza la Preparación primero.
              </td></tr>
            ) : rows.map(r => (
              <tr key={String(r[pk])}>
                {columnas.map(col => {
                  if (col.isPk) {
                    return (
                      <td key={col.key} className="emision-td emision-td--codebar">
                        {String(r[col.key] ?? '—')}
                      </td>
                    );
                  }
                  if (col.isClave) {
                    return (
                      <td key={col.key} className="emision-td emision-td--pk">
                        {String(r[col.key] ?? '—')}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className="emision-td">
                      {r[col.key] ?? '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="emision-pagination">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            ← Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Siguiente →
          </button>
          <span className="emision-total">{total.toLocaleString()} registros</span>
        </div>
      )}

      {showModal && (
        <ModalConfiguracion
          proyectoSlug={proyectoSlug}
          totalCuentas={total}
          onClose={() => setShowModal(false)}
          onConfirm={() => {
            setShowModal(false);
            setTimeout(() => { cargarJobs(); cargarTemporal(); }, 1000);
          }}
        />
      )}

      <Historial
        jobs={jobsRecientes}
        onRefresh={cargarJobs}
        proyectoSlug={proyectoSlug}
      />
    </div>
  );
}