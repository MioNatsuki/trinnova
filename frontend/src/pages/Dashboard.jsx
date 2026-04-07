import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/auth';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import './Dashboard.css';

// Colores por slug de proyecto — coherentes con el mockup
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
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/dashboard/')
      .then(r => setData(r.data))
      .catch(() => setError('No se pudo cargar el dashboard'))
      .finally(() => setLoading(false));
  }, []);

  // Transformar lista plana de emisiones en filas por mes para recharts
  const buildChartData = (emisiones) => {
    if (!emisiones?.length) return { rows: [], proyectos: [] };

    const slugs  = [...new Set(emisiones.map(e => e.slug))];
    const meses  = [...new Set(emisiones.map(e => e.mes))];

    const rows = meses.map(mes => {
      const row = { mes };
      slugs.forEach(slug => { row[slug] = 0; });
      emisiones.filter(e => e.mes === mes).forEach(e => { row[e.slug] = e.total; });
      return row;
    });

    const proyectos = slugs.map((slug, i) => ({
      slug,
      nombre: emisiones.find(e => e.slug === slug)?.proyecto || slug,
      color: SLUG_COLORS[slug] || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    }));

    return { rows, proyectos };
  };

  const { rows, proyectos } = data ? buildChartData(data.emisiones) : { rows: [], proyectos: [] };

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
  if (error)   return <div className="dash-error">{error}</div>;

  return (
    <div className="dashboard">

      {/* ── Stat cards ── */}
      <div className="dash-cards">
        {data.cards.usuarios != null && (
          <div className="dash-card">
            <span className="dash-card-num">{data.cards.usuarios}</span>
            <span className="dash-card-label">Usuarios</span>
          </div>
        )}
        <div className="dash-card">
          <span className="dash-card-num">{data.cards.proyectos}</span>
          <span className="dash-card-label">Proyectos</span>
        </div>
        <div className="dash-card">
          <span className="dash-card-num">{data.cards.plantillas}</span>
          <span className="dash-card-label">Plantillas</span>
        </div>
      </div>

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
