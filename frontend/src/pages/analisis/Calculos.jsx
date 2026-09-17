// frontend/src/pages/analisis/Calculos.jsx
// ============================================================
// VERSIÓN CORREGIDA - PK sin comas, fechas formateadas, etc.
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import ProyectoSelector from '../../components/ProyectoSelector';
import './Calculos.css';

// ============================================================
// UTILIDADES DE FORMATEO
// ============================================================

/**
 * Determina si una columna es una llave primaria
 */
const isPrimaryKeyColumn = (colKey, proyectoSlug, pk) => {
    const pkColumns = [
        'pk', 'id',
        'clave_APA', 'clave_apa',
        'cuenta',
        'credito',
        'prestamo',
        'cuenta_n',
        'licencia'
    ];
    
    return pkColumns.includes(colKey) || colKey === pk;
};

/**
 * Determina si una columna es de fecha
 */
const isDateColumn = (colKey) => {
    const dateColumns = [
        'fecha_notificacion', 'fecha_requerimiento', 'fecha_emision',
        'fecha_inpc_a', 'fecha_inpc_b', 'fecha_asignacion',
        'fecha_alta', 'fecha_lectura', 'fecemi',
        'ultimo_abono', 'ultima_aportacion', 'fecha_convenio'
    ];
    return dateColumns.includes(colKey);
};

/**
 * Formatea un valor de fecha
 */
const formatDate = (value) => {
    if (!value) return null;
    
    // Si ya es un objeto Date
    if (value instanceof Date) {
        return value.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }
    
    // Si es string con formato ISO
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        }
    }
    
    // Si es string con formato dd/mm/yyyy
    if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(value)) {
        const parts = value.split('/');
        const date = new Date(parts[2], parts[1] - 1, parts[0]);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        }
    }
    
    return value;
};

/**
 * Formatea un número
 */
