# backend/app/services/codebar_service.py
from datetime import datetime
from typing import Optional
import logging
import base64
import re
from pathlib import Path

logger = logging.getLogger(__name__)

_FONT_PATH = Path(__file__).parent.parent / "assets" / "fonts" / "IDAutomationHC39M.ttf"

class CodebarService:
    """
    Servicio centralizado para generación de códigos de barras.
    Unifica toda la lógica de código de barras en un solo lugar.
    """
    
    # ============================================================
    # MÉTODO PRINCIPAL - FIRMA UNIFICADA
    # ============================================================
    
    @staticmethod
    def generar_codebar_completo(
        pk_value: str,
        fecha_emision: Optional[datetime] = None,
        visita: Optional[str] = None,
        identificador_documento: Optional[str] = None,
        id_documento: Optional[int] = None  # ← AGREGADO para compatibilidad
    ) -> str:
        """
        Genera código de barras con formato: *PK+FECHA+IDENTIFICADOR+VISITA*
        
        Args:
            pk_value: Valor de la llave primaria (ej: cuenta, crédito, préstamo)
            fecha_emision: Fecha de emisión del documento (default: ahora)
            visita: Número de visita (ej: "1", "2", "3")
            identificador_documento: Identificador del documento (ej: "N", "R", "A")
            id_documento: ID del documento (alternativa a identificador_documento)
            
        Returns:
            str: Código de barras en formato Código 39 con asteriscos (*codigo*)
        """
        # Fecha por defecto
        if fecha_emision is None:
            fecha_emision = datetime.now()
        
        # Si se pasa id_documento pero no identificador_documento,
        # obtener el identificador del catálogo (solo si está disponible)
        if id_documento and not identificador_documento:
            # Intentar obtener de la BD (opcional - se puede hacer en el caller)
            identificador_documento = CodebarService._get_identificador_from_db(id_documento)
        
        # Fecha base Excel (1899-12-30)
        fecha_base_excel = datetime(1899, 12, 30)
        
        # 1. PK COMPLETA (NO TRUNCADA)
        pk_completa = str(pk_value)
        
        # 2. Fecha serial (días transcurridos desde 1899-12-30)
        fecha_str = str((fecha_emision - fecha_base_excel).days)
        
        # 3. Identificador del documento (N, R, A...)
        ident_str = str(identificador_documento).upper() if identificador_documento else ""
        
        # 4. Visita (número)
        visita_str = str(visita).strip() if visita else ""
        
        # Combinar todo
        codigo = f"{pk_completa}{fecha_str}{ident_str}{visita_str}"
        
        # Retornar formato Código 39
        return f"*{codigo.upper()}*"
    
    # ============================================================
    # MÉTODO ALIAS - PARA COMPATIBILIDAD CON CÓDIGO EXISTENTE
    # ============================================================
    
    @staticmethod
    def generar_codebar(
        pk_value: str,
        fecha_emision: Optional[datetime] = None,
        identificador: Optional[str] = None,
        visita: Optional[str] = None
    ) -> str:
        """
        Alias de generar_codebar_completo para compatibilidad.
        """
        return CodebarService.generar_codebar_completo(
            pk_value=pk_value,
            fecha_emision=fecha_emision,
            identificador_documento=identificador,
            visita=visita
        )
    
    # ============================================================
    # MÉTODO PARA INYECTAR ESTILO CSS
    # ============================================================
    
    @staticmethod
    def render_codebar_html(codebar: str) -> str:
        """Devuelve el <span> con la clase .codebar listo para meterse en la plantilla."""
        return f'<span class="codebar">{codebar or ""}</span>'
 
    @staticmethod
    def inject_codebar_style(html_content: str) -> str:
        """
        Inyecta @font-face + clase .codebar. Idempotente.
        IMPORTANTE: ya no depende de encontrar '{{codebar}}' (el renderer lo reemplaza
        ANTES de llamar a este método, por eso antes nunca se aplicaba la fuente).
        """
        if "IDAutomationHC39M" in html_content:
            return html_content
 
        if not _FONT_PATH.exists():
            # Mejor fallar fuerte que generar 10,000 PDFs con texto plano en vez de barras
            raise FileNotFoundError(f"No existe la fuente del código de barras: {_FONT_PATH}")
 
        font_b64 = base64.b64encode(_FONT_PATH.read_bytes()).decode("utf-8")
 
        style = f"""
                <style>
                @font-face {{
                    font-family: 'IDAutomationHC39M';
                    src: url('data:font/truetype;base64,{font_b64}') format('truetype');
                    font-weight: normal;
                    font-style: normal;
                }}
                .codebar {{
                    font-family: 'IDAutomationHC39M' !important;
                    font-size: 16px !important;      /* 10px es demasiado chico para que las barras se lean */
                    font-weight: 400 !important;     /* si el padre es bold, Chromium "engorda" las barras y se rompen */
                    font-style: normal !important;
                    letter-spacing: 0 !important;
                    line-height: 1 !important;
                    white-space: pre !important;
                }}
                </style>
                """
        if "</head>" in html_content:
            return html_content.replace("</head>", style + "</head>", 1)
        return style + html_content
    
    # ============================================================
    # MÉTODO PARA GENERAR HTML DE CÓDIGO DE BARRAS
    # ============================================================
    
    @staticmethod
    def generate_codebar_html(codebar: str) -> str:
        """
        Genera el HTML para mostrar un código de barras con la fuente correcta.
        """
        return f'<span class="codebar">{codebar}</span>'
    
    # ============================================================
    # MÉTODO PRIVADO PARA OBTENER IDENTIFICADOR DESDE BD
    # ============================================================
    
    @staticmethod
    def _get_identificador_from_db(id_documento: int) -> Optional[str]:
        """
        Obtiene el identificador del documento desde la base de datos.
        NOTA: Este método requiere una sesión de BD activa.
        """
        # Este método se puede implementar si es necesario
        # Por ahora, retorna None
        return None