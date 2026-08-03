from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field

from app.db.session import get_global_db
from app.core.dependencies import get_current_active_user, check_project_access
from app.models.global_models import Usuario
from app.services.inpc_service import INPCService
from app.services.numero_a_letras import numero_a_letras
from app.db.router import get_project_db
from app.services.log_service import registrar_log

router = APIRouter()

# ============================================================
# SCHEMAS
# ============================================================

class SincronizarINPCResponse(BaseModel):
    success: bool
    total: int
    mensaje: str
    errores: List[str] = []

class CalcularINPCRequest(BaseModel):
    importe_original: float = Field(..., description="Importe de la multa")
    fecha_notificacion: str = Field(..., description="Fecha de notificación (YYYY-MM-DD)")
    fecha_requerimiento: str = Field(..., description="Fecha del requerimiento (YYYY-MM-DD)")

class CalcularINPCResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class CalcularFilaRequest(BaseModel):
    pk_value: Any
    campos: Dict[str, Any]
    fecha_emision: Optional[str] = None
    visita: Optional[str] = None
    pmo: Optional[str] = None

class CalcularFilaResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class UltimoINPCResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# ============================================================
# HELPERS
# ============================================================

def _generar_codebar(
    pk_value: str,
    fecha_emision: datetime,
    id_documento: Optional[int] = None,
    visita: Optional[str] = None
) -> str:
    """
    Genera el código de barras con formato: *PK+SERIAL DATE+IDDOC+VISITA*
    """

    fecha_base_excel = datetime.datetime(1899, 12, 30)

    pk_short = str(pk_value)
    fecha_str = (fecha_emision - fecha_base_excel).days
    doc_str = f"DOC{id_documento:03d}" if id_documento else ""
    visita_str = f"V{visita[:2]}" if visita else ""
    
    codigo = f"{pk_short}{fecha_str}{doc_str}{visita_str}"
    return f"*{codigo.upper()}*"

def _calcular_campos_estado(
    db: Session,
    fila: Dict[str, Any],
    fecha_emision: datetime,
    visita: Optional[str],
    pmo: Optional[str]
) -> Dict[str, Any]:
    """Calcula todos los campos específicos para el proyecto Estado"""
    result = {}
    
    # Obtener importe histórico
    importe_historico = fila.get('importe_historico_determinado', 0)
    try:
        importe_historico = float(importe_historico)
    except (ValueError, TypeError):
        importe_historico = 0
    
    # Obtener fecha de notificación (YA ES datetime o string)
    fecha_notif = fila.get('fecha_notificacion')
    
    if not fecha_notif:
        return {"error": "Falta fecha de notificación"}
    
    # Convertir a datetime si es string
    if isinstance(fecha_notif, str):
        try:
            fecha_notificacion = datetime.strptime(fecha_notif, '%Y-%m-%d')
        except ValueError:
            return {"error": f"Formato de fecha de notificación inválido: {fecha_notif}"}
    elif isinstance(fecha_notif, datetime):
        fecha_notificacion = fecha_notif
    else:
        try:
            fecha_notificacion = datetime.combine(fecha_notif, datetime.min.time())
        except Exception:
            return {"error": f"Tipo de fecha inválido: {type(fecha_notif)}"}
    
    # Calcular INPC usando la nueva función
    calculo = INPCService.calcular_actualizacion_multas_v2(
        db,
        importe_historico,
        fecha_notificacion,
        fecha_emision
    )
    
    if not calculo["success"]:
        return {"error": calculo["error"]}
    
    data = calculo["data"]
    
    # Convertir a letras
    importe_letra = numero_a_letras(float(data["total_actualizado"]))
    
    # Generar código de barras
    pk_value = fila.get('credito', str(fila.get('pk_value', '')))
    codebar = _generar_codebar(
        pk_value,
        fecha_emision,
        id_documento=fila.get('id_documento'),
        visita=visita
    )
    
    # Obtener próximo INPC (el más reciente disponible)
    ultimo_inpc = INPCService.obtener_ultimo_registro(db)
    proximo_inpc = ultimo_inpc["periodo"] if ultimo_inpc else None
    
    # Construir resultado
    result.update({
        "proximo_inpc": proximo_inpc,
        "fecha_inpc_a": data["fecha_a"].strftime('%Y-%m-%d') if data["fecha_a"] else None,
        "periodo_a": data["periodo_a"],
        "inpc_a": float(data["inpc_a"]),
        "fecha_inpc_b": data["fecha_b"].strftime('%Y-%m-%d') if data["fecha_b"] else None,
        "periodo_b": data["periodo_b"],
        "inpc_b": float(data["inpc_b"]),
        "factor_actualizacion": float(data["factor_actualizacion"]),
        "importe_actualizacion": float(data["importe_actualizacion"]),
        "total_multa_actualizada": float(data["total_actualizado"]),
        "importe_letra": importe_letra,
        "codebar": codebar,
        "fecha_emision": fecha_emision.date().isoformat() if fecha_emision else None,
        "visita": visita,
        "pmo": pmo,
    })
    
    return result

