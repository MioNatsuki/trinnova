# backend/app/services/formatters.py
"""
Formateadores de fecha, moneda y otros valores para las plantillas HTML.
Se usan tanto en el renderer del backend como en el worker.
"""

from datetime import datetime, date
from typing import Optional, Any
import re


# ============================================================
# CONSTANTES
# ============================================================

MESES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]
MESES_ES_LOWER = [m.lower() for m in MESES_ES]


# ============================================================
# FORMATO DE FECHA POR PROYECTO
# ============================================================

FORMATO_FECHA_POR_PROYECTO = {
    'pensiones':          'dd/Mes/yyyy',   # 02/Octubre/2026
    'estado':             'es-long',       # 2 de octubre de 2026
    'apa_tlajomulco':     'dd/mm/yyyy',
    'predial_tlajomulco': 'dd/mm/yyyy',
    'predial_gdl':        'dd/mm/yyyy',
    'licencias_gdl':      'dd/mm/yyyy',
}


# Campos que contienen fechas, por proyecto
CAMPOS_FECHA_POR_PROYECTO = {
    'pensiones': [
        'ultimo_abono', 'ultimo_abono_modificado',
        'fecha_emision', 'fecha_alta', 'ultima_aportacion',
        'fecha_convenio', 'fecha_asignacion',
    ],
    'estado': [
        'fecha_notificacion', 'fecha_documento_determinante',
        'fecha_recepcion', 'exigible', 'fecha_emision',
        'fecha_inpc_a', 'fecha_inpc_b',
    ],
    'apa_tlajomulco': [
        'fecha_lectura', 'fecha_emision',
        'periodo_desde', 'periodo_hasta',
    ],
    'licencias_gdl': ['fecemi', 'fecha_emision'],
    'predial_gdl':    ['fecha_emision'],
    'predial_tlajomulco': ['fecha_emision'],
}


# ============================================================
# FORMATO DE MONEDA POR PROYECTO
# ============================================================

CAMPOS_MONEDA_POR_PROYECTO = {
    'pensiones': [
        'adeudo', 'saldo_por_vencer', 'moratorio', 'liquidacion',
    ],
    'estado': [
        'importe_historico_determinado', 'importe_actualizacion',
        'total_multa_actualizada', 'gastos_ejecucion',
    ],
    'apa_tlajomulco': [
        'saldo', 'adeudo_agua', 'adeudo_colectores',
        'adeudo_infraestructura', 'actualizacion', 'total_adeudo',
        'gastos', 'multa', 'conexiones', 'gasto_estimado',
    ],
    'predial_gdl': [
        'saldo', 'impuesto', 'recargo', 'actualizacion',
        'total_multas', 'total_gastos',
    ],
    'predial_tlajomulco': [
        'gastos_totales', 'multas', 'recargos_totales',
        'impuestos_totales', 'incp', 'total_adeudo',
    ],
    'licencias_gdl': [
        'derechos', 'recargos', 'multas', 'anuncios',
        'holograma', 'solicitud', 'gastos', 'total',
    ],
}


# ============================================================
# PARSEO DE FECHAS
# ============================================================

def parse_fecha(valor: Any) -> Optional[datetime]:
    """
    Parsea múltiples formatos de fecha a datetime.
    Retorna None si no se puede parsear.
    """
    if valor is None or valor == '':
        return None

    # Ya es datetime
    if isinstance(valor, datetime):
        return valor

    # Es date (sin hora)
    if isinstance(valor, date):
        return datetime(valor.year, valor.month, valor.day)

    # pandas.Timestamp
    if hasattr(valor, 'to_pydatetime'):
        try:
            return valor.to_pydatetime()
        except Exception:
            pass

    s = str(valor).strip()
    if not s:
        return None

    # ISO: YYYY-MM-DD o YYYY-MM-DD HH:MM:SS
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        try:
            return datetime.strptime(s[:19] if len(s) >= 19 else s[:10],
                                     '%Y-%m-%d %H:%M:%S' if len(s) >= 19 else '%Y-%m-%d')
        except ValueError:
            try:
                return datetime.strptime(s[:10], '%Y-%m-%d')
            except ValueError:
                pass

    # dd/mm/yyyy
    if len(s) >= 10 and s[2] == '/' and s[5] == '/':
        try:
            return datetime.strptime(s[:10], '%d/%m/%Y')
        except ValueError:
            pass

    # dd-Mes-yyyy (02/Octubre/2026) o dd/MM/yyyy
    partes = s.split('/')
    if len(partes) == 3:
        try:
            dia = int(partes[0])
            mes_str = partes[1].strip()
            anio = int(partes[2])
            # ¿Es número?
            if mes_str.isdigit():
                return datetime(anio, int(mes_str), dia)
            # ¿Es nombre de mes?
            mes_lower = mes_str.lower()
            for i, m in enumerate(MESES_ES_LOWER):
                if m.startswith(mes_lower[:3]):
                    return datetime(anio, i + 1, dia)
        except (ValueError, IndexError):
            pass

    return None


# ============================================================
# FORMATO DE FECHA
# ============================================================

