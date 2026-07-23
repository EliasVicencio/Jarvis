import asyncio
import datetime
import webbrowser
import subprocess
import platform
import random
import re
import os
import json
import time
import urllib.request
import urllib.parse
import tempfile

import edge_tts
import speech_recognition as sr
import requests

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID", "")

RECORDATORIOS_PATH = os.path.join(os.path.dirname(__file__), "recordatorios.txt")
MEMORIA_PATH = os.path.join(os.path.dirname(__file__), "memoria_semantica.json")
GROQ_API_KEY_MEM = os.getenv("GROQ_API_KEY", "")
VOZ = "es-MX-JorgeNeural"

# Reconocedor de voz (reutilizable)
_recognizer = sr.Recognizer()
_recognizer.pause_threshold = 1.0   # espera 1s de silencio antes de cortar
_recognizer.energy_threshold = 300  # sensibilidad al ruido


# ── Helpers ──────────────────────────────────────────────────────────────────
# ── Síntesis de voz ───────────────────────────────────────────────────────
def hablar(texto):
    """Convierte texto a voz con Edge TTS (gratuito, sin cuenta)."""
    print(f"🤖 Jarvis: {texto}")
    tmp = None
    try:
        # Generar archivo mp3 en carpeta temporal
        tmp = os.path.join(tempfile.gettempdir(), "jarvis_audio.mp3")

        async def _generar():
            comunicar = edge_tts.Communicate(texto, VOZ)
            await comunicar.save(tmp)

        # Usar un loop nuevo en un hilo separado para evitar conflicto con Flask
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            pool.submit(asyncio.run, _generar()).result()
        print(f"🔊 Audio generado: {tmp} ({os.path.getsize(tmp)} bytes)")

        # Intentar reproducir con diferentes métodos
        reproducido = False

        # Método 1: pygame
        if not reproducido:
            try:
                import pygame
                pygame.mixer.pre_init(44100, -16, 2, 512)
                pygame.mixer.init()
                pygame.mixer.music.load(tmp)
                pygame.mixer.music.play()
                while pygame.mixer.music.get_busy():
                    pygame.time.Clock().tick(10)
                pygame.mixer.quit()
                reproducido = True
                print("✓ Reproducido con pygame")
            except Exception as e:
                print(f"⚠ pygame falló: {e}")

        # Método 2: PowerShell (Windows nativo, siempre funciona)
        if not reproducido and platform.system() == "Windows":
            try:
                resultado = subprocess.run(
                    ["powershell", "-c",
                     f"Add-Type -AssemblyName presentationCore; "
                     f"$mp = New-Object system.windows.media.mediaplayer; "
                     f"$mp.open('{tmp}'); $mp.Play(); "
                     f"Start-Sleep -s ([math]::ceiling($mp.NaturalDuration.TimeSpan.TotalSeconds + 1)); "
                     f"$mp.Stop()"],
                    capture_output=True, timeout=30
                )
                reproducido = True
                print("✓ Reproducido con PowerShell")
            except Exception as e:
                print(f"⚠ PowerShell falló: {e}")

        # Método 3: afplay (macOS)
        if not reproducido and platform.system() == "Darwin":
            subprocess.run(["afplay", tmp])
            reproducido = True

        # Método 4: mpg123 (Linux)
        if not reproducido and platform.system() == "Linux":
            subprocess.run(["mpg123", "-q", tmp])
            reproducido = True

        if not reproducido:
            print("⚠ No se pudo reproducir el audio en ningún método")

    except Exception as e:
        print(f"⚠ Error en síntesis de voz: {e}")
    finally:
        if tmp and os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass
    return texto


# ── Reconocimiento de voz ─────────────────────────────────────────────────
def reconocer_voz():
    """Escucha el micrófono y devuelve el texto reconocido via Google STT."""
    print("🎤 Escuchando...")
    try:
        with sr.Microphone() as mic:
            _recognizer.adjust_for_ambient_noise(mic, duration=0.3)
            audio = _recognizer.listen(mic, timeout=8, phrase_time_limit=10)

        texto = _recognizer.recognize_google(audio, language="es-MX")
        texto = texto.lower().strip()
        print(f"📝 Entendí: {texto}")
        return texto

    except sr.WaitTimeoutError:
        print("❌ Tiempo de espera agotado")
    except sr.UnknownValueError:
        print("❌ No se entendió")
    except sr.RequestError as e:
        print(f"❌ Error de Google STT: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")
    return ""


