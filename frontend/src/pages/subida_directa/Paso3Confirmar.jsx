// frontend/src/pages/subida_directa/Paso3Confirmar.jsx
import { useState, useMemo, useCallback } from 'react';
import api from '../../api/auth';

/**
 * Paso 3 — Confirmación y creación de la tabla ad-hoc.
 *
 * Acciones:
 *   1. POST /subida-directa/{slug}/crear-temporal  (crea tabla y sube todo)
 *   2. POST /subida-directa/{slug}/limpieza        (si el usuario aplicó
 *                                                    limpieza en el paso 1)
 *   3. Redirige a Cálculos con origen=subida_directa
 */
export default function Paso3Confirmar({
  proyectoSlug,
  archivo,
  mapeo,
  preview,
  onAtras,
  onFinalizar,
}) {
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [aplicarLimpieza, setAplicarLimpieza] = useState(true);
  const [modoElegido, setModoElegido] = useState(null);  // ← NUEVO

  // ── Resumen para mostrar ────────────────────────────────────────────────
  const resumen = useMemo(() => {
    const mapeados = Object.entries(mapeo).filter(
      ([, v]) => v && v !== '__nueva__'
    );
    const nuevas = Object.entries(mapeo).filter(([, v]) => v === '__nueva__');
    const sinMapear = Object.entries(mapeo).filter(([, v]) => !v);

    return {
      totalFilas: preview?.total_filas || 0,
      totalColumnas: preview?.columnas_archivo?.length || 0,
      mapeados,
      nuevas,
      sinMapear,
      faltantes: preview?.columnas_sin_mapear || [],
    };
  }, [mapeo, preview]);

  // ── Crear tabla ad-hoc ──────────────────────────────────────────────────
  const handleConfirmar = useCallback(async (modo) => {
    setCreando(true);
    setError('');
    setModoElegido(modo);

    try {
      const fd = new FormData();
      fd.append('file', archivo);

      const res = await api.post(
        `/${proyectoSlug}/subida-directa/crear-temporal`,
        fd,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: {
            mapeo_json: JSON.stringify(mapeo),
            modo,                    // ← "sin_calcular" | "calcular"
          },
        }
      );

      if (!res.data.success) {
        setError(res.data.advertencia || 'No se pudo crear la tabla temporal.');
        setCreando(false);
        return;
      }

      // 2. Aplicar limpieza si el usuario lo decidió
      if (aplicarLimpieza) {
        try {
          await api.post(
            `/${proyectoSlug}/subida-directa/limpieza`,
            { accion: 'espacios' }
          );
          await api.post(
            `/${proyectoSlug}/subida-directa/limpieza`,
            { accion: 'calles' }
          );
        } catch (e) {
          // No bloquear si falla la limpieza: solo advertir
          console.warn('Limpieza post-creación falló:', e);
        }
      }

      // 3. Finalizar
      onFinalizar(res.data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.message ||
        'Error al crear la tabla temporal.'
      );
      setCreando(false);
    }
  }, [archivo, mapeo, proyectoSlug, aplicarLimpieza, onFinalizar]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="sd-paso sd-paso--3">
      <div className="sd-paso-header">
        <div>
          <h2 className="sd-paso-title">Paso 3 — Confirmar y crear</h2>
          <p className="sd-paso-sub">
            Revisa el resumen. Al confirmar, se creará la tabla ad-hoc
            <code> tabla_temporal_subida_directa </code> en el proyecto y se
            subirán todos los datos del archivo. Después, podrás continuar
            con Cálculos, Preparación y Emisión como en el flujo normal.
          </p>
        </div>
      </div>

      {/* Resumen visual */}
      <div className="sd-resumen-grid">
        <div className="sd-resumen-card">
          <span className="sd-resumen-num">{resumen.totalFilas.toLocaleString()}</span>
          <span className="sd-resumen-label">filas a subir</span>
        </div>
        <div className="sd-resumen-card">
          <span className="sd-resumen-num">{resumen.totalColumnas}</span>
          <span className="sd-resumen-label">columnas en archivo</span>
        </div>
        <div className="sd-resumen-card sd-resumen-card--ok">
          <span className="sd-resumen-num">{resumen.mapeados.length}</span>
          <span className="sd-resumen-label">campos mapeados</span>
        </div>
        <div className="sd-resumen-card sd-resumen-card--accent">
          <span className="sd-resumen-num">{resumen.nuevas.length}</span>
          <span className="sd-resumen-label">columnas nuevas</span>
        </div>
        {resumen.sinMapear.length > 0 && (
          <div className="sd-resumen-card sd-resumen-card--muted">
            <span className="sd-resumen-num">{resumen.sinMapear.length}</span>
            <span className="sd-resumen-label">en extras (JSON)</span>
          </div>
        )}
      </div>

      {/* Listado de mapeo confirmado */}
      <details className="sd-detalle-mapeo">
        <summary>
          Ver mapeo completo ({resumen.mapeados.length + resumen.nuevas.length} campos)
        </summary>
        <div className="sd-detalle-lista">
          {resumen.mapeados.map(([archivo, destino]) => (
            <div key={archivo} className="sd-detalle-row">
              <code>{archivo}</code>
              <span className="sd-detalle-arrow">→</span>
              <code>{destino}</code>
            </div>
          ))}
          {resumen.nuevas.map(([archivo]) => (
            <div key={archivo} className="sd-detalle-row">
              <code>{archivo}</code>
              <span className="sd-detalle-arrow">→</span>
              <span className="sd-detalle-nueva">se creará nueva columna</span>
            </div>
          ))}
          {resumen.sinMapear.map(([archivo]) => (
            <div key={archivo} className="sd-detalle-row sd-detalle-row--muted">
              <code>{archivo}</code>
              <span className="sd-detalle-arrow">→</span>
              <span>se guardará en _extra_json</span>
            </div>
          ))}
        </div>
      </details>

      {/* Faltantes */}
      {resumen.faltantes.length > 0 && (
        <div className="sd-message sd-message--warn">
          <strong>Faltan campos que Cálculos necesita:</strong>{' '}
          <code>{resumen.faltantes.join(', ')}</code>. Las filas que los
          requieran se marcarán como error en Cálculos y podrás corregirlas
          manualmente ahí. ¿Deseas continuar de todas formas?
        </div>
      )}

      {/* Opción de limpieza */}
      <label className="sd-check-line">
        <input
          type="checkbox"
          checked={aplicarLimpieza}
          onChange={(e) => setAplicarLimpieza(e.target.checked)}
        />
        <span>
          Aplicar limpieza automática (espacios + normalización de calles)
          sobre los datos completos después de crear la tabla. Recomendado.
        </span>
      </label>

      {/* Error */}
      {error && (
        <div className="sd-message sd-message--error">{error}</div>
      )}

      {/* Advertencia de reemplazo */}
      <div className="sd-replace-warn">
        ⚠️ Si ya existe una tabla de Subida Directa en este proyecto, será
        reemplazada por completo. La tabla <code>tabla_analisis</code> y el
        resto del flujo normal no se verán afectados.
      </div>

      {/* Footer */}
      <div className="sd-footer sd-footer--triple">
        <button
          type="button"
          className="sd-btn sd-btn--ghost"
          onClick={onAtras}
          disabled={creando}
        >
          ← Volver al mapeo
        </button>

        {/* Explicación de los dos modos */}
        <div className="sd-modos-info">
          <div className="sd-modo-info">
            <span className="sd-modo-info-title">⚡ Continuar sin calcular</span>
            <p className="sd-modo-info-desc">
              Los datos del archivo se copian tal cual a <code>tabla_dinamica</code>.
              Úsalo cuando tu Excel ya trae todos los cálculos hechos (INPC,
              factor, importe en letras, código de barras, etc.).
            </p>
          </div>
          <div className="sd-modo-info">
            <span className="sd-modo-info-title">🧮 Calcular y continuar</span>
            <p className="sd-modo-info-desc">
              Se ejecutan los cálculos (INPC, factor, importe en letras, código de
              barras) sobre los datos del archivo y el resultado se guarda en{' '}
              <code>tabla_dinamica</code>. Úsalo cuando tu Excel solo trae los
              datos base.
            </p>
          </div>
        </div>

        <div className="sd-footer-right">
          <button
            type="button"
            className="sd-btn"
            onClick={() => handleConfirmar('sin_calcular')}
            disabled={creando}
            title="Pobla tabla_dinamica tal cual, sin recalcular nada"
          >
            {creando && modoElegido === 'sin_calcular'
              ? '⏳ Subiendo…'
              : '⚡ Continuar sin calcular'}
          </button>

          <button
            type="button"
            className="sd-btn sd-btn--primary"
            onClick={() => handleConfirmar('calcular')}
            disabled={creando}
            title="Pobla tabla_dinamica ejecutando calcular-todas sobre los datos subidos"
          >
            {creando && modoElegido === 'calcular'
              ? '⏳ Calculando…'
              : '🧮 Calcular y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}