"""
TRINNOVA - Worker Service para Windows
=======================================
Este script corre como servicio de Windows en background.
Se encarga de procesar los jobs de emisión de documentos.

Estado actual: Fase 2.1 - Cliente API implementado
Pendiente: Procesamiento real de PDFs (Fase 2.2)
"""

import sys
import os
import time
import json
import logging
import signal
import traceback
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List

# ============================================================
# CONFIGURACIÓN DE PATHS
# ============================================================

# Obtener la ruta base del proyecto
BASE_DIR = Path(__file__).parent.parent
BACKEND_DIR = BASE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# Crear directorios necesarios
LOG_DIR = BASE_DIR / "Logs"
TEMP_DIR = BASE_DIR / "Temp"
EMISIONES_DIR = BASE_DIR / "Emisiones"

LOG_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)
EMISIONES_DIR.mkdir(exist_ok=True)

print(f"Directorio base: {BASE_DIR}")
print(f"Backend: {BACKEND_DIR}")
print(f"Logs: {LOG_DIR}")
print(f"Emisiones: {EMISIONES_DIR}")

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
# IMPORTACIÓN DE MÓDULOS
# ============================================================

try:
    from api_client import WorkerAPIClient
    logger.info("Cliente API importado correctamente")
except ImportError as e:
    logger.error(f"Error importando api_client: {e}")
    logger.error("Asegúrate de que api_client.py está en la misma carpeta")
    sys.exit(1)

try:
    from backend.app.core.config import settings
    logger.info("Configuración cargada correctamente")
except ImportError as e:
    logger.error(f"Error importando configuración: {e}")
    logger.error("Asegúrate de que el backend está en la ruta correcta")
    sys.exit(1)

# ============================================================
# CLASE PRINCIPAL DEL WORKER
# ============================================================

