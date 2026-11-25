README — Trinnova
Objetivo
Trinnova es un sistema web para la gestión y emisión masiva de documentos fiscales (créditos fiscales, requerimientos de pago, determinaciones, notificaciones, etc.). Reemplaza un proceso legacy basado en Visual Basic + Word por una solución moderna, concurrente y escalable.

El sistema genera PDFs masivos (hasta 10,000+ por lote), soporta múltiples usuarios simultáneos, permite recuperación automática mediante checkpoints, y elimina la dependencia de Word usando Playwright + Chromium.

Arquitectura general
text
trinnova/
├── backend/
│   ├── app/
│   │   ├── api/              Endpoints FastAPI (auth, usuarios, proyectos, analisis, calculos, emision, catalogos, logs, plantillas, subida_directa)
│   │   ├── core/             Configuración, dependencias, Redis, seguridad JWT
│   │   ├── db/               Sesiones SQLAlchemy y router de BDs por proyecto
│   │   ├── models/           Modelos globales de BD
│   │   ├── plantillas_html/  Plantillas HTML por proyecto
│   │   ├── schemas/          Schemas Pydantic
│   │   ├── scripts/          Scripts de utilidad (sync INPC, migraciones)
│   │   ├── services/         Servicios de negocio (codebar, emisión, INPC, formatos, número a letras, renderer)
│   │   └── utils/            Helpers por proyecto
│   └── Workers/
│       ├── worker_service.py     Worker asíncrono principal
│       ├── worker_config.json    Configuración del worker
│       └── api_client.py         Cliente HTTP del worker
├── frontend/
│   └── src/
│       ├── api/              Cliente Axios
│       ├── components/       Componentes reutilizables (layout, auth, selector de proyecto)
│       ├── context/          Contextos React (auth, navigation guard)
│       ├── hooks/            Hooks personalizados (useProyecto)
│       └── pages/            Páginas (dashboard, proyectos, análisis, cálculos, plantillas, emisión, subida directa, catálogos, usuarios)
├── Emisiones/                PDFs generados
├── Logs/                     Logs del sistema
└── Temp/                     Archivos temporales

Flujo general del sistema (flujo normal)
El sistema procesa documentos a través de un pipeline de tablas por proyecto. Cada proyecto tiene su propia base de datos y su propio conjunto de plantillas HTML.

Tabla	Función
tabla_padron	Carga inicial desde CSV o Excel. Base de todo el flujo.
tabla_complementaria	Complementa información de forma individual o masiva (CSV). Join de padrón con complementaria.
tabla_analisis	Reacomoda detalles. Join de padrón + complementaria + análisis. Marca viabilidad, pagada, no deudor.
tabla_pagos	Se llena desde tabla_analisis (estatus de pago, fecha, monto, observaciones).
tabla_captura	Llenado manual o externo. Relación 1:N con pk_cuenta.
tabla_programas	Catálogo ligero de programas (distinct de programa desde análisis o padrón).
tabla_dinamica	Se llena en Cálculos: codebar, INPC, factor de actualización, importe en letras, último abono modificado, sub estatus.
tabla_temporal	Efímera. Se llena en Preparación con el join de análisis + dinámica + padrón. Se vacía al terminar la emisión.
tabla_historica	Recibe el contenido de tabla_temporal al finalizar. Solo inserts, nunca updates ni deletes. Auditoría pura.
tabla_historica_especiales	Reimpresiones y emisiones especiales de documentos ya emitidos.

Reglas de mantenimiento
Upsert en tabla_padron, tabla_complementaria, tabla_analisis, tabla_pagos y tabla_dinamica.
tabla_temporal se llena y se vacía en cada ejecución.
tabla_historica es append-only.
tabla_historica_especiales para reimpresiones.

Módulos principales
Autenticación
Login con JWT. Roles: superadmin, analista, auxiliar. Cada usuario tiene acceso a uno o más proyectos.

Proyectos
Cada proyecto tiene su propia base de datos y conjunto de plantillas. Se accede desde el dashboard de proyectos o el sidebar.

Análisis (flujo normal)
Cargar Padrón: sube CSV/Excel, mapea columnas al esquema del proyecto, hace upsert.
Complementar: edición individual o carga masiva CSV para tabla_complementaria.
Limpieza y Análisis: normalización de calles, limpieza de espacios, acciones manuales (viable/no viable/pagada/ND), edición inline, carga CSV de viabilidad/pagos.
Cálculos: cálculo de INPC, factor de actualización, importe actualizado, codebar, importe en letras. Llena tabla_dinamica.

