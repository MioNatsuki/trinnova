// frontend/src/pages/plantillas/PlantillasCrear.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/auth';
import { useProyecto } from '../../hooks/useProyecto';
import { useNavigationGuard } from '../../context/NavigationGuardContext';
import './Plantillas.css';

// ── Syncfusion ─────────────────────────────────────────────────────────────────
// IMPORTANTE: L10n y setCulture deben importarse ANTES del componente del editor
import { L10n, setCulture } from '@syncfusion/ej2-base';
import {
  DocumentEditorContainerComponent,
  Toolbar,
} from '@syncfusion/ej2-react-documenteditor';
DocumentEditorContainerComponent.Inject(Toolbar);

// ── Traducción completa ES-MX ──────────────────────────────────────────────────
// FIX: El objeto de traducción del DocumentEditor requiere la clave exacta
// 'documenteditorcontainer' (con "container") para los items de la toolbar
// del contenedor, además de 'documenteditor' para el editor interno.
// Sin ambas claves, los botones siguen en inglés.
L10n.load({
  'es-MX': {
    'documenteditor': {
      // Tabs del ribbon
      'Table': 'Tabla',
      'Row': 'Fila',
      'Cell': 'Celda',
      'Ok': 'Aceptar',
      'Cancel': 'Cancelar',
      'Size': 'Tamaño',
      'Preferred Width': 'Ancho preferido',
      'Points': 'Puntos',
      'Percent': 'Porcentaje',
      'Measure in': 'Medida en',
      'Alignment': 'Alineación',
      'Left': 'Izquierda',
      'Center': 'Centro',
      'Right': 'Derecha',
      'Justify': 'Justificar',
      'Indent from left': 'Sangría izquierda',
      'Borders and Shading': 'Bordes y sombreado',
      'Options': 'Opciones',
      'Specify height': 'Especificar alto',
      'At least': 'Al menos',
      'Exactly': 'Exactamente',
      'Row height is': 'Alto de fila',
      'Allow row to break across pages': 'Permitir que la fila pase de página',
      'Repeat as header row at the top of each page': 'Repetir como encabezado en cada página',
      'Vertical alignment': 'Alineación vertical',
      'Top': 'Arriba',
      'Bottom': 'Abajo',
      'Default cell margins': 'Márgenes de celda predeterminados',
      'Default cell spacing': 'Espaciado de celdas predeterminado',
      'Allow spacing between cells': 'Permitir espacio entre celdas',
      'Cell margins': 'Márgenes de celda',
      'Same as the whole table': 'Igual que toda la tabla',
      'Borders': 'Bordes',
      'None': 'Ninguno',
      'Style': 'Estilo',
      'Width': 'Ancho',
      'Height': 'Alto',
      'Letter': 'Carta',
      'Tabloid': 'Tabloide',
      'Legal': 'Legal',
      'Statement': 'Declaración',
      'Executive': 'Ejecutivo',
      'A3': 'A3',
      'A4': 'A4',
      'A5': 'A5',
      'B4': 'B4',
      'B5': 'B5',
      'Custom Size': 'Tamaño personalizado',
      'Different odd and even': 'Par e impar diferentes',
      'Different first page': 'Primera página diferente',
      'From edge': 'Desde el borde',
      'Header': 'Encabezado',
      'Footer': 'Pie de página',
      'Margin': 'Margen',
      'Paper': 'Papel',
      'Layout': 'Diseño',
      'Orientation': 'Orientación',
      'Landscape': 'Horizontal',
      'Portrait': 'Vertical',
      'Table Of Contents': 'Tabla de contenido',
      'Show page numbers': 'Mostrar números de página',
      'Right align page numbers': 'Alinear números a la derecha',
      'Nothing': 'Nada',
      'Tab leader': 'Relleno de tabulación',
      'Show levels': 'Mostrar niveles',
      'Use hyperlinks instead of page numbers': 'Usar hipervínculos en lugar de números',
      'Build table of contents from': 'Construir tabla de contenido desde',
      'Styles': 'Estilos',
      'Available styles': 'Estilos disponibles',
      'TOC level': 'Nivel TDC',
      'Heading': 'Encabezado',
      'List Paragraph': 'Párrafo de lista',
      'Normal': 'Normal',
      'Outline levels': 'Niveles de esquema',
      'Table entry fields': 'Campos de entrada de tabla',
      'Modify': 'Modificar',
      'Color': 'Color',
      'Setting': 'Configuración',
      'Box': 'Cuadro',
      'All': 'Todos',
      'Custom': 'Personalizado',
      'Preview': 'Vista previa',
      'Shading': 'Sombreado',
      'Fill': 'Relleno',
      'Apply To': 'Aplicar a',
      'Table Properties': 'Propiedades de tabla',
      'Cell Options': 'Opciones de celda',
      'Table Options': 'Opciones de tabla',
      'Insert Table': 'Insertar tabla',
      'Number of columns': 'Número de columnas',
      'Number of rows': 'Número de filas',
      'Text to display': 'Texto para mostrar',
      'Address': 'Dirección',
      'Insert Hyperlink': 'Insertar hipervínculo',
      'Edit Hyperlink': 'Editar hipervínculo',
      'Insert': 'Insertar',
      'General': 'General',
      'Indentation': 'Sangría',
      'Before text': 'Antes del texto',
      'Special': 'Especial',
      'First line': 'Primera línea',
      'Hanging': 'Colgante',
      'After text': 'Después del texto',
      'By': 'Por',
      'Before': 'Antes',
      'Line Spacing': 'Interlineado',
      'After': 'Después',
      'At': 'En',
      'Multiple': 'Múltiple',
      'Spacing': 'Espaciado',
      'Define new Multilevel list': 'Definir nueva lista multinivel',
      'List level': 'Nivel de lista',
      'Choose level to modify': 'Elegir nivel a modificar',
      'Level': 'Nivel',
      'Number format': 'Formato de número',
      'Alignment': 'Alineación',
      'Follow number with': 'Después del número',
      'Tab character': 'Carácter de tabulación',
      'Space': 'Espacio',
      'Arabic': 'Árabe',
      'UpRoman': 'Romano mayúsc.',
      'LowRoman': 'Romano minúsc.',
      'UpLetter': 'Letra mayúsc.',
      'LowLetter': 'Letra minúsc.',
      'Number': 'Número',
      'Leading zero': 'Cero inicial',
      'Bullet': 'Viñeta',
      'Ordinal': 'Ordinal',
      'Ordinal Text': 'Texto ordinal',
      'For East': 'Asia oriental',
      'No Restart': 'Sin reiniciar',
      'Font': 'Fuente',
      'Font style': 'Estilo de fuente',
      'Underline style': 'Estilo de subrayado',
      'Font color': 'Color de fuente',
      'Effects': 'Efectos',
      'Strikethrough': 'Tachado',
      'Superscript': 'Superíndice',
      'Subscript': 'Subíndice',
      'Double strikethrough': 'Tachado doble',
      'Regular': 'Normal',
      'Bold': 'Negrita',
      'Italic': 'Cursiva',
      'Cut': 'Cortar',
      'Copy': 'Copiar',
      'Paste': 'Pegar',
      'Hyperlink': 'Hipervínculo',
      'Open Hyperlink': 'Abrir hipervínculo',
      'Copy Hyperlink': 'Copiar hipervínculo',
      'Remove Hyperlink': 'Eliminar hipervínculo',
      'Paragraph': 'Párrafo',
      'Linked Style': 'Estilo vinculado',
      'Character': 'Carácter',
      'Merge Cells': 'Combinar celdas',
      'Insert Above': 'Insertar encima',
      'Insert Below': 'Insertar abajo',
      'Insert Left': 'Insertar a la izquierda',
      'Insert Right': 'Insertar a la derecha',
      'Delete': 'Eliminar',
      'Delete Table': 'Eliminar tabla',
      'Delete Row': 'Eliminar fila',
      'New comment': 'Nuevo comentario',
      'Delete Column': 'Eliminar columna',
      'File Name': 'Nombre de archivo',
      'Format And Type': 'Formato y tipo',
      'Save': 'Guardar',
      'Navigation': 'Navegación',
      'Results': 'Resultados',
      'Replace': 'Reemplazar',
      'Replace All': 'Reemplazar todo',
      'We replaced all': 'Reemplazamos todos',
      'Find': 'Buscar',
      'No matches': 'Sin coincidencias',
      'All Done': 'Todo listo',
      'Result': 'Resultado',
      'of': 'de',
      'instances': 'instancias',
      'with': 'con',
      'Click to follow link': 'Clic para seguir enlace',
      'Continue Numbering': 'Continuar numeración',
      'Bookmark name': 'Nombre de marcador',
      'Close': 'Cerrar',
      'Restart At 1': 'Reiniciar en 1',
      'Properties': 'Propiedades',
      'Name': 'Nombre',
      'Style type': 'Tipo de estilo',
      'Style based on': 'Estilo basado en',
      'Style for following paragraph': 'Estilo para párrafo siguiente',
      'Set as Default': 'Establecer como predeterminado',
      'Add to template': 'Agregar a plantilla',
      'Formatting': 'Formato',
      'Numbering and Bullets': 'Numeración y viñetas',
      'Format': 'Formato',
      'Update Style': 'Actualizar estilo',
      'Make text only selection': 'Hacer selección solo de texto',
      'Change': 'Cambiar',
      'Define': 'Definir',
      'Update': 'Actualizar',
      'Manage': 'Administrar',
      'Above - Click to add header': 'Arriba - Clic para agregar encabezado',
      'Below - Click to add footer': 'Abajo - Clic para agregar pie de página',
      'Click to add header': 'Clic para agregar encabezado',
      'Click to add footer': 'Clic para agregar pie de página',
      'Header & Footer': 'Encabezado y pie de página',
      'Options': 'Opciones',
      'Different First Page': 'Primera página diferente',
      'Different header and footer for odd and even pages': 'Encabezado y pie diferente en pares e impares',
      'Different Odd & Even Pages': 'Páginas pares e impares diferentes',
      'Close Header and Footer': 'Cerrar encabezado y pie de página',
      'Insert Page Number': 'Insertar número de página',
      'Page Setup': 'Configurar página',
      'Vital Sign': 'Signo vital',
      'Insert Bookmark': 'Insertar marcador',
      'Bookmark': 'Marcador',
      'No bookmarks found': 'No se encontraron marcadores',
      'Number of rows must be between 1 and 32767': 'Las filas deben estar entre 1 y 32767',
      'Number of columns must be between 1 and 63': 'Las columnas deben estar entre 1 y 63',
      'Closed': 'Cerrado',
      'Blur Radius': 'Radio de desenfoque',
      'Shadow Color': 'Color de sombra',
      'Shadow': 'Sombra',
      'Outline': 'Contorno',
      'Fill Color': 'Color de relleno',
      'Remove link': 'Eliminar enlace',
      'Crop': 'Recortar',
      'Bold Tooltip': 'Negrita (Ctrl+B)',
      'Italic Tooltip': 'Cursiva (Ctrl+I)',
      'Underline Tooltip': 'Subrayado (Ctrl+U)',
      'Strikethrough Tooltip': 'Tachado',
      'Superscript Tooltip': 'Superíndice (Ctrl+Shift++)',
      'Subscript Tooltip': 'Subíndice (Ctrl+=)',
      'Align left Tooltip': 'Alinear a la izquierda (Ctrl+L)',
      'Center Tooltip': 'Centrar (Ctrl+E)',
      'Align right Tooltip': 'Alinear a la derecha (Ctrl+R)',
      'Justify Tooltip': 'Justificar (Ctrl+J)',
      'Decrease indent Tooltip': 'Disminuir sangría',
      'Increase indent Tooltip': 'Aumentar sangría',
      'Line spacing Tooltip': 'Interlineado',
      'Ordered list Tooltip': 'Lista ordenada (Ctrl+Shift+L)',
      'Unordered list Tooltip': 'Lista desordenada',
      'Image Tooltip': 'Insertar imagen',
      'Table Tooltip': 'Insertar tabla',
      'Hyperlink Tooltip': 'Insertar hipervínculo (Ctrl+K)',
      'Bookmark Tooltip': 'Insertar marcador',
      'Find Tooltip': 'Buscar y reemplazar (Ctrl+F)',
      'Local Clipboard': 'Portapapeles local',
      'Restrict Editing': 'Restringir edición',
      'Upload': 'Cargar',
      'URL': 'URL',
      'Alternate Text': 'Texto alternativo',
      'Online Image': 'Imagen en línea',
      'Apply': 'Aplicar',
      'Continue': 'Continuar',
      'Cannot undo': 'No se puede deshacer',
      'Read only': 'Solo lectura',
      'Form Fields': 'Campos de formulario',
      'Text Form Field': 'Campo de texto',
      'Check Box': 'Casilla de verificación',
      'DropDown': 'Lista desplegable',
      'Update Fields': 'Actualizar campos',
      'Bookmark already exists': 'El marcador ya existe',
      'Bookmark must start with letter': 'El marcador debe comenzar con letra',
      'Bookmark name cannot be empty': 'El nombre del marcador no puede estar vacío',
      'Self reference': 'Autoreferencia',
      'Enter Valid URL': 'Ingresa una URL válida',
      'Page': 'Página',
      'of': 'de',
    },
    'documenteditorcontainer': {
      'New': 'Nuevo',
      'Open': 'Abrir',
      'Undo': 'Deshacer',
      'Redo': 'Rehacer',
      'Image': 'Imagen',
      'Table': 'Tabla',
      'Link': 'Enlace',
      'Bookmark': 'Marcador',
      'Table of Contents': 'Tabla de contenido',
      'Header': 'Encabezado',
      'Footer': 'Pie de página',
      'Page Setup': 'Configurar página',
      'Page Number': 'Número de página',
      'Break': 'Salto',
      'Find': 'Buscar',
      'Local Clipboard': 'Portapapeles local',
      'Restrict Editing': 'Restringir edición',
      'Upload': 'Cargar',
      'Comment': 'Comentario',
      'Comments': 'Comentarios',
      'Track Changes': 'Control de cambios',
      'TrackChanges': 'Control de cambios',
      'Form Fields': 'Campos de formulario',
      'Update Fields': 'Actualizar campos',
      'Zoom': 'Zoom',
      'Show properties pane': 'Mostrar panel de propiedades',
      'Hide properties pane': 'Ocultar panel de propiedades',
    },
  },
});
setCulture('es-MX');

