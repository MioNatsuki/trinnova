# backend/app/services/plantilla_renderer.py
"""
PlantillaRenderer - Motor de renderizado para emisión masiva
Adaptado para alta concurrencia y reutilización de navegador
"""

import re
import os
import base64
import asyncio
import logging
from pathlib import Path
from typing import Dict, Optional, List, Any, Set
from datetime import datetime
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from app.core.config import settings

logger = logging.getLogger(__name__)

# ============================================================
# CONSTANTES
# ============================================================

PAGE_WIDTH = 816
PAGE_HEIGHT = 1286

# Alturas específicas por plantilla
ALTURAS_ESPECIALES = {
    "estado": {
        "FEDERAL_estado_requerimiento.html": 1300,
        "FE_CI_Liquidaciones_DGOS.html": 1286,
        "FE_CI_Liquidaciones_DNEF.html": 1286,
    },
    "pensiones": {
        "afiliados.html": 1300,
        "avales.html": 1300,
        "garantias.html": 1300,
    },
    "apa_tlajomulco": {"apa_tlajomulco.html": 1286},
    "predial_gdl": {"predial_gdl.html": 1286},
    "predial_tlajomulco": {"predial_tlajomulco.html": 1286},
}

# ============================================================
# CLASE PRINCIPAL
# ============================================================

