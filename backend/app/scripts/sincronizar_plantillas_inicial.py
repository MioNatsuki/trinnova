"""
Script de sincronización inicial de plantillas HTML
Ejecutar una sola vez para poblar la base de datos con las plantillas existentes
"""

import os
import sys
import re
from pathlib import Path

# ============ AGREGAR ESTO ============
# Agregar la ruta del proyecto al sys.path
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # Esto va hasta backend/
sys.path.insert(0, str(BASE_DIR))
# =====================================

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.global_models import Plantilla, PlantillaCampo, Proyecto

# Configurar conexión a la base de datos
DATABASE_URL_GLOBAL = (
    f"mysql+pymysql://{settings.DB_GLOBAL_USER}:{settings.DB_GLOBAL_PASSWORD}"
    f"@{settings.DB_GLOBAL_HOST}:{settings.DB_GLOBAL_PORT}/{settings.DB_GLOBAL_NAME}"
)

engine = create_engine(DATABASE_URL_GLOBAL)
Session = sessionmaker(bind=engine)
session = Session()

# Mapeo de carpetas a slugs de proyecto
CARPETA_PROYECTO = {
    "apa_tlajomulco": "apa_tlajomulco",
    "estado": "estado",
    "pensiones": "pensiones",
    "predial_gdl": "predial_gdl",
    "predial_tlajomulco": "predial_tlajomulco",
    "licencias_gdl": "licencias_gdl",
}

# Nombres legibles para cada proyecto
NOMBRES_PROYECTO = {
    "apa_tlajomulco": "APA Tlajomulco",
    "estado": "Estado",
    "pensiones": "Pensiones",
    "predial_gdl": "Predial GDL",
    "predial_tlajomulco": "Predial Tlajomulco",
    "licencias_gdl": "Licencias GDL",
}

# Descripciones por defecto
DESCRIPCIONES = {
    "apa_tlajomulco": "Determinación de Crédito Fiscal - Agua Potable",
    "estado": "Liquidaciones y Requerimientos - Estado",
    "pensiones": "Requerimiento de Pago Vencido - Pensiones",
    "predial_gdl": "Determinación de Crédito Fiscal - Predial Guadalajara",
    "predial_tlajomulco": "Determinación de Crédito Fiscal - Predial Tlajomulco",
    "licencias_gdl": "Licencias - Guadalajara",
}

def extraer_placeholders(html_content):
    """
    Extrae todos los placeholders {{campo}} del HTML
    """
    pattern = r'\{\{([a-zA-Z0-9_]+)\}\}'
    matches = re.findall(pattern, html_content)
    return list(dict.fromkeys(matches))  # Eliminar duplicados manteniendo orden

def obtener_id_proyecto(slug):
    """
    Obtiene el ID del proyecto por su slug
    """
    proyecto = session.query(Proyecto).filter(Proyecto.slug == slug).first()
    if not proyecto:
        print(f"⚠️ Proyecto no encontrado: {slug}")
        return None
    return proyecto.id

def procesar_archivo_html(ruta_archivo, proyecto_slug, proyecto_id):
    """
    Procesa un archivo HTML, extrae placeholders y crea/actualiza la plantilla
    """
    nombre_archivo = os.path.basename(ruta_archivo)
    nombre_base = os.path.splitext(nombre_archivo)[0]
    
    # Leer el contenido del HTML
    with open(ruta_archivo, 'r', encoding='utf-8') as f:
        contenido = f.read()
    
    # Extraer placeholders
    placeholders = extraer_placeholders(contenido)
    
    # Crear nombre legible para la plantilla
    nombre_plantilla = nombre_base.replace('_', ' ').title()
    
    # Obtener descripción
    descripcion = DESCRIPCIONES.get(proyecto_slug, f"Plantilla {nombre_plantilla}")
    
    # Construir nombre_archivo relativo (carpeta/archivo.html)
    nombre_archivo_relativo = f"{proyecto_slug}/{nombre_archivo}"
    
    print(f"\n📄 Procesando: {nombre_archivo_relativo}")
    print(f"   Placeholders encontrados: {len(placeholders)}")
    if placeholders:
        print(f"   Ejemplos: {', '.join(placeholders[:5])}")
    
    # Verificar si ya existe una plantilla con este nombre_archivo
    existente = session.query(Plantilla).filter(
        Plantilla.nombre_archivo == nombre_archivo_relativo
    ).first()
    
    if existente:
        # Actualizar existente
        existente.nombre = nombre_plantilla
        existente.descripcion = descripcion
        existente.activa = True
        plantilla = existente
        print(f"   ✅ Actualizada plantilla ID: {plantilla.id}")
    else:
        # Crear nueva
        nueva = Plantilla(
            id_proyecto=proyecto_id,
            nombre=nombre_plantilla,
            descripcion=descripcion,
            nombre_archivo=nombre_archivo_relativo,
            activa=True,
            created_by=1  # Usuario superadmin (asumimos ID 1)
        )
        session.add(nueva)
        session.flush()
        plantilla = nueva
        print(f"   ✅ Creada nueva plantilla ID: {plantilla.id}")
    
    # Eliminar campos antiguos
    session.query(PlantillaCampo).filter(
        PlantillaCampo.id_plantilla == plantilla.id
    ).delete()
    
    # Crear nuevos campos
    for orden, placeholder in enumerate(placeholders):
        campo = PlantillaCampo(
            id_plantilla=plantilla.id,
            placeholder=f"{{{{{placeholder}}}}}",
            campo_bd=placeholder,  # Por ahora, usamos el mismo nombre
            orden=orden
        )
        session.add(campo)
    
    print(f"   ✅ {len(placeholders)} campos mapeados")
    
    return plantilla

