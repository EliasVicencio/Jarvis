"""
config.py — Configuración de Jarvis.
Azure Speech ya no se usa — reemplazado por edge-tts y SpeechRecognition.
El .env solo necesita NEWS_API_KEY para las noticias.
"""

import os
from dotenv import load_dotenv

load_dotenv()

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")

# Estos se mantienen por compatibilidad pero ya no son requeridos
AZURE_SPEECH_KEY    = os.getenv("AZURE_SPEECH_KEY", "")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus")
AZURE_SPEECH_VOICE  = os.getenv("AZURE_SPEECH_VOICE", "es-MX-JorgeNeural")