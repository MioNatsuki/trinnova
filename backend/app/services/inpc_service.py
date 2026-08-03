import requests
import pandas as pd
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, Tuple, Any

from app.models.global_models import InpcHistorico

class INPCService:
    TOKEN = "772733d9-b7d0-cb3d-a5a4-0cdd79b5a39e"
    
    @staticmethod
    def sincronizar_desde_inegi(db: Session, solo_ultimo: bool = False) -> Dict:
        """Sincroniza INPC desde INEGI con UPSERT"""
        ultimo_param = "true" if solo_ultimo else "false"
        
        url = (
            f"https://www.inegi.org.mx/app/api/indicadores/"
            f"desarrolladores/jsonxml/INDICATOR/910392/es/00/"
            f"{ultimo_param}/"
            f"BIE-BISE/2.0/{INPCService.TOKEN}?type=json"
        )
        
        headers = {"User-Agent": "Mozilla/5.0"}
        
        try:
            response = requests.get(url, headers=headers, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            registros = []
            errores = []
            
            try:
                observaciones = data["Series"][0]["OBSERVATIONS"]
            except (KeyError, IndexError) as e:
                return {
                    "total": 0,
                    "nuevos": 0,
                    "actualizados": 0,
                    "mensaje": "Error en la respuesta del INEGI",
                    "errores": [str(e)]
                }
            
            for obs in observaciones:
                periodo = obs.get("TIME_PERIOD")  # Ej: "2026-06"
                valor_str = obs.get("OBS_VALUE")
                
                if not periodo or not valor_str:
                    continue
                
                # ============================================================
                # CONVERTIR "2026-06" a "2026-06-01" (primer día del mes)
                # ESTO ES LO QUE FALTA EN TU CÓDIGO
                # ============================================================
                # Si tiene formato YYYY-MM (con guion)
                if '-' in periodo and len(periodo) == 7:
                    periodo_con_dia = f"{periodo}-01"
                # Si tiene formato YYYY/MM (con slash)
                elif '/' in periodo and len(periodo) == 7:
                    periodo_con_dia = f"{periodo.replace('/', '-')}-01"
                else:
                    periodo_con_dia = periodo
                
                try:
                    valor = float(valor_str)
                    if not pd.isna(valor):
                        registros.append({
                            "periodo": periodo_con_dia,
                            "valor": Decimal(str(valor))
                        })
                except (ValueError, TypeError):
                    errores.append(f"Error al convertir valor: {valor_str}")
                    continue
            
            if not registros:
                return {
                    "total": 0,
                    "nuevos": 0,
                    "actualizados": 0,
                    "mensaje": "No se obtuvieron registros válidos",
                    "errores": errores
                }
            
            nuevos = 0
            actualizados = 0
            
            for reg in registros:
                existe = db.query(InpcHistorico).filter(
                    InpcHistorico.periodo == reg["periodo"]
                ).first()
                
                if existe:
                    if existe.valor != reg["valor"]:
                        existe.valor = reg["valor"]
                        actualizados += 1
                else:
                    db.add(InpcHistorico(
                        periodo=reg["periodo"],
                        valor=reg["valor"]
                    ))
                    nuevos += 1
            
            db.commit()
            
            total_db = db.query(InpcHistorico).count()
            
            return {
                "total": len(registros),
                "nuevos": nuevos,
                "actualizados": actualizados,
                "total_en_bd": total_db,
                "mensaje": f"Sincronización completada: {nuevos} nuevos, {actualizados} actualizados. Total en BD: {total_db}",
                "errores": errores
            }
            
        except requests.RequestException as e:
            return {
                "total": 0,
                "nuevos": 0,
                "actualizados": 0,
                "mensaje": f"Error al conectar con INEGI: {str(e)}",
                "errores": [str(e)]
            }
        except Exception as e:
            return {
                "total": 0,
                "nuevos": 0,
                "actualizados": 0,
                "mensaje": f"Error inesperado: {str(e)}",
                "errores": [str(e)]
            }
    
    @staticmethod
    def sincronizar_historico(db: Session) -> Dict:
        return INPCService.sincronizar_desde_inegi(db, solo_ultimo=False)
    
    @staticmethod
    def sincronizar_ultimo(db: Session) -> Dict:
        return INPCService.sincronizar_desde_inegi(db, solo_ultimo=True)
    
    @staticmethod
    def obtener_inpc_por_mes(db: Session, anio: int, mes: int) -> Optional[Decimal]:
        """Obtiene el valor del INPC para un mes específico"""
        periodo = f"{anio:04d}-{mes:02d}"
        registro = db.query(InpcHistorico).filter(
            InpcHistorico.periodo == periodo
        ).first()
        return registro.valor if registro else None
    
    @staticmethod
    def obtener_inpc_aplicable(
        db: Session, 
        fecha: datetime
    ) -> Tuple[Optional[Decimal], Optional[str]]:
        """
        Obtiene el INPC aplicable según la fecha de publicación:
        - El INPC se publica el día 10 de cada mes
        - Si la fecha es del 1 al 9: se usa el INPC del mes anterior
        - Si la fecha es del 10 en adelante: se usa el INPC del mismo mes
        
        Retorna: (valor_inpc, periodo_str)
        """
        dia = fecha.day
        
        if dia <= 9:
            # Si es 1-9, el INPC disponible es del mes anterior
            # Ir al primer día del mes, restar 1 día
            fecha_inpc = fecha.replace(day=1) - timedelta(days=1)
        else:
            # Si es 10+, el INPC del mes actual ya está publicado
            fecha_inpc = fecha.replace(day=1)
        
        # Ajustar por si es diciembre y queremos noviembre
        if fecha_inpc.month == 0:
            fecha_inpc = fecha_inpc.replace(year=fecha_inpc.year - 1, month=12)
        
        periodo = f"{fecha_inpc.year:04d}-{fecha_inpc.month:02d}"
        valor = INPCService.obtener_inpc_por_mes(db, fecha_inpc.year, fecha_inpc.month)
        
        return valor, periodo
    
    @staticmethod
    def obtener_inpc_mas_cercano_anterior(db: Session, fecha: datetime) -> Optional[Dict[str, Any]]:
        """
        Busca el INPC más cercano por fecha que sea <= a la fecha dada.
        Calcula la diferencia de días y toma el que tenga la menor diferencia positiva.
        """
        from sqlalchemy import text
        
        print(f"🔍 Buscando INPC para fecha: {fecha.strftime('%d/%m/%Y')}")
        
        # Obtener TODOS los INPC disponibles (ordenados de más reciente a más antiguo)
        query = """
            SELECT periodo, valor 
            FROM inpc_historico 
            ORDER BY periodo DESC
        """
        
        results = db.execute(text(query)).fetchall()
        
        if not results:
            print("❌ No hay datos en inpc_historico")
            return None
        
        mejor_inpc = None
        mejor_diferencia = None
        
        for result in results:
            # Convertir periodo a fecha
            periodo_valor = result.periodo
            if hasattr(periodo_valor, 'strftime'):
                fecha_inpc = datetime(periodo_valor.year, periodo_valor.month, periodo_valor.day)
            else:
                fecha_inpc = datetime.strptime(str(periodo_valor), '%Y-%m-%d')
            
            # Calcular diferencia de días (fecha_evento - fecha_inpc)
            diferencia = (fecha - fecha_inpc).days
            
            # Solo considerar si la fecha del INPC es <= fecha_evento (diferencia >= 0)
            if diferencia >= 0:
                # Si es la primera o tiene menor diferencia, es la mejor
                if mejor_diferencia is None or diferencia < mejor_diferencia:
                    mejor_diferencia = diferencia
                    mejor_inpc = {
                        "periodo": result.periodo if isinstance(result.periodo, str) else result.periodo.strftime('%Y-%m-%d'),
                        "valor": Decimal(str(result.valor)),
                        "fecha": fecha_inpc,
                        "diferencia_dias": diferencia
                    }
        
        if mejor_inpc:
            print(f"✅ INPC seleccionado: {mejor_inpc['periodo']} (diferencia: {mejor_inpc['diferencia_dias']} días)")
            return mejor_inpc
        
        print(f"❌ No se encontró INPC para la fecha: {fecha.strftime('%d/%m/%Y')}")
        return None


    @staticmethod
    def calcular_actualizacion_multas_v2(
        db: Session,
        importe_original: float,
        fecha_notificacion: datetime,
        fecha_emision: datetime
    ) -> Dict:
        """
        Calcula la actualización de multas usando INPC más cercano anterior
        Considera que el INPC se publica el día 10 de cada mes
        """
        # Buscar INPC aplicable para fecha_notificacion
        inpc_a_data = INPCService.obtener_inpc_mas_cercano_anterior(db, fecha_notificacion)
        if not inpc_a_data:
            return {
                "success": False,
                "error": f"No se encontró INPC disponible para la fecha de notificación: {fecha_notificacion.strftime('%d/%m/%Y')}"
            }
        
        # Buscar INPC aplicable para fecha_emision
        inpc_b_data = INPCService.obtener_inpc_mas_cercano_anterior(db, fecha_emision)
        if not inpc_b_data:
            return {
                "success": False,
                "error": f"No se encontró INPC disponible para la fecha de emisión: {fecha_emision.strftime('%d/%m/%Y')}"
            }
        
        # Realizar cálculos
        importe_original_dec = Decimal(str(importe_original))
        inpc_a = inpc_a_data["valor"]
        inpc_b = inpc_b_data["valor"]
        
        # Factor = inpc_b / inpc_a
        factor = inpc_b / inpc_a
        
        # Importe actualización = a × (factor - 1)
        importe_actualizacion = importe_original_dec * (factor - Decimal('1'))
        
        # Total = a + importe_actualizacion
        total_actualizado = importe_original_dec + importe_actualizacion
        
        return {
            "success": True,
            "data": {
                "importe_original": importe_original_dec,
                "fecha_notificacion": fecha_notificacion,
                "fecha_emision": fecha_emision,
                "inpc_a": inpc_a,
                "periodo_a": inpc_a_data["periodo"],
                "fecha_a": inpc_a_data["fecha"],
                "inpc_b": inpc_b,
                "periodo_b": inpc_b_data["periodo"],
                "fecha_b": inpc_b_data["fecha"],
                "factor_actualizacion": factor,
                "importe_actualizacion": importe_actualizacion,
                "total_actualizado": total_actualizado
            }
        }
    
    @staticmethod
    def verificar_datos(db: Session) -> Dict:
        total = db.query(InpcHistorico).count()
        
        if total == 0:
            return {
                "total": 0,
                "primero": None,
                "ultimo": None,
                "mensaje": "⚠️ No hay datos en inpc_historico. Ejecuta la sincronización."
            }
        
        primero = db.query(InpcHistorico).order_by(InpcHistorico.periodo.asc()).first()
        ultimo = db.query(InpcHistorico).order_by(InpcHistorico.periodo.desc()).first()
        
        return {
            "total": total,
            "primero": primero.periodo if primero else None,
            "ultimo": ultimo.periodo if ultimo else None,
            "mensaje": f"✅ {total} registros. Desde {primero.periodo} hasta {ultimo.periodo}"
        }

    @staticmethod
    def obtener_ultimo_registro(db: Session) -> Optional[Dict]:
        """Obtiene el último registro del INPC (el más reciente)"""
        ultimo = db.query(InpcHistorico).order_by(
            InpcHistorico.periodo.desc()
        ).first()
        
        if not ultimo:
            return None
        
        return {
            "periodo": ultimo.periodo,
            "valor": ultimo.valor
        }