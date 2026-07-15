# backend/app/services/plantilla_renderer.py
"""
Motor de renderizado de plantillas HTML → PDF
Usa Playwright con Chromium headless
"""

import re
import os
import base64
import time
from pathlib import Path
from typing import Dict, Optional, List, Any
from datetime import datetime
import asyncio
from playwright.async_api import async_playwright

# ============================================================
# DATOS DE EJEMPLO POR PROYECTO
# ============================================================
DATOS_EJEMPLO = {
    'apa_tlajomulco': {
        'clave_apa': 'APA-12345',
        'propietario_nombre': 'JUAN PÉREZ GONZÁLEZ',
        'domicilio': 'Calle Hidalgo 456, Col. Centro',
        'saldo': '$12,345.67',
        'adeudo_agua': '$8,900.00',
        'recargos': '$250.00',
        'actualizacion': '$150.00',
        'total_adeudo': '$12,345.67',
        'codebar': '1234567890',
    },
    'estado': {
        'credito': 'CRED-2024-056',
        'nombre_razon_social': 'EMPRESA EJEMPLO S.A. DE C.V.',
        'importe_historico_determinado': '$156,789.00',
        'calle_numero': 'Blvd. Principal 500',
        'colonia': 'Empresarial',
        'codigo_postal': '45010',
        'municipio': 'Zapopan',
        'rfc': 'EEJ900101ABC',
        'no_documento': 'DOC-2024-001',
        'codebar': '1234567890',
    },
    'pensiones': {
        'nombre': 'JUAN PÉREZ GONZÁLEZ',
        'prestamo': '12345',
        'adeudo': '$45,678.90',
        'ultimo_abono': '15/01/2025',
        'aval_nombre': 'ROBERTO LÓPEZ MARTÍNEZ',
        'codebar': '1234567890',
    },
    'predial_gdl': {
        'propietario': 'ANA LAURA HERNÁNDEZ',
        'cuenta': 'GDL-98765',
        'saldo': '$15,200.00',
        'folio_req': 'FOL-001',
        'axo_req': '2025',
        'codebar': '1234567890',
    },
    'predial_tlajomulco': {
        'cuenta': 'PRED-00123',
        'domicilio': 'Calle Independencia 789',
        'total_adeudo': '$8,900.00',
        'nombre_contribuyente': 'MARÍA GARCÍA LÓPEZ',
        'codebar': '1234567890',
    },
}

# ============================================================
# ALTURA POR PROYECTO Y PLANTILLA
# ============================================================
ALTURAS_ESPECIALES = {
    'estado': {
        'FEDERAL_estado_requerimiento.html': 1300,
        'FE_CI_Liquidaciones_DGOS.html': 1286,
        'FE_CI_Liquidaciones_DNEF.html': 1286,
    },
    'pensiones': {
        'afiliados.html': 1300,
        'avales.html': 1300,
        'garantias.html': 1300,
    },
    'apa_tlajomulco': {
        'apa_tlajomulco.html': 1286,
    },
    'predial_gdl': {
        'predial_gdl.html': 1286,
    },
    'predial_tlajomulco': {
        'predial_tlajomulco.html': 1286,
    },
}

# ============================================================
# FUENTE DE CÓDIGO DE BARRAS
# ============================================================
_RUTA_FUENTE_CODEBAR = Path(__file__).parent.parent / "assets" / "fonts" / "IDAutomationHC39M.ttf"
_FUENTE_CODEBAR_B64: Optional[str] = None


def _cargar_fuente_codebar_base64() -> Optional[str]:
    """Carga la fuente IDAutomationHC39M y la cachea en memoria como base64."""
    global _FUENTE_CODEBAR_B64
    if _FUENTE_CODEBAR_B64 is not None:
        return _FUENTE_CODEBAR_B64

    if not _RUTA_FUENTE_CODEBAR.exists():
        print(f"⚠️ Fuente de código de barras no encontrada en: {_RUTA_FUENTE_CODEBAR}")
        return None

    with open(_RUTA_FUENTE_CODEBAR, 'rb') as f:
        _FUENTE_CODEBAR_B64 = base64.b64encode(f.read()).decode('utf-8')
        print(f"✅ Fuente de código de barras cargada: {_RUTA_FUENTE_CODEBAR.name}")
    return _FUENTE_CODEBAR_B64


