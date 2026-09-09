# backend/app/services/codebar_service.py
from datetime import datetime
from typing import Optional
import logging
import base64
from pathlib import Path

logger = logging.getLogger(__name__)

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
    def inject_codebar_style(html_content: str) -> str:
        """
        Inyecta el estilo CSS necesario para renderizar códigos de barras.
        
        NOTA: Este método es un helper para desarrollo/preview.
        En producción, el estilo debería estar incluido en el HTML de la plantilla.
        """
        # Si ya tiene la fuente, no hacer nada
        if 'IDAutomationHC39M' in html_content:
            return html_content
        
        # Cargar la fuente desde el archivo .ttf y convertir a base64
        font_ttf_path = Path(__file__).parent.parent / "assets" / "fonts" / "IDAutomationHC39M.ttf"
        
        font_base64 = ""
        if font_ttf_path.exists():
            try:
                with open(font_ttf_path, 'rb') as f:
                    font_base64 = base64.b64encode(f.read()).decode('utf-8')
            except Exception as e:
                logger.warning(f"No se pudo cargar la fuente: {e}")
        
        # Si no se pudo cargar la fuente, usar un fallback
        if not font_base64:
            # Este es un fallback mínimo - la fuente real es necesaria para códigos de barras
            font_base64 = "AAEAAAALAIAAAwAwT1MvMg8SA..."  # Fallback vacío
            logger.warning("Usando fallback para fuente de código de barras")
        
        style = f'''
        <style>
        @font-face {{
            font-family: 'IDAutomationHC39M';
            src: url('data:font/truetype;charset=utf-8;base64,{font_base64}') format('truetype');
            font-weight: normal;
            font-style: normal;
        }}
        .codebar, [class*="codebar"], [class*="c-o-d-e-b-a-r"] {{
            font-family: 'IDAutomationHC39M', 'Courier New', monospace !important;
            font-size: 10px;
            letter-spacing: 1px;
            font-weight: 400;
        }}
        .c-o-d-e-b-a-r-05214b39831f {{
            font-family: 'IDAutomationHC39M', 'Courier New', monospace !important;
            font-size: 10px;
            letter-spacing: 1px;
        }}
        </style>
        '''
        
        # Insertar antes del cierre de </head>
        if '</head>' in html_content:
            return html_content.replace('</head>', style + '</head>')
        
        # Si no hay </head>, insertar al inicio
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