# ── Transcripción desde archivo (audio subido por el navegador) ──────────
def transcribir_archivo(path_wav):
    """Transcribe un .wav ya convertido (16-bit PCM) usando Google STT."""
    try:
        with sr.AudioFile(path_wav) as source:
            audio = _recognizer.record(source)
        texto = _recognizer.recognize_google(audio, language="es-MX")
        texto = texto.lower().strip()
        print(f"📝 Entendí (archivo): {texto}")
        return texto
    except sr.UnknownValueError:
        print("❌ No se entendió el audio")
        return ""
    except sr.RequestError as e:
        print(f"❌ Error de Google STT: {e}")
        return ""
    except Exception as e:
        print(f"❌ Error transcribiendo archivo: {e}")
        return ""


# ── Generar audio sin reproducirlo localmente ─────────────────────────────
def generar_audio_mp3(texto, output_path=None):
    """Genera un mp3 con Edge TTS y devuelve la ruta del archivo (no lo reproduce)."""
    if output_path is None:
        output_path = os.path.join(
            tempfile.gettempdir(), f"jarvis_tts_{os.getpid()}_{int(time.time() * 1000)}.mp3"
        )

    async def _generar():
        comunicar = edge_tts.Communicate(texto, VOZ)
        await comunicar.save(output_path)

    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        pool.submit(asyncio.run, _generar()).result()

    return output_path


# ── Envío de notas de voz / mensajes a Telegram ───────────────────────────
def enviar_texto_telegram(texto, chat_id=None):
    """Envía un mensaje de texto al chat de Telegram configurado."""
    chat_id = chat_id or TELEGRAM_CHAT_ID
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        requests.post(url, data={"chat_id": chat_id, "text": texto}, timeout=10)
        return True
    except Exception as e:
        print(f"⚠ Error enviando texto a Telegram: {e}")
        return False


def enviar_voz_telegram(path_ogg, chat_id=None, caption=None):
    """Envía una nota de voz (.ogg/opus) al chat de Telegram configurado."""
    chat_id = chat_id or TELEGRAM_CHAT_ID
    if not TELEGRAM_BOT_TOKEN or not chat_id:
        print("⚠ TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados")
        return False
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendVoice"
        with open(path_ogg, "rb") as f:
            files = {"voice": f}
            data = {"chat_id": chat_id}
            if caption:
                data["caption"] = caption[:1024]
            requests.post(url, data=data, files=files, timeout=20)
        return True
    except Exception as e:
        print(f"⚠ Error enviando voz a Telegram: {e}")
        return False


# ── Utilidades ────────────────────────────────────────────────────────────
def _abrir_app(nombre):
    sistema = platform.system()
    try:
        if sistema == "Windows":
            apps = {"calculadora": "calc.exe", "bloc de notas": "notepad.exe", "notas": "notepad.exe"}
            subprocess.Popen(apps.get(nombre, nombre))
        elif sistema == "Darwin":
            apps = {"calculadora": "Calculator", "bloc de notas": "TextEdit", "notas": "Notes"}
            subprocess.Popen(["open", "-a", apps.get(nombre, nombre)])
        else:
            apps = {"calculadora": "gnome-calculator", "bloc de notas": "gedit", "notas": "gedit"}
            subprocess.Popen([apps.get(nombre, nombre)])
        return True
    except Exception:
        return False


def _clima(ciudad="Santiago"):
    try:
        geo = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(
            {"name": ciudad, "count": 1, "language": "es"})
        with urllib.request.urlopen(geo, timeout=5) as r:
            data = json.loads(r.read())
        if not data.get("results"):
            return None
        lugar = data["results"][0]
        url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
            "latitude": lugar["latitude"], "longitude": lugar["longitude"],
            "current": "temperature_2m,weather_code", "timezone": "auto"
        })
        with urllib.request.urlopen(url, timeout=5) as r:
            c = json.loads(r.read())
        temp = c["current"]["temperature_2m"]
        desc = {0:"cielo despejado",1:"mayormente despejado",2:"parcialmente nublado",
                3:"nublado",61:"lluvia ligera",63:"lluvia moderada",80:"chubascos",
                95:"tormenta eléctrica"}.get(c["current"]["weather_code"], "condiciones variables")
        return f"En {lugar.get('name', ciudad)} hay {temp} grados con {desc}"
    except Exception:
        return None


