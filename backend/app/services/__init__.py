 
"""
Servicios de la aplicación Trinnova
"""

from .plantilla_renderer import (
    PlantillaRenderer,
    generar_preview_pdf,
    obtener_placeholders_especiales
)

__all__ = [
    'PlantillaRenderer',
    'generar_preview_pdf',
    'obtener_placeholders_especiales'
]