import os
import docx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUTA_PLANTILLA = os.path.join(BASE_DIR, "..", "uploads", "plantillas", "1_CC_APA_NOTIFICACION_FACSIMIL.docx")

if not os.path.exists(RUTA_PLANTILLA):
    raise FileNotFoundError(f"No se encontró la plantilla en: {RUTA_PLANTILLA}")

doc = docx.Document(RUTA_PLANTILLA)
print("Documento cargado correctamente")

print("=" * 60)
print("DIAGNÓSTICO DE PLANTILLA")
print("=" * 60)

# Ver tamaño de página
for i, section in enumerate(doc.sections):
    print(f"\n--- Sección {i+1} ---")
    print(f"Ancho página: {section.page_width} EMU = {section.page_width/914400:.2f} pulgadas = {section.page_width/360000*2.54:.2f} cm")
    print(f"Alto página:  {section.page_height} EMU = {section.page_height/914400:.2f} pulgadas = {section.page_height/360000*2.54:.2f} cm")
    
    # Oficio México: 21.59cm × 34.01cm → esperado: ~612pt × ~964pt

print("\n--- Primeros 10 párrafos del documento ---")
for i, para in enumerate(doc.paragraphs[:10]):
    print(f"\nPárrafo {i+1}:")
    print(f"  Texto completo: '{para.text[:200]}'")
    print(f"  Número de runs: {len(para.runs)}")
    for j, run in enumerate(para.runs[:5]):
        print(f"  Run {j+1}: '{run.text[:100]}'")

# Verificar si hay MERGEFIELD (campos de combinación de Word)
print("\n--- Buscando MERGEFIELDs en XML ---")
from lxml import etree
xml = etree.tostring(doc.element, encoding='unicode')
import re
mergefields = re.findall(r'MERGEFIELD\s+"?([^"<\s\\]+)"?', xml, re.IGNORECASE)
print(f"MERGEFIELDs encontrados: {len(mergefields)}")
for mf in mergefields[:20]:
    print(f"  - {mf}")

placeholders = re.findall(r'\{\{(\w+)\}\}', xml)
print(f"\nPlaceholders {{}} encontrados: {len(placeholders)}")
for ph in placeholders[:20]:
    print(f"  - {{{{ {ph} }}}}")