Plantillas
Gestión de plantillas HTML por proyecto. Mapeo de placeholders a columnas de BD. Vista previa de PDF con datos de ejemplo.

Emisión
Preparación: carga CSV/Excel con cuentas, orden de impresión y observaciones. Hace joins con 
tabla_dinamica
 y tabla_analisis. Llena tabla_temporal.

Emisión: creación de jobs, encolado en Redis, monitoreo de progreso, historial de emisiones.

Emisión Especial: reimpresión de documentos ya emitidos por codebar o cuenta.

Subida Directa (módulo nuevo)
Vía rápida para emitir desde un archivo ya listo, omitiendo Análisis (padrón → complementaria → análisis).

Flujo del usuario:
Modal de advertencia (3 segundos para confirmar).
Wizard de 3 pasos:
Paso 1 — Subir archivo: upload del Excel/CSV, preview editable con warnings (RFC, fechas, teléfonos, codificación), botones de limpieza (Espacios, Calles), guardado en memoria.
Paso 2 — Mapeo: cada columna del archivo → campo destino de tabla_temporal (o __nueva__, o sin mapear a _extra_json).
Paso 3 — Confirmar: dos opciones:

Continuar sin calcular: los datos se copian tal cual a tabla_dinamica.

Calcular y continuar: se ejecuta calcular-todas sobre los datos y el resultado se guarda en tabla_dinamica.

Redirige a Preparación con las cuentas ya preseleccionadas.

Tabla ad-hoc: tabla_temporal_subida_directa (una por proyecto, se dropea y recrea en cada subida). Convive con el flujo normal: tabla_dinamica, tabla_temporal y tabla_historica siguen siendo compartidas. Solo cambia el origen de lectura, parametrizado por origen=analisis|subida_directa.

Campos adicionales:
_fila_origen en tabla_temporal (migración incluida) para detectar el origen.
_extra_json en la tabla ad-hoc para columnas no mapeadas.
Normalización automática: pmo ("PMO 19" → "19"), visita ("N20" → "20"), teléfonos numéricos a string sin notación científica, tipos respetados desde tabla_temporal.

Catálogos
Documentos, notificadores y zonas por proyecto.

Bitácora
Registro de actividad del sistema (solo superadmin).

Usuarios
Gestión de usuarios y asignación de proyectos (solo superadmin).

Workers
Los workers son procesos asíncronos que corren en el servidor local de emisión.
Se registran contra el backend con un secreto.
Toman jobs de Redis.
Generan PDFs con Playwright + Chromium.
Actualizan progreso y checkpoints.
Una sola instancia de Chromium por proceso.
Los PDFs se guardan directamente en carpetas organizadas.

Estructura de salida:
Emisiones/{proyecto}/{anio}/{mes}/job_{id}/{orden} - {codebar}.pdf
Ejemplo:
0014 - 987445234N3AF.pdf

Código de barras
Formato general:
*{cuenta}{fecha_excel}{documento}{visita}*
Ejemplo:
*1234546308N1*
Pensiones agrega sufijo antes del asterisco final:
Plantilla	Sufijo
Afiliado	AF
Aval	AV
Garantía	GA
La fecha utilizada es el número de serie de Excel (días desde 1899-12-30).

Reglas:
tabla_dinamica guarda el codebar sin sufijo de pensiones.
El worker detecta el sufijo según la plantilla del job y reconstruye el codebar completo.
El worker actualiza tabla_temporal con el codebar final antes del traspaso.
tabla_historica hereda el codebar final.

Formatos
Fechas:
Pensiones: 02/Octubre/2026
Estado: formato largo en español
Resto: 02/10/2026
Montos: moneda mexicana con signo de pesos, comas de miles y dos decimales: $708,234.79.
Valores nulos o vacíos: se reemplazan por un guion - al renderizar.

Tecnologías
Backend
Python 3.11+
FastAPI
SQLAlchemy 2.0+
MySQL 8.0+ / MariaDB
Redis (Memurai en Windows)
Playwright 1.40+
httpx
pydantic 2.5+

Frontend
React 19+
Vite 8+
Recharts
Axios
React Router 7+

