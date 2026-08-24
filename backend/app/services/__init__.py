# backend/app/services/__init__.py

"""
Servicios de Trinnova
"""

from .log_service import registrar_log
from .inpc_service import INPCService
from .numero_a_letras import numero_a_letras
from .monitoreo_service import MonitoreoService

# PlantillaRenderer - versión asíncrona
from .plantilla_renderer import (
    PlantillaRenderer,
    renderizar_pdf_simple,
    renderizar_pdfs_batch,
    obtener_placeholders_especiales
)

# CodebarService
from .codebar_service import CodebarService

# EmisionService
from .emision_service import EmisionService