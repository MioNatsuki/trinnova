# backend/app/services/codebar_service.py
"""
CodebarService - Generación de códigos de barras Código 39
"""

import base64
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Ruta de la fuente IDAutomationHC39M
_FONT_PATH = Path(__file__).parent.parent / "assets" / "fonts" / "IDAutomationHC39M.ttf"
_FONT_B64: Optional[str] = None

def _cargar_fuente() -> Optional[str]:
    """Carga la fuente de código de barras en base64."""
    global _FONT_B64
    
    if _FONT_B64 is not None:
        return _FONT_B64
    
    if not _FONT_PATH.exists():
        logger.warning(f"Fuente de código de barras no encontrada: {_FONT_PATH}")
        return None
    
    with open(_FONT_PATH, 'rb') as f:
        _FONT_B64 = base64.b64encode(f.read()).decode('utf-8')
    
    return _FONT_B64


class CodebarService:
    """Servicio para generación de códigos de barras Código 39."""
    
    @staticmethod
    def generar_codebar_completo(
        pk_value: str,
        identificador: Optional[str] = None,
        visita: Optional[str] = None,
        fecha_emision: Optional[datetime] = None
    ) -> str:
        """
        Genera código de barras en formato Código 39.
        
        Formato: *PK+FECHA+IDENTIFICADOR+VISITA*
        
        Args:
            pk_value: Valor de la PK (completa, sin truncar)
            identificador: Identificador del documento (N, R, A, etc.)
            visita: Número de visita
            fecha_emision: Fecha de emisión (default: ahora)
        
        Returns:
            str: Código de barras con asteriscos
        """
        fecha_emision = fecha_emision or datetime.now()
        fecha_base_excel = datetime(1899, 12, 30)
        
        # PK completa - NO TRUNCADA
        pk_completa = str(pk_value)
        
        # Fecha serial (días desde 1899-12-30)
        fecha_str = str((fecha_emision - fecha_base_excel).days)
        
        # Identificador + visita
        ident_str = str(identificador).upper() if identificador else ""
        visita_str = str(visita).strip() if visita else ""
        combo_str = f"{ident_str}{visita_str}" if ident_str or visita_str else ""
        
        # Construir código
        codigo = f"{pk_completa}{fecha_str}{combo_str}"
        
        # Código 39 con asteriscos
        return f"*{codigo.upper()}*"
    
    @staticmethod
    def generar_codebar_simple(pk_value: str) -> str:
        """Genera código de barras simple (solo PK + fecha)."""
        return CodebarService.generar_codebar_completo(pk_value)
    
    @staticmethod
    def obtener_estilo_codebar() -> str:
        """
        Obtiene el CSS para renderizar códigos de barras.
        """
        fuente_b64 = _cargar_fuente()
        
        if not fuente_b64:
            # Fallback: usar fuente monoespaciada
            return """
            <style>
                .codebar-render {
                    font-family: 'Courier New', monospace !important;
                    font-size: 12px !important;
                    font-weight: bold !important;
                    letter-spacing: 1px !important;
                    white-space: nowrap !important;
                }
            </style>
            """
        
        return f"""
        <style>
            @font-face {{
                font-family: 'IDAutomationHC39M';
                src: url('data:font/truetype;base64,{fuente_b64}') format('truetype');
                font-weight: normal;
                font-style: normal;
            }}
            .codebar-render {{
                font-family: 'IDAutomationHC39M', 'Courier New', monospace !important;
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
    
    @staticmethod
    def inject_codebar_style(html: str) -> str:
        """Inyecta el estilo de código de barras en el HTML."""
        style = CodebarService.obtener_estilo_codebar()
        if '<head>' in html:
            return html.replace('<head>', f'<head>{style}')
        return f'{style}{html}'