class PlantillaRenderer:
    """
    Renderer optimizado para emisión masiva.
    - Reutiliza el navegador para múltiples PDFs
    - Soporta renderizado concurrente con páginas
    - Cache de HTML y recursos
    """
    
    _instance = None
    _browser: Optional[Browser] = None
    _context: Optional[BrowserContext] = None
    _playwright = None
    _html_cache: Dict[str, str] = {}
    _image_cache: Dict[str, str] = {}
    _lock = asyncio.Lock()
    
    def __init__(self, proyecto_slug: str):
        self.proyecto_slug = proyecto_slug
        self.base_path = Path(__file__).parent.parent / "plantillas_html" / proyecto_slug
        self._cache_placeholders: Dict[str, List[str]] = {}
        
        if not self.base_path.exists():
            raise FileNotFoundError(f"No se encontró la carpeta de plantillas para: {proyecto_slug}")
    
    # ============================================================
    # GESTIÓN DEL NAVEGADOR (SINGLETON GLOBAL)
    # ============================================================
    
    @classmethod
    async def get_browser(cls) -> Browser:
        """
        Obtiene una instancia única del navegador.
        Se reutiliza para todos los PDFs.
        """
        async with cls._lock:
            if cls._browser is None:
                logger.info("Iniciando navegador Chromium (singleton)...")
                cls._playwright = await async_playwright().start()
                cls._browser = await cls._playwright.chromium.launch(
                    headless=True,
                    args=[
                        '--disable-gpu',
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-setuid-sandbox'
                    ]
                )
                cls._context = await cls._browser.new_context(
                    viewport={'width': PAGE_WIDTH, 'height': PAGE_HEIGHT},
                    device_scale_factor=1,
                )
                logger.info("Navegador iniciado correctamente")
            return cls._browser
    
    @classmethod
    async def close_browser(cls):
        """Cierra el navegador globalmente."""
        async with cls._lock:
            if cls._context:
                await cls._context.close()
                cls._context = None
            if cls._browser:
                await cls._browser.close()
                cls._browser = None
            if cls._playwright:
                await cls._playwright.stop()
                cls._playwright = None
            cls._html_cache.clear()
            cls._image_cache.clear()
            logger.info("Navegador cerrado")
    
    # ============================================================
    # CACHE DE PLANTILLAS
    # ============================================================
    
    def _get_cache_key(self, nombre_archivo: str, preview_mode: bool = False) -> str:
        return f"{nombre_archivo}:{self.proyecto_slug}:{preview_mode}"
    
    def _cargar_html(self, nombre_archivo: str, force_reload: bool = False) -> str:
        """Carga HTML con caché."""
        cache_key = self._get_cache_key(nombre_archivo)
        
        if cache_key in self._html_cache and not force_reload:
            return self._html_cache[cache_key]
        
        ruta_completa = self.base_path / nombre_archivo
        if not ruta_completa.exists():
            raise FileNotFoundError(f"Archivo HTML no encontrado: {ruta_completa}")
        
        with open(ruta_completa, 'r', encoding='utf-8') as f:
            html = f.read()
        
        self._html_cache[cache_key] = html
        return html
    
    def _cargar_imagen_base64(self, nombre_imagen: str) -> Optional[str]:
        """Carga imagen y la convierte a base64 con caché."""
        if nombre_imagen in self._image_cache:
            return self._image_cache[nombre_imagen]
        
        img_folder = self.base_path / "img"
        if not img_folder.exists():
            return None
        
        # Buscar la imagen (con y sin minúsculas)
        posibles = [nombre_imagen, nombre_imagen.lower()]
        for nombre in posibles:
            ruta_imagen = img_folder / nombre
            if ruta_imagen.exists():
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
                        self._image_cache[nombre_imagen] = result
                        return result
                except Exception as e:
                    logger.warning(f"Error convirtiendo imagen {nombre_imagen}: {e}")
                    continue
        
        return None
    
    def _convertir_imagenes_a_base64(self, html_content: str) -> str:
        """Convierte todas las imágenes a base64 en el HTML."""
        # Buscar patrones: url('./img/archivo.png'), url('img/archivo.png'), url('archivo.png')
        pattern = r"url\(['\"]?(?:\./)?(?:img/)?([^'\"()]+)['\"]?\)"
        
        def reemplazar(match):
            nombre_imagen = match.group(1).strip()
            img_b64 = self._cargar_imagen_base64(nombre_imagen)
            if img_b64:
                return f"url('{img_b64}')"
            return match.group(0)
        
        return re.sub(pattern, reemplazar, html_content)
    
    # ============================================================
    # EXTRACCIÓN DE PLACEHOLDERS
    # ============================================================
    
    def extraer_placeholders(self, nombre_archivo: str) -> List[str]:
        """Extrae todos los placeholders de una plantilla."""
        if nombre_archivo in self._cache_placeholders:
            return self._cache_placeholders[nombre_archivo]
        
        html = self._cargar_html(nombre_archivo)
        pattern = r'\{\{([a-zA-Z0-9_]+)\}\}'
        matches = re.findall(pattern, html)
        placeholders = list(dict.fromkeys(matches))
        self._cache_placeholders[nombre_archivo] = placeholders
        return placeholders
    
    def _calcular_placeholders_especiales(
        self,
        pagina_actual: int = 1,
        total_paginas: int = 1,
        codebar: str = ""
    ) -> Dict[str, str]:
        """Calcula placeholders especiales (fechas, páginas, etc.)"""
        ahora = datetime.now()
        return {
            '{{_fecha_actual}}': ahora.strftime("%d/%m/%Y"),
            '{{_fecha_actual_larga}}': ahora.strftime("%d de %B de %Y"),
            '{{_numero_pagina}}': str(pagina_actual),
            '{{_total_paginas}}': str(total_paginas),
            '{{_nombre_proyecto}}': self.proyecto_slug.replace('_', ' ').title(),
            '{{_hora_actual}}': ahora.strftime("%H:%M"),
        }
    
    # ============================================================
    # RENDERIZADO DE PDF (NÚCLEO)
    # ============================================================
    
    async def render_pdf(
        self,
        nombre_archivo: str,
        placeholders: Dict[str, str],
        altura: Optional[int] = None,
        pagina_actual: int = 1,
        total_paginas: int = 1,
        codebar: Optional[str] = None,
        usar_cache: bool = True
    ) -> bytes:
        """
        Renderiza un PDF desde una plantilla HTML.
        
        Args:
            nombre_archivo: Nombre del archivo HTML
            placeholders: Diccionario de placeholders a reemplazar
            altura: Altura personalizada (opcional)
            pagina_actual: Número de página actual
            total_paginas: Total de páginas del documento
            codebar: Código de barras personalizado (opcional)
            usar_cache: Usar caché de HTML
        
        Returns:
            bytes: Contenido del PDF
        """
        # 1. Obtener navegador
        browser = await self.get_browser()
        context = PlantillaRenderer._context
        
        # 2. Cargar HTML
        html = self._cargar_html(nombre_archivo, force_reload=not usar_cache)
        
        # 3. Reemplazar placeholders
        # Placeholders especiales
        especiales = self._calcular_placeholders_especiales(
            pagina_actual, total_paginas, codebar or ""
        )
        
        # Combinar todos los placeholders (prioridad: los pasados por parámetro)
        todos_placeholders = {**especiales, **placeholders}
        
        # Reemplazar en HTML
        for key, value in todos_placeholders.items():
            if value is None:
                value = ""
            html = html.replace(f"{{{{{key}}}}}", str(value))
        
        # 4. Inyectar estilo de código de barras
        from app.services.codebar_service import CodebarService
        html = CodebarService.inject_codebar_style(html)
        
        # 5. Convertir imágenes a base64
        html = self._convertir_imagenes_a_base64(html)
        
        # 6. Generar PDF
        altura_final = altura or ALTURAS_ESPECIALES.get(self.proyecto_slug, {}).get(
            nombre_archivo, PAGE_HEIGHT
        )
        
        page = await context.new_page()
        try:
            await page.set_content(html, wait_until='networkidle')
            await page.wait_for_timeout(500)
            
            pdf_bytes = await page.pdf(
                print_background=True,
                width=f'{PAGE_WIDTH}px',
                height=f'{altura_final}px',
                margin={'top': '0mm', 'bottom': '0mm', 'left': '0mm', 'right': '0mm'},
                prefer_css_page_size=True,
            )
            return pdf_bytes
        finally:
            await page.close()
    
    # ============================================================
    # RENDERIZADO CONCURRENTE (BATCH)
    # ============================================================
    
    async def render_batch_pdfs(
        self,
        nombre_archivo: str,
        placeholders_list: List[Dict[str, str]],
        max_concurrent: int = 10,
        altura: Optional[int] = None,
        codebar_prefix: Optional[str] = None
    ) -> List[bytes]:
        """
        Renderiza múltiples PDFs en paralelo.
        
        Args:
            nombre_archivo: Nombre del archivo HTML
            placeholders_list: Lista de placeholders para cada PDF
            max_concurrent: Número máximo de páginas concurrentes
            altura: Altura personalizada
            codebar_prefix: Prefijo para códigos de barras (opcional)
        
        Returns:
            List[bytes]: Lista de PDFs
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def render_one(placeholders: Dict[str, str], idx: int) -> bytes:
            async with semaphore:
                # Generar código de barras si se solicitó
                codebar = None
                if codebar_prefix:
                    from app.services.codebar_service import CodebarService
                    pk = placeholders.get('pk', str(idx))
                    codebar = CodebarService.generar_codebar_completo(
                        pk_value=pk,
                        identificador=placeholders.get('identificador_documento'),
                        visita=placeholders.get('visita')
                    )
                
                return await self.render_pdf(
                    nombre_archivo,
                    placeholders,
                    altura,
                    pagina_actual=idx + 1,
                    total_paginas=len(placeholders_list),
                    codebar=codebar
                )
        
        tasks = [render_one(p, i) for i, p in enumerate(placeholders_list)]
        resultados = await asyncio.gather(*tasks)
        return resultados
    
    # ============================================================
    # MÉTODOS DE UTILIDAD
    # ============================================================
    
    def get_altura(self, nombre_archivo: str) -> int:
        """Obtiene la altura recomendada para una plantilla."""
        return ALTURAS_ESPECIALES.get(self.proyecto_slug, {}).get(
            nombre_archivo, PAGE_HEIGHT
        )
    
    def get_template_path(self, nombre_archivo: str) -> Path:
        """Obtiene la ruta completa de una plantilla."""
        return self.base_path / nombre_archivo
    
    def template_exists(self, nombre_archivo: str) -> bool:
        """Verifica si una plantilla existe."""
        return (self.base_path / nombre_archivo).exists()
    
    def list_templates(self) -> List[str]:
        """Lista todas las plantillas disponibles."""
        return [f.name for f in self.base_path.glob("*.html")]


# ============================================================
# FUNCIONES DE CONVENIENCIA
# ============================================================

async def renderizar_pdf_simple(
    proyecto_slug: str,
    nombre_archivo: str,
    placeholders: Dict[str, str]
) -> bytes:
    """Función simple para renderizar un PDF."""
    renderer = PlantillaRenderer(proyecto_slug)
    return await renderer.render_pdf(nombre_archivo, placeholders)


async def renderizar_pdfs_batch(
    proyecto_slug: str,
    nombre_archivo: str,
    placeholders_list: List[Dict[str, str]],
    max_concurrent: int = 10
) -> List[bytes]:
    """Función simple para renderizar múltiples PDFs."""
    renderer = PlantillaRenderer(proyecto_slug)
    return await renderer.render_batch_pdfs(
        nombre_archivo,
        placeholders_list,
        max_concurrent=max_concurrent
    )


def obtener_placeholders_especiales() -> Dict[str, str]:
    """Retorna la lista de placeholders especiales del sistema."""
    return {
        '{{_fecha_actual}}': 'Fecha actual en formato dd/mm/aaaa',
        '{{_fecha_actual_larga}}': 'Fecha actual en formato largo',
        '{{_numero_pagina}}': 'Número de página actual',
        '{{_total_paginas}}': 'Total de páginas del documento',
        '{{_nombre_proyecto}}': 'Nombre del proyecto',
        '{{_hora_actual}}': 'Hora actual',
        '{{codebar}}': 'Código de barras (Código 39)',
    }

def generar_preview_pdf(
    proyecto_slug: str,
    nombre_archivo: str,
    placeholders: Optional[Dict[str, str]] = None,
    preview_mode: bool = False
) -> bytes:
    """
    Genera un PDF de preview de la plantilla.
    Función síncrona para compatibilidad con el código existente.
    """
    import asyncio
    
    renderer = PlantillaRenderer(proyecto_slug)
    
    async def _generar():
        # Asegurar que el navegador está iniciado
        await PlantillaRenderer.get_browser()
        
        # Preparar placeholders
        if preview_mode:
            # Modo preview: usar datos de ejemplo
            datos_ejemplo = _obtener_datos_ejemplo(proyecto_slug)
            if datos_ejemplo:
                placeholders = {**(placeholders or {}), **datos_ejemplo}
        
        # Generar código de barras si no existe
        if placeholders and 'codebar' not in placeholders:
            from app.services.codebar_service import CodebarService
            pk = placeholders.get('pk', '12345')
            placeholders['codebar'] = CodebarService.generar_codebar_completo(pk)
        
        return await renderer.render_pdf(
            nombre_archivo,
            placeholders or {},
            codebar=placeholders.get('codebar') if placeholders else None
        )
    
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(_generar())
        loop.close()
        return result
    except Exception as e:
        raise RuntimeError(f"Error generando preview PDF: {e}")


def _obtener_datos_ejemplo(proyecto_slug: str) -> Dict[str, str]:
    """Obtiene datos de ejemplo para el preview."""
    ejemplos = {
        'apa_tlajomulco': {
            'clave_apa': 'APA-12345',
            'propietario_nombre': 'JUAN PÉREZ GONZÁLEZ',
            'domicilio': 'Calle Hidalgo 456, Col. Centro',
            'saldo': '$12,345.67',
            'adeudo_agua': '$8,900.00',
            'recargos': '$250.00',
            'actualizacion': '$150.00',
            'total_adeudo': '$12,345.67',
            'pk': '12345'
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
            'pk': 'CRED-2024-056'
        },
        'pensiones': {
            'nombre': 'JUAN PÉREZ GONZÁLEZ',
            'prestamo': '12345',
            'adeudo': '$45,678.90',
            'ultimo_abono': '15/01/2025',
            'aval_nombre': 'ROBERTO LÓPEZ MARTÍNEZ',
            'pk': '12345'
        },
        'predial_gdl': {
            'propietario': 'ANA LAURA HERNÁNDEZ',
            'cuenta': 'GDL-98765',
            'saldo': '$15,200.00',
            'folio_req': 'FOL-001',
            'axo_req': '2025',
            'pk': 'GDL-98765'
        },
        'predial_tlajomulco': {
            'cuenta': 'PRED-00123',
            'domicilio': 'Calle Independencia 789',
            'total_adeudo': '$8,900.00',
            'nombre_contribuyente': 'MARÍA GARCÍA LÓPEZ',
            'pk': 'PRED-00123'
        }
    }
    return ejemplos.get(proyecto_slug, {})