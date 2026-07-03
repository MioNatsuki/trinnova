"""
Motor de renderizado de plantillas HTML → PDF
Usa WeasyPrint para convertir HTML a PDF con tamaño Oficio México
"""

import re
from pathlib import Path
from typing import Dict, Optional, List, Any
from datetime import datetime

from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration


class PlantillaRenderer:
    """
    Clase responsable de renderizar plantillas HTML a PDF
    """

    # Tamaño Oficio México en puntos (1pt = 1/72 pulgada)
    # 21.59cm × 34.01cm = 612pt × 964pt aproximadamente
    PAGE_WIDTH = 612
    PAGE_HEIGHT = 964

    def __init__(self, proyecto_slug: str):
        """
        Inicializa el renderer para un proyecto específico

        Args:
            proyecto_slug: Slug del proyecto (ej: 'estado', 'pensiones')
        """
        self.proyecto_slug = proyecto_slug
        self.base_path = Path(__file__).parent.parent / "plantillas_html" / proyecto_slug

        if not self.base_path.exists():
            raise FileNotFoundError(f"No se encontró la carpeta de plantillas para: {proyecto_slug}")

        # Configuración de fuentes para WeasyPrint
        self.font_config = FontConfiguration()

    def _cargar_html(self, nombre_archivo: str) -> str:
        """
        Carga el contenido del archivo HTML

        Args:
            nombre_archivo: Nombre del archivo HTML (ej: 'FE_CI_Liquidaciones_DGOS.html')

        Returns:
            Contenido HTML como string
        """
        ruta_completa = self.base_path / nombre_archivo

        if not ruta_completa.exists():
            raise FileNotFoundError(f"Archivo HTML no encontrado: {ruta_completa}")

        with open(ruta_completa, 'r', encoding='utf-8') as f:
            contenido = f.read()

        return contenido

    def _extraer_placeholders(self, html_content: str) -> List[str]:
        """
        Extrae todos los placeholders {{campo}} del HTML

        Args:
            html_content: Contenido HTML

        Returns:
            Lista de placeholders únicos
        """
        pattern = r'\{\{([a-zA-Z0-9_]+)\}\}'
        matches = re.findall(pattern, html_content)
        # Eliminar duplicados manteniendo orden
        return list(dict.fromkeys(matches))

    def _resaltar_placeholders(self, html_content: str) -> str:
        """
        Reemplaza placeholders por versiones resaltadas (modo OFF/preview)

        Args:
            html_content: HTML con placeholders

        Returns:
            HTML con placeholders resaltados
        """
        def reemplazar(match):
            placeholder = match.group(1)
            return f'<span style="background: #fefcbf; border: 2px solid #f6e05e; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #975a16;">{{{{{placeholder}}}}}</span>'

        pattern = r'\{\{([a-zA-Z0-9_]+)\}\}'
        return re.sub(pattern, reemplazar, html_content)

    def _reemplazar_placeholders(self, html_content: str, placeholders: Dict[str, str]) -> str:
        """
        Reemplaza placeholders con valores reales (modo ON)

        Args:
            html_content: HTML con placeholders
            placeholders: Diccionario {nombre_placeholder: valor}

        Returns:
            HTML con placeholders reemplazados
        """
        for key, value in placeholders.items():
            placeholder = f"{{{{{key}}}}}"
            if value is None:
                value = ""
            html_content = html_content.replace(placeholder, str(value))

        return html_content

    def _calcular_placeholders_especiales(self, pagina_actual: int, total_paginas: int) -> Dict[str, str]:
        """
        Calcula los placeholders especiales del sistema

        Args:
            pagina_actual: Número de página actual (1-indexed)
            total_paginas: Total de páginas del documento

        Returns:
            Diccionario con placeholders especiales
        """
        # Obtener fecha actual en diferentes formatos
        ahora = datetime.now()
        fecha_dd_mm_yyyy = ahora.strftime("%d/%m/%Y")
        fecha_dd_mmmm_aaaa = ahora.strftime("%d de %B de %Y")
        fecha_dd_del_mmmm_del_aaaa = ahora.strftime("%d del %B del %Y")

        # Meses en español para formato largo
        meses_es = {
            'January': 'enero', 'February': 'febrero', 'March': 'marzo',
            'April': 'abril', 'May': 'mayo', 'June': 'junio',
            'July': 'julio', 'August': 'agosto', 'September': 'septiembre',
            'October': 'octubre', 'November': 'noviembre', 'December': 'diciembre'
        }

        # Reemplazar meses en inglés por español
        for en, es in meses_es.items():
            fecha_dd_mmmm_aaaa = fecha_dd_mmmm_aaaa.replace(en, es)
            fecha_dd_del_mmmm_del_aaaa = fecha_dd_del_mmmm_del_aaaa.replace(en, es)

        return {
            '_fecha_actual': fecha_dd_mm_yyyy,
            '_fecha_actual_larga': fecha_dd_mmmm_aaaa,
            '_fecha_actual_extensa': fecha_dd_del_mmmm_del_aaaa,
            '_numero_pagina': str(pagina_actual),
            '_total_paginas': str(total_paginas),
            '_nombre_proyecto': self.proyecto_slug.replace('_', ' ').title(),
        }

    def renderizar_html(
        self,
        nombre_archivo: str,
        placeholders: Optional[Dict[str, str]] = None,
        preview_mode: bool = False,
        pagina_actual: int = 1,
        total_paginas: int = 1
    ) -> str:
        """
        Renderiza el HTML con los placeholders reemplazados o resaltados

        Args:
            nombre_archivo: Nombre del archivo HTML
            placeholders: Diccionario de placeholders y valores
            preview_mode: Si es True, reemplaza con valores; si es False, resalta
            pagina_actual: Número de página actual
            total_paginas: Total de páginas

        Returns:
            HTML renderizado
        """
        # Cargar HTML
        html_content = self._cargar_html(nombre_archivo)

        # Placeholders especiales del sistema
        especiales = self._calcular_placeholders_especiales(pagina_actual, total_paginas)

        # Si hay placeholders, reemplazar
        if placeholders:
            # Combinar placeholders proporcionados con especiales
            todos_placeholders = {**placeholders, **especiales}
            html_content = self._reemplazar_placeholders(html_content, todos_placeholders)

        # Si es modo preview (OFF), resaltar placeholders que quedaron sin reemplazar
        if preview_mode:
            html_content = self._resaltar_placeholders(html_content)

        return html_content

    def generar_pdf(
        self,
        html_content: str,
        nombre_archivo: Optional[str] = None
    ) -> bytes:
        """
        Convierte HTML a PDF usando WeasyPrint

        Args:
            html_content: HTML a convertir
            nombre_archivo: Opcional, para generar nombre de archivo

        Returns:
            Bytes del PDF generado
        """
        # CSS para tamaño de página Oficio México
        css = CSS(string=f"""
            @page {{
                size: {self.PAGE_WIDTH}pt {self.PAGE_HEIGHT}pt;
                margin: 40pt 30pt 40pt 30pt;
            }}
            body {{
                font-family: Arial, Calibri, sans-serif;
                font-size: 11pt;
                line-height: 1.4;
            }}
            img {{
                max-width: 100%;
                height: auto;
            }}
            table {{
                border-collapse: collapse;
                width: 100%;
            }}
            td, th {{
                padding: 4px 8px;
                border: 1px solid #000;
            }}
        """)

        # Generar PDF con configuración de fuentes
        html = HTML(string=html_content, base_url=str(self.base_path))
        pdf_bytes = html.write_pdf(
            stylesheets=[css],
            font_config=self.font_config,
            optimize_size=True
        )

        return pdf_bytes

    def renderizar_pdf(
        self,
        nombre_archivo: str,
        placeholders: Optional[Dict[str, str]] = None,
        preview_mode: bool = False
    ) -> bytes:
        """
        Método completo: carga HTML, reemplaza placeholders y genera PDF

        Args:
            nombre_archivo: Nombre del archivo HTML
            placeholders: Diccionario de placeholders y valores
            preview_mode: Si es True, usa datos reales; si es False, resalta placeholders

        Returns:
            Bytes del PDF generado
        """
        # Renderizar HTML (con modo preview)
        html_content = self.renderizar_html(
            nombre_archivo=nombre_archivo,
            placeholders=placeholders,
            preview_mode=preview_mode
        )

        # Generar PDF
        pdf_bytes = self.generar_pdf(html_content, nombre_archivo)

        return pdf_bytes

    def extraer_placeholders_desde_archivo(self, nombre_archivo: str) -> List[str]:
        """
        Extrae placeholders de un archivo HTML sin renderizar

        Args:
            nombre_archivo: Nombre del archivo HTML

        Returns:
            Lista de placeholders
        """
        html_content = self._cargar_html(nombre_archivo)
        return self._extraer_placeholders(html_content)

    def obtener_placeholders_especiales(self) -> Dict[str, str]:
        """
        Obtiene los placeholders especiales del sistema (sin valores dinámicos)

        Returns:
            Diccionario con los nombres de placeholders especiales
        """
        return {
            '_fecha_actual': 'Fecha actual (dd/mm/aaaa)',
            '_fecha_actual_larga': 'Fecha actual (dd de mmmm de aaaa)',
            '_fecha_actual_extensa': 'Fecha actual (dd del mmmm del aaaa)',
            '_numero_pagina': 'Número de página actual',
            '_total_paginas': 'Total de páginas',
            '_nombre_proyecto': 'Nombre del proyecto',
        }


