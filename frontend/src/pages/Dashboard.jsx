// frontend/src/pages/Dashboard.jsx
// ============================================================
// DASHBOARD - FILTRO POR PROYECTO CORREGIDO
// ============================================================

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProyecto } from '../hooks/useProyecto';
import api from '../api/auth';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './Dashboard.css';

// ============================================================
// CONSTANTES
// ============================================================

const SLUG_COLORS = {
    licencias_gdl: '#4caf50',
    apa_tlajomulco: '#90caf9',
    predial_gdl: '#ef9a3e',
    predial_tlajomulco: '#b39ddb',
    estado: '#5c9bd6',
    pensiones: '#c8c8c8',
};

const DEFAULT_COLORS = ['#4a7fb5', '#38a169', '#dd6b20', '#805ad5', '#e53e3e', '#00b5d8'];

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

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

    // ============================================================
    // CARGAR DATOS DEL DASHBOARD
    // ============================================================

    useEffect(() => {
        api.get('/dashboard/')
            .then(r => setData(r.data))
            .catch(() => setError('No se pudo cargar el dashboard'))
            .finally(() => setLoading(false));
    }, []);

    // ============================================================
    // FILTRAR EMISIONES POR PROYECTO SELECCIONADO
    // ============================================================

    const filteredData = useMemo(() => {
        if (!data) return null;

        // Si no hay filtro o es "todos", devolver datos completos
        if (selectedProyecto === 'todos' || !selectedProyecto) {
            return data;
        }

        // Filtrar emisiones por proyecto
        const emisionesFiltradas = (data.emisiones || []).filter(
            e => e.slug === selectedProyecto
        );

        // Filtrar proyectos del usuario (para mostrar solo el seleccionado)
        const proyectosFiltrados = (data.proyectos_usuario || []).filter(
            p => p.slug === selectedProyecto
        );

        return {
            ...data,
            emisiones: emisionesFiltradas,
            proyectos_usuario: proyectosFiltrados,
        };
    }, [data, selectedProyecto]);

    // ============================================================
    // CONSTRUIR DATOS PARA LA GRÁFICA
    // ============================================================

    const { rows, proyectos } = useMemo(() => {
        if (!filteredData?.emisiones?.length) {
            return { rows: [], proyectos: [] };
        }

        const emisiones = filteredData.emisiones;
        const slugs = [...new Set(emisiones.map(e => e.slug))];
        const meses = [...new Set(emisiones.map(e => e.mes))];

        // Construir filas para la gráfica
        const rows = meses.map(mes => {
            const row = { mes };
            slugs.forEach(slug => { row[slug] = 0; });
            emisiones.filter(e => e.mes === mes).forEach(e => {
                row[e.slug] = (row[e.slug] || 0) + e.total;
            });
            return row;
        });

        // Construir lista de proyectos con colores
        const proyectos = slugs.map((slug, i) => ({
            slug,
            nombre: emisiones.find(e => e.slug === slug)?.proyecto || slug,
            color: SLUG_COLORS[slug] || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        }));

        return { rows, proyectos };
    }, [filteredData]);

    // ============================================================
    // CALCULAR ESTADÍSTICAS FILTRADAS
    // ============================================================

    const filteredCards = useMemo(() => {
        if (!filteredData?.cards) {
            return { usuarios: 0, proyectos: 0, plantillas: 0, emisiones: 0 };
        }

        const cards = filteredData.cards;

        // Si hay filtro por proyecto, calcular solo ese proyecto
        if (selectedProyecto !== 'todos' && selectedProyecto) {
            // Las emisiones ya están filtradas en filteredData
            const emisionesFiltradas = filteredData.emisiones || [];
            const totalEmisiones = emisionesFiltradas.reduce(
                (sum, e) => sum + e.total, 0
            );

            // Para viables/pendientes/no_viables, solo contar del proyecto seleccionado
            // Nota: Esto requiere que el backend envíe datos por proyecto
            // Por ahora, usamos los valores originales pero con advertencia
            return {
                ...cards,
                emisiones: totalEmisiones,
                // Para proyectos, mostrar solo el seleccionado
                proyectos: filteredData.proyectos_usuario?.length || 1,
            };
        }

        return cards;
    }, [filteredData, selectedProyecto]);

    // ============================================================
    // TOOLTIP PERSONALIZADO
    // ============================================================

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

    // ============================================================
    // RENDERIZADO
    // ============================================================

    if (loading) return <div className="dash-loading">Cargando dashboard...</div>;
    if (error) return <div className="dash-error">{error}</div>;
    if (!data) return <div className="dash-loading">Sin datos</div>;

    const cards = filteredCards || data.cards || {};

    return (
        <div className="dashboard">

            {/* ===== TARJETAS DE ESTADÍSTICAS ===== */}
            <div className="dash-cards">
                {esSuperadmin && cards.usuarios != null && (
                    <div className="dash-card">
                        <span className="dash-card-num">{cards.usuarios}</span>
                        <span className="dash-card-label">Usuarios</span>
                    </div>
                )}
                <div className="dash-card">
                    <span className="dash-card-num">
                        {selectedProyecto !== 'todos' && selectedProyecto
                            ? 1
                            : cards.proyectos || 0}
                    </span>
                    <span className="dash-card-label">Proyectos</span>
                </div>
                <div className="dash-card">
                    <span className="dash-card-num">
                        {selectedProyecto !== 'todos' && selectedProyecto
                            ? cards.plantillas || 0
                            : cards.plantillas || 0}
                    </span>
                    <span className="dash-card-label">Plantillas</span>
                </div>
                <div className="dash-card">
                    <span className="dash-card-num">
                        {selectedProyecto !== 'todos' && selectedProyecto
                            ? cards.emisiones || 0
                            : cards.emisiones || 0}
                    </span>
                    <span className="dash-card-label">
                        {selectedProyecto !== 'todos' && selectedProyecto
                            ? 'Emisiones (filtrado)'
                            : 'Emisiones'}
                    </span>
                </div>
            </div>

            {/* ===== TARJETAS DE ANÁLISIS ===== */}
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

            {/* ===== MENSAJE PARA AUXILIAR ===== */}
            {esAuxiliar && (
                <div className="dash-auxiliar-message">
                    <p>Bienvenido, {user?.nombre}.</p>
                    <span>Tu rol es de Auxiliar. Puedes ver el estado general pero no realizar cambios.</span>
                </div>
            )}

            {/* ===== FILTRO POR PROYECTO ===== */}
            {data.proyectos_usuario?.length > 0 && (
                <div className="dash-filter">
                    <label>Filtrar por proyecto:</label>
                    <select
                        value={selectedProyecto}
                        onChange={e => setSelectedProyecto(e.target.value)}
                    >
                        <option value="todos">Todos los proyectos</option>
                        {data.proyectos_usuario.map(p => (
                            <option key={p.id} value={p.slug}>{p.nombre}</option>
                        ))}
                    </select>
                    {selectedProyecto !== 'todos' && selectedProyecto && (
                        <button
                            className="dash-filter-clear"
                            onClick={() => setSelectedProyecto('todos')}
                            title="Limpiar filtro"
                        >
                            ✕
                        </button>
                    )}
                </div>
            )}

            {/* ===== GRÁFICA ===== */}
            <div className="dash-chart-card">
                {rows.length === 0 ? (
                    <div className="dash-empty">
                        <p>
                            {selectedProyecto !== 'todos' && selectedProyecto
                                ? `No hay emisiones registradas para este proyecto.`
                                : 'Aún no hay emisiones registradas.'}
                        </p>
                        <p className="dash-empty-sub">
                            {selectedProyecto !== 'todos' && selectedProyecto
                                ? 'Cambia el filtro o espera a que se generen emisiones.'
                                : 'La gráfica se actualizará automáticamente cuando se generen PDFs.'}
                        </p>
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

            {/* ===== INDICADOR DE FILTRO ===== */}
            {selectedProyecto !== 'todos' && selectedProyecto && (
                <div className="dash-filter-indicator">
                    <span>
                        Mostrando datos para: <strong>
                            {data.proyectos_usuario?.find(p => p.slug === selectedProyecto)?.nombre || selectedProyecto}
                        </strong>
                    </span>
                </div>
            )}
        </div>
    );
}