class TrinnovaWorker:
    """
    Worker que procesa jobs de emisión de documentos.
    
    Estado actual:
    - Conecta al backend via API Client
    - Obtiene jobs pendientes
    - Pendiente: Procesamiento real de PDFs (Fase 2.2)
    """
    
    def __init__(self, worker_id: str = "worker_1"):
        """
        Inicializa el worker.
        
        Args:
            worker_id: Identificador único del worker
        """
        self.worker_id = worker_id
        self.running = True
        self.api_client = None
        
        # Configuración
        self.poll_interval = 10  # Segundos entre consultas
        self.checkpoint_interval = 50  # Registros entre checkpoints
        self.batch_size = 100
        
        # Estadísticas
        self.stats = {
            "jobs_procesados": 0,
            "pdfs_generados": 0,
            "errores": 0,
            "inicio": datetime.now().isoformat()
        }
        
        # Cargar configuración desde archivo
        self._load_config()
        
        # Registrar señales para cierre limpio
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        logger.info(f"Worker {worker_id} inicializado")
        logger.info(f"Directorio base: {BASE_DIR}")
    
    # ============================================================
    # CONFIGURACIÓN
    # ============================================================
    
    def _load_config(self):
        """Carga la configuración desde worker_config.json"""
        config_file = Path(__file__).parent / "worker_config.json"
        
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                
                # Configuración del worker
                self.poll_interval = config.get("worker", {}).get("poll_interval", 10)
                self.checkpoint_interval = config.get("procesamiento", {}).get("checkpoint_interval", 50)
                self.batch_size = config.get("procesamiento", {}).get("batch_size", 100)
                
                # Crear cliente API
                servidor = config.get("servidor", {})
                self.api_client = WorkerAPIClient(
                    base_url=servidor.get("url", "http://localhost:8000/api/v1"),
                    token=servidor.get("token", ""),
                    timeout=servidor.get("timeout", 60)
                )
                
                logger.info("Configuración cargada correctamente")
                
            except Exception as e:
                logger.error(f"Error cargando configuración: {e}")
                sys.exit(1)
        else:
            logger.warning(f"Archivo de configuración no encontrado: {config_file}")
            logger.warning("Usando valores por defecto")
            
            # Valores por defecto
            self.api_client = WorkerAPIClient(
                base_url="http://localhost:8000/api/v1",
                token="",
                timeout=60
            )
    
    # ============================================================
    # MANEJO DE SEÑALES
    # ============================================================
    
    def _signal_handler(self, signum, frame):
        """Maneja señales de cierre (Ctrl+C, terminación)"""
        logger.info(f"🛑 Recibida señal {signum}, cerrando worker...")
        self.stop()
    
    # ============================================================
    # BUCLE PRINCIPAL
    # ============================================================
    
    def run(self):
        """
        Bucle principal del worker.
        Se ejecuta indefinidamente hasta que se reciba señal de cierre.
        """
        logger.info("=" * 60)
        logger.info(f"INICIANDO TRINNOVA WORKER - {self.worker_id}")
        logger.info(f"Sistema: {os.name}")
        logger.info(f"Directorio: {BASE_DIR}")
        logger.info(f"API: {self.api_client.base_url}")
        logger.info("=" * 60)
        
        logger.info("Worker listo para procesar jobs")
        logger.info(f"Intervalo de polling: {self.poll_interval} segundos")
        logger.info(f"Checkpoint cada: {self.checkpoint_interval} registros")
        logger.info("=" * 60)
        
        # Bucle principal
        while self.running:
            try:
                # 1. Obtener jobs pendientes
                jobs = self.api_client.get_pending_jobs(self.worker_id)
                
                if jobs:
                    # 2. Procesar cada job (uno a la vez)
                    for job in jobs:
                        if not self.running:
                            break
                        self._process_job(job)
                else:
                    # No hay trabajos, esperar
                    if self.running:
                        time.sleep(self.poll_interval)
                        
            except KeyboardInterrupt:
                logger.info("🛑 Interrupción por teclado recibida")
                break
            except Exception as e:
                logger.error(f"Error en bucle principal: {e}")
                logger.error(traceback.format_exc())
                time.sleep(30)  # Esperar antes de reintentar
        
        # Cierre limpio
        self._cleanup()
    
    # ============================================================
    # PROCESAMIENTO DE JOBS
    # ============================================================
    
    def _process_job(self, job: Dict[str, Any]):
        """
        Procesa un job completo.
        
        Args:
            job: Datos del job obtenidos del servidor
        """
        job_id = job.get("id")
        
        if not job_id:
            logger.warning("Job sin ID, ignorando")
            return
        
        logger.info(f"Iniciando procesamiento del job {job_id}")
        logger.info(f"   Proyecto: {job.get('proyecto_slug')}")
        logger.info(f"   Plantilla: {job.get('plantilla_nombre')}")
        logger.info(f"   Total registros: {job.get('total_registros', 0)}")
        
        try:
            # 1. Tomar el job (claim)
            claimed_job = self.api_client.claim_job(self.worker_id, job_id)
            
            if not claimed_job:
                logger.warning(f"No se pudo tomar el job {job_id}, otro worker lo procesará")
                return
            
            # 2. Actualizar estado a 'processing'
            self.api_client.update_progress(
                self.worker_id,
                job_id,
                procesados=0,
                status="processing"
            )
            
            # 3. Verificar si hay checkpoint (recuperación)
            checkpoint = self.api_client.get_checkpoint(job_id)
            if checkpoint:
                logger.info(f"Recuperando desde checkpoint: {checkpoint.get('procesados', 0)} registros")
                # TODO: Implementar recuperación desde checkpoint (Fase 2.3)
            
            # 4. Procesar registros
            # FASE 2.2: Aquí irá la lógica de generación de PDFs
            # Por ahora simulamos procesamiento
            total = job.get('total_registros', 0)
            procesados = checkpoint.get('procesados', 0) if checkpoint else 0
            
            logger.info(f"Procesando {total} registros...")
            
            # Simulación de procesamiento (será reemplazado por la lógica real)
            for i in range(procesados, total):
                # Simular procesamiento de un registro
                time.sleep(0.1)
                procesados = i + 1
                
                # Guardar checkpoint cada N registros
                if procesados % self.checkpoint_interval == 0:
                    self.api_client.save_checkpoint(job_id, {
                        "procesados": procesados,
                        "ultimo_pk": f"PK_{procesados}"
                    })
                    
                    # Actualizar progreso en el servidor
                    self.api_client.update_progress(
                        self.worker_id,
                        job_id,
                        procesados=procesados,
                        ultimo_pk=f"PK_{procesados}"
                    )
                    
                    logger.info(f"Progreso: {procesados}/{total} ({round(procesados/total*100, 1)}%)")
            
            # 5. Marcar como completado
            # Crear ZIP vacío por ahora (será reemplazado por la lógica real)
            zip_path = EMISIONES_DIR / f"emision_{job_id}_temp.zip"
            zip_path.touch()  # Crear archivo vacío
            
            self.api_client.mark_completed(self.worker_id, job_id, str(zip_path))
            
            logger.info(f"Job {job_id} completado exitosamente")
            
            # Actualizar estadísticas
            self.stats["jobs_procesados"] += 1
            self.stats["pdfs_generados"] += total
            
        except Exception as e:
            error_msg = f"Error procesando job {job_id}: {str(e)}\n{traceback.format_exc()}"
            logger.error(error_msg)
            
            # Marcar como fallido
            self.api_client.update_progress(
                self.worker_id,
                job_id,
                procesados=0,
                status="failed",
                error_msg=str(e)
            )
    
    # ============================================================
    # LIMPIEZA Y CIERRE
    # ============================================================
    
    def _cleanup(self):
        """Limpieza final al cerrar el worker"""
        logger.info("Limpiando recursos...")
        
        if self.api_client:
            # Enviar heartbeat de detención
            self.api_client.send_heartbeat(self.worker_id, "stopped")
        
        logger.info("=" * 60)
        logger.info("ESTADÍSTICAS FINALES")
        logger.info(f"   Jobs procesados: {self.stats['jobs_procesados']}")
        logger.info(f"   PDFs generados: {self.stats['pdfs_generados']}")
        logger.info(f"   Errores: {self.stats['errores']}")
        logger.info(f"   Inicio: {self.stats['inicio']}")
        logger.info(f"   Fin: {datetime.now().isoformat()}")
        logger.info("=" * 60)
        logger.info("Worker detenido correctamente")
    
    def stop(self):
        """Detiene el worker de forma segura"""
        if not self.running:
            return
        
        logger.info("🛑 Deteniendo worker...")
        self.running = False
        
        # Esperar a que termine el procesamiento actual
        time.sleep(2)


# ============================================================
# PUNTO DE ENTRADA
# ============================================================

if __name__ == "__main__":
    # Obtener worker_id de argumentos o usar default
    worker_id = "worker_1"
    if len(sys.argv) > 1:
        worker_id = sys.argv[1]
    
    # Crear e iniciar worker
    worker = TrinnovaWorker(worker_id)
    worker.run()