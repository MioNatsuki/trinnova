# service_monitor.py - Monitor para el servicio worker
import os
import sys
import json
import time
import subprocess
from pathlib import Path
from datetime import datetime

SERVICE_NAME = "TrinnovaWorker"
BASE_DIR = Path(__file__).parent
LOG_DIR = BASE_DIR / "Logs"
LOG_FILE = LOG_DIR / "monitor.log"

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp}] {msg}\n")
    print(f"[{timestamp}] {msg}")

def get_service_status():
    try:
        result = subprocess.run(
            ["nssm", "status", SERVICE_NAME],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.stdout.strip()
    except Exception as e:
        return f"ERROR: {e}"

def restart_service():
    try:
        subprocess.run(["nssm", "restart", SERVICE_NAME], timeout=30)
        return True
    except Exception as e:
        log(f"Error reiniciando servicio: {e}")
        return False

def check_worker_heartbeat():
    # Verificar que el worker está enviando heartbeat
    # Esto requiere conexión a Redis
    try:
        import redis
        from app.core.config import settings
        
        r = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=5
        )
        
        # Obtener todos los workers activos
        workers = r.hgetall("workers:active")
        
        if not workers:
            log("WARNING: No hay workers activos en Redis")
            return False
        
        log(f"Workers activos: {len(workers)}")
        for worker_id, data in workers.items():
            worker_data = json.loads(data)
            log(f"  {worker_id}: {worker_data.get('status')} - ultimo heartbeat: {worker_data.get('last_seen')}")
        
        return True
    except Exception as e:
        log(f"Error verificando heartbeat: {e}")
        return False

def main():
    log("=" * 60)
    log("INICIANDO MONITOR DE WORKER")
    log(f"SERVICIO: {SERVICE_NAME}")
    log("=" * 60)
    
    while True:
        try:
            status = get_service_status()
            log(f"Estado del servicio: {status}")
            
            if "RUNNING" not in status and "started" not in status.lower():
                log("WARNING: Servicio no esta corriendo, reiniciando...")
                if restart_service():
                    log("Servicio reiniciado correctamente")
                else:
                    log("ERROR: No se pudo reiniciar el servicio")
            
            # Verificar heartbeat cada 2 minutos
            if int(time.time()) % 120 < 10:
                check_worker_heartbeat()
            
            time.sleep(60)  # Esperar 1 minuto
            
        except KeyboardInterrupt:
            log("Monitor detenido por usuario")
            break
        except Exception as e:
            log(f"Error en monitor: {e}")
            time.sleep(60)

if __name__ == "__main__":
    main()