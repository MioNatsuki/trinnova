# NOTAS - Fase 4: Refactorización de Plantillas

## Fecha de inicio: 2026-07-02

### Estructura de archivos a modificar:
- `backend/app/api/plantillas.py` - Eliminar endpoints .docx
- `backend/app/api/emision.py` - Eliminar completamente
- `backend/app/models/global_models.py` - Modificar modelo
- `backend/app/services/plantilla_renderer.py` - NUEVO
- `frontend/src/pages/plantillas/PlantillasCrear.jsx` - Eliminar
- `frontend/src/pages/plantillas/PlantillasDashboard.jsx` - Modificar
- `frontend/src/components/layout/Sidebar.jsx` - Eliminar ítem
- `frontend/src/App.jsx` - Eliminar ruta

### Plantillas HTML a normalizar:
- [ ] apa_tlajomulco/apa_tlajomulco.html
- [ ] estado/FE_CI_Liquidaciones_DGOS.html
- [ ] estado/FE_CI_Liquidaciones_DNEF.html
- [ ] estado/FEDERAL_estado_requerimiento.html
- [ ] pensiones/afiliados.html
- [ ] pensiones/avales.html
- [ ] pensiones/garantias.html
- [ ] predial_gdl/predial_gdl.html
- [ ] predial_tlajomulco/predial_tlajomulco.html

### Progreso:
- [x] Paso 1: Respaldo y preparación
- [ ] Paso 2: Eliminar código obsoleto
- [ ] Paso 3: Nuevo motor de renderizado
- [ ] Paso 4: Normalizar HTML
- [ ] Paso 5: Actualizar frontend
- [ ] Paso 6: Pruebas