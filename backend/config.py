"""
Configuración de Jarvis.

IMPORTANTE — SEGURIDAD:
Tu clave anterior de Azure quedó expuesta en texto plano dentro del código que
subiste. Te recomendamos regenerarla en Azure Portal (Recursos > tu recurso de
Speech > Claves y punto de conexión > Regenerar clave) y NUNCA volver a
escribirla directamente en el código fuente, sobre todo si subes el proyecto a
GitHub.

En su lugar, esta versión lee la clave desde variables de entorno usando un
archivo .env (que NO se sube a git — ya está listado en .gitignore).

Pasos:
1. Copia ".env.example" como ".env"
2. Pega tu clave (idealmente la nueva, regenerada) y región en ".env"
3. Listo, config.py la carga automáticamente
"""

import os
from dotenv import load_dotenv

load_dotenv()

AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus")

# Voz seleccionada: Jorge (México), voz neuronal masculina en español
AZURE_SPEECH_VOICE = os.getenv("AZURE_SPEECH_VOICE", "es-MX-JorgeNeural")

# Idioma de reconocimiento de voz
SPEECH_RECOGNITION_LANGUAGE = os.getenv("SPEECH_RECOGNITION_LANGUAGE", "es-MX")

if not AZURE_SPEECH_KEY:
    raise RuntimeError(
        "No se encontró AZURE_SPEECH_KEY. Crea un archivo .env basado en "
        ".env.example y agrega tu clave de Azure Speech."
    )
