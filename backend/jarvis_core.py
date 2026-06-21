"""
jarvis_core.py — Lógica central del asistente Jarvis.

Contiene:
- Reconocimiento de voz (Azure Speech-to-Text)
- Síntesis de voz (Azure Text-to-Speech, voz es-MX-JorgeNeural)
- Procesamiento de comandos
- Persistencia simple de recordatorios

Este módulo no sabe nada de Flask ni de HTTP: solo expone funciones que
app.py (el servidor) usa para responder a las peticiones del frontend React.
"""

import azure.cognitiveservices.speech as speechsdk
import datetime
import webbrowser
import subprocess
import platform
import random
import re
import os
import json
import urllib.request
import urllib.parse

import config

# ========== CONFIGURACIÓN DE VOZ ==========
speech_config = speechsdk.SpeechConfig(
    subscription=config.AZURE_SPEECH_KEY,
    region=config.AZURE_SPEECH_REGION,
)
speech_config.speech_recognition_language = config.SPEECH_RECOGNITION_LANGUAGE
speech_config.speech_synthesis_voice_name = config.AZURE_SPEECH_VOICE

RECORDATORIOS_PATH = os.path.join(os.path.dirname(__file__), "recordatorios.txt")


# ========== RECONOCIMIENTO DE VOZ ==========
def reconocer_voz():
    """Escucha al micrófono (una sola frase) y devuelve el texto reconocido."""
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config)
    result = recognizer.recognize_once()

    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        return result.text.lower().strip()
    elif result.reason == speechsdk.ResultReason.NoMatch:
        return ""
    else:
        return ""


# ========== SÍNTESIS DE VOZ ==========
def hablar(texto):
    """Convierte texto a voz usando la voz configurada (es-MX-JorgeNeural)."""
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config)
    synthesizer.speak_text_async(texto).get()
    return texto


# ========== UTILIDADES ==========
def _abrir_app_sistema(nombre_app):
    """Abre una aplicación nativa del sistema operativo, multiplataforma."""
    sistema = platform.system()
    try:
        if sistema == "Windows":
            apps = {
                "calculadora": "calc.exe",
                "notas": "notepad.exe",
                "bloc de notas": "notepad.exe",
            }
            subprocess.Popen(apps.get(nombre_app, nombre_app))
        elif sistema == "Darwin":  # macOS
            apps = {
                "calculadora": "Calculator",
                "notas": "Notes",
                "bloc de notas": "TextEdit",
            }
            subprocess.Popen(["open", "-a", apps.get(nombre_app, nombre_app)])
        else:  # Linux
            apps = {
                "calculadora": "gnome-calculator",
                "notas": "gedit",
                "bloc de notas": "gedit",
            }
            subprocess.Popen([apps.get(nombre_app, nombre_app)])
        return True
    except Exception:
        return False


def _obtener_clima(ciudad="Santiago"):
    """Consulta el clima actual usando Open-Meteo (API gratuita, sin clave)."""
    try:
        # Geocodificación: nombre de ciudad -> lat/lon
        geo_url = (
            "https://geocoding-api.open-meteo.com/v1/search?"
            + urllib.parse.urlencode({"name": ciudad, "count": 1, "language": "es"})
        )
        with urllib.request.urlopen(geo_url, timeout=5) as resp:
            geo_data = json.loads(resp.read())

        if not geo_data.get("results"):
            return None

        lugar = geo_data["results"][0]
        lat, lon = lugar["latitude"], lugar["longitude"]
        nombre_real = lugar.get("name", ciudad)

        clima_url = (
            "https://api.open-meteo.com/v1/forecast?"
            + urllib.parse.urlencode(
                {
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,weather_code",
                    "timezone": "auto",
                }
            )
        )
        with urllib.request.urlopen(clima_url, timeout=5) as resp:
            clima_data = json.loads(resp.read())

        temp = clima_data["current"]["temperature_2m"]
        codigo = clima_data["current"]["weather_code"]

        descripciones = {
            0: "cielo despejado",
            1: "mayormente despejado",
            2: "parcialmente nublado",
            3: "nublado",
            45: "neblina",
            48: "neblina con escarcha",
            51: "llovizna ligera",
            61: "lluvia ligera",
            63: "lluvia moderada",
            65: "lluvia fuerte",
            71: "nieve ligera",
            80: "chubascos",
            95: "tormenta eléctrica",
        }
        descripcion = descripciones.get(codigo, "condiciones variables")

        return f"En {nombre_real} hay {temp} grados con {descripcion}"
    except Exception:
        return None


CHISTES = [
    "¿Por qué los programadores prefieren el frío? Porque odian los bugs.",
    "¿Cómo se llama el campeón de buceo japonés? Mitsubishi.",
    "Mi código no tiene errores, solo características inesperadas.",
    "¿Por qué la computadora fue al médico? Porque tenía un virus.",
    "Hay 10 tipos de personas: las que entienden binario y las que no.",
]