# ============================================
# FUNCIÓN DE UTILIDAD PARA USAR DESDE ENDPOINTS
# ============================================

def generar_preview_pdf(
    proyecto_slug: str,
    nombre_archivo: str,
    placeholders: Optional[Dict[str, str]] = None,
    preview_mode: bool = False
) -> bytes:
    """
    Función de conveniencia para generar un PDF de preview

    Args:
        proyecto_slug: Slug del proyecto
        nombre_archivo: Nombre del archivo HTML
        placeholders: Diccionario de placeholders y valores
        preview_mode: True = datos reales, False = resaltar placeholders

    Returns:
        Bytes del PDF generado
    """
    renderer = PlantillaRenderer(proyecto_slug)
    return renderer.renderizar_pdf(nombre_archivo, placeholders, preview_mode)


def obtener_placeholders_especiales() -> Dict[str, str]:
    """
    Obtiene los placeholders especiales del sistema

    Returns:
        Diccionario con placeholders especiales y su descripción
    """
    return {
        '{{codebar}}': 'Código de barras (se genera automáticamente)',
        '{{_fecha_actual}}': 'Fecha actual en formato dd/mm/aaaa',
        '{{_fecha_actual_larga}}': 'Fecha actual en formato dd de mmmm de aaaa',
        '{{_fecha_actual_extensa}}': 'Fecha actual en formato dd del mmmm del aaaa',
        '{{_numero_pagina}}': 'Número de página actual',
        '{{_total_paginas}}': 'Total de páginas del documento',
        '{{_nombre_proyecto}}': 'Nombre del proyecto',
    }