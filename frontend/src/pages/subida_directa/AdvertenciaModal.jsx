// frontend/src/pages/subida_directa/AdvertenciaModal.jsx
import { useState, useEffect } from 'react';

/**
 * Modal de advertencia antes de entrar al wizard de Subida Directa.
 * - Cuenta regresiva de 3 segundos antes de habilitar "Confirmar".
 * - "Cancelar" siempre habilitado.
 */
export default function AdvertenciaModal({ onConfirm, onCancel }) {
  const [segundos, setSegundos] = useState(3);

  useEffect(() => {
    if (segundos <= 0) return;
    const t = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [segundos]);

  const habilitado = segundos <= 0;

  return (
    <div className="sd-warn-overlay">
      <div className="sd-warn-modal">
        <div className="sd-warn-icon">⚠️</div>

        <h2 className="sd-warn-title">
          Antes de continuar…
        </h2>

        <p className="sd-warn-body">
          <strong>La Subida Directa es una vía rápida para emitir</strong> cuando ya
          tienes un archivo listo para impresión y no necesitas pasar por el flujo
          completo de Análisis.
        </p>

        <p className="sd-warn-body">
          Se recomienda usarla <strong>solo como último recurso o cuando tengas prisa</strong>,
          porque omite validaciones del flujo normal. Ten en cuenta:
        </p>

        <ul className="sd-warn-list">
          <li>Los datos que subas se usarán tal cual, sin joins contra padrón.</li>
          <li>Algunos cálculos (INPC, formatos) requieren campos mínimos que podrían faltar.</li>
          <li>Si algo falla, no podrás recuperar el análisis previo del proyecto, tendrás que iniciar de ceros.</li>
        </ul>

        <div className="sd-warn-actions">
          <button
            type="button"
            className="sd-warn-btn"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="sd-warn-btn sd-warn-btn--danger"
            onClick={onConfirm}
            disabled={!habilitado}
            title={
              !habilitado
                ? `Espera ${segundos} segundo(s) para confirmar`
                : 'Entrar a Subida Directa'
            }
          >
            {habilitado
              ? 'Deseo continuar'
              : `Espera ${segundos}s…`}
          </button>
        </div>
      </div>
    </div>
  );
}