// frontend/src/pages/subida_directa/Paso2Mapeo.jsx
import { useState, useMemo, useCallback } from 'react';

/**
 * Paso 2 — Mapeo de columnas del archivo → campos destino en BD.
 *
 * Los destinos son las columnas reales de tabla_temporal del proyecto
 * (mismo esquema que espera el flujo de emisión).
 *
 * Cada columna del archivo se mapea a:
 *   - Un campo destino existente, o
 *   - "__nueva__" (se crea la columna en la tabla ad-hoc con el nombre
 *     normalizado del encabezado), o
 *   - "" (no mapear: se guarda en _extra_json).
 */
export default function Paso2Mapeo({
  proyectoSlug,
  preview,
  mapeoInicial,
  onAtras,
  onSiguiente,
}) {
  const [mapeo, setMapeo] = useState(() => (
    mapeoInicial && typeof mapeoInicial === 'object' && !Array.isArray(mapeoInicial)
      ? mapeoInicial
      : {}
  ));

  const columnasArchivo = Array.isArray(preview?.columnas_archivo)
    ? preview.columnas_archivo
    : [];
  const destinosDisponibles = Array.isArray(preview?.columnas_destino_disponibles)
    ? preview.columnas_destino_disponibles
    : [];

  // ── Cambios de mapeo ────────────────────────────────────────────────────
  const setColumnaDestino = useCallback((colArchivo, destino) => {
    setMapeo((prev) => ({ ...prev, [colArchivo]: destino }));
  }, []);

  // ── Validaciones locales ────────────────────────────────────────────────
  const errores = useMemo(() => {
    const errs = [];
    const usados = {};
    Object.entries(mapeo).forEach(([colArchivo, destino]) => {
      if (!destino || destino === '' || destino === '__nueva__') return;
      if (usados[destino]) {
        errs.push(
          `El campo destino "${destino}" está asignado a más de una columna ` +
          `("${usados[destino]}" y "${colArchivo}").`
        );
      } else {
        usados[destino] = colArchivo;
      }
    });
    return errs;
  }, [mapeo]);

  const faltantes = Array.isArray(preview?.columnas_sin_mapear)
    ? preview.columnas_sin_mapear
    : [];
  const columnasNuevas = Object.entries(mapeo)
    .filter(([, v]) => v === '__nueva__')
    .map(([k]) => k);
  const sinMapear = Object.entries(mapeo)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const puedeSiguiente = errores.length === 0 && columnasArchivo.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="sd-paso sd-paso--2">
      <div className="sd-paso-header">
        <div>
          <h2 className="sd-paso-title">Paso 2 — Mapeo de columnas</h2>
          <p className="sd-paso-sub">
            Asocia cada columna de tu archivo con un campo destino de la
            tabla temporal del proyecto. Las columnas marcadas como{' '}
            <code>__nueva__</code> se crearán con su nombre normalizado; las
            que dejes en blanco se guardarán en un JSON de extras (no se
            renderizan en la plantilla).
          </p>
        </div>
      </div>

      {/* Tabla de mapeo */}
      <div className="sd-mapeo-wrap">
        <table className="sd-mapeo-table">
          <thead>
            <tr>
              <th className="sd-mapeo-th">Columna en archivo</th>
              <th className="sd-mapeo-th">→</th>
              <th className="sd-mapeo-th">Campo destino en BD</th>
              <th className="sd-mapeo-th">Estado</th>
            </tr>
          </thead>
          <tbody>
            {columnasArchivo.map((colArchivo) => {
              const destino = mapeo[colArchivo] || '';
              const esNueva = destino === '__nueva__';
              const esSinMapeo = !destino;
              const esSugerida = preview?.mapeo_propuesto?.[colArchivo] === destino;

              return (
                <tr key={colArchivo} className="sd-mapeo-row">
                  <td className="sd-mapeo-td sd-mapeo-td--archivo">
                    <code>{colArchivo}</code>
                  </td>
                  <td className="sd-mapeo-td sd-mapeo-td--arrow">→</td>
                  <td className="sd-mapeo-td">
                    <select
                      className="sd-select sd-select--wide"
                      value={destino}
                      onChange={(e) => setColumnaDestino(colArchivo, e.target.value)}
                    >
                      <option value="">— No mapear (a _extra_json) —</option>
                      <option value="__nueva__">
                        ➕ Crear como nueva columna
                      </option>
                      {destinosDisponibles.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="sd-mapeo-td sd-mapeo-td--estado">
                    {esNueva && (
                      <span className="sd-map-status sd-map-status--nueva">
                        Nueva columna
                      </span>
                    )}
                    {esSinMapeo && (
                      <span className="sd-map-status sd-map-status--skip">
                        Se guardará en extras
                      </span>
                    )}
                    {!esNueva && !esSinMapeo && esSugerida && (
                      <span className="sd-map-status sd-map-status--auto">
                        ✓ Sugerida
                      </span>
                    )}
                    {!esNueva && !esSinMapeo && !esSugerida && (
                      <span className="sd-map-status sd-map-status--manual">
                        Manual
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Resumen */}
      <div className="sd-mapeo-resumen">
        <div className="sd-resumen-item">
          <strong>{Object.values(mapeo).filter((v) => v && v !== '__nueva__').length}</strong>
          <span>campos mapeados</span>
        </div>
        <div className="sd-resumen-item">
          <strong>{columnasNuevas.length}</strong>
          <span>columnas nuevas</span>
        </div>
        <div className="sd-resumen-item">
          <strong>{sinMapear.length}</strong>
          <span>sin mapear (extras)</span>
        </div>
      </div>

      {/* Advertencias de faltantes */}
      {faltantes.length > 0 && (
        <div className="sd-message sd-message--warn">
          <strong>Advertencia:</strong> el proyecto requiere estos campos que
          no se mapearon: <code>{faltantes.join(', ')}</code>. Algunas filas
          podrían fallar en Cálculos. Puedes mapearlas manualmente arriba.
        </div>
      )}

      {/* Errores de mapeo duplicado */}
      {errores.length > 0 && (
        <div className="sd-message sd-message--error">
          <strong>Corrige antes de continuar:</strong>
          <ul style={{ margin: '6px 0 0 16px' }}>
            {errores.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Footer */}
      <div className="sd-footer">
        <button
          type="button"
          className="sd-btn sd-btn--ghost"
          onClick={onAtras}
        >
          ← Volver al archivo
        </button>
        <button
          type="button"
          className="sd-btn sd-btn--primary"
          onClick={() => onSiguiente(mapeo)}
          disabled={!puedeSiguiente}
        >
          Continuar a confirmación →
        </button>
      </div>
    </div>
  );
}