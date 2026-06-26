import os
from dotenv import load_dotenv

load_dotenv()

AZURE_SPEECH_KEY    = os.getenv("AZURE_SPEECH_KEY")
AZURE_SPEECH_REGION = os.getenv("AZURE_SPEECH_REGION", "eastus")
AZURE_SPEECH_VOICE  = os.getenv("AZURE_SPEECH_VOICE", "es-MX-JorgeNeural")
SPEECH_RECOGNITION_LANGUAGE = os.getenv("SPEECH_RECOGNITION_LANGUAGE", "es-MX")

if not AZURE_SPEECH_KEY:
    raise RuntimeError(
        "No se encontró AZURE_SPEECH_KEY. "
        "Crea el archivo backend/.env basado en .env.example."
    )