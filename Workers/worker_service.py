# Workers/worker_service.py - CORREGIDO

import sys
import os
import json
import asyncio
import logging
import signal
import traceback
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
import httpx
from backend.app.services.monitoreo_service import MonitoreoService
from backend.app.services.emision_service import EmisionService
from backend.app.services.codebar_service import CodebarService
from backend.app.db.session import SessionGlobal 

# ============================================================
# CONFIGURACIÓN DE PATHS
# ============================================================

BASE_DIR = Path(__file__).parent.parent
BACKEND_DIR = BASE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

LOG_DIR = BASE_DIR / "Logs"
TEMP_DIR = BASE_DIR / "Temp"
EMISIONES_DIR = BASE_DIR / "Emisiones"

LOG_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
EMISIONES_DIR.mkdir(exist_ok=True)

# ============================================================
# CONFIGURACIÓN DE LOGGING
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(LOG_DIR / 'worker.log', encoding='utf-8'),
        logging.FileHandler(LOG_DIR / 'worker_errors.log', encoding='utf-8', mode='a'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("TrinnovaWorker")

# ============================================================
# CLIENTE API ASÍNCRONO
# ============================================================

class AsyncAPIClient:
    """Cliente HTTP asíncrono para el worker con auto-registro."""
    
    def __init__(self, base_url: str, worker_id: str, worker_secret: str = None, timeout: int = 60):
        self.base_url = base_url.rstrip('/')
        self.worker_id = worker_id
        self.worker_secret = worker_secret or "Admin2024!"
        self.timeout = timeout
        self.token = None
        self.client = None
    
    async def __aenter__(self):
        await self._register()
        
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            headers={
                'Authorization': f'Bearer {self.token}',
                'Content-Type': 'application/json',
                'User-Agent': f'Trinnova-Worker/{self.worker_id}'
            },
            limits=httpx.Limits(max_keepalive_connections=10)
        )
        return self
    
    async def _register(self):
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/emision/workers/register",
                    params={
                        "worker_id": self.worker_id,
                        "worker_secret": self.worker_secret
                    }
                )
                response.raise_for_status()
                data = response.json()
                self.token = data.get("access_token")
                logger.info(f"Worker registrado: {self.worker_id}")
                return True
        except Exception as e:
            logger.error(f"Error registrando worker: {e}")
            self.token = None
            return False
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.aclose()
    
    async def get_pending_jobs(self, worker_id: str) -> List[Dict]:
        try:
            response = await self.client.get(
                "/emision/workers/pending",
                params={"worker_id": worker_id}
            )
            response.raise_for_status()
            data = response.json()
            return data.get("jobs", [])
        except Exception as e:
            logger.error(f"Error obteniendo jobs: {e}")
            return []
    
    async def claim_job(self, worker_id: str, job_id: int) -> Optional[Dict]:
        try:
            response = await self.client.post(
                "/emision/workers/claim",
                json={"worker_id": worker_id, "job_id": job_id}
            )
            response.raise_for_status()
            data = response.json()
            return data.get("job")
        except Exception as e:
            logger.error(f"Error tomando job {job_id}: {e}")
            return None
    
    async def update_progress(
        self,
        worker_id: str,
        job_id: int,
        procesados: int,
        ultimo_pk: Optional[str] = None,
        status: str = "processing",
        error_msg: Optional[str] = None,
        checkpoint_data: Optional[Dict] = None
    ) -> bool:
        try:
            payload = {
                "worker_id": worker_id,
                "procesados": procesados,
                "status": status
            }
            if ultimo_pk:
                payload["ultimo_pk"] = ultimo_pk
            if error_msg:
                payload["error_msg"] = error_msg
            if checkpoint_data:
                payload["checkpoint_data"] = checkpoint_data
            
            response = await self.client.post(
                f"/emision/workers/{worker_id}/progress/{job_id}",
                json=payload
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error actualizando progreso: {e}")
            return False
    
    async def save_checkpoint(self, job_id: int, checkpoint_data: Dict) -> bool:
        try:
            response = await self.client.post(
                "/emision/workers/checkpoint",
                json={"job_id": job_id, "checkpoint": checkpoint_data}
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error guardando checkpoint: {e}")
            return False
    
    async def get_checkpoint(self, job_id: int) -> Optional[Dict]:
        try:
            response = await self.client.get(f"/emision/workers/checkpoint/{job_id}")
            response.raise_for_status()
            data = response.json()
            return data.get("checkpoint")
        except Exception as e:
            logger.error(f"Error obteniendo checkpoint: {e}")
            return None
    
    async def complete_job(
        self,
        worker_id: str,
        job_id: int,
        manifest: Dict
    ) -> bool:
        try:
            response = await self.client.post(
                f"/emision/workers/{worker_id}/upload/{job_id}",
                json={"manifest": manifest}
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error completando job: {e}")
            return False
    
    async def send_heartbeat(self, worker_id: str, status: str = "running", current_job: Optional[int] = None) -> bool:
        try:
            await self.client.post(
                "/emision/workers/heartbeat",
                json={
                    "worker_id": worker_id,
                    "status": status,
                    "timestamp": datetime.now().isoformat(),
                    "current_job": current_job
                }
            )
            return True
        except:
            return False


# ============================================================
# RENDERER DE PLANTILLAS (Asíncrono)
# ============================================================

class AsyncPlantillaRenderer:
    # Variables de clase para compartir entre todos los Jobs
    _playwright = None
    _browser = None
    _context = None
    _lock = asyncio.Lock()

    def __init__(self, proyecto_slug: str):
        self.proyecto_slug = proyecto_slug
        self.base_path = Path(__file__).parent.parent / "backend" / "app" / "plantillas_html" / proyecto_slug
        
        if not self.base_path.exists():
            raise FileNotFoundError(f"No se encontró la carpeta de plantillas para: {proyecto_slug}")
    
    @classmethod
    async def start(cls):
        """Inicia el navegador una sola vez para todo el proceso del Worker"""
        async with cls._lock:
            if cls._browser is None:
                from playwright.async_api import async_playwright
                logger.info("Lanzando instancia global de Chromium...")
                cls._playwright = await async_playwright().start()
                cls._browser = await cls._playwright.chromium.launch(
                    headless=True,
                    args=[
                        '--disable-gpu',
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-web-security'
                    ]
                )
                cls._context = await cls._browser.new_context(
                    viewport={'width': 816, 'height': 1286}
                )
                logger.info("Navegador global iniciado correctamente.")

    @classmethod
    async def stop(cls):
        """Cierra el navegador al apagar el Worker"""
        async with cls._lock:
            if cls._context:
                await cls._context.close()
            if cls._browser:
                await cls._browser.close()
            if cls._playwright:
                await cls._playwright.stop()
            cls._browser = cls._context = cls._playwright = None
            logger.info("Navegador global cerrado.")
    
    async def render_pdf(
        self,
        nombre_archivo: str,
        placeholders: Dict[str, str],
        altura: int = 1286
    ) -> bytes:
        import base64
        
        # Asegurar que el contexto exista
        if not AsyncPlantillaRenderer._context:
            await AsyncPlantillaRenderer.start()

        ruta_completa = self.base_path / nombre_archivo
        if not ruta_completa.exists():
            raise FileNotFoundError(f"Archivo HTML no encontrado: {ruta_completa}")
        
        with open(ruta_completa, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        for key, value in placeholders.items():
            html_content = html_content.replace(f"{{{{{key}}}}}", str(value if value is not None else ""))
        
        # Inyectar estilos de código de barras
        html_content = CodebarService.inject_codebar_style(html_content)
        
        # Convertir imágenes
        img_folder = self.base_path / "img"
        if img_folder.exists():
            for img_path in img_folder.glob("*"):
                try:
                    with open(img_path, 'rb') as f:
                        img_data = base64.b64encode(f.read()).decode('utf-8')
                        mime = "image/png" if img_path.suffix == ".png" else "image/jpeg"
                        html_content = html_content.replace(f"./img/{img_path.name}", f"data:{mime};base64,{img_data}")
                        html_content = html_content.replace(f"img/{img_path.name}", f"data:{mime};base64,{img_data}")
                except: continue
        
        # USAR EL CONTEXTO GLOBAL
        page = await AsyncPlantillaRenderer._context.new_page()
        try:
            await page.set_content(html_content, wait_until='networkidle')
            await page.wait_for_timeout(300)
            
            return await page.pdf(
                print_background=True,
                width='816px',
                height=f'{altura}px',
                margin={'top': '0mm', 'bottom': '0mm', 'left': '0mm', 'right': '0mm'},
                prefer_css_page_size=True,
            )
        finally:
            await page.close()


# ============================================================
# WORKER PRINCIPAL
# ============================================================

class TrinnovaWorker:
    def __init__(self, worker_id: str = "worker_1"):
        self.worker_id = worker_id
        self.running = True
        self.api_client = None
        self.current_job = None
        
        self.config = {
            "worker": {"poll_interval": 5, "secret": "Admin2024!"},
            "servidor": {"url": "http://localhost:8000/api/v1", "timeout": 60},
            "procesamiento": {"checkpoint_interval": 50, "batch_size": 50, "max_concurrent_pages": 10},
            "almacenamiento": {"base_path": str(EMISIONES_DIR), "temp_path": str(TEMP_DIR)}
        }
        
        self.poll_interval = 5
        self.checkpoint_interval = 50
        self.batch_size = 50
        self.max_concurrent_pages = 10
        self.base_emisiones_path = EMISIONES_DIR
        self.temp_path = TEMP_DIR
        
        self.stats = {
            "jobs_procesados": 0,
            "pdfs_generados": 0,
            "errores": 0,
            "inicio": datetime.now().isoformat()
        }

        self.api_config = {
            "base_url": self.config["servidor"].get("url", "http://localhost:8000/api/v1"),
            "worker_id": self.worker_id,
            "worker_secret": self.config["worker"].get("secret", "Admin2024!"),
            "timeout": self.config["servidor"].get("timeout", 60)
        }
        
        self._load_config()
        logger.info(f"Worker {worker_id} inicializado (modo: SIN ZIP)")
    
    def _load_config(self):
        config_file = Path(__file__).parent / "worker_config.json"
        
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)

                self.config["worker"].update(config.get("worker", {}))
                self.config["servidor"].update(config.get("servidor", {}))
                self.config["procesamiento"].update(config.get("procesamiento", {}))
                self.config["almacenamiento"].update(config.get("almacenamiento", {}))
                
                self.poll_interval = self.config["worker"].get("poll_interval", 5)
                self.checkpoint_interval = self.config["procesamiento"].get("checkpoint_interval", 50)
                self.batch_size = self.config["procesamiento"].get("batch_size", 50)
                self.max_concurrent_pages = self.config["procesamiento"].get("max_concurrent_pages", 10)
                
                servidor = self.config["servidor"]
                self.api_config = {
                    "base_url": servidor.get("url", "http://localhost:8000/api/v1"),
                    "token": servidor.get("token", ""),
                    "timeout": servidor.get("timeout", 60),
                    "worker_id": self.worker_id,
                    "worker_secret": self.config["worker"].get("secret", "Admin2024!")
                }
                
                self.base_emisiones_path = Path(self.config["almacenamiento"].get("base_path", str(EMISIONES_DIR)))
                self.temp_path = Path(self.config["almacenamiento"].get("temp_path", str(TEMP_DIR)))
                
                logger.info("Configuración cargada correctamente")
            except Exception as e:
                logger.error(f"Error cargando configuración: {e}")
                self.api_config = {
                    "base_url": "http://localhost:8000/api/v1",
                    "token": "",
                    "timeout": 60,
                    "worker_id": self.worker_id,
                    "worker_secret": self.config["worker"].get("secret", "Admin2024!")
                }
                self.base_emisiones_path = EMISIONES_DIR
                self.temp_path = TEMP_DIR
    
    async def run(self):
        logger.info("=" * 60)
        logger.info(f"INICIANDO TRINNOVA WORKER - {self.worker_id}")
        logger.info(f"API: {self.api_config['base_url']}")
        logger.info("=" * 60)

        await AsyncPlantillaRenderer.start()
        
        try:
            async with AsyncAPIClient(**self.api_config) as client:
                self.api_client = client
                await self.api_client.send_heartbeat(self.worker_id, "running")
                
                logger.info("Worker listo para procesar jobs")
                logger.info(f"Intervalo de polling: {self.poll_interval}s")
                logger.info(f"Checkpoint cada: {self.checkpoint_interval} registros")
                logger.info(f"Batch size: {self.batch_size}")
                logger.info(f"Concurrencia máxima: {self.max_concurrent_pages} páginas")
                logger.info("=" * 60)
                
                while self.running:
                    try:
                        jobs = await self.api_client.get_pending_jobs(self.worker_id)
                        
                        if jobs:
                            for job in jobs:
                                if not self.running:
                                    break
                                await self._process_job(job)
                        else:
                            if self.running:
                                await asyncio.sleep(self.poll_interval)
                                
                    except asyncio.CancelledError:
                        logger.info("Tarea cancelada")
                        break
                    except Exception as e:
                        logger.error(f"Error en bucle principal: {e}")
                        logger.error(traceback.format_exc())
                        await asyncio.sleep(30)
                
                await self.api_client.send_heartbeat(self.worker_id, "stopped")
        finally:
            await AsyncPlantillaRenderer.stop()
        self._print_stats()
        logger.info("Worker detenido correctamente")
    
    async def _process_job(self, job_data: Dict[str, Any]):
        job_id = job_data.get("id")
        
        if not job_id:
            logger.warning("Job sin ID, ignorando")
            return
        
        proyecto_slug = job_data.get('proyecto_slug')
        total = job_data.get('total_registros', 0)
        
        # ✅ LOG: Inicio de job
        MonitoreoService.registrar_log_estructurado(
            nivel="info",
            mensaje=f"Iniciando procesamiento de job {job_id}",
            job_id=job_id,
            worker_id=self.worker_id,
            proyecto_slug=proyecto_slug,
            datos_extra={"total_registros": total}
        )
        
        logger.info(f"Procesando job {job_id}")
        logger.info(f"   Proyecto: {proyecto_slug}")
        logger.info(f"   Plantilla: {job_data.get('plantilla_nombre')}")
        logger.info(f"   Total registros: {total}")
        
        claimed_job = await self.api_client.claim_job(self.worker_id, job_id)
        
        if not claimed_job:
            logger.warning(f"No se pudo tomar el job {job_id}")
            return
        
        self.current_job = job_id
        
        # ✅ Crear sesión de BD para el worker
        db_session = SessionGlobal()
        
        try:
            emision_service = EmisionService(
                job_id=job_id,
                db_global=db_session,
                worker_id=self.worker_id
            )

            def on_progress(progreso):
                asyncio.create_task(
                    self.api_client.update_progress(
                        self.worker_id,
                        job_id,
                        procesados=progreso["procesados"],
                        ultimo_pk=None
                    )
                )
            
            # Generar emisión
            resultados = await emision_service.generar_emision(
                max_concurrent_pages=self.max_concurrent_pages,
                checkpoint_interval=self.checkpoint_interval,
                progress_callback=on_progress
            )

            procesados = 0
            ultimo_pk = None
            checkpoint = await self.api_client.get_checkpoint(job_id)
            
            if checkpoint:
                procesados = checkpoint.get('procesados', 0)
                ultimo_pk = checkpoint.get('ultimo_pk')
                logger.info(f"Recuperando desde checkpoint: {procesados} registros")
            
            job_dir = self._get_job_directory(proyecto_slug, job_id)
            job_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"Carpeta de salida: {job_dir}")
            
            renderer = AsyncPlantillaRenderer(proyecto_slug)
            pdfs_generados = 0
            fallidos = 0
            errores = []
            orden_impresion = claimed_job.get('orden_impresion_inicial', 1)
            
            offset = procesados
            plantilla_archivo = claimed_job.get('plantilla_archivo', '').split('/')[-1]
            pk = self._get_pk_name(proyecto_slug)
            
            while offset < total and self.running:
                registros = await self._get_registros_batch(
                    proyecto_slug,
                    claimed_job.get('filtros', {}),
                    offset,
                    self.batch_size,
                    pk
                )
                
                if not registros:
                    break
                
                resultados_pdf = await self._generar_pdfs_lote(
                    renderer,
                    plantilla_archivo,
                    registros,
                    claimed_job,
                    job_dir,
                    orden_impresion
                )
                
                for resultado in resultados_pdf:
                    if resultado.get('success'):
                        pdfs_generados += 1
                        orden_impresion += 1
                    else:
                        fallidos += 1
                        errores.append(resultado.get('error', 'Error desconocido'))
                
                offset += len(registros)
                procesados = offset
                if resultados_pdf:
                    ultimo_pk = resultados_pdf[-1].get('pk_value')
                
                if offset % self.checkpoint_interval == 0 or offset >= total:
                    await self.api_client.save_checkpoint(job_id, {
                        "procesados": offset,
                        "ultimo_pk": ultimo_pk,
                        "pdfs_generados": pdfs_generados,
                        "fallidos": fallidos,
                        "ultimo_orden": orden_impresion - 1
                    })
                    
                    await self.api_client.update_progress(
                        self.worker_id,
                        job_id,
                        procesados=offset,
                        ultimo_pk=ultimo_pk
                    )
                    
                    logger.info(f"Progreso: {offset}/{total} ({round(offset/total*100, 1)}%) | PDFs: {pdfs_generados} | Fallidos: {fallidos}")
            
            manifest = {
                "job_id": job_id,
                "worker_id": self.worker_id,
                "proyecto_slug": proyecto_slug,
                "total_registros": total,
                "generados": pdfs_generados,
                "fallidos": fallidos,
                "ruta_local": str(job_dir),
                "fecha_completado": datetime.now().isoformat(),
                "ultimo_orden": orden_impresion - 1,
                "errores": errores[:10]
            }
            
            await self.api_client.complete_job(self.worker_id, job_id, manifest)
            
            # ✅ LOG: Job completado
            MonitoreoService.registrar_log_estructurado(
                nivel="info",
                mensaje=f"Job {job_id} completado exitosamente",
                job_id=job_id,
                worker_id=self.worker_id,
                proyecto_slug=proyecto_slug,
                datos_extra={"pdfs_generados": pdfs_generados, "fallidos": fallidos}
            )
            
            logger.info(f"Job {job_id} completado: {pdfs_generados} PDFs generados, {fallidos} fallidos")
            logger.info(f"Ubicación: {job_dir}")
            
            self.stats["jobs_procesados"] += 1
            self.stats["pdfs_generados"] += pdfs_generados
            self.stats["errores"] += fallidos
            
        except Exception as e:
            error_msg = f"Error procesando job {job_id}: {str(e)}\n{traceback.format_exc()}"
            logger.error(error_msg)
            
            # ✅ LOG: Error
            MonitoreoService.registrar_log_estructurado(
                nivel="error",
                mensaje=f"Error en job {job_id}: {str(e)}",
                job_id=job_id,
                worker_id=self.worker_id,
                proyecto_slug=proyecto_slug,
                datos_extra={"error": str(e), "traceback": traceback.format_exc()}
            )
            
            await self.api_client.update_progress(
                self.worker_id,
                job_id,
                procesados=procesados,
                status="failed",
                error_msg=str(e)
            )
        finally:
            db_session.close()  # ✅ Cerrar sesión de BD
            self.current_job = None
    
    def _get_pk_name(self, proyecto_slug: str) -> str:
        pks = {
            "apa_tlajomulco": "clave_APA",
            "predial_tlajomulco": "cuenta",
            "licencias_gdl": "licencia",
            "predial_gdl": "cuenta_n",
            "estado": "credito",
            "pensiones": "prestamo",
        }
        return pks.get(proyecto_slug, "id")
    
    async def _get_registros_batch(
        self,
        proyecto_slug: str,
        filtros: Dict[str, Any],
        offset: int,
        limit: int,
        pk: str
    ) -> List[Dict]:
        from backend.app.db.router import get_project_db
        from sqlalchemy import text
        
        try:
            db_proyecto = next(get_project_db(proyecto_slug))
            
            conditions = ["viabilidad = 'viable'"]
            params = {}
            
            if filtros.get("programa") and filtros["programa"] != "todos":
                conditions.append("programa = :programa")
                params["programa"] = filtros["programa"]
            
            if filtros.get("ids") and isinstance(filtros["ids"], list):
                placeholders = ", ".join([f":id{i}" for i in range(len(filtros["ids"]))])
                conditions.append(f"{pk} IN ({placeholders})")
                for i, id_val in enumerate(filtros["ids"]):
                    params[f"id{i}"] = id_val
            
            where = " AND ".join(conditions) if conditions else "1=1"
            
            query = text(f"""
                SELECT * FROM tabla_analisis 
                WHERE {where}
                ORDER BY `{pk}` ASC
                LIMIT {limit} OFFSET {offset}
            """)
            
            result = db_proyecto.execute(query, params)
            rows = [dict(r._mapping) for r in result]
            
            db_proyecto.close()
            return rows
            
        except Exception as e:
            logger.error(f"Error obteniendo registros: {e}")
            return []
    
    async def _generar_pdfs_lote(
        self,
        renderer: AsyncPlantillaRenderer,
        plantilla_archivo: str,
        registros: List[Dict],
        job_data: Dict[str, Any],
        job_dir: Path,
        orden_inicial: int
    ) -> List[Dict[str, Any]]:
        semaphore = asyncio.Semaphore(self.max_concurrent_pages)
        pk = self._get_pk_name(job_data.get('proyecto_slug'))
        
        async def generar_pdf(registro, idx):
            async with semaphore:
                try:
                    pk_value = registro.get(pk)
                    orden_actual = orden_inicial + idx
                    
                    placeholders = {}
                    for key, value in registro.items():
                        if value is not None:
                            placeholders[key] = str(value)
                    
                    placeholders['_fecha_actual'] = datetime.now().strftime("%d/%m/%Y")
                    placeholders['_numero_pagina'] = "1"
                    placeholders['_total_paginas'] = "1"
                    placeholders['orden_impresion'] = str(orden_actual)
                    
                    if 'codebar' not in placeholders:
                        placeholders['codebar'] = CodebarService.generar_codebar_completo(
                            pk_value=str(pk_value),
                            fecha_emision=datetime.now(),
                            visita=job_data.get('visita'),
                            identificador_documento=job_data.get('identificador_documento')
                        )
                    
                    pdf_bytes = await renderer.render_pdf(
                        plantilla_archivo,
                        placeholders,
                        altura=1286
                    )
                    
                    nombre_pdf = f"{orden_actual:05d} - {pk_value}.pdf"
                    pdf_path = job_dir / nombre_pdf
                    
                    with open(pdf_path, 'wb') as f:
                        f.write(pdf_bytes)
                    
                    return {
                        "success": True,
                        "pk_value": pk_value,
                        "orden": orden_actual,
                        "path": str(pdf_path)
                    }
                    
                except Exception as e:
                    logger.error(f"Error generando PDF para {idx}: {e}")
                    return {
                        "success": False,
                        "pk_value": registro.get(pk),
                        "error": str(e)
                    }
        
        tasks = [generar_pdf(reg, i) for i, reg in enumerate(registros)]
        resultados = await asyncio.gather(*tasks)
        return resultados
    
    def _get_job_directory(self, proyecto_slug: str, job_id: int) -> Path:
        ahora = datetime.now()
        year = ahora.strftime("%Y")
        month = ahora.strftime("%m")
        job_dir = self.base_emisiones_path / proyecto_slug / year / month / f"job_{job_id}"
        return job_dir
    
    def _print_stats(self):
        logger.info("=" * 60)
        logger.info("ESTADISTICAS FINALES")
        logger.info(f"   Jobs procesados: {self.stats['jobs_procesados']}")
        logger.info(f"   PDFs generados: {self.stats['pdfs_generados']}")
        logger.info(f"   Errores: {self.stats['errores']}")
        logger.info(f"   Inicio: {self.stats['inicio']}")
        logger.info(f"   Fin: {datetime.now().isoformat()}")
        logger.info("=" * 60)
    
    def stop(self):
        self.running = False


# ============================================================
# PUNTO DE ENTRADA
# ============================================================

async def main():
    import sys
    
    worker_id = "worker_1"
    if len(sys.argv) > 1:
        worker_id = sys.argv[1]
    
    worker = TrinnovaWorker(worker_id)
    
    loop = asyncio.get_running_loop()
    
    def signal_handler():
        logger.info("Senal recibida, deteniendo worker...")
        worker.stop()
    
    for sig in [signal.SIGINT, signal.SIGTERM]:
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            signal.signal(sig, lambda s, f: signal_handler())
    
    try:
        await worker.run()
    except KeyboardInterrupt:
        logger.info("Interrupcion por teclado")
    except Exception as e:
        logger.error(f"Error fatal: {e}")
        logger.error(traceback.format_exc())
    finally:
        logger.info("Worker finalizado")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())