CHISTES = [
    "¿Por qué los programadores prefieren el frío? Porque odian los bugs.",
    "Mi código no tiene errores, solo características inesperadas.",
    "Hay 10 tipos de personas: las que entienden binario y las que no.",
    "¿Por qué la computadora fue al médico? Porque tenía un virus.",
    "¿Cómo se llama el campeón de buceo japonés? Mitsubishi.",
]


# ── Procesamiento de comandos ─────────────────────────────────────────────
def procesar_comando(comando):
    comando = comando.lower().strip().rstrip(".,;:!?¿¡")


    if "hora" in comando:
        r = f"Son las {datetime.datetime.now().strftime('%I:%M %p')}"
        return {"respuesta": r, "continuar": True, "accion": "hora"}

    if "fecha" in comando or "qué día" in comando:
        _dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
        _meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        _ahora = datetime.datetime.now()
        _dia_semana = _dias[_ahora.weekday()]
        _mes = _meses[_ahora.month - 1]
        r = f"Hoy es {_dia_semana} {_ahora.day} de {_mes} de {_ahora.year}"
        return {"respuesta": r, "continuar": True, "accion": "fecha"}

    if "recuérdame" in comando or "recuerdame" in comando:
        m = re.search(r"recu[eé]rdame\s+(.+)", comando)
        if m:
            with open(RECORDATORIOS_PATH, "a", encoding="utf-8") as f:
                f.write(m.group(1) + "\n")
            return {"respuesta": f"Ok, te recordaré: {m.group(1)}", "continuar": True, "accion": "recordatorio_agregado"}
        return {"respuesta": "¿Qué quieres que recuerde?", "continuar": True, "accion": "recordatorio_vacio"}

    if "mis recordatorios" in comando or "pendiente" in comando:
        recs = obtener_recordatorios()
        r = ("Tus recordatorios: " + ", ".join(recs)) if recs else "No tienes recordatorios pendientes"
        return {"respuesta": r, "continuar": True, "accion": "listar_recordatorios"}

    if "clima" in comando or "temperatura" in comando:
        m = re.search(r"clima(?:\s+en)?\s+(.+)", comando)
        ciudad = m.group(1).strip() if m else "Santiago"
        c = _clima(ciudad)
        return {"respuesta": c or f"No pude obtener el clima de {ciudad}", "continuar": True, "accion": "clima"}

    if "busca noticias" in comando or "noticias de hoy" in comando:
        return {"respuesta": "Abriendo Stark Intel", "continuar": True, "accion": "abrir_noticias"}

    if "busca" in comando:
        m = re.search(r"busca(?:r)?\s+(.+)", comando)
        if m:
            return {"respuesta": f"Buscando {m.group(1)} en Google", "continuar": True, "accion": "buscar", "dato": m.group(1)}
        return {"respuesta": "¿Qué quieres que busque?", "continuar": True, "accion": "buscar_vacio"}

    if "abre youtube" in comando:
        return {"respuesta": "Abriendo YouTube", "continuar": True, "accion": "abrir_youtube"}

    if "abre spotify" in comando:
        return {"respuesta": "Abriendo Spotify", "continuar": True, "accion": "abrir_spotify"}

    if "abre google" in comando or "abre navegador" in comando:
        return {"respuesta": "Abriendo el navegador", "continuar": True, "accion": "abrir_navegador"}

    if "calculadora" in comando:
        return {"respuesta": "Abriendo la calculadora", "continuar": True, "accion": "abrir_calculadora"}

    if "bloc de notas" in comando or "abre notas" in comando:
        return {"respuesta": "Abriendo el bloc de notas", "continuar": True, "accion": "abrir_notas"}

    if "chiste" in comando:
        return {"respuesta": random.choice(CHISTES), "continuar": True, "accion": "chiste"}

    if "ayuda" in comando or "qué puedes" in comando or "comandos" in comando:
        return {"respuesta": "Puedo decirte la hora, la fecha, el clima, buscar en Google, "
                             "abrir YouTube, Spotify, la calculadora, guardar recordatorios y contarte un chiste.",
                "continuar": True, "accion": "ayuda"}

    if any(p in comando for p in ["para", "pausa", "detente", "silencio"]):
        return {"respuesta": "Entendido, me pongo en pausa. Di Jarvis cuando me necesites.",
                "continuar": True, "accion": "pausar"}

    if any(p in comando for p in ["actívate", "activar", "despausa", "reanuda"]):
        return {"respuesta": "De vuelta. ¿En qué te ayudo?", "continuar": True, "accion": "reanudar"}

    # Cambiar canal en Stark Intel
    patrones_canal = ["cambia de canal a ", "cambia a canal ", "pon el canal ", "pon ", "cambia al canal ", "cambia a "]
    for patron in patrones_canal:
        if patron in comando:
            canal = comando.split(patron, 1)[1].strip()
            if canal:
                return {"respuesta": f"Cambiando a {canal}", "continuar": True, "accion": "cambiar_canal", "dato": canal}

    if any(p in comando for p in ["abre mapa", "abrir mapa", "stark maps", "mapa"]):
        return {"respuesta": "Abriendo Stark Maps", "continuar": True, "accion": "abrir_mapa"}

    # Crear carpeta (deshabilitado en servidor remoto)
    for patron in ["crea una carpeta", "crea carpeta", "crear carpeta", "nueva carpeta"]:
        if patron in comando:
            return {"respuesta": "No puedo crear carpetas en el servidor remoto", "continuar": True, "accion": "desconocido"}

    # Eliminar carpeta (deshabilitado en servidor remoto)
    for patron in ["elimina la carpeta", "elimina carpeta", "borra la carpeta", "borra carpeta", "eliminar carpeta", "borrar carpeta"]:
        if patron in comando:
            return {"respuesta": "No puedo eliminar carpetas en el servidor remoto", "continuar": True, "accion": "desconocido"}

    # WhatsApp
    patrones_wa = [r"envía un mensaje a (\+?\d+).*?diciendo (.+)", r"envía un whatsapp a (\+?\d+).*?diciendo (.+)",
                   r"manda un mensaje a (\+?\d+).*?diciendo (.+)", r"manda un whatsapp a (\+?\d+).*?diciendo (.+)",
                   r"whatsapp a (\+?\d+).*?diciendo (.+)"]
    for p in patrones_wa:
        m = re.search(p, comando, re.IGNORECASE)
        if m:
            numero, texto = m.group(1), m.group(2)
            try:
                data = json.dumps({"numero": numero, "mensaje": texto}).encode()
                req = urllib.request.Request("http://localhost:5000/api/whatsapp/enviar",
                                             data=data, headers={"Content-Type": "application/json"},
                                             method="POST")
                with urllib.request.urlopen(req, timeout=15) as r:
                    resp = json.loads(r.read())
                if resp.get("ok"):
                    return {"respuesta": f"Mensaje enviado a {numero}", "continuar": True, "accion": "whatsapp_enviado"}
                return {"respuesta": f"Error enviando WhatsApp: {resp.get('error', 'desconocido')}", "continuar": True, "accion": "whatsapp_error"}
            except Exception as e:
                return {"respuesta": f"No pude enviar el WhatsApp: {e}", "continuar": True, "accion": "whatsapp_error"}

    # Email
    m = re.search(r"envía un email a (\S+@\S+).*?asunto (.+?) (?:diciendo|cuerpo|con contenido) (.+)", comando, re.IGNORECASE)
    if not m:
        m = re.search(r"envía un correo a (\S+@\S+).*?asunto (.+?) (?:diciendo|cuerpo|con contenido) (.+)", comando, re.IGNORECASE)
    if not m:
        m = re.search(r"email a (\S+@\S+).*?asunto (.+?) (?:diciendo|cuerpo|con contenido) (.+)", comando, re.IGNORECASE)
    if m:
        para, asunto, cuerpo = m.group(1), m.group(2), m.group(3)
        try:
            import urllib.request
            data = json.dumps({"para": para, "asunto": asunto, "cuerpo": cuerpo}).encode()
            req = urllib.request.Request("http://localhost:5000/api/enviar-email",
                                         data=data, headers={"Content-Type": "application/json"},
                                         method="POST")
            with urllib.request.urlopen(req, timeout=15) as r:
                resp = json.loads(r.read())
            if resp.get("ok"):
                return {"respuesta": f"Email enviado a {para}", "continuar": True, "accion": "email_enviado"}
            return {"respuesta": f"Error enviando email: {resp.get('error', 'desconocido')}", "continuar": True, "accion": "email_error"}
        except Exception as e:
            return {"respuesta": f"No pude enviar el email: {e}", "continuar": True, "accion": "email_error"}

    if "mis emails" in comando or "mis correos" in comando or "bandeja" in comando:
        try:
            import urllib.request
            with urllib.request.urlopen("http://localhost:5000/api/emails", timeout=10) as r:
                data = json.loads(r.read())
            emails = data.get("emails", [])
            if not emails:
                return {"respuesta": "No tienes emails en la bandeja de entrada", "continuar": True, "accion": "emails_vacio"}
            resumen = ". ".join(f"{e['de']}: {e['asunto']}" for e in emails[:5])
            return {"respuesta": f"Tus últimos emails: {resumen}", "continuar": True, "accion": "listar_emails"}
        except Exception as e:
            return {"respuesta": f"No pude leer los emails: {e}", "continuar": True, "accion": "emails_error"}

    if "adiós" in comando or "adios" in comando or "apagado" in comando:
        return {"respuesta": "Hasta luego", "continuar": False, "accion": "despedida"}

    return {"respuesta": "No sé cómo hacer eso todavía. Estoy aprendiendo.",
            "continuar": True, "accion": "desconocido"}


