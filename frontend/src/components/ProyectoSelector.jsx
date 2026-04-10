// frontend/src/components/ProyectoSelector.jsx
// Componente reutilizable: selector de proyecto visible cuando el usuario
// tiene más de uno asignado. Se usa en todas las páginas de análisis.

import './ProyectoSelector.css';

export default function ProyectoSelector({ proyectos, value, onChange }) {
  if (!proyectos || proyectos.length === 0) {
    return (
      <div className="ps-warn">
        ⚠️ No tienes proyectos asignados. Contacta al administrador.
      </div>
    );
  }

  // Si solo hay uno ya se seleccionó en el hook — no mostrar selector
  if (proyectos.length === 1) return null;

  return (
    <div className="ps-bar">
      <label className="ps-label">Proyecto:</label>
      <select
        className="ps-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Selecciona un proyecto</option>
        {proyectos.map(p => (
          <option key={p.id} value={p.slug}>
            {p.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
