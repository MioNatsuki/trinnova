"""
Maneja la conexión a Redis para la cola de trabajos.
"""

import redis
import json
import logging
from typing import Optional, Dict, Any
from app.core.config import settings

logger = logging.getLogger("TrinnovaRedis")

class RedisClient:
    """
    Cliente singleton para Redis.
    Maneja la conexión y operaciones con la cola de trabajos.
    """
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialize()
        return cls._instance
    
    def _initialize(self):
        """Inicializa la conexión a Redis"""
        try:
            self.connection = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                password=settings.REDIS_PASSWORD or None,
                db=settings.REDIS_DB,
                decode_responses=True,
                socket_keepalive=True,
                socket_connect_timeout=5,
                retry_on_timeout=True
            )
            # Probar conexión
            self.connection.ping()
            logger.info(f"Redis conectado: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
        except Exception as e:
            logger.error(f"Error conectando a Redis: {e}")
            raise
    
    def get(self):
        """Retorna la conexión a Redis"""
        return self.connection
    
    # ============================================================
    # OPERACIONES DE COLA
    # ============================================================
    
    def push_job(self, job_id: int, queue_name: str = "emision_jobs") -> bool:
        """
        Publica un job en la cola de trabajos.
        
        Args:
            job_id: ID del job a publicar
            queue_name: Nombre de la cola (default: emision_jobs)
        
        Returns:
            bool: True si se publicó correctamente
        """
        try:
            self.connection.lpush(queue_name, str(job_id))
            logger.info(f"Job {job_id} publicado en cola '{queue_name}'")
            return True
        except Exception as e:
            logger.error(f"Error publicando job {job_id}: {e}")
            return False
    
    def pop_job(self, queue_name: str = "emision_jobs") -> Optional[str]:
        """
        Obtiene un job de la cola (operación atómica).
        
        Args:
            queue_name: Nombre de la cola (default: emision_jobs)
        
        Returns:
            Optional[str]: ID del job o None si no hay
        """
        try:
            job_id = self.connection.rpop(queue_name)
            if job_id:
                logger.info(f"Job {job_id} obtenido de la cola '{queue_name}'")
            return job_id
        except Exception as e:
            logger.error(f"Error obteniendo job de cola: {e}")
            return None
    
    def get_queue_length(self, queue_name: str = "emision_jobs") -> int:
        """
        Obtiene el número de jobs en la cola.
        
        Args:
            queue_name: Nombre de la cola (default: emision_jobs)
        
        Returns:
            int: Número de jobs en la cola
        """
        try:
            return self.connection.llen(queue_name)
        except Exception as e:
            logger.error(f"Error obteniendo longitud de cola: {e}")
            return 0
    
    # ============================================================
    # OPERACIONES DE ESTADO (CACHE)
    # ============================================================
    
    def set_job_status(self, job_id: int, status: str, data: Optional[Dict] = None) -> bool:
        """
        Guarda el estado de un job en Redis (cache).
        
        Args:
            job_id: ID del job
            status: Estado del job
            data: Datos adicionales (opcional)
        
        Returns:
            bool: True si se guardó correctamente
        """
        try:
            key = f"job:{job_id}:status"
            value = {
                "status": status,
                "updated_at": str(datetime.now()),
                **(data or {})
            }
            self.connection.setex(
                key,
                3600,  # Expira en 1 hora
                json.dumps(value)
            )
            return True
        except Exception as e:
            logger.error(f"Error guardando estado de job {job_id}: {e}")
            return False
    
    def get_job_status(self, job_id: int) -> Optional[Dict]:
        """
        Obtiene el estado de un job desde Redis (cache).
        
        Args:
            job_id: ID del job
        
        Returns:
            Optional[Dict]: Estado del job o None
        """
        try:
            key = f"job:{job_id}:status"
            data = self.connection.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.error(f"Error obteniendo estado de job {job_id}: {e}")
            return None
    
    def set_checkpoint(self, job_id: int, checkpoint_data: Dict) -> bool:
        """
        Guarda un checkpoint de un job en Redis.
        
        Args:
            job_id: ID del job
            checkpoint_data: Datos del checkpoint
        
        Returns:
            bool: True si se guardó correctamente
        """
        try:
            key = f"job:{job_id}:checkpoint"
            self.connection.setex(
                key,
                86400,  # Expira en 24 horas
                json.dumps(checkpoint_data)
            )
            return True
        except Exception as e:
            logger.error(f"Error guardando checkpoint de job {job_id}: {e}")
            return False
    
    def get_checkpoint(self, job_id: int) -> Optional[Dict]:
        """
        Obtiene el checkpoint de un job desde Redis.
        
        Args:
            job_id: ID del job
        
        Returns:
            Optional[Dict]: Checkpoint del job o None
        """
        try:
            key = f"job:{job_id}:checkpoint"
            data = self.connection.get(key)
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.error(f"Error obteniendo checkpoint de job {job_id}: {e}")
            return None
    
    # ============================================================
    # OPERACIONES DE LIMPIEZA
    # ============================================================
    
    def clear_job_cache(self, job_id: int) -> bool:
        """
        Limpia las llaves de Redis relacionadas con un job.
        
        Args:
            job_id: ID del job
        
        Returns:
            bool: True si se limpió correctamente
        """
        try:
            keys = [
                f"job:{job_id}:status",
                f"job:{job_id}:checkpoint"
            ]
            self.connection.delete(*keys)
            logger.info(f"Cache de job {job_id} limpiado")
            return True
        except Exception as e:
            logger.error(f"Error limpiando cache de job {job_id}: {e}")
            return False


# Singleton
redis_client = RedisClient()

# Funciones de conveniencia
def push_job(job_id: int) -> bool:
    """Publica un job en la cola"""
    return redis_client.push_job(job_id)

def pop_job() -> Optional[str]:
    """Obtiene un job de la cola"""
    return redis_client.pop_job()

def get_queue_length() -> int:
    """Obtiene la longitud de la cola"""
    return redis_client.get_queue_length()

def set_job_status(job_id: int, status: str, data: Optional[Dict] = None) -> bool:
    """Guarda el estado de un job en cache"""
    return redis_client.set_job_status(job_id, status, data)

def get_job_status(job_id: int) -> Optional[Dict]:
    """Obtiene el estado de un job desde cache"""
    return redis_client.get_job_status(job_id)

def set_checkpoint(job_id: int, checkpoint_data: Dict) -> bool:
    """Guarda un checkpoint de un job"""
    return redis_client.set_checkpoint(job_id, checkpoint_data)

def get_checkpoint(job_id: int) -> Optional[Dict]:
    """Obtiene el checkpoint de un job"""
    return redis_client.get_checkpoint(job_id)

def clear_job_cache(job_id: int) -> bool:
    """Limpia la cache de un job"""
    return redis_client.clear_job_cache(job_id)