# ============================================================
# CLASE PRINCIPAL
# ============================================================
class PlantillaRenderer:
    """
    Renderer que usa Playwright + Chromium para generar PDFs
    """

    PAGE_WIDTH = 816
    PAGE_HEIGHT = 1286

    def __init__(self, proyecto_slug: str):
        self.proyecto_slug = proyecto_slug
        self.base_path = Path(__file__).parent.parent / "plantillas_html" / proyecto_slug

        if not self.base_path.exists():
            raise FileNotFoundError(f"No se encontró la carpeta de plantillas para: {proyecto_slug}")

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
        return {
            '_fecha_actual': ahora.strftime("%d/%m/%Y"),
            '_numero_pagina': str(pagina_actual),
            '_total_paginas': str(total_paginas),
            '_nombre_proyecto': self.proyecto_slug.replace('_', ' ').title(),
        }

    def _obtener_datos_ejemplo(self) -> Dict[str, str]:
        return DATOS_EJEMPLO.get(self.proyecto_slug, {})

    def _obtener_altura(self, nombre_archivo: str) -> int:
        proyecto_alturas = ALTURAS_ESPECIALES.get(self.proyecto_slug, {})
        return proyecto_alturas.get(nombre_archivo, 1286)

    def _generar_codigo_barras(self, datos: Dict[str, str]) -> str:
        """Genera código de barras con formato Código 39 (*TEXTO*)"""
        codebar = datos.get('codebar', '')
        if not codebar:
            timestamp = int(time.time() * 1000) % 10000000000
            codebar = f"TRN{self.proyecto_slug[:4].upper()}{timestamp:010d}"
        return f"*{codebar.upper()}*"

    def _estilo_codebar(self) -> str:
        """
        Bloque <style> con la fuente IDAutomationHC39M embebida
        Tamaño 11px, sin negritas
        """
        fuente_b64 = _cargar_fuente_codebar_base64()

        font_face = ""
        if fuente_b64:
            font_face = f"""
            @font-face {{
                font-family: 'IDAutomationHC39M';
                src: url('data:font/truetype;base64,{fuente_b64}') format('truetype');
                font-weight: normal;
                font-style: normal;
            }}
            """

        return f"""
        <style>
            {font_face}
            .codebar-render {{
                font-family: 'IDAutomationHC39M', monospace !important;
                font-size: 11px !important;
                font-weight: normal !important;
                font-style: normal !important;
                letter-spacing: normal !important;
                white-space: nowrap !important;
                display: inline !important;
                line-height: 1 !important;
                text-decoration: none !important;
                background: transparent !important;
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
            }}
        </style>
        """

    def _convertir_imagenes_a_base64(self, html_content: str) -> str:
        """
        Convierte imágenes a base64 para Playwright
        SOLO CAMBIO: Ahora busca TODAS las variantes de url()
        """
        print(f"\n🔍 [IMÁGENES] Procesando {self.proyecto_slug}...")
        print(f"📁 Ruta base: {self.base_path}")

        img_folder = self.base_path / "img"
        if not img_folder.exists():
            print(f"⚠️ Carpeta img NO EXISTE en: {img_folder}")
            return html_content

        imagenes_disponibles = list(img_folder.glob("*"))
        print(f"📸 Imágenes disponibles ({len(imagenes_disponibles)}): {[f.name for f in imagenes_disponibles]}")

        # Cache de imágenes convertidas
        cache_imagenes = {}

        def obtener_imagen_base64(nombre_imagen: str) -> Optional[str]:
            """Retorna el data:image base64 o None si no existe"""
            nombre_limpio = nombre_imagen.split('?')[0].split('#')[0]
            
            if nombre_limpio in cache_imagenes:
                return cache_imagenes[nombre_limpio]
            
            ruta_imagen = img_folder / nombre_limpio
            print(f"   🔎 Buscando: {nombre_limpio}")
            
            if not ruta_imagen.exists():
                # Intentar con minúsculas
                nombre_minusculas = nombre_limpio.lower()
                if nombre_minusculas != nombre_limpio:
                    ruta_imagen_alt = img_folder / nombre_minusculas
                    if ruta_imagen_alt.exists():
                        ruta_imagen = ruta_imagen_alt
                        nombre_limpio = nombre_minusculas
                        print(f"   🔄 Encontrado como: {nombre_minusculas}")
                    else:
                        print(f"   ❌ NO ENCONTRADA: {nombre_limpio}")
                        cache_imagenes[nombre_limpio] = None
                        return None
                else:
                    print(f"   ❌ NO ENCONTRADA: {nombre_limpio}")
                    cache_imagenes[nombre_limpio] = None
                    return None

            try:
                with open(ruta_imagen, 'rb') as f:
                    img_data = base64.b64encode(f.read()).decode('utf-8')
                    ext = ruta_imagen.suffix.lower()
                    mime = {
                        '.png': 'image/png', '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg', '.gif': 'image/gif',
                        '.svg': 'image/svg+xml', '.webp': 'image/webp'
                    }.get(ext, 'image/png')
                    result = f"data:{mime};base64,{img_data}"
                    cache_imagenes[nombre_limpio] = result
                    print(f"   ✅ Convertida: {nombre_limpio}")
                    return result
            except Exception as e:
                print(f"   ❌ Error al leer {nombre_limpio}: {e}")
                cache_imagenes[nombre_limpio] = None
                return None

        # ============================================================
        # CAMBIO IMPORTANTE: Buscar TODAS las variantes de url()
        # ============================================================
        
        # 1. url('./img/archivo.png') - con ./img/
        def reemplazar_url1(match):
            ruta = match.group(1)
            nombre = ruta.replace('./img/', '').replace('img/', '')
            img_b64 = obtener_imagen_base64(nombre)
            if img_b64:
                return f'url("{img_b64}")'
            return match.group(0)
        
        html_content = re.sub(
            r'url\([\'"]?(\./img/[^\'")]+)[\'"]?\)',
            reemplazar_url1,
            html_content
        )

        # 2. url('img/archivo.png') - sin ./
        def reemplazar_url2(match):
            ruta = match.group(1)
            nombre = ruta.replace('img/', '')
            img_b64 = obtener_imagen_base64(nombre)
            if img_b64:
                return f'url("{img_b64}")'
            return match.group(0)
        
        html_content = re.sub(
            r'url\([\'"]?(img/[^\'")]+)[\'"]?\)',
            reemplazar_url2,
            html_content
        )

        # 3. url('archivo.png') - solo el nombre (asumiendo que está en img/)
        def reemplazar_url3(match):
            nombre = match.group(1).strip()
            # Verificar si existe en la carpeta img
            if (img_folder / nombre).exists() or (img_folder / nombre.lower()).exists():
                img_b64 = obtener_imagen_base64(nombre)
                if img_b64:
                    return f'url("{img_b64}")'
            return match.group(0)
        
        html_content = re.sub(
            r'url\([\'"]?([^/\'")]+\.[a-zA-Z0-9]+)[\'"]?\)',
            reemplazar_url3,
            html_content
        )

        return html_content

    def renderizar_html(
        self,
        nombre_archivo: str,
        placeholders: Optional[Dict[str, str]] = None,
        preview_mode: bool = False,
        pagina_actual: int = 1,
        total_paginas: int = 1,
        usar_datos_ejemplo: bool = False
    ) -> str:
        html_content = self._cargar_html(nombre_archivo)
        especiales = self._calcular_placeholders_especiales(pagina_actual, total_paginas)

        # === 1. INYECTAR ESTILO DE CÓDIGO DE BARRAS ===
        html_content = html_content.replace('</head>', self._estilo_codebar() + '</head>')

        # === 2. PREPARAR DATOS ===
        if usar_datos_ejemplo or preview_mode:
            datos = self._obtener_datos_ejemplo()
            if 'codebar' not in datos:
                datos['codebar'] = '1234567890'
            placeholders = {**datos, **(placeholders or {})}

        # === 3. PROCESAR CÓDIGO DE BARRAS ===
        if '{{codebar}}' in html_content:
            codebar = self._generar_codigo_barras(placeholders or {})
            html_content = html_content.replace(
                '{{codebar}}',
                f'<span class="codebar-render">{codebar}</span>'
            )
            print(f"🔲 Código de barras generado: {codebar}")

        # === 4. PROCESAR RESTO DE PLACEHOLDERS ===
        if placeholders:
            placeholders_sin_codebar = {k: v for k, v in placeholders.items() if k != 'codebar'}
            todos_placeholders = {**placeholders_sin_codebar, **especiales}
            html_content = self._reemplazar_placeholders(html_content, todos_placeholders)

        # === 5. MODO PREVIEW ===
        if preview_mode and not usar_datos_ejemplo:
            html_content = self._resaltar_placeholders(html_content)

        # === 6. CONVERTIR IMÁGENES A BASE64 ===
        html_content = self._convertir_imagenes_a_base64(html_content)

        return html_content

    async def _generar_pdf_async(self, html_content: str, nombre_archivo: str = None) -> bytes:
        altura = self._obtener_altura(nombre_archivo) if nombre_archivo else 1286

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True, 
                args=[
                    '--disable-gpu', 
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            )
            try:
                context = await browser.new_context(viewport={'width': 816, 'height': altura})
                page = await context.new_page()
                
                await page.set_content(html_content, wait_until='networkidle')
                await page.wait_for_timeout(1000)
                
                pdf_bytes = await page.pdf(
                    print_background=True,
                    width=f'816px',
                    height=f'{altura}px',
                    margin={'top': '0mm', 'bottom': '0mm', 'left': '0mm', 'right': '0mm'},
                    prefer_css_page_size=True,
                )
                return pdf_bytes
            finally:
                await browser.close()

    def generar_pdf(self, html_content: str, nombre_archivo: Optional[str] = None) -> bytes:
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            pdf_bytes = loop.run_until_complete(self._generar_pdf_async(html_content, nombre_archivo))
            loop.close()
            return pdf_bytes
        except Exception as e:
            print(f"⚠️ Error generando PDF con Playwright: {e}")
            import traceback
            traceback.print_exc()
            return html_content.encode('utf-8')

    def renderizar_pdf(
        self,
        nombre_archivo: str,
        placeholders: Optional[Dict[str, str]] = None,
        preview_mode: bool = False,
        usar_datos_ejemplo: bool = False
    ) -> bytes:
        html_content = self.renderizar_html(
            nombre_archivo=nombre_archivo,
            placeholders=placeholders,
            preview_mode=preview_mode,
            usar_datos_ejemplo=usar_datos_ejemplo
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
    return renderer.renderizar_pdf(
        nombre_archivo,
        placeholders=placeholders,
        preview_mode=preview_mode,
        usar_datos_ejemplo=preview_mode
    )


def obtener_placeholders_especiales() -> Dict[str, str]:
    return {
        '{{codebar}}': 'Código de barras (Código 39 con asteriscos)',
        '{{_fecha_actual}}': 'Fecha actual en formato dd/mm/aaaa',
        '{{_numero_pagina}}': 'Número de página actual',
        '{{_total_paginas}}': 'Total de páginas del documento',
        '{{_nombre_proyecto}}': 'Nombre del proyecto',
    }