const formatNumber = (value, decimals = 2) => {
    if (typeof value !== 'number') return value;
    
    if (Number.isInteger(value)) {
        return value.toLocaleString('es-MX');
    }
    
    return value.toLocaleString('es-MX', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

// ============================================================
// COMPONENTE DE CELDA CON FORMATEO
// ============================================================

const TableCell = ({ col, row, pk, proyectoSlug }) => {
    const value = row[col.key];
    
    // PK - Sin formato de miles
    if (isPrimaryKeyColumn(col.key, proyectoSlug, pk)) {
        return <td key={col.key} className="col-pk">{value ?? '—'}</td>;
    }

    if (col.key === 'sub_estatus_id' && value) {
        const isCJ = value === 'CJ';
        const isCE = value === 'CE';
        let label = value;
        let className = 'col-sub-estatus';
        
        if (isCJ) {
            className += ' cj';
            label = '⚖️ CJ - Judicial';
        } else if (isCE) {
            className += ' ce';
            label = '📄 CE - Extrajudicial';
        }
        
        return (
            <td key={col.key} className={className}>
                {label}
            </td>
        );
    }
    
    // ============================================================
    // NUEVO: ÚLTIMO ABONO MODIFICADO (PENSIONES)
    // ============================================================
        if (col.key === 'ultimo_abono_modificado') {
            if (!value) {
                return (
                    <td key={col.key} className="col-ultimo-abono">
                        <span className="fecha-null">— ( &gt; 5 años )</span>
                    </td>
                );
            }
            // Formatear fecha
            const formatted = formatDate(value);
            return (
                <td key={col.key} className="col-ultimo-abono">
                    <span className="fecha-valida">{formatted}</span>
                </td>
            );
        }
    
    // Código de barras
    if (col.key === 'codebar' && value) {
        return (
            <td key={col.key} className="col-codebar">
                <span style={{ 
                    fontFamily: 'IDAutomationHC39M, monospace',
                    fontSize: '11px',
                    letterSpacing: '1px'
                }}>
                    {value}
                </span>
            </td>
        );
    }
    
    // Importe en letras
    if (col.key === 'importe_letra' && value) {
        const display = value.length > 50 ? value.substring(0, 50) + '...' : value;
        return (
            <td key={col.key} className="col-letra" title={value}>
                {display}
            </td>
        );
    }
    
    // Fechas
    if (isDateColumn(col.key)) {
        const formatted = formatDate(value);
        return <td key={col.key} className="col-fecha">{formatted ?? '—'}</td>;
    }
    
    // Números (no PK) - con formato de miles
    if (typeof value === 'number') {
        const decimals = Number.isInteger(value) ? 0 : 2;
        const formatted = formatNumber(value, decimals);
        const isMonto = col.isMonto || false;
        return (
            <td key={col.key} className={isMonto ? 'col-monto' : 'col-numero'}>
                {formatted}
            </td>
        );
    }
    
    // Valor por defecto (strings, etc.)
    return <td key={col.key}>{value ?? '—'}</td>;
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function Calculos() {
    const location = useLocation();
    const { proyectoSlug, setProyectoSlug, proyectos } = useProyecto();
    const [loading, setLoading] = useState(false);
    const [calculando, setCalculando] = useState(false);
    const [data, setData] = useState({ rows: [], total: 0, pk: null });
    const [inpcInfo, setInpcInfo] = useState(null);
    const [sincronizando, setSincronizando] = useState(false);
    const [message, setMessage] = useState(null);
    
    // Paginación
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [totalRegistros, setTotalRegistros] = useState(0);
    
    // Catálogos
    const [documentos, setDocumentos] = useState([]);
    const [notificadores, setNotificadores] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState('');
    const [selectedNotif, setSelectedNotif] = useState('');
    const [modoInpc, setModoInpc] = useState('actual');
    
    const esEstado = proyectoSlug === 'estado';
    
    const [filtros, setFiltros] = useState({
        fecha_emision: new Date().toISOString().split('T')[0],
        visita: '',
        pmo: '',
    });

    useEffect(() => {
        const state = location.state;
        if (state?.proyectoSlug) {
            setProyectoSlug(state.proyectoSlug);
        }
    }, [location.state, setProyectoSlug]);
    // ============================================================
    // FUNCIONES AUXILIARES
    // ============================================================

    const calcularFechaAnterior = () => {
        const fecha = filtros.fecha_emision 
            ? new Date(filtros.fecha_emision) 
            : new Date();
        const fechaAnterior = new Date(fecha.getFullYear(), fecha.getMonth() - 1, 1);
        return fechaAnterior.toISOString().split('T')[0];
    };

    const showMessage = (type, text) => {
        setMessage({ type, text });
        setTimeout(() => setMessage(null), 5000);
    };

    // ============================================================
    // CARGAR DATOS
    // ============================================================

    const loadData = useCallback(async () => {
        if (!proyectoSlug) return;
        setLoading(true);
        try {
            const res = await api.get(`/analisis/${proyectoSlug}/analisis`, {
                params: { 
                    page: page, 
                    limit: limit
                }
            });
            setData(res.data);
            setTotalRegistros(res.data.total || 0);
        } catch (err) {
            console.error('Error cargando datos:', err);
            showMessage('error', err.response?.data?.detail || 'Error cargando datos');
        } finally {
            setLoading(false);
        }
    }, [proyectoSlug, page, limit]);

    const loadTablaDinamica = useCallback(async () => {
        if (!proyectoSlug) return;
        try {
            const res = await api.get(`/calculos/${proyectoSlug}/tabla-dinamica`, {
                params: { page: 1, limit: 100 }
            });
            if (res.data.rows && res.data.rows.length > 0) {
                setData(prev => ({
                    ...prev,
                    rows: res.data.rows,
                    total: res.data.total
                }));
                setTotalRegistros(res.data.total || 0);
            }
        } catch (err) {
            console.error('Error cargando tabla_dinamica:', err);
        }
    }, [proyectoSlug]);

    const loadUltimoInpc = useCallback(async () => {
        if (!esEstado) {
            setInpcInfo(null);
            return;
        }
        try {
            const res = await api.get('/calculos/inpc/ultimo');
            if (res.data.success) {
                setInpcInfo({
                    periodo: res.data.data.periodo,
                    valor: res.data.data.valor,
                    periodo_anterior: res.data.anterior?.periodo,
                    valor_anterior: res.data.anterior?.valor
                });
            } else {
                setInpcInfo(null);
            }
        } catch (err) {
            console.error('Error cargando INPC:', err);
            setInpcInfo(null);
        }
    }, [esEstado]);

    const loadCatalogos = useCallback(async () => {
        if (!proyectoSlug) return;
        try {
            const [docRes, notifRes] = await Promise.all([
                api.get(`/calculos/${proyectoSlug}/catalogo/documentos`),
                api.get(`/calculos/${proyectoSlug}/catalogo/notificadores`),
            ]);
            setDocumentos(docRes.data || []);
            setNotificadores(notifRes.data || []);
        } catch (err) {
            console.error('Error cargando catálogos:', err);
        }
    }, [proyectoSlug]);

    // ============================================================
    // ACCIONES
    // ============================================================

    const handleSyncInpc = async () => {
        if (!esEstado) {
            showMessage('error', 'El botón de INPC solo está disponible para el proyecto Estado');
            return;
        }
        
        if (!window.confirm('¿Sincronizar datos del INPC desde el INEGI?\nEsto puede tomar varios segundos.')) return;
        
        setSincronizando(true);
        setMessage(null);
        try {
            const res = await api.post('/calculos/inpc/sincronizar', null, {
                params: { historico: true }
            });
            if (res.data.success) {
                showMessage('success', `${res.data.mensaje}`);
                await loadUltimoInpc();
            } else {
                showMessage('error', res.data.mensaje || 'Error al sincronizar');
            }
        } catch (err) {
            showMessage('error', err.response?.data?.detail || 'Error al sincronizar INPC');
        } finally {
            setSincronizando(false);
        }
    };

    const calcularTodas = async () => {
        if (totalRegistros === 0) {
            showMessage('error', 'No hay datos para calcular');
            return;
        }
        
        const modoTexto = modoInpc === 'actual' ? 'Actual' : 'Anterior';
        const fechaTexto = filtros.fecha_emision || new Date().toISOString().split('T')[0];
        const fechaAnterior = calcularFechaAnterior();
        const docNombre = documentos.find(d => d.id === parseInt(selectedDoc))?.nombre || 'No seleccionado';
        const notifNombre = notificadores.find(n => n.id === parseInt(selectedNotif))?.nombre || 'No seleccionado';
        const identDoc = documentos.find(d => d.id === parseInt(selectedDoc))?.identificador || '';
        
        const fechaMostrar = modoInpc === 'anterior' ? fechaAnterior : fechaTexto;
        
        if (!window.confirm(
            `CALCULAR TODAS LAS FILAS\n\n` +
            `Fecha de emisión: ${fechaTexto}\n` +
            `Modo INPC: ${modoTexto} (${fechaMostrar})\n` +
            `${modoInpc === 'anterior' ? 'Usa el INPC del mes anterior\n' : ''}` +
            `Documento: ${docNombre} ${identDoc ? `(${identDoc})` : ''}\n` +
            `Notificador: ${notifNombre}\n\n` +
            `Total: ${totalRegistros.toLocaleString()} registros\n\n` +
            `¿Continuar?`
        )) return;
        
        setCalculando(true);
        setMessage(null);
        
        try {
            const params = {
                fecha_emision: filtros.fecha_emision || new Date().toISOString().split('T')[0],
                visita: filtros.visita || '',
                pmo: filtros.pmo || '',
                modo_inpc: modoInpc,
            };
            
            if (selectedDoc) params.id_documento = parseInt(selectedDoc);
            if (selectedNotif) params.id_notificador = parseInt(selectedNotif);
            
            const res = await api.post(`/analisis/${proyectoSlug}/calcular-todas`, null, { params });
            
            if (res.data.success) {
                showMessage('success', `${res.data.mensaje}`);
                await loadData();
                await loadTablaDinamica();
            } else {
                showMessage('error', res.data.error || 'Error al calcular');
            }
        } catch (err) {
            console.error('Error al calcular todas:', err);
            showMessage('error', err.response?.data?.detail || 'Error al calcular todas las filas');
        } finally {
            setCalculando(false);
        }
    };

    // ============================================================
    // EFECTOS
    // ============================================================

    useEffect(() => {
        if (proyectoSlug) {
            loadData();
            loadUltimoInpc();
            loadCatalogos();
            loadTablaDinamica();
        }
    }, [proyectoSlug, page, limit, loadData, loadUltimoInpc, loadCatalogos, loadTablaDinamica]);

    // ============================================================
    // DEFINICIÓN DE COLUMNAS
    // ============================================================

    const renderColumnas = useMemo(() => {
        const pkMap = {
            'apa_tlajomulco': 'clave_APA',
            'predial_tlajomulco': 'cuenta',
            'licencias_gdl': 'licencia',
            'predial_gdl': 'cuenta_n',
            'estado': 'credito',
            'pensiones': 'prestamo',
        };
        const pk = pkMap[proyectoSlug] || data.pk || 'id';

        // Proyecto Estado
        if (proyectoSlug === 'estado') {
            return [
                { key: 'credito', label: 'Crédito', isPk: true },
                { key: 'nombre_razon_social', label: 'Nombre' },
                { key: 'importe_historico_determinado', label: 'Importe Histórico', isMonto: true },
                { key: 'fecha_notificacion', label: 'Fecha Notificación' },
                { key: 'fecha_requerimiento', label: 'Fecha Requerimiento' },
                { key: 'proximo_inpc', label: 'Próximo INPC' },
                { key: 'inpc_notificacion', label: 'INPC Notificación' },
                { key: 'inpc_requerimiento', label: 'INPC Requerimiento' },
                { key: 'factor_actualizacion', label: 'Factor' },
                { key: 'importe_actualizacion', label: 'Actualización', isMonto: true },
                { key: 'total_multa_actualizada', label: 'Total Actualizado', isMonto: true },
                { key: 'importe_letra', label: 'Importe en Letra' },
                { key: 'codebar', label: 'Código de Barras' },
            ];
        }
        
        // APA Tlajomulco
        if (proyectoSlug === 'apa_tlajomulco') {
            return [
                { key: 'clave_APA', label: 'Clave APA', isPk: true },
                { key: 'propietario_nombre', label: 'Propietario' },
                { key: 'total_adeudo', label: 'Total Adeudo', isMonto: true },
                { key: 'domicilio', label: 'Domicilio' },
                { key: 'firma', label: 'Firma' },
                { key: 'codebar', label: 'Código de Barras' },
            ];
        }
        
        // Predial GDL
        if (proyectoSlug === 'predial_gdl') {
            return [
                { key: 'cuenta_n', label: 'Cuenta', isPk: true },
                { key: 'propietario', label: 'Propietario' },
                { key: 'saldo', label: 'Saldo', isMonto: true },
                { key: 'codebar', label: 'Código de Barras' },
            ];
        }
        
        // Predial Tlajomulco
        if (proyectoSlug === 'predial_tlajomulco') {
            return [
                { key: 'cuenta', label: 'Cuenta', isPk: true },
                { key: 'propietario', label: 'Propietario' },
                { key: 'saldo', label: 'Saldo', isMonto: true },
                { key: 'codebar', label: 'Código de Barras' },
            ];
        }
        
        // Pensiones
        if (proyectoSlug === 'pensiones') {
            return [
                { key: 'prestamo', label: 'Préstamo', isPk: true },
                { key: 'nombre', label: 'Nombre' },
                { key: 'adeudo', label: 'Adeudo', isMonto: true },
                // ============================================================
                // NUEVAS COLUMNAS PARA PENSIONES
                // ============================================================
                { key: 'ultimo_abono_modificado', label: 'Último Abono Modificado' },
                { key: 'sub_estatus_id', label: 'Sub-Estatus' },
                { key: 'codebar', label: 'Código de Barras' },
            ];
        }
        
        // Proyectos genéricos
        return [
            { key: pk, label: 'ID', isPk: true },
            { key: 'nombre', label: 'Nombre' },
            { key: 'saldo', label: 'Saldo', isMonto: true },
            { key: 'codebar', label: 'Código de Barras' },
        ];
    }, [proyectoSlug, data.pk]);

    // Calcular total de páginas
    const totalPages = Math.max(1, Math.ceil(totalRegistros / limit));

    // ============================================================
    // RENDERIZADO
    // ============================================================

    return (
        <div className="calculos-page">
            {/* ===== HEADER ===== */}
            <div className="calculos-header">
                <div className="calculos-title-row">
                    <h1>Cálculos</h1>
                    <div className="calculos-actions">
                        {esEstado && (
                            <button 
                                className="btn-sync-inpc"
                                onClick={handleSyncInpc}
                                disabled={sincronizando}
                            >
                                {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar INPC'}
                            </button>
                        )}
                        <button 
                            className="btn-calc-all"
                            onClick={calcularTodas}
                            disabled={calculando || totalRegistros === 0}
                        >
                            {calculando ? '⏳ Calculando...' : 'Calcular Todas'}
                        </button>
                    </div>
                </div>

                {esEstado && inpcInfo && (
                    <div className="inpc-banner">
                        <span className="inpc-label">INPC más reciente:</span>
                        <span className="inpc-value">{inpcInfo.periodo} = {inpcInfo.valor}</span>
                    </div>
                )}
                {esEstado && !inpcInfo && (
                    <div className="inpc-banner inpc-warning">
                        <span>No hay datos de INPC. Sincroniza primero con el botón "Sincronizar INPC"</span>
                    </div>
                )}
            </div>

            {/* ===== FILTROS ===== */}
            <div className="calculos-filtros">
                <ProyectoSelector 
                    proyectos={proyectos} 
                    value={proyectoSlug} 
                    onChange={setProyectoSlug} 
                />
                
                <div className="filtros-grid">
                    {/* FECHA EMISIÓN */}
                    <div className="filtro-group">
                        <label>Fecha Emisión:</label>
                        <input 
                            type="date" 
                            className="filtro-input"
                            value={filtros.fecha_emision}
                            onChange={e => setFiltros(prev => ({...prev, fecha_emision: e.target.value}))}
                        />
                    </div>
                    
                    {/* VISITA */}
                    <div className="filtro-group">
                        <label>Visita:</label>
                        <input 
                            type="text" 
                            className="filtro-input"
                            value={filtros.visita}
                            onChange={e => setFiltros(prev => ({...prev, visita: e.target.value.toUpperCase()}))}
                            placeholder="Última visita"
                            maxLength={10}
                        />
                    </div>
                    
                    {/* PMO */}
                    <div className="filtro-group">
                        <label>PMO:</label>
                        <input 
                            type="text" 
                            className="filtro-input"
                            value={filtros.pmo}
                            onChange={e => setFiltros(prev => ({...prev, pmo: e.target.value.toUpperCase()}))}
                            placeholder="Último PMO"
                            maxLength={10}
                        />
                    </div>
                    
                    {/* DOCUMENTOS */}
                    <div className="filtro-group">
                        <label>Documento:</label>
                        <select 
                            className="filtro-select"
                            value={selectedDoc}
                            onChange={e => setSelectedDoc(e.target.value)}
                        >
                            <option value="">Sin documento</option>
                            {documentos.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.nombre} {d.identificador ? `(${d.identificador})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* NOTIFICADORES */}
                    <div className="filtro-group">
                        <label>Notificador:</label>
                        <select 
                            className="filtro-select"
                            value={selectedNotif}
                            onChange={e => setSelectedNotif(e.target.value)}
                        >
                            <option value="">Sin notificador</option>
                            {notificadores.map(n => (
                                <option key={n.id} value={n.id}>
                                    {n.nombre} {n.acronimo ? `(${n.acronimo})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* MODO INPC */}
                    {esEstado && (
                        <div className="filtro-group">
                            <label>INPC para fecha de emisión:</label>
                            <select 
                                className="filtro-select"
                                value={modoInpc}
                                onChange={e => setModoInpc(e.target.value)}
                            >
                                <option value="actual">
                                    Actual ({inpcInfo?.periodo || 'sin datos'})
                                </option>
                                <option value="anterior">
                                    Anterior ({inpcInfo?.periodo_anterior || 'sin datos'})
                                </option>
                            </select>
                            {modoInpc === 'anterior' && (
                                <span style={{ fontSize: 11, color: '#c05621', marginTop: 4, display: 'block' }}>
                                    Usa el INPC del mes anterior
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ===== MENSAJES ===== */}
            {message && (
                <div className={`calculos-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* ===== TABLA ===== */}
            {loading ? (
                <div className="calculos-loading">Cargando datos...</div>
            ) : (
                <>
                    <div className="calculos-table-wrapper">
                        <table className="calculos-table">
                            <thead>
                                <tr>
                                    {renderColumnas.map(col => (
                                        <th key={col.key}>{col.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={renderColumnas.length} className="calculos-empty">
                                            {proyectoSlug 
                                                ? 'No hay datos en la tabla de análisis. Genera el análisis primero.'
                                                : 'Selecciona un proyecto para ver los datos.'}
                                        </td>
                                    </tr>
                                ) : (
                                    data.rows.map((row, idx) => {
                                        return (
                                            <tr key={idx}>
                                                {renderColumnas.map(col => (
                                                    <TableCell 
                                                        key={col.key}
                                                        col={col}
                                                        row={row}
                                                        pk={data.pk}
                                                        proyectoSlug={proyectoSlug}
                                                    />
                                                ))}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ===== PAGINACIÓN ===== */}
                    {totalRegistros > 0 && (
                        <div className="calculos-pagination">
                            <button 
                                onClick={() => setPage(p => Math.max(1, p - 1))} 
                                disabled={page === 1}
                            >
                                ← Anterior
                            </button>
                            <span>Página {page} de {totalPages}</span>
                            <select
                                value={limit}
                                onChange={e => { 
                                    setLimit(Number(e.target.value)); 
                                    setPage(1); 
                                }}
                                className="calculos-page-size"
                            >
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={200}>200</option>
                            </select>
                            <button 
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                                disabled={page >= totalPages}
                            >
                                Siguiente →
                            </button>
                            <span className="calculos-total-registros">
                                Total: {totalRegistros.toLocaleString()} registro{totalRegistros !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}