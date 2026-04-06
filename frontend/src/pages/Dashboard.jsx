import { useAuth } from '../context/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './Dashboard.css';

/* Datos de ejemplo — en fases posteriores vendrán del backend */
const chartData = [
  { mes: 'Enero',   gdl_lic: 0,   tlaj_agua: 420, gdl_pred: 380, tlaj_pred: 520, estado: 290, pensiones: 130 },
  { mes: 'Febrero', gdl_lic: 0,   tlaj_agua: 310, gdl_pred: 420, tlaj_pred: 480, estado: 360, pensiones: 110 },
  { mes: 'Marzo',   gdl_lic: 0,   tlaj_agua: 390, gdl_pred: 290, tlaj_pred: 560, estado: 470, pensiones: 150 },
  { mes: 'Abril',   gdl_lic: 140, tlaj_agua: 310, gdl_pred: 20,  tlaj_pred: 330, estado: 0,   pensiones: 0   },
];

const COLORS = {
  gdl_lic:   '#4caf50',
  tlaj_agua: '#90caf9',
  gdl_pred:  '#ef9a3e',
  tlaj_pred: '#b39ddb',
  estado:    '#5c9bd6',
  pensiones: '#c8c8c8',
};

const LABELS = {
  gdl_lic:   'Guadalajara – Licencias',
  tlaj_agua: 'Tlajomulco – Agua',
  gdl_pred:  'Guadalajara – Predial',
  tlaj_pred: 'Tlajomulco – Predial',
  estado:    'Proyecto del Estado',
  pensiones: 'Instituto de Pensiones',
};

export default function Dashboard() {
  const { user } = useAuth();
  const isSuperadmin = user?.rol === 'superadmin';

  return (
    <div className="dashboard">
      {/* Stat cards */}
      <div className="dash-cards">
        {isSuperadmin && (
          <div className="dash-card">
            <span className="dash-card-num">5</span>
            <span className="dash-card-label">Usuarios</span>
          </div>
        )}
        <div className="dash-card">
          <span className="dash-card-num">{user?.proyectos?.length ?? 0}</span>
          <span className="dash-card-label">Proyectos</span>
        </div>
        <div className="dash-card">
          <span className="dash-card-num">0</span>
          <span className="dash-card-label">Plantillas</span>
        </div>
      </div>

      {/* Gráfica de barras */}
      <div className="dash-chart-card">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#718096' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#718096' }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e8eaed', fontSize: 12 }}
              cursor={{ fill: '#f7fafc' }}
            />
            <Legend
              iconType="square"
              iconSize={12}
              wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
              formatter={(value) => LABELS[value] || value}
            />
            {Object.keys(COLORS).map(key => (
              <Bar key={key} dataKey={key} fill={COLORS[key]} radius={[3,3,0,0]} maxBarSize={28} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}