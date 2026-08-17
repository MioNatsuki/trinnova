// frontend/src/pages/Dashboard.jsx - MODIFICAR

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProyecto } from '../hooks/useProyecto';
import api from '../api/auth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import './Dashboard.css';

const SLUG_COLORS = {
  licencias_gdl:    '#4caf50',
  apa_tlajomulco:   '#90caf9',
  predial_gdl:      '#ef9a3e',
  predial_tlajomulco: '#b39ddb',
  estado:           '#5c9bd6',
  pensiones:        '#c8c8c8',
};

const DEFAULT_COLORS = ['#4a7fb5','#38a169','#dd6b20','#805ad5','#e53e3e','#00b5d8'];

export default function Dashboard() {
  const { user } = useAuth();
  const { setProyectoSlug } = useProyecto();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedProyecto, setSelectedProyecto] = useState('todos');

  const rol = user?.rol || 'auxiliar';
  const esSuperadmin = rol === 'superadmin';
  const esAnalista = rol === 'analista' || esSuperadmin;
  const esAuxiliar = rol === 'auxiliar';

  useEffect(() => {
    api.get('/dashboard/')
      .then(r => setData(r.data))
      .catch(() => setError('No se pudo cargar el dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const buildChartData = (emisiones) => {
    if (!emisiones?.length) return { rows: [], proyectos: [] };

    const slugs = [...new Set(emisiones.map(e => e.slug))];
    const meses = [...new Set(emisiones.map(e => e.mes))];

    // Filtrar por proyecto seleccionado
    let filtered = emisiones;
    if (selectedProyecto !== 'todos') {
      filtered = emisiones.filter(e => e.slug === selectedProyecto);
    }

    const slugsFiltrados = [...new Set(filtered.map(e => e.slug))];
    const mesesFiltrados = [...new Set(filtered.map(e => e.mes))];

    const rows = mesesFiltrados.map(mes => {
      const row = { mes };
      slugsFiltrados.forEach(slug => { row[slug] = 0; });
      filtered.filter(e => e.mes === mes).forEach(e => { row[e.slug] = e.total; });
      return row;
    });

    const proyectos = slugsFiltrados.map((slug, i) => ({
      slug,
      nombre: filtered.find(e => e.slug === slug)?.proyecto || slug,
      color: SLUG_COLORS[slug] || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    }));

    return { rows, proyectos };
  };

  const { rows, proyectos } = data ? buildChartData(data.emisiones || []) : { rows: [], proyectos: [] };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-label">{label}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.fill }}>
            {proyectos.find(x => x.slug === p.dataKey)?.nombre || p.dataKey}: <strong>{p.value}</strong>
          </p>
        ))}
      </div>
    );
  };

  if (loading) return <div className="dash-loading">Cargando dashboard...</div>;
  if (error) return <div className="dash-error">{error}</div>;
  if (!data) return <div className="dash-loading">Sin datos</div>;

  const cards = data.cards || {};

  return (
    <div className="dashboard">
      {/* ── Tarjetas según rol ── */}
      <div className="dash-cards">
        {esSuperadmin && cards.usuarios != null && (
          <div className="dash-card">
            <span className="dash-card-num">{cards.usuarios}</span>
            <span className="dash-card-label">Usuarios</span>
          </div>
        )}
        <div className="dash-card">
          <span className="dash-card-num">{cards.proyectos || 0}</span>
          <span className="dash-card-label">Proyectos</span>
        </div>
        <div className="dash-card">
          <span className="dash-card-num">{cards.plantillas || 0}</span>
          <span className="dash-card-label">Plantillas</span>
        </div>
        <div className="dash-card">
          <span className="dash-card-num">{cards.emisiones || 0}</span>
          <span className="dash-card-label">Emisiones</span>
        </div>
      </div>

      {/* ── Tarjetas de análisis (solo analista/superadmin) ── */}
      {esAnalista && (
        <div className="dash-cards">
          <div className="dash-card dash-card-analisis">
            <span className="dash-card-num">{cards.viables || 0}</span>
            <span className="dash-card-label dash-label-viable">✓ Viables</span>
          </div>
          <div className="dash-card dash-card-analisis">
            <span className="dash-card-num">{cards.pendientes || 0}</span>
            <span className="dash-card-label dash-label-pendiente">⏳ Pendientes</span>
          </div>
          <div className="dash-card dash-card-analisis">
            <span className="dash-card-num">{cards.no_viables || 0}</span>
            <span className="dash-card-label dash-label-no-viable">✗ No viables</span>
          </div>
        </div>
      )}

      {/* ── Mensaje para Auxiliar ── */}
      {esAuxiliar && (
        <div className="dash-auxiliar-message">
          <p>Bienvenido, {user?.nombre}.</p>
          <span>Tu rol es de Auxiliar. Puedes ver el estado general pero no realizar cambios.</span>
        </div>
      )}

      {/* ── Filtro de proyecto ── */}
      {data.proyectos_usuario?.length > 0 && (
        <div className="dash-filter">
          <label>Filtrar por proyecto:</label>
          <select 
            value={selectedProyecto} 
            onChange={e => setSelectedProyecto(e.target.value)}
          >
            <option value="todos">Todos</option>
            {data.proyectos_usuario.map(p => (
              <option key={p.id} value={p.slug}>{p.nombre}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Gráfica ── */}
      <div className="dash-chart-card">
        {rows.length === 0 ? (
          <div className="dash-empty">
            <p>Aún no hay emisiones registradas.</p>
            <p className="dash-empty-sub">La gráfica se actualizará automáticamente cuando se generen PDFs.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart
              data={rows}
              margin={{ top: 16, right: 32, left: 8, bottom: 8 }}
              barCategoryGap="28%"
              barGap={3}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="mes"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#718096' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#718096' }}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f7fafc' }} />
              <Legend
                iconType="square"
                iconSize={12}
                wrapperStyle={{ fontSize: 12, paddingTop: 20 }}
                formatter={(value) =>
                  proyectos.find(p => p.slug === value)?.nombre || value
                }
              />
              {proyectos.map(p => (
                <Bar
                  key={p.slug}
                  dataKey={p.slug}
                  fill={p.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}