// ──────────────────────────────────────────────────────────────────────────────

const Icon = ({ d, d2, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);
const ICONS = {
  upload:  { d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", d2:"M17 8l-5-5-5 5M12 3v12" },
  edit:    { d:"M12 20h9", d2:"M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" },
  back:    { d:"M19 12H5M12 19l-7-7 7-7" },
  check:   { d:"M20 6L9 17l-5-5" },
  barcode: { d:"M6 4h2v16H6zM3 4h1v16H3zM11 4h1v16h-1zM14 4h2v16h-2zM18 4h1v16h-1zM21 4h1v16h-1z" },
  preview: { d:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z", d2:"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" },
};

// Datos de ejemplo para vista previa
const DATOS_EJEMPLO = {
  pensiones: {
    '{{nombre}}':          'JUAN PÉREZ GONZÁLEZ',
    '{{prestamo}}':        '12345',
    '{{adeudo}}':          '$45,678.90',
    '{{afiliado_calle}}':  'Av. Revolución 123',
    '{{afiliado_colonia}}':'Centro',
    '{{ultimo_abono}}':    '15/enero/2025',
    '{{estatus}}':         'Activo',
  },
  apa_tlajomulco: {
    '{{propietario}}': 'MARÍA GARCÍA LÓPEZ',
    '{{clave_APA}}':   'A-56789',
    '{{saldo}}':       '$12,345.67',
    '{{calle}}':       'Calle Hidalgo 456',
  },
  predial_tlajomulco: {
    '{{domicilio}}': 'CALLE INDEPENDENCIA 789, COL. CENTRO',
    '{{cuenta}}':    'PRED-00123',
    '{{saldo}}':     '$8,900.00',
  },
  licencias_gdl: {
    '{{propietario}}': 'RESTAURANTE EL SOL S.A. DE C.V.',
    '{{licencia}}':    'LIC-2024-001',
    '{{total}}':       '$23,456.00',
    '{{ubicacion}}':   'Av. Juárez 1500',
  },
  predial_gdl: {
    '{{propietariotitular_n}}': 'ANA LAURA HERNÁNDEZ',
    '{{cuenta_n}}':             'GDL-98765',
    '{{saldo2025}}':            '$15,200.00',
    '{{calle}}':                'Calle Morelos 234',
  },
  estado: {
    '{{nombre_razon_social}}':            'EMPRESA EJEMPLO S.A.',
    '{{credito}}':                        'CRED-2024-056',
    '{{importe_historico_determinado}}':  '$156,789.00',
    '{{calle_numero}}':                   'Blvd. Principal 500',
  },
};

export default function PlantillasCrear() {
  const { proyectoSlug, proyectos, setProyectoSlug } = useProyecto();
  const { setDirty } = useNavigationGuard();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [modo,              setModo]              = useState(null);
  const [selectedSlug,      setSelectedSlug]      = useState(proyectoSlug || '');
  const [nombre,            setNombre]            = useState('');
  const [descripcion,       setDesc]              = useState('');
  const [loading,           setLoading]           = useState(false);
  const [message,           setMessage]           = useState(null);
  const [result,            setResult]            = useState(null);
  const [mapEdits,          setMapEdits]          = useState({});
  const [camposDisp,        setCamposDisp]        = useState([]);
  const [file,              setFile]              = useState(null);
  const [editandoPlantilla, setEditandoPlantilla] = useState(null);
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false);
  // Vista previa activa (documento temporal con datos rellenos)
  const [vistaPrevia,       setVistaPrevia]       = useState(false);

  const fileRef   = useRef();
  const editorRef = useRef(null);
  // Guardamos el SFDT original antes de aplicar vista previa
  const sfdtOriginalRef = useRef(null);

  const proyectoActual = proyectos.find(p => p.slug === selectedSlug);

  const showMsg = useCallback((type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  }, []);

  // NavigationGuard
  useEffect(() => {
    setDirty(!!nombre && !result, 'Tienes una plantilla sin guardar.');
    return () => setDirty(false);
  }, [nombre, result, setDirty]);

  // Cargar campos disponibles
  useEffect(() => {
    if (!selectedSlug) return;
    api.get(`/plantillas/${selectedSlug}/campos-temporales-slug`)
      .then(r => setCamposDisp(r.data?.campos || []))
      .catch(() => {
        api.get(`/analisis/${selectedSlug}/analisis`, { params: { limit: 1 } })
          .then(r => {
            if (r.data.rows?.length > 0)
              setCamposDisp(Object.keys(r.data.rows[0]).filter(c => !c.startsWith('_')));
          })
          .catch(() => setCamposDisp([]));
      });
  }, [selectedSlug]);

  // Cargar plantilla para edición (cuando viene ?edit=ID)
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;

    const cargarPlantilla = async () => {
      setCargandoPlantilla(true);
      try {
        const res = await api.get(`/plantillas/${editId}`);
        const p = res.data;
        if (cancelled) return;

        setEditandoPlantilla(p);
        setModo('editor');
        setSelectedSlug(p.proyecto_slug);
        setProyectoSlug(p.proyecto_slug);
        setNombre(p.nombre);
        setDesc(p.descripcion || '');

        if (p.ruta_archivo) {
          try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(
              `http://localhost:8000/api/v1/plantillas/${p.id}/descargar`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            if (cancelled) return;

            // Esperar a que el editor esté listo y abrir el blob
            const intentarAbrir = (intentos = 0) => {
              const editor = editorRef.current?.documentEditor;
              if (editor) {
                editor.open(blob);
              } else if (intentos < 15) {
                setTimeout(() => intentarAbrir(intentos + 1), 300);
              } else {
                showMsg('error', 'Editor no disponible tras esperar.');
              }
            };
            // Dar tiempo al editor para inicializarse
            setTimeout(() => intentarAbrir(), 600);
          } catch (err) {
            console.error('[PlantillasCrear] Error descargando:', err);
            if (!cancelled) showMsg('error', 'No se pudo cargar el documento.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[PlantillasCrear] Error:', err);
          showMsg('error', 'Error al cargar la plantilla.');
        }
      } finally {
        if (!cancelled) setCargandoPlantilla(false);
      }
    };

    cargarPlantilla();
    return () => { cancelled = true; };
  }, [editId]); // eslint-disable-line

  // ── Configurar editor (tamaño oficio, Calibri 11) ─────────────────────────
  const configureEditorPage = useCallback(() => {
    const editor = editorRef.current?.documentEditor;
    if (!editor) return;
    setTimeout(() => {
      try {
        const sectionFormat = editor.selection?.sectionFormat;
        if (!sectionFormat) return;
        // Oficio México: 21.59 × 34.01 cm → pts (1 cm = 28.346 pts)
        sectionFormat.pageWidth    = 612;   // 21.59 cm
        sectionFormat.pageHeight   = 963;   // 34.01 cm
        sectionFormat.leftMargin   = 56.7;
        sectionFormat.rightMargin  = 56.7;
        sectionFormat.topMargin    = 56.7;
        sectionFormat.bottomMargin = 56.7;
        const charFormat = editor.selection?.characterFormat;
        if (charFormat) {
          charFormat.fontFamily = 'Calibri';
          charFormat.fontSize   = 11;
        }
      } catch { /* ignorar si la selección no está lista */ }
    }, 500);
  }, []);

  // ── Insertar texto en la posición del cursor ───────────────────────────────
  const insertText = useCallback((text) => {
    const editor = editorRef.current?.documentEditor;
    if (editor) editor.editor?.insertText(text);
  }, []);

  // ── Insertar código de barras como placeholder ─────────────────────────────
  const insertBarcode = useCallback(() => {
    insertText('{{codebar}}');
  }, [insertText]);

  // ── Vista previa ────────────────────────────────────────────────────────────
  // FIX: El problema anterior era serializar el SFDT como JSON string y hacer
  // replace de strings, pero Syncfusion puede fragmentar "{{campo}}" en varios
  // "runs" de texto en el JSON interno, por lo que el placeholder nunca se
  // encontraba como cadena continua.
  //
  // Solución: usar el API nativo de Find & Replace del DocumentEditor,
  // que opera sobre el texto renderizado (no el JSON interno) y puede
  // encontrar el placeholder sin importar cómo esté fragmentado.
  const aplicarVistaPrevia = useCallback(() => {
    const editor = editorRef.current?.documentEditor;
    if (!editor) { showMsg('error', 'Editor no disponible.'); return; }

    const datos = DATOS_EJEMPLO[selectedSlug];
    if (!datos) {
      showMsg('error', 'No hay datos de ejemplo configurados para este proyecto.');
      return;
    }

    if (vistaPrevia) {
      // Ya hay una vista previa activa → restaurar el original
      if (sfdtOriginalRef.current) {
        try {
          editor.open(sfdtOriginalRef.current);
          sfdtOriginalRef.current = null;
          setVistaPrevia(false);
          showMsg('success', 'Documento original restaurado.');
        } catch (err) {
          showMsg('error', 'Error al restaurar: ' + err.message);
        }
      }
      return;
    }

    try {
      // Guardar SFDT original antes de modificar
      sfdtOriginalRef.current = editor.serialize();

      let reemplazos = 0;
      // Usar el método nativo replaceAll que busca en el texto visible
      for (const [placeholder, valor] of Object.entries(datos)) {
        // replaceAll(searchText, replaceText, matchCase, wholeWord)
        const antes = reemplazos;
        // Intentar contar coincidencias primero
        editor.find(placeholder, 'None');
        const resultados = editor.search?.searchResults?.length || 0;
        if (resultados > 0) {
          reemplazos += resultados;
        }
        editor.replaceAll(placeholder, valor, false, false);
      }

      setVistaPrevia(true);
      showMsg('success', `Vista previa activa. Pulsa "👁️ Restaurar" para volver al original.`);
    } catch (err) {
      console.error('[VistaPrevia] Error:', err);
      // Intentar con método alternativo: regex replace en SFDT serializado
      try {
        const sfdt = editor.serialize();
        let sfdtStr = JSON.stringify(sfdt);
        let reemplazos = 0;
        for (const [placeholder, valor] of Object.entries(datos)) {
          const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escaped, 'g');
          const matches = (sfdtStr.match(regex) || []).length;
          if (matches > 0) {
            reemplazos += matches;
            sfdtStr = sfdtStr.replace(regex, valor);
          }
        }
        if (reemplazos > 0) {
          sfdtOriginalRef.current = sfdt;
          editor.open(JSON.parse(sfdtStr));
          setVistaPrevia(true);
          showMsg('success', `Vista previa: ${reemplazos} campos reemplazados (modo JSON).`);
        } else {
          showMsg('error', 'No se encontraron placeholders {{campo}} en el documento.');
        }
      } catch (err2) {
        showMsg('error', 'Error en vista previa: ' + err2.message);
      }
    }
  }, [selectedSlug, vistaPrevia, showMsg]);

  // ── Subir .docx ────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file || !nombre.trim() || !selectedSlug) {
      showMsg('error', 'Selecciona proyecto, escribe el nombre y adjunta el archivo.');
      return;
    }
    const proy = proyectos.find(p => p.slug === selectedSlug);
    if (!proy) { showMsg('error', 'Proyecto no encontrado.'); return; }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/plantillas/subir', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { proyecto_id: proy.id, nombre, descripcion },
      });
      setDirty(false);
      setResult(res.data);
      const edits = {};
      Object.entries(res.data.mapeo_automatico || {}).forEach(([ph, campo]) => {
        edits[`{{${ph}}}`] = campo || '';
      });
      setMapEdits(edits);
      if (res.data.campos_disponibles?.length) setCamposDisp(res.data.campos_disponibles);
      showMsg('success', res.data.mensaje);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al subir.');
    } finally { setLoading(false); }
  };

  // ── Guardar mapeo (modo upload) ────────────────────────────────────────────
  const handleGuardarMapeo = async () => {
    if (!result?.id) return;
    const campos = Object.entries(mapEdits)
      .filter(([, v]) => v)
      .map(([placeholder, campo_bd], orden) => ({ placeholder, campo_bd, orden }));
    try {
      await api.post(`/plantillas/${result.id}/mapear`, { campos });
      setDirty(false);
      showMsg('success', `${campos.length} campos mapeados.`);
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error guardando mapeo.');
    }
  };

  // ── Guardar desde editor ───────────────────────────────────────────────────
  const handleGuardarEditor = async () => {
    if (!nombre.trim() || !selectedSlug) {
      showMsg('error', 'Escribe el nombre y selecciona el proyecto.');
      return;
    }
    const proy = proyectos.find(p => p.slug === selectedSlug);
    if (!proy) return;

    // Si hay vista previa activa, restaurar antes de guardar
    if (vistaPrevia && sfdtOriginalRef.current) {
      const editor = editorRef.current?.documentEditor;
      if (editor) {
        try { editor.open(sfdtOriginalRef.current); } catch { /* ignorar */ }
      }
      sfdtOriginalRef.current = null;
      setVistaPrevia(false);
    }

    let placeholders = [];
    try {
      const editor = editorRef.current?.documentEditor;
      if (editor) {
        const sfdt = editor.serialize();
        const text = JSON.stringify(sfdt);
        const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)];
        placeholders = [...new Set(matches.map(m => m[1]))];
      }
    } catch { /* ignorar */ }

    setLoading(true);
    try {
      // Si estamos editando una plantilla existente, actualizamos metadata
      if (editandoPlantilla) {
        await api.put(`/plantillas/${editandoPlantilla.id}`, { nombre, descripcion });
        setDirty(false);
        showMsg('success', `Plantilla "${nombre}" actualizada.`);
        setTimeout(() => navigate('/plantillas'), 1500);
        return;
      }

      const res = await api.post('/plantillas/', {
        id_proyecto: proy.id, nombre, descripcion, origen: 'editor',
      });
      const plantillaId = res.data.id;
      if (placeholders.length > 0) {
        const campos = placeholders
          .filter(ph => camposDisp.includes(ph))
          .map((ph, orden) => ({ placeholder: `{{${ph}}}`, campo_bd: ph, orden }));
        if (campos.length > 0) {
          await api.post(`/plantillas/${plantillaId}/mapear`, { campos });
        }
      }
      setDirty(false);
      showMsg('success', `Plantilla "${nombre}" creada.`);
      setTimeout(() => navigate('/plantillas'), 1500);
    } catch (err) {
      showMsg('error', err.response?.data?.detail || 'Error al guardar.');
    } finally { setLoading(false); }
  };

  // ── PANTALLA INICIAL ───────────────────────────────────────────────────────
  if (!modo && !cargandoPlantilla) {
    return (
      <div className="pl-page">
        <div className="pl-header">
          <div>
            <h1 className="pl-title">Nueva Plantilla</h1>
            <p className="pl-subtitle">Elige cómo quieres crear tu plantilla</p>
          </div>
          <button className="pl-btn" onClick={() => navigate('/plantillas')}>
            <Icon {...ICONS.back} size={14} /> Volver
          </button>
        </div>

        {message && <div className={`pl-message pl-message--${message.type}`}>{message.text}</div>}

        <div className="pl-project-select-wrap">
          <label className="pl-label">Proyecto *</label>
          <select className="pl-select pl-select--lg" value={selectedSlug}
            onChange={e => { setSelectedSlug(e.target.value); setProyectoSlug(e.target.value); }}>
            <option value="">— Selecciona un proyecto —</option>
            {proyectos.map(p => <option key={p.id} value={p.slug}>{p.nombre}</option>)}
          </select>
        </div>

        {selectedSlug && (
          <div className="pl-modo-cards">
            <div className="pl-modo-card" onClick={() => setModo('upload')}>
              <div className="pl-modo-icon"><Icon {...ICONS.upload} size={32} /></div>
              <h3>Subir .docx</h3>
              <p>Sube un documento Word existente. El sistema detecta automáticamente los placeholders <code>{'{{campo}}'}</code> y sugiere el mapeo.</p>
              <div className="pl-modo-hint">Recomendado si ya tienes el diseño en Word</div>
            </div>
            <div className="pl-modo-card" onClick={() => setModo('editor')}>
              <div className="pl-modo-icon"><Icon {...ICONS.edit} size={32} /></div>
              <h3>Crear desde cero</h3>
              <p>Editor integrado con tamaño Oficio México, fuente Calibri 11, inserción de imágenes y código de barras dinámico.</p>
              <div className="pl-modo-hint">Editor Syncfusion · Word-like</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (cargandoPlantilla) {
    return <div className="pl-loading">Cargando plantilla para edición...</div>;
  }

  // ── MODO SUBIR ─────────────────────────────────────────────────────────────
  if (modo === 'upload') {
    return (
      <div className="pl-page">
        <div className="pl-header">
          <div>
            <h1 className="pl-title">Subir Plantilla .docx</h1>
            <p className="pl-subtitle">Proyecto: <strong>{proyectoActual?.nombre}</strong></p>
          </div>
          <button className="pl-btn" onClick={() => { setModo(null); setResult(null); setFile(null); }}>
            <Icon {...ICONS.back} size={14} /> Volver
          </button>
        </div>

        {message && <div className={`pl-message pl-message--${message.type}`}>{message.text}</div>}

        {!result ? (
          <div className="pl-upload-form">
            <div className="pl-form-row">
              <div className="pl-field">
                <label className="pl-label">Nombre *</label>
                <input className="pl-input" value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Requerimiento 2025" />
              </div>
              <div className="pl-field">
                <label className="pl-label">Descripción</label>
                <input className="pl-input" value={descripcion}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="Opcional" />
              </div>
            </div>

            <label className="pl-label">Archivo .docx *</label>
            <div className={`pl-drop-zone ${file ? 'pl-drop-zone--has-file' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDrop={e => { e.preventDefault(); setFile(e.dataTransfer.files[0] || null); }}
              onDragOver={e => e.preventDefault()}>
              <input type="file" accept=".docx" ref={fileRef} style={{ display: 'none' }}
                onChange={e => setFile(e.target.files[0] || null)} />
              {file ? (
                <>
                  <div className="pl-drop-icon pl-drop-icon--ok">✓</div>
                  <p className="pl-drop-filename">{file.name}</p>
                  <p className="pl-drop-hint">Haz clic para cambiar</p>
                </>
              ) : (
                <>
                  <div className="pl-drop-icon">📄</div>
                  <p className="pl-drop-text">Arrastra aquí o haz clic</p>
                  <p className="pl-drop-hint">Solo archivos .docx</p>
                </>
              )}
            </div>

            <div className="pl-upload-info">
              <h4>Campos disponibles ({camposDisp.length}):</h4>
              <div className="pl-campos-preview">
                {camposDisp.slice(0, 40).map(c => (
                  <span key={c} className="pl-campo-chip"><code>{`{{${c}}}`}</code></span>
                ))}
                {camposDisp.length > 40 && (
                  <span className="pl-campo-chip pl-campo-chip--more">+{camposDisp.length - 40} más</span>
                )}
              </div>
            </div>

            <button className="pl-btn pl-btn--primary pl-btn--full"
              onClick={handleUpload}
              disabled={loading || !file || !nombre.trim() || !selectedSlug}>
              {loading ? 'Procesando…' : 'Subir y extraer campos'}
            </button>
          </div>
        ) : (
          <div className="pl-mapeo-section">
            <div className="pl-mapeo-success">
              <Icon {...ICONS.check} size={18} />
              <span>{result.mensaje}</span>
            </div>
            <h3 className="pl-mapeo-title">Mapeo de campos</h3>
            <p className="pl-mapeo-desc">{result.placeholders?.length || 0} placeholders detectados.</p>
            {!result.placeholders?.length ? (
              <div className="pl-mapeo-empty">
                No se encontraron placeholders <code>{'{{campo}}'}</code>.
              </div>
            ) : (
              <div className="pl-map-grid">
                <div className="pl-map-grid-header">
                  <span>Placeholder</span><span>Campo BD</span><span>Estado</span>
                </div>
                {result.placeholders.map(ph => {
                  const key = `{{${ph}}}`;
                  const val = mapEdits[key] || '';
                  const autoMapped = !!result.mapeo_automatico?.[ph];
                  return (
                    <div key={ph} className="pl-map-row">
                      <span className="pl-map-ph">{key}</span>
                      <select className="pl-select pl-map-select" value={val}
                        onChange={e => setMapEdits(prev => ({ ...prev, [key]: e.target.value }))}>
                        <option value="">— Sin mapear —</option>
                        {camposDisp.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <span className={`pl-map-status ${val ? (autoMapped ? 'auto' : 'manual') : 'empty'}`}>
                        {val ? (autoMapped ? '🤖 Auto' : '✏️ Manual') : '⚠️ Sin mapear'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="pl-mapeo-actions">
              <button className="pl-btn"
                onClick={() => { setDirty(false); navigate('/plantillas'); }}>
                Omitir mapeo
              </button>
              <button className="pl-btn pl-btn--primary" onClick={handleGuardarMapeo}>
                Guardar mapeo y finalizar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MODO EDITOR ────────────────────────────────────────────────────────────
  if (modo === 'editor') {
    return (
      <div className="pl-page" style={{
        display: 'flex', flexDirection: 'column',
        height: 'calc(100vh - var(--header-h) - 48px)',
        overflow: 'hidden',
      }}>
        {/* Barra superior */}
        <div className="pl-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="pl-btn" onClick={() => { setModo(null); }}>
              <Icon {...ICONS.back} size={14} /> Volver
            </button>

            <input className="pl-input" style={{ width: 220 }} value={nombre}
              onChange={e => {
                setNombre(e.target.value);
                if (e.target.value.trim()) setDirty(true, 'Plantilla sin guardar.');
              }}
              placeholder="Nombre de plantilla *" />

            <input className="pl-input" style={{ width: 200 }} value={descripcion}
              onChange={e => setDesc(e.target.value)}
              placeholder="Descripción (opcional)" />

            <button className="pl-btn pl-btn--primary"
              onClick={handleGuardarEditor}
              disabled={loading || !nombre.trim()}>
              {loading ? 'Guardando…' : '💾 Guardar'}
            </button>

            <button className="pl-btn" onClick={insertBarcode}
              title="Insertar marcador de código de barras en el cursor">
              <Icon {...ICONS.barcode} size={14} /> Barcode
            </button>

            {/* Vista previa — alterna entre preview y restaurar */}
            <button
              className={`pl-btn ${vistaPrevia ? 'pl-btn--warning' : ''}`}
              onClick={aplicarVistaPrevia}
              title={vistaPrevia
                ? 'Restaurar documento original'
                : 'Vista previa con datos de ejemplo (reemplaza placeholders temporalmente)'}>
              {vistaPrevia ? '↩️ Restaurar' : '👁️ Vista previa'}
            </button>
          </div>

          {message && (
            <div className={`pl-message pl-message--${message.type}`} style={{ marginTop: 8 }}>
              {message.text}
            </div>
          )}
        </div>

        {/* Área principal: editor + panel de campos */}
        <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0, overflow: 'hidden' }}>

          {/* Editor Syncfusion */}
          <div style={{
            flex: 1, minWidth: 0, overflow: 'hidden',
            border: '1px solid var(--clr-border)', borderRadius: 8,
          }}>
            {/*
              FIX — 'Open' eliminado de toolbarItems para evitar el error:
              POST http://localhost:5173/plantillas/Import 404 (Not Found)

              El botón nativo "Open" del contenedor intenta hacer POST a
              /plantillas/Import (ruta relativa al serviceUrl vacío),
              lo que resulta en un 404. La carga del docx ya la manejamos
              nosotros mismos vía el endpoint /descargar, por lo que
              no necesitamos el botón Open de la toolbar.

              FIX — locale="es-MX" funciona ahora porque L10n.load incluye
              la clave 'documenteditorcontainer' además de 'documenteditor'.
            */}
            <DocumentEditorContainerComponent
              ref={editorRef}
              enableToolbar={true}
              locale="es-MX"
              height="100%"
              serviceUrl=""
              toolbarItems={[
                'New',
                // 'Open' ← ELIMINADO: causaba POST /plantillas/Import 404
                'Separator',
                'Undo',
                'Redo',
                'Separator',
                'Image',    // botón nativo de imagen (funciona sin serviceUrl)
                'Table',
                'Hyperlink',
                'Bookmark',
                'TableOfContents',
                'Separator',
                'Header',
                'Footer',
                'PageSetup',
                'PageNumber',
                'Break',
                'Separator',
                'Find',
                'Separator',
                'Comments',
                'TrackChanges',
                'LocalClipboard',
                'RestrictEditing',
              ]}
              created={configureEditorPage}
              style={{ height: '100%' }}
            />
          </div>

          {/* Panel lateral: campos disponibles */}
          <div style={{
            width: 220, flexShrink: 0,
            background: 'var(--clr-white)',
            border: '1px solid var(--clr-border)',
            borderRadius: 8,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--clr-border)',
              fontSize: 12, fontWeight: 600,
              color: 'var(--clr-muted)',
              textTransform: 'uppercase', letterSpacing: '.3px',
            }}>
              Campos disponibles
              <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, textTransform: 'none' }}>
                Clic para insertar en el cursor
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {camposDisp.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--clr-muted)', padding: '8px 4px' }}>
                  Sin campos. Selecciona un proyecto con datos cargados.
                </p>
              ) : (
                camposDisp.map(c => (
                  <button key={c}
                    onClick={() => insertText(`{{${c}}}`)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '5px 8px', marginBottom: 3,
                      border: '1px solid var(--clr-border)', borderRadius: 5,
                      background: '#f8f9fa', fontSize: 11.5,
                      fontFamily: 'monospace', cursor: 'pointer',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#eef3f9'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f8f9fa'}
                    title={`Insertar {{${c}}}`}>
                    {`{{${c}}}`}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}