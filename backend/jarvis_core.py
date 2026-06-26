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

speech_config = speechsdk.SpeechConfig(
    subscription=config.AZURE_SPEECH_KEY,
    region=config.AZURE_SPEECH_REGION,
)
speech_config.speech_recognition_language = config.SPEECH_RECOGNITION_LANGUAGE
speech_config.speech_synthesis_voice_name = config.AZURE_SPEECH_VOICE

RECORDATORIOS_PATH = os.path.join(os.path.dirname(__file__), "recordatorios.txt")


def reconocer_voz():
    """Escucha el micrófono UNA vez y devuelve el texto (o '' si no entendió)."""
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config)
    print("🎤 Azure escuchando...")
    result = recognizer.recognize_once()
    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        texto = result.text.lower().strip()
        print(f"📝 Entendí: {texto}")
        return texto
    print(f"❌ No entendí ({result.reason})")
    return ""


def hablar(texto):
    """Convierte texto a voz con la voz configurada."""
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config)
    print(f"🤖 Jarvis: {texto}")
    synthesizer.speak_text_async(texto).get()
    return texto


def _abrir_app_sistema(nombre_app):
    sistema = platform.system()
    try:
        if sistema == "Windows":
            apps = {
                "calculadora": "calc.exe",
                "notas": "notepad.exe",
                "bloc de notas": "notepad.exe",
            }
            subprocess.Popen(apps.get(nombre_app, nombre_app))
        elif sistema == "Darwin":
            apps = {
                "calculadora": "Calculator",
                "notas": "Notes",
                "bloc de notas": "TextEdit",
            }
            subprocess.Popen(["open", "-a", apps.get(nombre_app, nombre_app)])
        else:
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
    try:
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
            + urllib.parse.urlencode({
                "latitude": lat, "longitude": lon,
                "current": "temperature_2m,weather_code",
                "timezone": "auto",
            })
        )
        with urllib.request.urlopen(clima_url, timeout=5) as resp:
            clima_data = json.loads(resp.read())
        temp   = clima_data["current"]["temperature_2m"]
        codigo = clima_data["current"]["weather_code"]
        descripciones = {
            0: "cielo despejado", 1: "mayormente despejado", 2: "parcialmente nublado",
            3: "nublado", 45: "neblina", 61: "lluvia ligera", 63: "lluvia moderada",
            65: "lluvia fuerte", 80: "chubascos", 95: "tormenta eléctrica",
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


def procesar_comando(comando):
    """
    Procesa el comando y devuelve:
    {"respuesta": str, "continuar": bool, "accion": str}
    """
    comando   = comando.lower().strip()
    continuar = True
    accion    = "desconocido"

    if "hora" in comando:
        ahora     = datetime.datetime.now().strftime("%I:%M %p")
        respuesta = f"Son las {ahora}"
        accion    = "hora"

    elif "fecha" in comando or "qué día es" in comando:
        hoy       = datetime.datetime.now().strftime("%A %d de %B de %Y")
        respuesta = f"Hoy es {hoy}"
        accion    = "fecha"

    elif "recuérdame" in comando or "recuerdame" in comando:
        match = re.search(r"recu[eé]rdame\s+(.+)", comando)
        if match:
            recordatorio = match.group(1)
            with open(RECORDATORIOS_PATH, "a", encoding="utf-8") as f:
                f.write(f"{recordatorio}\n")
            respuesta = f"Ok, te recordaré: {recordatorio}"
            accion    = "recordatorio_agregado"
        else:
            respuesta = "¿Qué quieres que recuerde?"
            accion    = "recordatorio_vacio"

    elif "mis recordatorios" in comando or "qué tengo pendiente" in comando:
        recs = obtener_recordatorios()
        respuesta = ("Tus recordatorios son: " + ", ".join(recs)) if recs else "No tienes recordatorios pendientes"
        accion    = "listar_recordatorios"

    elif "clima" in comando or "temperatura" in comando:
        match  = re.search(r"clima(?:\s+en)?\s+(.+)", comando)
        ciudad = match.group(1).strip() if match else "Santiago"
        clima  = _obtener_clima(ciudad)
        respuesta = clima if clima else f"No pude obtener el clima de {ciudad}"
        accion    = "clima"

    elif "busca" in comando or "buscar" in comando:
        match = re.search(r"busca(?:r)?\s+(.+)", comando)
        if match:
            consulta = match.group(1)
            webbrowser.open("https://www.google.com/search?q=" + urllib.parse.quote(consulta))
            respuesta = f"Buscando {consulta} en Google"
            accion    = "buscar"
        else:
            respuesta = "¿Qué quieres que busque?"
            accion    = "buscar_vacio"

    elif "abre navegador" in comando or "abre google" in comando:
        webbrowser.open("https://www.google.com")
        respuesta = "Abriendo el navegador"
        accion    = "abrir_navegador"

    elif "abre youtube" in comando:
        webbrowser.open("https://www.youtube.com")
        respuesta = "Abriendo YouTube"
        accion    = "abrir_youtube"

    elif "abre spotify" in comando:
        webbrowser.open("https://open.spotify.com/")
        respuesta = "Abriendo Spotify"
        accion    = "abrir_spotify"

    elif "calculadora" in comando:
        ok        = _abrir_app_sistema("calculadora")
        respuesta = "Abriendo la calculadora" if ok else "No pude abrir la calculadora"
        accion    = "abrir_calculadora"

    elif "bloc de notas" in comando or "abre notas" in comando:
        ok        = _abrir_app_sistema("bloc de notas")
        respuesta = "Abriendo el bloc de notas" if ok else "No pude abrir el bloc de notas"
        accion    = "abrir_notas"

    elif "chiste" in comando or "cuéntame algo" in comando:
        respuesta = random.choice(CHISTES)
        accion    = "chiste"

    elif "ayuda" in comando or "qué puedes hacer" in comando or "comandos" in comando:
        respuesta = (
            "Puedo decirte la hora y la fecha, crear recordatorios, "
            "darte el clima, buscar en Google, abrir el navegador, "
            "YouTube, Spotify, la calculadora o el bloc de notas, "
            "y contarte un chiste."
        )
        accion = "ayuda"

    elif "adiós" in comando or "adios" in comando or "apagado" in comando:
        respuesta  = "Hasta luego"
        continuar  = False
        accion     = "despedida"

    else:
        respuesta = f"No sé cómo hacer eso todavía. Estoy aprendiendo"
        accion    = "desconocido"

    return {"respuesta": respuesta, "continuar": continuar, "accion": accion}


def obtener_recordatorios():
    if os.path.exists(RECORDATORIOS_PATH):
        with open(RECORDATORIOS_PATH, "r", encoding="utf-8") as f:
            return [l.strip() for l in f.readlines() if l.strip()]
    return []