def main():
    """
    Función principal: escanea todas las carpetas y sincroniza
    """
    print("=" * 60)
    print("🔄 SINCRONIZACIÓN INICIAL DE PLANTILLAS HTML")
    print("=" * 60)
    
    # Ruta base de plantillas HTML
    base_path = Path(__file__).parent.parent / "plantillas_html"
    
    if not base_path.exists():
        print(f"❌ No se encontró la carpeta: {base_path}")
        return
    
    print(f"📁 Escaneando: {base_path}\n")
    
    # Contadores
    total_archivos = 0
    total_creadas = 0
    total_actualizadas = 0
    total_errores = 0
    
    # Recorrer carpetas de proyectos
    for carpeta in sorted(base_path.iterdir()):
        if not carpeta.is_dir():
            continue
        
        proyecto_slug = carpeta.name
        if proyecto_slug not in CARPETA_PROYECTO:
            print(f"⚠️ Carpeta ignorada (no mapeada): {proyecto_slug}")
            continue
        
        print(f"\n📂 === PROYECTO: {proyecto_slug.upper()} ===")
        
        # Obtener ID del proyecto
        proyecto_id = obtener_id_proyecto(proyecto_slug)
        if not proyecto_id:
            print(f"❌ Proyecto no encontrado en BD: {proyecto_slug}")
            total_errores += 1
            continue
        
        # Buscar archivos HTML
        archivos_html = list(carpeta.glob("*.html"))
        
        if not archivos_html:
            print(f"   ⚠️ No se encontraron archivos HTML en {carpeta}")
            continue
        
        print(f"   Encontrados {len(archivos_html)} archivos HTML")
        
        # Procesar cada archivo
        for archivo in archivos_html:
            try:
                plantilla = procesar_archivo_html(
                    archivo, 
                    proyecto_slug, 
                    proyecto_id
                )
                total_archivos += 1
                if plantilla.id:
                    total_creadas += 1
            except Exception as e:
                print(f"   ❌ Error en {archivo.name}: {e}")
                total_errores += 1
        
        # Commit por proyecto
        session.commit()
        print(f"   ✅ Cambios guardados para {proyecto_slug}")
    
    # Resumen final
    print("\n" + "=" * 60)
    print("📊 RESUMEN DE SINCRONIZACIÓN")
    print("=" * 60)
    print(f"📄 Total archivos procesados: {total_archivos}")
    print(f"✅ Plantillas creadas: {total_creadas}")
    print(f"🔄 Plantillas actualizadas: {total_actualizadas}")
    print(f"❌ Errores: {total_errores}")
    print("=" * 60)
    
    # Mostrar todas las plantillas creadas
    print("\n📋 PLANTILLAS EN LA BASE DE DATOS:")
    plantillas = session.query(Plantilla).order_by(Plantilla.id_proyecto, Plantilla.nombre).all()
    for p in plantillas:
        proyecto = session.query(Proyecto).filter(Proyecto.id == p.id_proyecto).first()
        campos_count = session.query(PlantillaCampo).filter(
            PlantillaCampo.id_plantilla == p.id
        ).count()
        print(f"   • {p.nombre} ({proyecto.nombre if proyecto else '?'}) - {campos_count} campos")
    
    session.close()
    print("\n✅ Sincronización completada.")

if __name__ == "__main__":
    main()