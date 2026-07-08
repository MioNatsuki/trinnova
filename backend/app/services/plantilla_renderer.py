"""
Motor de renderizado de plantillas HTML → PDF
Usa pdfkit + wkhtmltopdf (sin WeasyPrint)
"""

import re
import os
import subprocess
from pathlib import Path
from typing import Dict, Optional, List, Any
from datetime import datetime
import pdfkit

# ============================================================
# CONFIGURAR WKHTMLTOPDF
# ============================================================
def encontrar_wkhtmltopdf():
    """Encuentra la ruta de wkhtmltopdf en el sistema"""
    rutas_posibles = [
        r"C:\Program Files\wkhtmltopdf\bin\wkhtmltopdf.exe",
        r"C:\Program Files (x86)\wkhtmltopdf\bin\wkhtmltopdf.exe",
        r"C:\Program Files\wkhtmltopdf\wkhtmltopdf.exe",
        r"C:\wkhtmltopdf\bin\wkhtmltopdf.exe",
        r"wkhtmltopdf",  # Si está en el PATH
    ]
    
    for ruta in rutas_posibles:
        if os.path.exists(ruta):
            return ruta
    
    # Si no se encuentra, intentar con el PATH usando where
    try:
        result = subprocess.run(['where', 'wkhtmltopdf'], capture_output=True, text=True)
        if result.stdout:
            return result.stdout.strip().split('\n')[0]
    except:
        pass
    
    return None

WKHTMLTOPDF_PATH = encontrar_wkhtmltopdf()

if WKHTMLTOPDF_PATH:
    print(f"✅ wkhtmltopdf encontrado en: {WKHTMLTOPDF_PATH}")
    config = pdfkit.configuration(wkhtmltopdf=WKHTMLTOPDF_PATH)
else:
    print("⚠️ wkhtmltopdf no encontrado. Usando fallback HTML.")
    config = None

