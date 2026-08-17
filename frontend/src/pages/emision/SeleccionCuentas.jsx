// frontend/src/components/emision/SeleccionCuentas.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/auth';
import './SeleccionCuentas.css';

export default function SeleccionCuentas({ 
  proyectoSlug, 
  onSelect, 
  selectedCount = 0 
}) {
  const [loading, setLoading] = useState(false);
  const [cuentas, setCuentas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [filtros, setFiltros] = useState({
    viabilidad: 'viable',
    programa: 'todos',
    busqueda: ''
  });
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  
  const totalPages = Math.ceil(total / limit);
  
  // Cargar cuentas
  const cargarCuentas = useCallback(async () => {
    if (!proyectoSlug) return;
    
    setLoading(true);
    try {
      const params = {
        page,
        limit,
        viabilidad: filtros.viabilidad || undefined,
        programa: filtros.programa !== 'todos' ? filtros.programa : undefined,
        busqueda: filtros.busqueda || undefined,
        sort_col: sortCol || undefined,
        sort_dir: sortDir
      };
      
      const res = await api.get(`/emision/${proyectoSlug}/cuentas`, { params });
      setCuentas(res.data.rows || []);
      setTotal(res.data.total || 0);
    } catch (error) {
      console.error('Error cargando cuentas:', error);
    } finally {
      setLoading(false);
    }
  }, [proyectoSlug, page, limit, filtros, sortCol, sortDir]);
  
  useEffect(() => {
    cargarCuentas();
  }, [cargarCuentas]);
  
  // Manejar selección
  const toggleSeleccion = (pkValue) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(pkValue)) {
      newSelected.delete(pkValue);
    } else {
      newSelected.add(pkValue);
    }
    setSelectedIds(newSelected);
    onSelect(Array.from(newSelected));
  };
  
  const toggleSeleccionTodos = () => {
    if (selectedIds.size === cuentas.length) {
      setSelectedIds(new Set());
      onSelect([]);
    } else {
      const ids = cuentas.map(c => c[cuentas[0]?.pk || 'id']);
      setSelectedIds(new Set(ids));
      onSelect(ids);
    }
  };
  
  // Ordenar
  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };
  
  // Obtener nombre de la PK
  const pk = cuentas.length > 0 ? (cuentas[0].pk || 'id') : 'id';
  
  // Columnas a mostrar
  const columnas = useMemo(() => {
    if (cuentas.length === 0) return [];
    
    const primera = cuentas[0];
    // Columnas importantes para mostrar
    const importantes = ['pk', 'clave_APA', 'cuenta', 'credito', 'prestamo', 'cuenta_n'];
    const nombreCols = ['nombre_razon_social', 'propietario', 'propietario_nombre', 'nombre'];
    const adeudoCols = ['saldo', 'total_adeudo', 'importe_historico_determinado', 'adeudo'];
    
    // Buscar PK
    let pkCol = null;
    for (const col of Object.keys(primera)) {
      if (importantes.includes(col) || col === pk) {
        pkCol = col;
        break;
      }
    }
    
    // Buscar nombre
    let nombreCol = null;
    for (const col of Object.keys(primera)) {
      if (nombreCols.includes(col)) {
        nombreCol = col;
        break;
      }
    }
    
    // Buscar adeudo
    let adeudoCol = null;
    for (const col of Object.keys(primera)) {
      if (adeudoCols.includes(col)) {
        adeudoCol = col;
        break;
      }
    }
    
    // Buscar calle/domicilio
    let calleCol = null;
    for (const col of Object.keys(primera)) {
      if (['domicilio', 'calle', 'ubicacion', 'calle_numero'].includes(col)) {
        calleCol = col;
        break;
      }
    }
    
    const cols = [];
    if (pkCol) cols.push({ key: pkCol, label: 'ID' });
    if (nombreCol) cols.push({ key: nombreCol, label: 'Nombre' });
    if (calleCol) cols.push({ key: calleCol, label: 'Domicilio' });
    if (adeudoCol) cols.push({ key: adeudoCol, label: 'Adeudo' });
    cols.push({ key: 'viabilidad', label: 'Estado' });
    cols.push({ key: 'programa', label: 'Programa' });
    
    return cols;
  }, [cuentas, pk]);
  
  return (
    <div className="seleccion-cuentas">
      <div className="seleccion-header">
        <h3>Selección de Cuentas</h3>
        <div className="seleccion-stats">
          <span>{selectedIds.size} seleccionadas</span>
          <span>•</span>
          <span>{total.toLocaleString()} total</span>
        </div>
      </div>
      
      {/* Filtros */}
      <div className="seleccion-filtros">
        <select 
          value={filtros.viabilidad}
          onChange={e => setFiltros({ ...filtros, viabilidad: e.target.value })}
        >
          <option value="">Todos</option>
          <option value="viable">Viables</option>
          <option value="no_viable">No Viables</option>
          <option value="pendiente">Pendientes</option>
        </select>
        
        <input
          type="text"
          placeholder="Buscar por nombre, ID, dirección..."
          value={filtros.busqueda}
          onChange={e => setFiltros({ ...filtros, busqueda: e.target.value })}
        />
        
        <button 
          className="btn-clear"
          onClick={() => setFiltros({ viabilidad: 'viable', programa: 'todos', busqueda: '' })}
        >
          Limpiar
        </button>
      </div>
      
      {/* Tabla */}
      <div className="seleccion-tabla-wrapper">
        <table className="seleccion-tabla">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input 
                  type="checkbox"
                  checked={cuentas.length > 0 && selectedIds.size === cuentas.length}
                  onChange={toggleSeleccionTodos}
                />
              </th>
              {columnas.map(col => (
                <th 
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{ cursor: 'pointer' }}
                >
                  {col.label}
                  {sortCol === col.key && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnas.length + 1} className="loading-cell">Cargando...</td></tr>
            ) : cuentas.length === 0 ? (
              <tr><td colSpan={columnas.length + 1} className="empty-cell">No hay cuentas</td></tr>
            ) : (
              cuentas.map((cuenta, idx) => {
                const pkValue = cuenta[pk] || cuenta.id || idx;
                const isSelected = selectedIds.has(pkValue);
                
                return (
                  <tr 
                    key={idx}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => toggleSeleccion(pkValue)}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSeleccion(pkValue)}
                      />
                    </td>
                    {columnas.map(col => {
                      let value = cuenta[col.key];
                      if (col.key === 'viabilidad') {
                        const badge = {
                          viable: <span className="badge-viable">✓ Viable</span>,
                          no_viable: <span className="badge-no-viable">✗ No viable</span>,
                          pendiente: <span className="badge-pendiente">⏳ Pendiente</span>
                        };
                        return <td key={col.key}>{badge[value] || value}</td>;
                      }
                      if (typeof value === 'number') {
                        value = value.toLocaleString('es-MX', { 
                          minimumFractionDigits: 2, 
                          maximumFractionDigits: 2 
                        });
                      }
                      return <td key={col.key}>{value || '—'}</td>;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* Paginación */}
      {total > 0 && (
        <div className="seleccion-paginacion">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}