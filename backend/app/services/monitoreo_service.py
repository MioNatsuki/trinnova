# backend/app/services/monitoreo_service.py
"""
Servicio de monitoreo para el sistema de emisión.
Maneja logs, métricas y alertas.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from pathlib import Path
from collections import defaultdict

logger = logging.getLogger(__name__)

class MonitoreoService:
    """Servicio central de monitoreo."""
    
    # Métricas agregadas
    _metricas = {
        "jobs_totales": 0,
        "jobs_completados": 0,
        "jobs_fallidos": 0,
        "pdfs_generados": 0,
        "pdfs_por_segundo": 0,
        "tiempo_promedio_pdf": 0,
        "workers_activos": 0,
        "errores_totales": 0,
        "ultima_actualizacion": None
    }
    
    # Historial de tiempo de generación por job
    _tiempos_job = []
    
    @classmethod
    def registrar_log_estructurado(
        cls,
        nivel: str,
        mensaje: str,
        job_id: Optional[int] = None,
        worker_id: Optional[str] = None,
        proyecto_slug: Optional[str] = None,
        usuario_id: Optional[int] = None,
        datos_extra: Optional[Dict] = None,
        db_global = None
    ):
        """
        Registra un log estructurado en JSON.
        """
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "nivel": nivel,
            "mensaje": mensaje,
            "job_id": job_id,
            "worker_id": worker_id,
            "proyecto_slug": proyecto_slug,
            "usuario_id": usuario_id,
            "datos_extra": datos_extra or {}
        }
        
        # Guardar en archivo de logs estructurados
        log_dir = Path(__file__).parent.parent.parent.parent / "Logs"
        log_dir.mkdir(exist_ok=True)
        
        try:
            log_file = log_dir / "emision_logs.jsonl"
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
        except Exception as e:
            logger.error(f"Error guardando log estructurado: {e}")
        
        # También guardar en BD si está disponible
        if db_global and usuario_id:
            try:
                from app.services.log_service import registrar_log
                registrar_log(
                    db_global,
                    usuario_id,
                    f"monitoreo_{nivel}",
                    mensaje,
                    proyecto_id=None  # Se puede obtener del proyecto_slug
                )
            except Exception:
                pass
        
        # Imprimir en consola para desarrollo
        print(f"[{log_entry['timestamp']}] {nivel.upper()}: {mensaje}")
    
    @classmethod
    def actualizar_metricas(cls, **kwargs):
        """Actualiza las métricas agregadas."""
        for key, value in kwargs.items():
            if key in cls._metricas:
                cls._metricas[key] = value
        
        cls._metricas["ultima_actualizacion"] = datetime.now().isoformat()
    
    @classmethod
    def registrar_tiempo_generacion(cls, job_id: int, tiempo_segundos: float, registros: int):
        """Registra el tiempo de generación de un job."""
        cls._tiempos_job.append({
            "job_id": job_id,
            "tiempo_segundos": tiempo_segundos,
            "registros": registros,
            "timestamp": datetime.now().isoformat()
        })
        
        # Mantener solo los últimos 100 registros
        if len(cls._tiempos_job) > 100:
            cls._tiempos_job = cls._tiempos_job[-100:]
        
        # Actualizar métricas agregadas
        pdfs_por_segundo = registros / tiempo_segundos if tiempo_segundos > 0 else 0
        cls.actualizar_metricas(
            pdfs_por_segundo=pdfs_por_segundo,
            tiempo_promedio_pdf=tiempo_segundos / registros if registros > 0 else 0
        )
    
    @classmethod
    def obtener_metricas(cls) -> Dict:
        """Obtiene las métricas actuales."""
        return cls._metricas.copy()
    
    @classmethod
    def obtener_tiempos_job(cls, limit: int = 50) -> List[Dict]:
        """Obtiene los tiempos de generación de jobs."""
        return cls._tiempos_job[-limit:]
    
    @classmethod
    def obtener_estadisticas_worker(
        cls,
        worker_id: str,
        db_global = None
    ) -> Dict:
        """
        Obtiene estadísticas de un worker específico.
        """
        from sqlalchemy import text
        
        if not db_global:
            return {"error": "Conexión a BD no disponible"}
        
        try:
            # Obtener jobs del worker desde la BD
            result = db_global.execute(
                text("""
                    SELECT 
                        COUNT(*) as total_jobs,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completados,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as fallidos,
                        SUM(procesados) as total_procesados,
                        AVG(TIMESTAMPDIFF(SECOND, started_at, completed_at)) as tiempo_promedio
                    FROM emision_jobs 
                    WHERE checkpoint_data->>'$.worker_id' = :worker_id
                """),
                {"worker_id": worker_id}
            ).first()
            
            if result:
                return {
                    "worker_id": worker_id,
                    "total_jobs": result.total_jobs or 0,
                    "completados": result.completados or 0,
                    "fallidos": result.fallidos or 0,
                    "total_procesados": result.total_procesados or 0,
                    "tiempo_promedio": result.tiempo_promedio or 0
                }
            
            return {
                "worker_id": worker_id,
                "total_jobs": 0,
                "completados": 0,
                "fallidos": 0,
                "total_procesados": 0,
                "tiempo_promedio": 0
            }
            
        except Exception as e:
            logger.error(f"Error obteniendo estadísticas del worker: {e}")
            return {"error": str(e)}