# ============================================================
# CLASE PRINCIPAL
# ============================================================
class PlantillaRenderer:
    """
    Renderer que usa pdfkit + wkhtmltopdf para generar PDFs
    """

    PAGE_WIDTH = 816
    PAGE_HEIGHT = 1286

    def __init__(self, proyecto_slug: str):
        self.proyecto_slug = proyecto_slug
        self.base_path = Path(__file__).parent.parent / "plantillas_html" / proyecto_slug

        if not self.base_path.exists():
            raise FileNotFoundError(f"No se encontró la carpeta de plantillas para: {proyecto_slug}")

        self.config = config

    def _cargar_html(self, nombre_archivo: str) -> str:
        ruta_completa = self.base_path / nombre_archivo
        if not ruta_completa.exists():
            raise FileNotFoundError(f"Archivo HTML no encontrado: {ruta_completa}")
        with open(ruta_completa, 'r', encoding='utf-8') as f:
            return f.read()

    def _extraer_placeholders(self, html_content: str) -> List[str]:
        pattern = r'\{\{([a-zA-Z0-9_]+)\}\}'
        matches = re.findall(pattern, html_content)
        return list(dict.fromkeys(matches))

    def _resaltar_placeholders(self, html_content: str) -> str:
        def reemplazar(match):
            placeholder = match.group(1)
            return f'<span style="background: #fefcbf; border: 2px solid #f6e05e; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #975a16;">{{{{{placeholder}}}}}</span>'
        pattern = r'\{\{([a-zA-Z0-9_]+)\}\}'
        return re.sub(pattern, reemplazar, html_content)

    def _reemplazar_placeholders(self, html_content: str, placeholders: Dict[str, str]) -> str:
        for key, value in placeholders.items():
            placeholder = f"{{{{{key}}}}}"
            if value is None:
                value = ""
            html_content = html_content.replace(placeholder, str(value))
        return html_content

    def _calcular_placeholders_especiales(self, pagina_actual: int = 1, total_paginas: int = 1) -> Dict[str, str]:
        ahora = datetime.now()
        meses_es = {
            'January': 'enero', 'February': 'febrero', 'March': 'marzo',
            'April': 'abril', 'May': 'mayo', 'June': 'junio',
            'July': 'julio', 'August': 'agosto', 'September': 'septiembre',
            'October': 'octubre', 'November': 'noviembre', 'December': 'diciembre'
        }
        fecha_larga = ahora.strftime("%d de %B de %Y")
        for en, es in meses_es.items():
            fecha_larga = fecha_larga.replace(en, es)
        
        return {
            '_fecha_actual': ahora.strftime("%d/%m/%Y"),
            '_fecha_actual_larga': fecha_larga,
            '_fecha_actual_extensa': ahora.strftime("%d del %B del %Y"),
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
        html_content = self._cargar_html(nombre_archivo)
        especiales = self._calcular_placeholders_especiales(pagina_actual, total_paginas)
        
        if placeholders:
            todos_placeholders = {**placeholders, **especiales}
            html_content = self._reemplazar_placeholders(html_content, todos_placeholders)
        
        if preview_mode:
            html_content = self._resaltar_placeholders(html_content)
        
        return html_content

    def generar_pdf(self, html_content: str, nombre_archivo: Optional[str] = None) -> bytes:
        """Genera PDF usando pdfkit o fallback HTML"""
        
        # Si pdfkit está disponible y configurado
        if self.config:
            try:
                # Opciones para formato Oficio México
                options = {
                    'page-size': 'Letter',
                    'margin-top': '15mm',
                    'margin-bottom': '15mm',
                    'margin-left': '15mm',
                    'margin-right': '15mm',
                    'encoding': 'UTF-8',
                    'enable-local-file-access': None,
                    'disable-smart-shrinking': None,
                    'print-media-type': None,
                    'javascript-delay': 500,  # Esperar a que carguen las imágenes
                }
                
                # Generar PDF desde string HTML
                pdf_bytes = pdfkit.from_string(
                    html_content, 
                    False,  # False = no guardar en archivo, retornar bytes
                    options=options,
                    configuration=self.config
                )
                return pdf_bytes
            except Exception as e:
                print(f"⚠️ Error generando PDF con pdfkit: {e}")
                # Si falla, usar fallback HTML
        
        # Fallback: retornar HTML envuelto
        html_completo = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; }}
                .container {{ max-width: 816px; margin: 0 auto; background: white; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                .warning {{ background: #ff6b6b; color: white; padding: 12px; border-radius: 4px; margin-bottom: 16px; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="warning">⚠️ PDF no disponible - Vista previa HTML</div>
                {html_content}
            </div>
        </body>
        </html>
        """
        return html_completo.encode('utf-8')

    def renderizar_pdf(
        self,
        nombre_archivo: str,
        placeholders: Optional[Dict[str, str]] = None,
        preview_mode: bool = False
    ) -> bytes:
        html_content = self.renderizar_html(
            nombre_archivo=nombre_archivo,
            placeholders=placeholders,
            preview_mode=preview_mode
        )
        return self.generar_pdf(html_content, nombre_archivo)

    def extraer_placeholders_desde_archivo(self, nombre_archivo: str) -> List[str]:
        html_content = self._cargar_html(nombre_archivo)
        return self._extraer_placeholders(html_content)


# ============================================================
# FUNCIONES DE UTILIDAD
# ============================================================

def generar_preview_pdf(
    proyecto_slug: str,
    nombre_archivo: str,
    placeholders: Optional[Dict[str, str]] = None,
    preview_mode: bool = False
) -> bytes:
    renderer = PlantillaRenderer(proyecto_slug)
    return renderer.renderizar_pdf(nombre_archivo, placeholders, preview_mode)


def obtener_placeholders_especiales() -> Dict[str, str]:
    return {
        '{{codebar}}': 'Código de barras (se genera automáticamente)',
        '{{_fecha_actual}}': 'Fecha actual en formato dd/mm/aaaa',
        '{{_fecha_actual_larga}}': 'Fecha actual en formato dd de mmmm de aaaa',
        '{{_fecha_actual_extensa}}': 'Fecha actual en formato dd del mmmm del aaaa',
        '{{_numero_pagina}}': 'Número de página actual',
        '{{_total_paginas}}': 'Total de páginas del documento',
        '{{_nombre_proyecto}}': 'Nombre del proyecto',
    }