def formatear_fecha(valor: Any, proyecto_slug: str) -> Optional[str]:
    """
    Convierte un valor de fecha al formato del proyecto.
    Retorna None si el valor está vacío.
    """
    if valor is None or valor == '':
        return None

    fecha = parse_fecha(valor)
    if not fecha:
        # Devolver el valor original si no se pudo parsear
        return str(valor)

    fmt = FORMATO_FECHA_POR_PROYECTO.get(proyecto_slug, 'dd/mm/yyyy')
    dia = fecha.day
    mes = fecha.month
    anio = fecha.year

    if fmt == 'es-long':
        return f"{dia} de {MESES_ES_LOWER[mes - 1]} de {anio}"

    if fmt == 'dd/Mes/yyyy':
        return f"{dia:02d}/{MESES_ES[mes - 1]}/{anio}"

    # dd/mm/yyyy (default)
    return f"{dia:02d}/{mes:02d}/{anio}"


# ============================================================
# FORMATO DE MONEDA
# ============================================================

def formatear_moneda(valor: Any) -> str:
    """
    Formatea un número como moneda mexicana: $708,234.79
    Retorna '' si el valor está vacío.
    """
    if valor is None or valor == '':
        return ''

    # Limpiar el valor
    if isinstance(valor, str):
        limpio = valor.replace(',', '').replace('$', '').strip()
        if not limpio:
            return ''
        try:
            num = float(limpio)
        except (ValueError, TypeError):
            return str(valor)
    else:
        try:
            num = float(valor)
        except (ValueError, TypeError):
            return str(valor)

    return f"${num:,.2f}"


# ============================================================
# APLICAR FORMATOS A UN DICCIONARIO DE PLACEHOLDERS
# ============================================================

def aplicar_formato_fechas(placeholders: dict, proyecto_slug: str) -> dict:
    """
    Aplica formato de fecha a los campos conocidos como fechas
    en el proyecto indicado.
    """
    campos = CAMPOS_FECHA_POR_PROYECTO.get(proyecto_slug, [])
    ph = dict(placeholders)

    for campo in campos:
        if campo in ph and ph[campo] is not None and str(ph[campo]).strip() != '':
            formateado = formatear_fecha(ph[campo], proyecto_slug)
            if formateado is not None:
                ph[campo] = formateado

    return ph


def aplicar_formato_moneda(placeholders: dict, proyecto_slug: str) -> dict:
    """
    Aplica formato de moneda a los campos conocidos como monetarios
    en el proyecto indicado.
    """
    campos = CAMPOS_MONEDA_POR_PROYECTO.get(proyecto_slug, [])
    ph = dict(placeholders)

    for campo in campos:
        if campo in ph and ph[campo] is not None and str(ph[campo]).strip() != '':
            ph[campo] = formatear_moneda(ph[campo])

    return ph


# ============================================================
# BLOQUES CONDICIONALES {{#if campo}}...{{/if}}
# ============================================================

# Regex para bloques condicionales: {{#if campo}}...{{/if}}
_IF_PATTERN = re.compile(
    r'\{\{#if\s+([a-zA-Z0-9_]+)\}\}(.*?)\{\{/if\}\}',
    re.DOTALL
)


def procesar_condicionales(html: str, placeholders: dict) -> str:
    """
    Procesa bloques {{#if campo}}...{{/if}}:
    - Si el campo tiene valor no vacío, deja el contenido interno.
    - Si el campo es vacío o no existe, elimina todo el bloque.

    Soporta anidamiento (aunque no es común).
    """
    def reemplazar(match):
        campo = match.group(1)
        contenido = match.group(2)
        valor = placeholders.get(campo)
        if valor is not None and str(valor).strip() != '':
            return contenido
        return ''

    # Aplicar repetidamente por si hay anidamientos
    anterior = None
    while anterior != html:
        anterior = html
        html = _IF_PATTERN.sub(reemplazar, html)

    return html

def reemplazar_vacios(placeholders: dict, default: str = '-') -> dict:
    """
    Reemplaza todos los valores vacíos/None/'' por `default` (por defecto '-').
    """
    ph = {}
    for k, v in placeholders.items():
        if v is None or str(v).strip() == '':
            ph[k] = default
        else:
            ph[k] = v
    return ph

PLACEHOLDER_ALIASES = {
    "pensiones": {
        "orden":           "orden_impresion",
        "subestatus":      "sub_estatus_id",
        "afiliado":        "numero_afiliado",
        "aval_nombre":     "nombre_aval",
        "afiliado_cruza1": "cruce_1",
        "afiliado_cruza2": "cruce_2",
        "observaciones":   "obs",
        "ultimo_abono":    "ultimo_abono_modificado",
    },
}

def aplicar_aliases(placeholders: dict, proyecto_slug: str) -> dict:
    """
    Agrega el alias solo si NO existe ya en placeholders y la columna real SÍ existe.
    """
    aliases = PLACEHOLDER_ALIASES.get(proyecto_slug, {})
    ph = dict(placeholders)
    for alias, col_real in aliases.items():
        if alias not in ph and col_real in ph:
            ph[alias] = ph[col_real]
    return ph