Workers
Python asíncrono
httpx
Playwright con Chromium
SQLAlchemy

Proyectos soportados
Proyecto	Slug	Descripción
APA Tlajomulco	apa_tlajomulco	Derechos por uso de agua potable
Predial Tlajomulco	predial_tlajomulco	Impuesto predial
Licencias GDL	licencias_gdl	Licencias municipales
Predial GDL	predial_gdl	Impuesto predial
Estado	estado	Créditos fiscales estatales
Pensiones	pensiones	Préstamos y pensiones

Requisitos previos
Python 3.11 o superior
Node.js 18 o superior
MySQL 8.0 o superior / MariaDB
Memurai (Redis para Windows) o Redis nativo en Linux
Git

Instalación básica
Clonar el repositorio.
Crear y configurar backend/.env con las credenciales de MySQL, Redis, rutas de emisión y secreto de workers.
Crear las bases de datos global y por proyecto en MySQL.
Instalar dependencias del backend: pip install -r backend/requirements.txt.
Instalar Chromium para Playwright: playwright install chromium.
Instalar dependencias del frontend: npm install dentro de frontend/.
Configurar frontend/.env con la URL del backend.
Iniciar Redis y MySQL.
Iniciar el backend: uvicorn app.main:app --reload.
Iniciar el frontend: npm run dev.
Iniciar el worker: python worker_service.py worker_1.

Migraciones puntuales:
bash
python -m app.scripts.migrar_fila_origen     # agrega _fila_origen a tabla_temporal
python -m app.scripts.sincronizar_inpc       # sincroniza INPC desde INEGI

Operación diaria
Iniciar MySQL.
Iniciar Redis (Memurai en Windows).
Iniciar el backend.
Iniciar el frontend.
Iniciar uno o más workers.
Acceder al frontend, iniciar sesión y seleccionar un proyecto.
Ejecutar el flujo normal (padrón → complementar → análisis → cálculos → preparación → emisión) o usar Subida Directa para un flujo express.

Endpoints clave
Autenticación
POST /api/v1/auth/login
GET /api/v1/auth/me
POST /api/v1/auth/logout

Análisis
POST /api/v1/analisis/{slug}/cargar-padron
POST /api/v1/analisis/{slug}/cargar-complemento-csv
POST /api/v1/analisis/{slug}/generar-analisis
POST /api/v1/analisis/{slug}/calcular-todas?origen=analisis|subida_directa
GET /api/v1/analisis/{slug}/analisis
GET /api/v1/analisis/{slug}/estadisticas

Cálculos
POST
/api/v1/calculos/inpc/sincronizar
GET /api/v1/calculos/inpc/ultimo
GET /api/v1/calculos/{slug}/tabla-dinamica

Emisión
GET /api/v1/emision/{slug}/preparacion?origen=analisis|subida_directa
POST /api/v1/emision/{slug}/preparar-tabla-temporal (acepta origen)
POST /api/v1/emision/{slug}/preparar (crea el EmisionJob)
GET /api/v1/emision/jobs/{id}/estado
POST /api/v1/emision/jobs/{id}/cancelar

Emisión Especial
GET /api/v1/emision/{slug}/emision-especial/buscar?q=...
POST /api/v1/emision/{slug}/emision-especial/preparar

Subida Directa
POST /api/v1/{slug}/subida-directa/preview
POST /api/v1/{slug}/subida-directa/crear-temporal?mapeo_json=...&modo=sin_calcular|calcular
GET /api/v1/{slug}/subida-directa/tabla
POST /api/v1/{slug}/subida-directa/actualizar
POST /api/v1/{slug}/subida-directa/limpieza
GET /api/v1/{slug}/subida-directa/ids
GET /api/v1/{slug}/subida-directa/estadisticas

Workers
POST /api/v1/emision/workers/register
GET /api/v1/emision/workers/pending?worker_id=...
POST /api/v1/emision/workers/claim
POST /api/v1/emision/workers/{worker_id}/progress/{job_id}
POST /api/v1/emision/workers/{worker_id}/upload/{job_id}
POST /api/v1/emision/workers/heartbeat

Estado actual del proyecto
El sistema está funcionalmente completo en su flujo principal y en el módulo nuevo de Subida Directa. Se está en fase de correcciones finas y normalización de tablas, con el proyecto Pensiones como caso piloto.