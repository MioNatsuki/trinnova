"""
Conversión de números a letras en español
Soporta hasta 999,999,999.99
"""

from decimal import Decimal

UNIDADES = (
    'cero', 'un', 'dos', 'tres', 'cuatro', 'cinco',
    'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince',
    'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'
)

DECENAS = (
    'veinti', 'treinta', 'cuarenta', 'cincuenta',
    'sesenta', 'setenta', 'ochenta', 'noventa'
)

CENTENAS = (
    'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
    'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'
)


def numero_a_letras(numero: float) -> str:
    """
    Convierte un número a su representación en letras en español
    
    Ejemplo:
        403000.00 -> "CUATROCIENTOS TRES MIL PESOS 00/100 M.N."
    """
    if not isinstance(numero, (int, float, Decimal)):
        return str(numero)
    
    numero = float(numero)
    
    # Separar parte entera y decimal
    parte_entera = int(numero)
    parte_decimal = round((numero - parte_entera) * 100)
    
    if parte_entera == 0:
        texto_entero = "cero"
    else:
        texto_entero = _convertir_entero(parte_entera)
    
    # Formatear resultado
    texto_decimal = f"{parte_decimal:02d}/100"
    
    # Determinar si es "PESO" o "PESOS"
    moneda = "PESO" if parte_entera == 1 else "PESOS"
    
    return f"{texto_entero} {moneda} {texto_decimal} M.N."


def _convertir_entero(n: int) -> str:
    """Convierte la parte entera a letras"""
    if n < 0:
        return "menos " + _convertir_entero(-n)
    
    if n < 21:
        return UNIDADES[n]
    
    if n < 30:
        return DECENAS[0] + _convertir_entero(n - 20)
    
    if n < 100:
        decena = n // 10
        unidad = n % 10
        if unidad == 0:
            return DECENAS[decena - 2]
        return DECENAS[decena - 2] + " y " + UNIDADES[unidad]
    
    if n < 1000:
        centena = n // 100
        resto = n % 100
        if centena == 1 and resto == 0:
            return "cien"
        if resto == 0:
            return CENTENAS[centena - 1]
        return CENTENAS[centena - 1] + " " + _convertir_entero(resto)
    
    if n < 1000000:
        miles = n // 1000
        resto = n % 1000
        if miles == 1:
            texto = "mil"
        else:
            texto = _convertir_entero(miles) + " mil"
        if resto == 0:
            return texto
        return texto + " " + _convertir_entero(resto)
    
    if n < 1000000000:
        millones = n // 1000000
        resto = n % 1000000
        if millones == 1:
            texto = "un millón"
        else:
            texto = _convertir_entero(millones) + " millones"
        if resto == 0:
            return texto
        return texto + " " + _convertir_entero(resto)
    
    return str(n)  # Número demasiado grande