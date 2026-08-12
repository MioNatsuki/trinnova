"""
TRINNOVA - API Client para el Worker
====================================
Cliente HTTP para que el worker se comunique con el backend.

Endpoints que usa el worker:
- GET /emision/workers/pending    → Obtener jobs pendientes
- POST /emision/workers/claim     → Tomar un job para procesar
- POST /emision/workers/progress  → Actualizar progreso
- POST /emision/workers/upload    → Subir ZIP completado
- POST /emision/workers/heartbeat → Heartbeat del worker
"""

import requests
import json
import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("TrinnovaWorker.APIClient")

class WorkerAPIClient:
    """
    Cliente HTTP para que el worker se comunique con el backend.
    Maneja autenticación, reintentos y errores.
    """
    
    def __init__(self, base_url: str, token: str, timeout: int = 60):
        """
        Inicializa el cliente.
        
        Args:
            base_url: URL base del backend (ej: http://localhost:8000/api/v1)
            token: Token JWT del usuario
            timeout: Timeout en segundos para las peticiones
        """
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.timeout = timeout
        
        # Crear sesión para reutilizar conexiones
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
            'User-Agent': 'Trinnova-Worker/1.0'
        })
        
        logger.info(f"API Client inicializado: {base_url}")
    
    # ============================================================
    # MÉTODOS PARA OBTENER JOBS
    # ============================================================
    
    def get_pending_jobs(self, worker_id: str) -> List[Dict[str, Any]]:
        """
        Obtiene jobs pendientes para el worker.
        
        Args:
            worker_id: ID del worker
            
        Returns:
            List[Dict]: Lista de jobs pendientes
        """
        try:
            response = self.session.get(
                f"{self.base_url}/emision/workers/pending",
                params={"worker_id": worker_id},
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            jobs = data.get("jobs", [])
            logger.info(f"{len(jobs)} jobs pendientes obtenidos")
            return jobs
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error obteniendo jobs pendientes: {e}")
            return []
    
    def claim_job(self, worker_id: str, job_id: int) -> Optional[Dict[str, Any]]:
        """
        Toma un job para procesarlo.
        
        Args:
            worker_id: ID del worker
            job_id: ID del job
            
        Returns:
            Optional[Dict]: Datos del job o None si no se pudo tomar
        """
        try:
            response = self.session.post(
                f"{self.base_url}/emision/workers/claim",
                json={
                    "worker_id": worker_id,
                    "job_id": job_id
                },
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            if data.get("success"):
                logger.info(f"Job {job_id} tomado por worker {worker_id}")
                return data.get("job")
            else:
                logger.warning(f"No se pudo tomar job {job_id}: {data.get('message')}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error tomando job {job_id}: {e}")
            return None
    
    # ============================================================
    # MÉTODOS PARA ACTUALIZAR PROGRESO
    # ============================================================
    
    def update_progress(
        self,
        worker_id: str,
        job_id: int,
        procesados: int,
        ultimo_pk: Optional[str] = None,
        status: str = "processing",
        error_msg: Optional[str] = None
    ) -> bool:
        """
        Actualiza el progreso de un job.
        
        Args:
            worker_id: ID del worker
            job_id: ID del job
            procesados: Número de registros procesados
            ultimo_pk: Última PK procesada
            status: Estado del job (processing/completed/failed)
            error_msg: Mensaje de error (opcional)
            
        Returns:
            bool: True si se actualizó correctamente
        """
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
            
            response = self.session.post(
                f"{self.base_url}/emision/workers/{worker_id}/progress/{job_id}",
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            return data.get("success", False)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error actualizando progreso del job {job_id}: {e}")
            return False
    
    def mark_completed(self, worker_id: str, job_id: int, zip_path: str) -> bool:
        """
        Marca un job como completado y envía la ruta del ZIP.
        
        Args:
            worker_id: ID del worker
            job_id: ID del job
            zip_path: Ruta local del ZIP generado
            
        Returns:
            bool: True si se marcó como completado
        """
        # Primero subir el ZIP
        if not self.upload_zip(worker_id, job_id, zip_path):
            logger.error(f"Error subiendo ZIP para job {job_id}")
            return False
        
        # Luego actualizar estado
        return self.update_progress(
            worker_id,
            job_id,
            procesados=0,  # No importa, se tomará de la BD
            status="completed"
        )
    
    # ============================================================
    # MÉTODOS PARA SUBIR ARCHIVOS
    # ============================================================
    
    def upload_zip(self, worker_id: str, job_id: int, zip_path: str) -> bool:
        """
        Sube el ZIP generado al servidor.
        
        Args:
            worker_id: ID del worker
            job_id: ID del job
            zip_path: Ruta local del ZIP
            
        Returns:
            bool: True si se subió correctamente
        """
        try:
            zip_path = Path(zip_path)
            
            if not zip_path.exists():
                logger.error(f"ZIP no encontrado: {zip_path}")
                return False
            
            with open(zip_path, 'rb') as f:
                files = {'zip': (zip_path.name, f, 'application/zip')}
                
                response = self.session.post(
                    f"{self.base_url}/emision/workers/{worker_id}/upload/{job_id}",
                    files=files,
                    timeout=self.timeout * 2  # Más tiempo para subir archivos
                )
                response.raise_for_status()
            
            data = response.json()
            logger.info(f"📤 ZIP subido para job {job_id}")
            return data.get("success", False)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error subiendo ZIP para job {job_id}: {e}")
            return False
    
    # ============================================================
    # MÉTODOS PARA HEARTBEAT
    # ============================================================
    
    def send_heartbeat(self, worker_id: str, status: str = "running") -> bool:
        """
        Envía un heartbeat al servidor.
        
        Args:
            worker_id: ID del worker
            status: Estado del worker (running/idle/stopped)
            
        Returns:
            bool: True si se envió correctamente
        """
        try:
            response = self.session.post(
                f"{self.base_url}/emision/workers/heartbeat",
                json={
                    "worker_id": worker_id,
                    "status": status,
                    "timestamp": datetime.now().isoformat()
                },
                timeout=self.timeout
            )
            response.raise_for_status()
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error enviando heartbeat: {e}")
            return False
    
    # ============================================================
    # MÉTODOS PARA CHECKPOINTS
    # ============================================================
    
    def save_checkpoint(self, job_id: int, checkpoint_data: Dict[str, Any]) -> bool:
        """
        Guarda un checkpoint en el servidor.
        
        Args:
            job_id: ID del job
            checkpoint_data: Datos del checkpoint
            
        Returns:
            bool: True si se guardó correctamente
        """
        try:
            response = self.session.post(
                f"{self.base_url}/emision/workers/checkpoint",
                json={
                    "job_id": job_id,
                    "checkpoint": checkpoint_data
                },
                timeout=self.timeout
            )
            response.raise_for_status()
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error guardando checkpoint del job {job_id}: {e}")
            return False
    
    def get_checkpoint(self, job_id: int) -> Optional[Dict[str, Any]]:
        """
        Obtiene el último checkpoint de un job.
        
        Args:
            job_id: ID del job
            
        Returns:
            Optional[Dict]: Checkpoint o None
        """
        try:
            response = self.session.get(
                f"{self.base_url}/emision/workers/checkpoint/{job_id}",
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            return data.get("checkpoint")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error obteniendo checkpoint del job {job_id}: {e}")
            return None
    
    # ============================================================
    # MÉTODOS PARA OBTENER DATOS DEL JOB
    # ============================================================
    
    def get_job_data(self, job_id: int) -> Optional[Dict[str, Any]]:
        """
        Obtiene los datos completos de un job.
        
        Args:
            job_id: ID del job
            
        Returns:
            Optional[Dict]: Datos del job o None
        """
        try:
            response = self.session.get(
                f"{self.base_url}/emision/jobs/{job_id}/data",
                timeout=self.timeout
            )
            response.raise_for_status()
            
            data = response.json()
            return data.get("job")
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error obteniendo datos del job {job_id}: {e}")
            return None


# ============================================================
# FUNCIÓN DE CONVENIENCIA
# ============================================================

def create_api_client(config: Dict[str, Any]) -> WorkerAPIClient:
    """
    Crea un cliente API a partir de una configuración.
    
    Args:
        config: Diccionario con la configuración
        
    Returns:
        WorkerAPIClient: Cliente API listo para usar
    """
    base_url = config.get("servidor", {}).get("url", "http://localhost:8000/api/v1")
    token = config.get("servidor", {}).get("token", "")
    timeout = config.get("servidor", {}).get("timeout", 60)
    
    return WorkerAPIClient(base_url, token, timeout)