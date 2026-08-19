# backend/app/services/codebar_service.py
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class CodebarService:
    @staticmethod
    def generar_codebar_completo(
        pk_value: str,
        fecha_emision: datetime,
        visita: Optional[str] = None,
        identificador_documento: Optional[str] = None
    ) -> str:
        """
        LÓGICA ÚNICA CENTRALIZADA
        Genera código de barras con formato: *PK+FECHA+IDENTIFICADOR+VISTA*
        """
        # Fecha base Excel (1899-12-30)
        fecha_base_excel = datetime(1899, 12, 30)
        
        # 1. PK COMPLETA
        pk_completa = str(pk_value)
        
        # 2. Fecha serial (días transcurridos)
        fecha_str = str((fecha_emision - fecha_base_excel).days)
        
        # 3. Identificador del documento (N, R, A...)
        ident_str = str(identificador_documento).upper() if identificador_documento else ""
        
        # 4. Visita
        visita_str = str(visita).strip() if visita else ""
        
        # Combinar
        codigo = f"{pk_completa}{fecha_str}{ident_str}{visita_str}"
        
        # Retornar formato Código 39
        return f"*{codigo.upper()}*"