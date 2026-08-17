# backend/app/services/emision_service.py
"""
EmisionService - Lógica de generación de PDFs para emisión masiva
Soporta generación individual y por paquetes
"""

import asyncio
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple, Callable
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.plantilla_renderer import PlantillaRenderer
from app.services.codebar_service import CodebarService
from app.models.global_models import EmisionJob, EmisionDetalle
from app.db.router import get_project_db

logger = logging.getLogger(__name__)

# ============================================================
# CONSTANTES
# ============================================================

PK_MAP = {
    "apa_tlajomulco": "clave_APA",
    "predial_tlajomulco": "cuenta",
    "licencias_gdl": "licencia",
    "predial_gdl": "cuenta_n",
    "estado": "credito",
    "pensiones": "prestamo",
}

# ============================================================
# CLASE PRINCIPAL
# ============================================================

class EmisionService:
    """
    Servicio de emisión de documentos.
    Maneja la generación de PDFs individuales y por paquetes.
    """
    
    def __init__(
        self,
        job_id: int,
        db_global: Session,
        worker_id: str = "worker_1"
    ):
        self.job_id = job_id
        self.db_global = db_global
        self.worker_id = worker_id
        
        # Cargar job
        self.job = db_global.query(EmisionJob).filter(EmisionJob.id == job_id).first()
        if not self.job:
            raise ValueError(f"Job {job_id} no encontrado")
        
        # Obtener proyecto y plantilla
        self.proyecto = self.job.proyecto
        self.plantilla = self.job.plantilla
        self.proyecto_slug = self.proyecto.slug
        self.pk = PK_MAP.get(self.proyecto_slug, "id")
        
        # Configuración
        self.modo = self.job.modo or "lotes"
        self.cuentas_por_lote = self.job.cuentas_por_lote or 50
        self.orden_impresion_inicial = self.job.orden_impresion_inicial or 1
        
        # Directorio de salida
        from app.core.config import settings
        self.base_path = Path(settings.EMISIONES_PATH) / self.proyecto_slug
        self.job_dir = self._get_job_directory()
        
        # Estadísticas
        self.stats = {
            "total": self.job.total_registros,
            "generados": 0,
            "fallidos": 0,
            "orden_actual": self.orden_impresion_inicial
        }
        
        # Callbacks
        self.on_progress: Optional[Callable] = None
        
        logger.info(f"EmisionService iniciado para job {job_id}")
        logger.info(f"   Proyecto: {self.proyecto_slug}")
        logger.info(f"   Modo: {self.modo}")
        logger.info(f"   Cuentas por lote: {self.cuentas_por_lote}")
    
    # ============================================================
    # DIRECTORIO DE TRABAJO
    # ============================================================
    
    def _get_job_directory(self) -> Path:
        """Obtiene el directorio para este job."""
        ahora = datetime.now()
        year = ahora.strftime("%Y")
        month = ahora.strftime("%m")
        
        job_dir = self.base_path / year / month / f"job_{self.job_id}"
        return job_dir
    
    def _prepare_job_directory(self):
        """Prepara el directorio del job."""
        self.job_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Directorio de trabajo: {self.job_dir}")
        return self.job_dir
    
    # ============================================================
    # OBTENCIÓN DE REGISTROS
    # ============================================================
    
    def _get_registros(
        self,
        offset: int = 0,
        limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Obtiene registros de tabla_analisis con filtros."""
        db_proyecto = next(get_project_db(self.proyecto_slug))
        
        try:
            # Construir filtros
            filtros = json.loads(self.job.filtros) if self.job.filtros else {}
            conditions = ["viabilidad = 'viable'"]
            params = {}
            
            if filtros.get("programa") and filtros["programa"] != "todos":
                conditions.append("programa = :programa")
                params["programa"] = filtros["programa"]
            
            if filtros.get("ids") and isinstance(filtros["ids"], list):
                placeholders = ", ".join([f":id{i}" for i in range(len(filtros["ids"]))])
                conditions.append(f"{self.pk} IN ({placeholders})")
                for i, id_val in enumerate(filtros["ids"]):
                    params[f"id{i}"] = id_val
            
            where = " AND ".join(conditions) if conditions else "1=1"
            
            # Construir query
            query = f"""
                SELECT * FROM tabla_analisis 
                WHERE {where}
                ORDER BY `{self.pk}` ASC
            """
            
            if limit:
                query += f" LIMIT {limit} OFFSET {offset}"
            
            result = db_proyecto.execute(text(query), params)
            registros = [dict(r._mapping) for r in result]
            
            return registros
            
        finally:
            db_proyecto.close()
    
    def _count_registros(self) -> int:
        """Cuenta el total de registros a procesar."""
        db_proyecto = next(get_project_db(self.proyecto_slug))
        
        try:
            filtros = json.loads(self.job.filtros) if self.job.filtros else {}
            conditions = ["viabilidad = 'viable'"]
            params = {}
            
            if filtros.get("programa") and filtros["programa"] != "todos":
                conditions.append("programa = :programa")
                params["programa"] = filtros["programa"]
            
            if filtros.get("ids") and isinstance(filtros["ids"], list):
                placeholders = ", ".join([f":id{i}" for i in range(len(filtros["ids"]))])
                conditions.append(f"{self.pk} IN ({placeholders})")
                for i, id_val in enumerate(filtros["ids"]):
                    params[f"id{i}"] = id_val
            
            where = " AND ".join(conditions) if conditions else "1=1"
            
            result = db_proyecto.execute(
                text(f"SELECT COUNT(*) AS total FROM tabla_analisis WHERE {where}"),
                params
            ).first()
            
            return result.total if result else 0
            
        finally:
            db_proyecto.close()
    
    # ============================================================
    # GENERACIÓN DE PDFs INDIVIDUALES (3.2)
    # ============================================================
    
    async def generar_pdf_individual(
        self,
        registro: Dict[str, Any],
        renderer: PlantillaRenderer,
        orden: int,
        plantilla_archivo: str
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Genera un PDF individual a partir de un registro.
        
        Args:
            registro: Datos del registro de tabla_analisis
            renderer: Instancia del renderer
            orden: Número de orden de impresión
            plantilla_archivo: Nombre del archivo HTML
            
        Returns:
            Tuple[success, pdf_path, error_msg]
        """
        try:
            pk_value = registro.get(self.pk)
            
            # Preparar placeholders
            placeholders = {}
            for key, value in registro.items():
                if value is not None:
                    placeholders[key] = str(value)
            
            # Agregar campos calculados
            placeholders['orden_impresion'] = str(orden)
            
            # Generar código de barras
            identificador = placeholders.get('identificador_documento')
            visita = placeholders.get('visita')
            codebar = CodebarService.generar_codebar_completo(
                pk_value=str(pk_value),
                identificador=identificador,
                visita=visita
            )
            
            # Renderizar PDF
            pdf_bytes = await renderer.render_pdf(
                plantilla_archivo,
                placeholders,
                codebar=codebar,
                pagina_actual=1,
                total_paginas=1
            )
            
            # Guardar PDF
            nombre_pdf = f"{orden:05d} - {pk_value}.pdf"
            pdf_path = self.job_dir / nombre_pdf
            
            with open(pdf_path, 'wb') as f:
                f.write(pdf_bytes)
            
            return True, str(pdf_path), None
            
        except Exception as e:
            logger.error(f"Error generando PDF para {registro.get(self.pk)}: {e}")
            return False, None, str(e)
    
    # ============================================================
    # GENERACIÓN DE PDFs POR PAQUETES (3.3)
    # ============================================================
    
    async def generar_paquete_pdf(
        self,
        registros: List[Dict[str, Any]],
        renderer: PlantillaRenderer,
        plantilla_archivo: str,
        orden_inicial: int,
        nombre_paquete: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Genera un PDF que contiene múltiples registros (paquete).
        
        Args:
            registros: Lista de registros a incluir en el paquete
            renderer: Instancia del renderer
            plantilla_archivo: Nombre del archivo HTML
            orden_inicial: Orden inicial para los registros
            nombre_paquete: Nombre personalizado del paquete
            
        Returns:
            Dict con resultados del paquete
        """
        resultado = {
            "success": False,
            "pdf_path": None,
            "registros_procesados": 0,
            "registros_fallidos": 0,
            "errores": []
        }
        
        try:
            # Preparar placeholders con todos los registros del paquete
            placeholders = {}
            for idx, registro in enumerate(registros):
                pk_value = registro.get(self.pk)
                orden_actual = orden_inicial + idx
                
                # Agregar al placeholder del paquete
                for key, value in registro.items():
                    if value is not None:
                        # Para campos repetidos, agregar el índice
                        if key in placeholders:
                            # Si ya existe, crear una versión con índice
                            placeholders[f"{key}_{idx+1}"] = str(value)
                        else:
                            placeholders[key] = str(value)
                
                # Agregar orden específico por registro
                placeholders[f"orden_{idx+1}"] = str(orden_actual)
                placeholders[f"pk_{idx+1}"] = str(pk_value)
            
            # Agregar metadatos del paquete
            placeholders['_total_registros_paquete'] = str(len(registros))
            placeholders['_orden_inicial'] = str(orden_inicial)
            placeholders['_orden_final'] = str(orden_inicial + len(registros) - 1)
            
            # Generar código de barras del paquete
            pk_principal = registros[0].get(self.pk) if registros else "PAQUETE"
            codebar = CodebarService.generar_codebar_completo(
                pk_value=str(pk_principal),
                identificador="PAQ"
            )
            
            # Renderizar PDF
            pdf_bytes = await renderer.render_pdf(
                plantilla_archivo,
                placeholders,
                codebar=codebar,
                pagina_actual=1,
                total_paginas=1
            )
            
            # Guardar PDF del paquete
            nombre_paquete = nombre_paquete or f"PAQUETE_{orden_inicial:05d}_{orden_inicial + len(registros) - 1:05d}"
            nombre_pdf = f"{nombre_paquete}.pdf"
            pdf_path = self.job_dir / nombre_pdf
            
            with open(pdf_path, 'wb') as f:
                f.write(pdf_bytes)
            
            resultado["success"] = True
            resultado["pdf_path"] = str(pdf_path)
            resultado["registros_procesados"] = len(registros)
            
        except Exception as e:
            logger.error(f"Error generando paquete: {e}")
            resultado["registros_fallidos"] = len(registros)
            resultado["errores"].append(str(e))
        
        return resultado
    
    # ============================================================
    # MÉTODO PRINCIPAL: GENERAR EMISIÓN (3.5)
    # ============================================================
    
    async def generar_emision(
        self,
        max_concurrent_pages: int = 10,
        checkpoint_interval: int = 50,
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Genera la emisión completa.
        
        Args:
            max_concurrent_pages: Número máximo de páginas concurrentes
            checkpoint_interval: Cada cuántos registros guardar checkpoint
            progress_callback: Función de callback para progreso
        
        Returns:
            Dict con resultados de la emisión
        """
        self.on_progress = progress_callback
        self._prepare_job_directory()
        
        # Obtener total de registros
        total = self._count_registros()
        if total == 0:
            return {
                "success": False,
                "error": "No hay registros viables para emitir",
                "generados": 0,
                "fallidos": 0
            }
        
        logger.info(f"Iniciando emisión para {total} registros")
        logger.info(f"Modo: {self.modo}, Cuentas por lote: {self.cuentas_por_lote}")
        
        # Inicializar renderer
        renderer = PlantillaRenderer(self.proyecto_slug)
        plantilla_archivo = self.plantilla.nombre_archivo.split('/')[-1]
        
        # Asegurar que el navegador esté iniciado
        await PlantillaRenderer.get_browser()
        
        # Resultados
        resultados = {
            "success": True,
            "generados": 0,
            "fallidos": 0,
            "errores": [],
            "pdfs": [],
            "paquetes": []
        }
        
        orden_actual = self.orden_impresion_inicial
        
        try:
            if self.modo == "lotes":
                # Generar PDFs individuales (lotes)
                resultados = await self._generar_por_lotes(
                    renderer,
                    plantilla_archivo,
                    total,
                    max_concurrent_pages,
                    checkpoint_interval,
                    orden_actual
                )
            else:
                # Generar PDFs por paquetes
                resultados = await self._generar_por_paquetes(
                    renderer,
                    plantilla_archivo,
                    total,
                    max_concurrent_pages,
                    checkpoint_interval,
                    orden_actual
                )
            
            # Guardar manifiesto
            self._guardar_manifiesto(resultados)
            
        except Exception as e:
            logger.error(f"Error en emisión: {e}")
            resultados["success"] = False
            resultados["error"] = str(e)
        
        finally:
            # No cerramos el navegador aquí (se reutiliza globalmente)
            pass
        
        return resultados
    
    # ============================================================
    # GENERACIÓN POR LOTES (PDFs individuales)
    # ============================================================
    
    async def _generar_por_lotes(
        self,
        renderer: PlantillaRenderer,
        plantilla_archivo: str,
        total: int,
        max_concurrent: int,
        checkpoint_interval: int,
        orden_actual: int
    ) -> Dict[str, Any]:
        """Genera PDFs individuales por lotes."""
        resultados = {
            "success": True,
            "generados": 0,
            "fallidos": 0,
            "errores": [],
            "pdfs": []
        }
        
        offset = 0
        procesados = 0
        
        while offset < total:
            batch_size = min(self.cuentas_por_lote, total - offset)
            registros = self._get_registros(offset, batch_size)
            
            if not registros:
                break
            
            logger.info(f"Procesando lote {offset//batch_size + 1}: {len(registros)} registros")
            
            # Generar PDFs en paralelo
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def generar_registro(registro, idx):
                async with semaphore:
                    orden = orden_actual + idx
                    success, pdf_path, error = await self.generar_pdf_individual(
                        registro,
                        renderer,
                        orden,
                        plantilla_archivo
                    )
                    return {
                        "pk": registro.get(self.pk),
                        "orden": orden,
                        "success": success,
                        "path": pdf_path,
                        "error": error
                    }
            
            tasks = [generar_registro(r, i) for i, r in enumerate(registros)]
            batch_resultados = await asyncio.gather(*tasks)
            
            # Actualizar resultados
            for res in batch_resultados:
                if res["success"]:
                    resultados["generados"] += 1
                    resultados["pdfs"].append(res)
                else:
                    resultados["fallidos"] += 1
                    resultados["errores"].append({
                        "pk": res["pk"],
                        "error": res["error"]
                    })
            
            # Actualizar orden y offset
            orden_actual += len(registros)
            offset += batch_size
            procesados += len(registros)
            
            # Callback de progreso
            if self.on_progress:
                progreso = {
                    "procesados": procesados,
                    "total": total,
                    "generados": resultados["generados"],
                    "fallidos": resultados["fallidos"],
                    "orden_actual": orden_actual
                }
                self.on_progress(progreso)
            
            # Checkpoint
            if procesados % checkpoint_interval == 0 or procesados >= total:
                logger.info(f"Checkpoint: {procesados}/{total} registros procesados")
                await self._guardar_checkpoint(procesados, resultados)
        
        return resultados
    
    # ============================================================
    # GENERACIÓN POR PAQUETES
    # ============================================================
    
    async def _generar_por_paquetes(
        self,
        renderer: PlantillaRenderer,
        plantilla_archivo: str,
        total: int,
        max_concurrent: int,
        checkpoint_interval: int,
        orden_actual: int
    ) -> Dict[str, Any]:
        """Genera PDFs por paquetes (múltiples registros por PDF)."""
        resultados = {
            "success": True,
            "generados": 0,
            "fallidos": 0,
            "errores": [],
            "paquetes": []
        }
        
        offset = 0
        procesados = 0
        paquete_num = 1
        
        while offset < total:
            batch_size = min(self.cuentas_por_lote, total - offset)
            registros = self._get_registros(offset, batch_size)
            
            if not registros:
                break
            
            logger.info(f"Procesando paquete {paquete_num}: {len(registros)} registros")
            
            # Generar paquete
            resultado_paquete = await self.generar_paquete_pdf(
                registros,
                renderer,
                plantilla_archivo,
                orden_actual,
                f"PAQUETE_{paquete_num:05d}"
            )
            
            # Actualizar resultados
            if resultado_paquete["success"]:
                resultados["generados"] += resultado_paquete["registros_procesados"]
                resultados["paquetes"].append({
                    "orden_inicial": orden_actual,
                    "orden_final": orden_actual + len(registros) - 1,
                    "path": resultado_paquete["pdf_path"],
                    "registros": len(registros)
                })
            else:
                resultados["fallidos"] += resultado_paquete["registros_fallidos"]
                resultados["errores"].extend(resultado_paquete["errores"])
            
            # Actualizar orden y offset
            orden_actual += len(registros)
            offset += batch_size
            procesados += len(registros)
            paquete_num += 1
            
            # Callback de progreso
            if self.on_progress:
                progreso = {
                    "procesados": procesados,
                    "total": total,
                    "generados": resultados["generados"],
                    "fallidos": resultados["fallidos"],
                    "orden_actual": orden_actual,
                    "paquete_actual": paquete_num - 1
                }
                self.on_progress(progreso)
            
            # Checkpoint
            if procesados % checkpoint_interval == 0 or procesados >= total:
                logger.info(f"Checkpoint: {procesados}/{total} registros procesados")
                await self._guardar_checkpoint(procesados, resultados)
        
        return resultados
    
    # ============================================================
    # CHECKPOINTS Y MANIFIESTOS
    # ============================================================
    
    async def _guardar_checkpoint(self, procesados: int, resultados: Dict):
        """Guarda checkpoint del progreso."""
        checkpoint_data = {
            "procesados": procesados,
            "generados": resultados["generados"],
            "fallidos": resultados["fallidos"],
            "orden_actual": self.orden_impresion_inicial + resultados["generados"],
            "timestamp": datetime.now().isoformat()
        }
        
        self.job.checkpoint_data = checkpoint_data
        self.db_global.commit()
        
        logger.info(f"Checkpoint guardado: {procesados} registros procesados")
    
    def _guardar_manifiesto(self, resultados: Dict):
        """Guarda el manifiesto del job."""
        manifest = {
            "job_id": self.job_id,
            "proyecto": self.proyecto_slug,
            "plantilla": self.plantilla.nombre,
            "fecha_emision": datetime.now().isoformat(),
            "modo": self.modo,
            "total_registros": self.job.total_registros,
            "generados": resultados.get("generados", 0),
            "fallidos": resultados.get("fallidos", 0),
            "orden_inicial": self.orden_impresion_inicial,
            "orden_final": self.orden_impresion_inicial + resultados.get("generados", 0),
            "ruta": str(self.job_dir),
            "errores": resultados.get("errores", [])[:20]  # Solo los primeros 20
        }
        
        manifest_path = self.job_dir / "manifest.json"
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, default=str)
        
        logger.info(f"Manifiesto guardado en: {manifest_path}")
        return manifest