def obtener_recordatorios():
    if os.path.exists(RECORDATORIOS_PATH):
        with open(RECORDATORIOS_PATH, "r", encoding="utf-8") as f:
            return [l.strip() for l in f if l.strip()]
    return []

def obtener_memoria():
    if os.path.exists(MEMORIA_PATH):
        try:
            with open(MEMORIA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def agregar_memoria(categoria, texto, relacion=None):
    memorias = obtener_memoria()
    texto_norm = (texto or "").strip().lower()
    if not texto_norm:
        return memorias
    if any(m.get("texto", "").strip().lower() == texto_norm for m in memorias):
        return memorias  # ya existe, evitar duplicados
    memorias.append({
        "categoria": categoria or "OTRO",
        "texto": texto.strip(),
        "relacion": relacion,
        "fecha": datetime.datetime.now().isoformat(),
    })
    with open(MEMORIA_PATH, "w", encoding="utf-8") as f:
        json.dump(memorias, f, ensure_ascii=False, indent=2)
    return memorias


def eliminar_memoria(indice):
    memorias = obtener_memoria()
    if 0 <= indice < len(memorias):
        memorias.pop(indice)
        with open(MEMORIA_PATH, "w", encoding="utf-8") as f:
            json.dump(memorias, f, ensure_ascii=False, indent=2)
    return memorias


def contexto_memoria_para_prompt(limite=25):
    """Arma un resumen de la memoria guardada para inyectarlo en el system prompt de Groq."""
    memorias = obtener_memoria()[-limite:]
    if not memorias:
        return ""
    lineas = [f"- {m['texto']}" for m in memorias]
    return "Datos que ya sabes sobre Elías (úsalos si son relevantes para responder):\n" + "\n".join(lineas)


def extraer_memoria_llm(mensaje_usuario):
    """Le pregunta a Groq si el mensaje trae un dato personal digno de recordar a largo plazo."""
    if not GROQ_API_KEY_MEM:
        return None
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": (
                        "Analiza el mensaje del usuario y decide si contiene un dato personal "
                        "digno de recordar a largo plazo (nombre, preferencia, lugar donde vive o "
                        "trabaja, proyecto, gusto, relación, dato de contexto útil). "
                        "Si NO hay nada digno de recordar, responde exactamente: NADA\n"
                        "Si SÍ hay algo, responde SOLO con un JSON válido de una línea, sin texto "
                        "adicional ni markdown, con esta forma exacta: "
                        '{"categoria":"TAREA|LUGAR|ARCHIVO|CONTEXTO|CLIMA|OTRO","texto":"resumen breve en tercera persona","relacion":null}'
                    )},
                    {"role": "user", "content": mensaje_usuario}
                ],
                "max_tokens": 150,
                "temperature": 0.2
            },
            timeout=15
        )
        if not resp.ok:
            return None
        contenido = resp.json()["choices"][0]["message"]["content"].strip()
        if contenido.upper().startswith("NADA"):
            return None
        contenido = contenido.strip("`").strip()
        if contenido.lower().startswith("json"):
            contenido = contenido[4:].strip()
        dato = json.loads(contenido)
        if dato.get("categoria") not in ("TAREA", "LUGAR", "ARCHIVO", "CONTEXTO", "CLIMA", "OTRO"):
            dato["categoria"] = "OTRO"
        return dato
    except Exception as e:
        print(f"⚠ Error extrayendo memoria: {e}")
        return None