def _calcular_campos_apa_tlajomulco(
    fila: Dict[str, Any],
    fecha_emision: datetime,
    visita: Optional[str],
    pmo: Optional[str]
) -> Dict[str, Any]:
    """
    Calcula todos los campos específicos para el proyecto APA Tlajomulco
    """
    result = {}
    
    # Domicilio = concatenación de población, localidad, calle, exterior, interior
    partes_domicilio = []
    for campo in ['poblacion', 'localidad', 'calle', 'exterior', 'interior']:
        valor = fila.get(campo, '').strip()
        if valor:
            partes_domicilio.append(valor)
    domicilio = " ".join(partes_domicilio)
    
    # Firma según reglas
    total_adeudo = fila.get('total_adeudo', 0)
    try:
        total_adeudo = float(total_adeudo)
    except (ValueError, TypeError):
        total_adeudo = 0
    
    if total_adeudo > 75000:
        firma = "1.-TESORERO"
    elif total_adeudo > 20000:
        firma = "2.-POLITICA FISCAL"
    else:
        firma = "3.-FACSIMIL"
    
    # Generar código de barras
    pk_value = fila.get('clave_apa', str(fila.get('pk_value', '')))
    codebar = _generar_codebar(
        pk_value,
        fecha_emision,
        id_documento=fila.get('id_documento'),
        visita=visita
    )
    
    result.update({
        "domicilio": domicilio,
        "firma": firma,
        "codebar": codebar,
        "fecha_emision": fecha_emision.date().isoformat() if fecha_emision else None,
        "visita": visita,
        "pmo": pmo,
    })
    
    return result

def _calcular_campos_genericos(
    fila: Dict[str, Any],
    fecha_emision: datetime,
    visita: Optional[str],
    pmo: Optional[str]
) -> Dict[str, Any]:
    """
    Calcula campos genéricos para cualquier proyecto
    """
    result = {}
    
    # Generar código de barras
    pk_value = str(fila.get('pk_value', ''))
    codebar = _generar_codebar(
        pk_value,
        fecha_emision,
        id_documento=fila.get('id_documento'),
        visita=visita
    )
    
    result.update({
        "codebar": codebar,
        "fecha_emision": fecha_emision.date().isoformat() if fecha_emision else None,
        "visita": visita,
        "pmo": pmo,
    })
    
    return result

# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/inpc/sincronizar", response_model=SincronizarINPCResponse)
def sincronizar_inpc(
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """
    Sincroniza la tabla inpc_historico con la API del INEGI.
    Solo disponible para superadmin.
    """
    from app.core.dependencies import require_superadmin
    require_superadmin(current_user)
    
    resultado = INPCService.sincronizar_desde_inegi(db)
    
    # Registrar log
    registrar_log(
        db,
        current_user.id,
        "sincronizar_inpc",
        f"Sincronización INPC: {resultado['total']} registros",
        ip=None
    )
    
    return SincronizarINPCResponse(
        success=resultado["total"] > 0,
        total=resultado["total"],
        mensaje=resultado["mensaje"],
        errores=resultado.get("errores", [])
    )

@router.post("/inpc/calcular", response_model=CalcularINPCResponse)
def calcular_actualizacion(
    request: CalcularINPCRequest,
    db: Session = Depends(get_global_db),
):
    """
    Calcula la actualización de una multa usando INPC (prueba individual)
    """
    try:
        fecha_notificacion = datetime.strptime(request.fecha_notificacion, '%Y-%m-%d')
        fecha_requerimiento = datetime.strptime(request.fecha_requerimiento, '%Y-%m-%d')
        
        resultado = INPCService.calcular_actualizacion_multas(
            db,
            request.importe_original,
            fecha_notificacion,
            fecha_requerimiento
        )
        
        if not resultado["success"]:
            return CalcularINPCResponse(success=False, error=resultado["error"])
        
        # Convertir Decimal a float para JSON
        data = resultado["data"]
        data_serializable = {
            "importe_original": float(data["importe_original"]),
            "fecha_notificacion": data["fecha_notificacion"].isoformat(),
            "fecha_requerimiento": data["fecha_requerimiento"].isoformat(),
            "periodo_notificacion": data["periodo_notificacion"],
            "periodo_requerimiento": data["periodo_requerimiento"],
            "inpc_notificacion": float(data["inpc_notificacion"]),
            "inpc_requerimiento": float(data["inpc_requerimiento"]),
            "factor_actualizacion": float(data["factor_actualizacion"]),
            "importe_actualizacion": float(data["importe_actualizacion"]),
            "total_actualizado": float(data["total_actualizado"])
        }
        
        return CalcularINPCResponse(success=True, data=data_serializable)
        
    except ValueError as e:
        return CalcularINPCResponse(success=False, error=f"Formato de fecha inválido: {str(e)}")
    except Exception as e:
        return CalcularINPCResponse(success=False, error=str(e))

@router.get("/inpc/ultimo", response_model=UltimoINPCResponse)
def obtener_ultimo_inpc(
    db: Session = Depends(get_global_db),
):
    """
    Obtiene el último valor del INPC registrado
    """
    ultimo = INPCService.obtener_ultimo_registro(db)
    
    if not ultimo:
        return UltimoINPCResponse(
            success=False,
            error="No hay datos de INPC disponibles. Ejecuta la sincronización primero."
        )
    
    return UltimoINPCResponse(
        success=True,
        data={
            "periodo": ultimo["periodo"],
            "valor": float(ultimo["valor"])
        }
    )

@router.post("/{proyecto_slug}/calcular-fila", response_model=CalcularFilaResponse)
def calcular_fila(
    proyecto_slug: str,
    request: CalcularFilaRequest,
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """
    Calcula todos los campos necesarios para una fila del proyecto
    """
    from sqlalchemy import text
    
    # Verificar acceso al proyecto
    proyecto = check_project_access(proyecto_slug, current_user, db_global)
    
    # Obtener conexión a la base de datos del proyecto
    db_proyecto = next(get_project_db(proyecto_slug))
    
    # Obtener fecha de emisión
    fecha_emision = request.fecha_emision
    if fecha_emision:
        try:
            fecha_emision_dt = datetime.strptime(fecha_emision, '%Y-%m-%d')
        except ValueError:
            return CalcularFilaResponse(
                success=False,
                error=f"Formato de fecha inválido: {fecha_emision}"
            )
    else:
        fecha_emision_dt = datetime.now()
    
    visita = request.visita
    pmo = request.pmo
    
    # Obtener la fila completa de la tabla_analisis
    pk_value = request.pk_value
    pk_name = None
    
    # Determinar la PK según el proyecto
    pks = {
        "apa_tlajomulco": "clave_APA",
        "predial_tlajomulco": "cuenta",
        "licencias_gdl": "licencia",
        "predial_gdl": "cuenta_n",
        "estado": "credito",
        "pensiones": "prestamo",
    }
    pk_name = pks.get(proyecto_slug, "id")
    
    try:
        # Obtener la fila de análisis
        query = text(f"SELECT * FROM tabla_analisis WHERE `{pk_name}` = :pk")
        result = db_proyecto.execute(query, {"pk": pk_value}).first()
        
        if not result:
            return CalcularFilaResponse(
                success=False,
                error=f"No se encontró la fila con {pk_name}={pk_value}"
            )
        
        fila = dict(result._mapping)
        
        # Calcular según el proyecto
        if proyecto_slug == "estado":
            calculado = _calcular_campos_estado(
                db_global, fila, fecha_emision_dt, visita, pmo
            )
        elif proyecto_slug == "apa_tlajomulco":
            calculado = _calcular_campos_apa_tlajomulco(
                fila, fecha_emision_dt, visita, pmo
            )
        else:
            calculado = _calcular_campos_genericos(
                fila, fecha_emision_dt, visita, pmo
            )
        
        if "error" in calculado:
            return CalcularFilaResponse(success=False, error=calculado["error"])
        
        # Actualizar la tabla_analisis con los campos calculados
        update_fields = []
        update_params = {"pk": pk_value}
        
        for key, value in calculado.items():
            # Ignorar campos que no son columnas de la tabla
            if key in ['periodo_notificacion', 'periodo_requerimiento']:
                continue
            update_fields.append(f"`{key}` = :{key}")
            update_params[key] = value
        
        if update_fields:
            update_query = text(
                f"UPDATE tabla_analisis SET {', '.join(update_fields)} "
                f"WHERE `{pk_name}` = :pk"
            )
            db_proyecto.execute(update_query, update_params)
            db_proyecto.commit()
        
        # Registrar log
        registrar_log(
            db_global,
            current_user.id,
            "calcular_fila",
            f"Cálculo realizado para {pk_name}={pk_value} en {proyecto_slug}",
            proyecto.id
        )
        
        return CalcularFilaResponse(
            success=True,
            data=calculado
        )
        
    except Exception as e:
        db_proyecto.rollback()
        return CalcularFilaResponse(
            success=False,
            error=f"Error al calcular: {str(e)}"
        )
@router.post("/inpc/sincronizar")
def sincronizar_inpc(
    historico: bool = Query(True, description="True: sincroniza todo el histórico, False: solo el último"),
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """
    Sincroniza la tabla inpc_historico con la API del INEGI.
    - historico=True: trae TODA la serie histórica
    - historico=False: trae solo el último dato
    """
    from app.core.dependencies import require_superadmin
    require_superadmin(current_user)
    
    if historico:
        resultado = INPCService.sincronizar_historico(db)
    else:
        resultado = INPCService.sincronizar_ultimo(db)
    
    # Registrar log
    registrar_log(
        db,
        current_user.id,
        "sincronizar_inpc",
        f"Sincronización INPC: {resultado['nuevos']} nuevos, {resultado['actualizados']} actualizados",
        ip=None
    )
    
    return {
        "success": resultado["total"] > 0,
        "total": resultado["total"],
        "nuevos": resultado["nuevos"],
        "actualizados": resultado["actualizados"],
        "total_en_bd": resultado.get("total_en_bd", 0),
        "mensaje": resultado["mensaje"],
        "errores": resultado.get("errores", [])
    }

@router.get("/inpc/verificar")
def verificar_inpc(
    current_user: Usuario = Depends(get_current_active_user),
    db: Session = Depends(get_global_db),
):
    """Verifica cuántos datos hay en inpc_historico"""
    return INPCService.verificar_datos(db)

@router.get("/inpc/ultimo")
def obtener_ultimo_inpc(
    db: Session = Depends(get_global_db),
):
    """
    Obtiene el último valor del INPC registrado
    """
    ultimo = INPCService.obtener_ultimo_registro(db)
    
    if not ultimo:
        return {
            "success": False,
            "error": "No hay datos de INPC disponibles. Ejecuta la sincronización primero."
        }
    
    return {
        "success": True,
        "data": {
            "periodo": ultimo["periodo"],
            "valor": float(ultimo["valor"])
        }
    }

@router.get("/{proyecto_slug}/tabla-dinamica")
def get_tabla_dinamica(
    proyecto_slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: Usuario = Depends(get_current_active_user),
    db_global: Session = Depends(get_global_db),
):
    """Obtiene los datos de tabla_dinamica para la pantalla de Cálculos"""
    from sqlalchemy import text
    
    check_project_access(proyecto_slug, current_user, db_global)
    db_proyecto = next(get_project_db(proyecto_slug))
    
    # Determinar la PK
    pks = {
        "apa_tlajomulco": "clave_APA",
        "predial_tlajomulco": "cuenta",
        "licencias_gdl": "licencia",
        "predial_gdl": "cuenta_n",
        "estado": "credito",
        "pensiones": "prestamo",
    }
    pk = pks.get(proyecto_slug, "id")
    
    try:
        db_proyecto.execute(text("SELECT 1 FROM tabla_dinamica LIMIT 1"))
    except Exception:
        return {
            "rows": [],
            "total": 0,
            "page": page,
            "limit": limit,
            "pk": pk,
            "error": "No hay datos calculados. Ejecuta 'Calcular Todas' primero."
        }
    
    offset = (page - 1) * limit
    total = db_proyecto.execute(text("SELECT COUNT(*) AS total FROM tabla_dinamica")).first().total
    rows = db_proyecto.execute(
        text(f"SELECT * FROM tabla_dinamica LIMIT {limit} OFFSET {offset}")
    ).fetchall()
    
    return {
        "rows": [dict(r._mapping) for r in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "pk": pk
    }