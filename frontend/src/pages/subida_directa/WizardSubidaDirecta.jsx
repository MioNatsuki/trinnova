// frontend/src/pages/subida_directa/WizardSubidaDirecta.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Paso1Subir from './Paso1Subir';
import Paso2Mapeo from './Paso2Mapeo';
import Paso3Confirmar from './Paso3Confirmar';

/**
 * Wizard de Subida Directa.
 *
 * Estado compartido entre pasos:
 *   - paso: 1 | 2 | 3
 *   - archivo: File seleccionado
 *   - preview: respuesta de /subida-directa/preview
 *   - mapeo: { col_archivo: col_destino }
 *   - resultadoTemporal: respuesta de /subida-directa/crear-temporal
 *
 * El wizard NO guarda en BD hasta el paso 3. En pasos 1 y 2 solo se
 * previsualiza y se confirma el mapeo.
 */
export default function WizardSubidaDirecta({
  proyectoSlug,
  proyectos,
  onChangeProyecto,
}) {
  const navigate = useNavigate();

  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapeo, setMapeo] = useState({});
  const [resultadoTemporal, setResultadoTemporal] = useState(null);

  // ── Handlers ────────────────────────────────────────────────────────────

  const irAPaso2 = ({ file, previewData }) => {
    setArchivo(file);
    setPreview(previewData);
    setMapeo(previewData.mapeo_propuesto || {});
    setPaso(2);
  };

  const irAPaso3 = (mapeoFinal) => {
    setMapeo(mapeoFinal);
    setPaso(3);
  };

  const volverAPaso1 = () => {
    setPaso(1);
    // No limpiamos archivo/preview: si el usuario vuelve, queremos
    // que vea lo que ya había cargado.
  };

  const volverAPaso2 = () => setPaso(2);

  const finalizar = (resultado) => {
    setResultadoTemporal(resultado);
    // Ya se calculó (o no) según el modo elegido. Vamos a Preparación.
    navigate('/emision/preparacion', {
      state: { proyectoSlug, origen: 'subida_directa' },
    });
  };

  const cancelar = () => {
    if (
      archivo &&
      !window.confirm(
        'Si cancelas ahora, se perderá el archivo cargado. ¿Salir de Subida Directa?'
      )
    ) {
      return;
    }
    navigate('/proyectos');
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="sd-wizard">
      {/* Barra de progreso */}
      <div className="sd-steps">
        <StepBadge num={1} label="Subir archivo" active={paso === 1} done={paso > 1} />
        <div className="sd-step-line" />
        <StepBadge num={2} label="Mapear campos" active={paso === 2} done={paso > 2} />
        <div className="sd-step-line" />
        <StepBadge num={3} label="Confirmar" active={paso === 3} done={paso > 3} />
      </div>

      {paso === 1 && (
        <Paso1Subir
          proyectoSlug={proyectoSlug}
          proyectos={proyectos}
          onChangeProyecto={onChangeProyecto}
          archivoInicial={archivo}
          onSiguiente={irAPaso2}
          onCancelar={cancelar}
        />
      )}

      {paso === 2 && (
        <Paso2Mapeo
          proyectoSlug={proyectoSlug}
          preview={preview}
          mapeoInicial={mapeo}
          onAtras={volverAPaso1}
          onSiguiente={irAPaso3}
        />
      )}

      {paso === 3 && (
        <Paso3Confirmar
          proyectoSlug={proyectoSlug}
          archivo={archivo}
          mapeo={mapeo}
          preview={preview}
          onAtras={volverAPaso2}
          onFinalizar={finalizar}
        />
      )}
    </div>
  );
}

function StepBadge({ num, label, active, done }) {
  return (
    <div className={`sd-step ${active ? 'sd-step--active' : ''} ${done ? 'sd-step--done' : ''}`}>
      <div className="sd-step-num">{done ? '✓' : num}</div>
      <span className="sd-step-label">{label}</span>
    </div>
  );
}