def obtener_memoria():
    if os.path.exists(MEMORIA_PATH):
        try:
            with open(MEMORIA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def agregar_memoria(categoria, texto, relacion=None):
    memorias = obtener_memoria()
    texto_norm = (texto or "").strip().lower()
    if not texto_norm:
        return memorias
    if any(m.get("texto", "").strip().lower() == texto_norm for m in memorias):
        return memorias  # ya existe, evitar duplicados
    memorias.append({
        "categoria": categoria or "OTRO",
        "texto": texto.strip(),
        "relacion": relacion,
        "fecha": datetime.datetime.now().isoformat(),
    })
    with open(MEMORIA_PATH, "w", encoding="utf-8") as f:
        json.dump(memorias, f, ensure_ascii=False, indent=2)
    return memorias


def eliminar_memoria(indice):
    memorias = obtener_memoria()
    if 0 <= indice < len(memorias):
        memorias.pop(indice)
        with open(MEMORIA_PATH, "w", encoding="utf-8") as f:
            json.dump(memorias, f, ensure_ascii=False, indent=2)
    return memorias


def contexto_memoria_para_prompt(limite=25):
    """Arma un resumen de la memoria guardada para inyectarlo en el system prompt de Groq."""
    memorias = obtener_memoria()[-limite:]
    if not memorias:
        return ""
    lineas = [f"- {m['texto']}" for m in memorias]
    return "Datos que ya sabes sobre Elías (úsalos si son relevantes para responder):\n" + "\n".join(lineas)


def extraer_memoria_llm(mensaje_usuario):
    """Le pregunta a Groq si el mensaje trae un dato personal digno de recordar a largo plazo."""
    if not GROQ_API_KEY_MEM:
        return None
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": (
                        "Analiza el mensaje del usuario y decide si contiene un dato personal "
                        "digno de recordar a largo plazo (nombre, preferencia, lugar donde vive o "
                        "trabaja, proyecto, gusto, relación, dato de contexto útil). "
                        "Si NO hay nada digno de recordar, responde exactamente: NADA\n"
                        "Si SÍ hay algo, responde SOLO con un JSON válido de una línea, sin texto "
                        "adicional ni markdown, con esta forma exacta: "
                        '{"categoria":"TAREA|LUGAR|ARCHIVO|CONTEXTO|CLIMA|OTRO","texto":"resumen breve en tercera persona","relacion":null}'
                    )},
                    {"role": "user", "content": mensaje_usuario}
                ],
                "max_tokens": 150,
                "temperature": 0.2
            },
            timeout=15
        )
        if not resp.ok:
            return None
        contenido = resp.json()["choices"][0]["message"]["content"].strip()
        if contenido.upper().startswith("NADA"):
            return None
        contenido = contenido.strip("`").strip()
        if contenido.lower().startswith("json"):
            contenido = contenido[4:].strip()
        dato = json.loads(contenido)
        if dato.get("categoria") not in ("TAREA", "LUGAR", "ARCHIVO", "CONTEXTO", "CLIMA", "OTRO"):
            dato["categoria"] = "OTRO"
        return dato
    except Exception as e:
        print(f"⚠ Error extrayendo memoria: {e}")
        return None


def agregar_recordatorio(texto):
    texto = texto.strip()
    if not texto:
        return obtener_recordatorios()
    with open(RECORDATORIOS_PATH, "a", encoding="utf-8") as f:
        f.write(texto + "\n")
    return obtener_recordatorios()


def eliminar_recordatorio(indice):
    recs = obtener_recordatorios()
    if 0 <= indice < len(recs):
        recs.pop(indice)
        with open(RECORDATORIOS_PATH, "w", encoding="utf-8") as f:
            for r in recs:
                f.write(r + "\n")
    return recs