# ========== PROCESAMIENTO DE COMANDOS ==========
def procesar_comando(comando):
    """
    Ejecuta la acción según el comando reconocido.
    Devuelve un dict: {"respuesta": str, "continuar": bool, "accion": str}
    """
    comando = comando.lower().strip()
    accion = "desconocido"
    continuar = True

    # 1. HORA
    if "hora" in comando:
        ahora = datetime.datetime.now().strftime("%I:%M %p")
        respuesta = f"Son las {ahora}"
        accion = "hora"

    # 2. FECHA
    elif "fecha" in comando or "qué día es" in comando:
        hoy = datetime.datetime.now().strftime("%A %d de %B de %Y")
        respuesta = f"Hoy es {hoy}"
        accion = "fecha"

    # 3. RECORDATORIO
    elif "recuérdame" in comando or "recuerdame" in comando:
        match = re.search(r"recu[eé]rdame\s+(.+)", comando)
        if match:
            recordatorio = match.group(1)
            with open(RECORDATORIOS_PATH, "a", encoding="utf-8") as f:
                f.write(f"{recordatorio}\n")
            respuesta = f"Ok, te recordaré: {recordatorio}"
            accion = "recordatorio_agregado"
        else:
            respuesta = "¿Qué quieres que recuerde?"
            accion = "recordatorio_vacio"

    # 4. LISTAR RECORDATORIOS
    elif "mis recordatorios" in comando or "qué tengo pendiente" in comando:
        recordatorios = obtener_recordatorios()
        if recordatorios:
            respuesta = "Tus recordatorios son: " + ", ".join(recordatorios)
        else:
            respuesta = "No tienes recordatorios pendientes"
        accion = "listar_recordatorios"

    # 5. CLIMA
    elif "clima" in comando or "temperatura" in comando:
        match = re.search(r"clima(?:\s+en)?\s+(.+)", comando)
        ciudad = match.group(1).strip() if match else "Santiago"
        clima = _obtener_clima(ciudad)
        respuesta = clima if clima else f"No pude obtener el clima de {ciudad}"
        accion = "clima"

    # 6. BUSCAR EN GOOGLE
    elif "busca" in comando or "buscar" in comando:
        match = re.search(r"busca(?:r)?\s+(.+)", comando)
        if match:
            consulta = match.group(1)
            url = "https://www.google.com/search?q=" + urllib.parse.quote(consulta)
            webbrowser.open(url)
            respuesta = f"Buscando {consulta} en Google"
            accion = "buscar"
        else:
            respuesta = "¿Qué quieres que busque?"
            accion = "buscar_vacio"

    # 7. ABRIR NAVEGADOR / GOOGLE
    elif "abre navegador" in comando or "abre google" in comando:
        webbrowser.open("https://www.google.com")
        respuesta = "Abriendo el navegador"
        accion = "abrir_navegador"

    # 8. ABRIR YOUTUBE
    elif "abre youtube" in comando:
        webbrowser.open("https://www.youtube.com")
        respuesta = "Abriendo YouTube"
        accion = "abrir_youtube"

    # 9. ABRIR SPOTIFY
    elif "abre spotify" in comando:
        webbrowser.open("https://open.spotify.com/")
        respuesta = "Abriendo Spotify"
        accion = "abrir_spotify"

    # 10. ABRIR CALCULADORA
    elif "calculadora" in comando:
        ok = _abrir_app_sistema("calculadora")
        respuesta = "Abriendo la calculadora" if ok else "No pude abrir la calculadora"
        accion = "abrir_calculadora"

    # 11. ABRIR BLOC DE NOTAS
    elif "bloc de notas" in comando or "abre notas" in comando:
        ok = _abrir_app_sistema("bloc de notas")
        respuesta = "Abriendo el bloc de notas" if ok else "No pude abrir el bloc de notas"
        accion = "abrir_notas"

    # 12. CHISTE
    elif "chiste" in comando or "cuéntame algo" in comando:
        respuesta = random.choice(CHISTES)
        accion = "chiste"

    # 13. AYUDA / QUÉ PUEDES HACER
    elif "ayuda" in comando or "qué puedes hacer" in comando or "comandos" in comando:
        respuesta = (
            "Puedo decirte la hora y la fecha, crear recordatorios, "
            "darte el clima, buscar en Google, abrir el navegador, "
            "YouTube, Spotify, la calculadora o el bloc de notas, "
            "y contarte un chiste."
        )
        accion = "ayuda"

    # 14. CERRAR / DESPEDIDA
    elif "modo dios" in comando or "apagado" in comando or "adiós" in comando or "adios" in comando:
        respuesta = "Hasta luego"
        continuar = False
        accion = "despedida"

    # 15. COMANDO DESCONOCIDO
    else:
        respuesta = f"No sé cómo hacer '{comando}' todavía. Estoy aprendiendo"
        accion = "desconocido"

    return {"respuesta": respuesta, "continuar": continuar, "accion": accion}


def obtener_recordatorios():
    """Devuelve la lista de recordatorios guardados."""
    if os.path.exists(RECORDATORIOS_PATH):
        with open(RECORDATORIOS_PATH, "r", encoding="utf-8") as f:
            return [linea.strip() for linea in f.readlines() if linea.strip()]
    return []
