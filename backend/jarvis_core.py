import psutil
import asyncio
import datetime
import webbrowser
import subprocess
import platform
import random
import re
import threading
import queue
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

HISTORIAL_PATH = os.path.join(os.path.dirname(__file__), "historial.json")

CALENDAR_TOKEN_PATH = os.path.join(os.path.dirname(__file__), "token.json")
CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def _obtener_servicio_calendar():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    if not os.path.exists(CALENDAR_TOKEN_PATH):
        return None
    creds = Credentials.from_authorized_user_file(CALENDAR_TOKEN_PATH, CALENDAR_SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(CALENDAR_TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
    return build('calendar', 'v3', credentials=creds)

def resumen_agenda_hoy():
    """Genera un resumen hablado de los eventos de hoy en Google Calendar."""
    try:
        service = _obtener_servicio_calendar()
        if not service:
            return "No tengo acceso a tu calendario configurado, señor."

        from zoneinfo import ZoneInfo
        tz = ZoneInfo("America/Santiago")
        hoy = datetime.datetime.now(tz).date()
        inicio = datetime.datetime.combine(hoy, datetime.time.min, tzinfo=tz).isoformat()
        fin = datetime.datetime.combine(hoy, datetime.time.max, tzinfo=tz).isoformat()

        eventos_result = service.events().list(
            calendarId='primary', timeMin=inicio, timeMax=fin,
            singleEvents=True, orderBy='startTime', timeZone='America/Santiago'
        ).execute()
        eventos = eventos_result.get('items', [])

        if not eventos:
            return "No tienes eventos programados para hoy."

        partes = [f"Tienes {len(eventos)} evento{'s' if len(eventos) != 1 else ''} hoy."]
        for ev in eventos[:5]:
            titulo = ev.get('summary', 'Sin título')
            inicio_ev = ev['start'].get('dateTime')
            if inicio_ev:
                hora = inicio_ev[11:16]
                partes.append(f"A las {hora}, {titulo}.")
            else:
                partes.append(f"{titulo}, todo el día.")
        return " ".join(partes)
    except Exception as e:
        print(f"⚠ Error obteniendo eventos del calendario: {e}")
        return "No pude acceder a tu calendario en este momento, señor."
    
HISTORIAL_MAX = 15
MEMORIA_MAX = 300

NOTAS_PATH = os.path.join(os.path.dirname(__file__), "notas_rapidas.json")

def obtener_notas():
    if os.path.exists(NOTAS_PATH):
        try:
            with open(NOTAS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def agregar_nota(texto):
    notas = obtener_notas()
    notas.append({"texto": texto.strip(), "fecha": datetime.datetime.now().isoformat()})
    notas = notas[-200:]
    with open(NOTAS_PATH, "w", encoding="utf-8") as f:
        json.dump(notas, f, ensure_ascii=False, indent=2)
    return notas

def eliminar_nota(indice):
    notas = obtener_notas()
    if 0 <= indice < len(notas):
        notas.pop(indice)
        with open(NOTAS_PATH, "w", encoding="utf-8") as f:
            json.dump(notas, f, ensure_ascii=False, indent=2)
    return notas

def resumen_del_dia():
    """Resumen hablado de la actividad de hoy, usando el historial y las notas."""
    hoy = datetime.datetime.now().date().isoformat()
    comandos_hoy = [h for h in obtener_historial() if h.get("fecha", "").startswith(hoy)]
    notas_hoy = [n for n in obtener_notas() if n.get("fecha", "").startswith(hoy)]

    n_comandos = len(comandos_hoy)
    if n_comandos == 0:
        return "Todavía no hemos interactuado hoy, señor."

    vez_txt = "vez" if n_comandos == 1 else "veces"
    partes = [f"Hoy me usaste {n_comandos} {vez_txt}."]

    if notas_hoy:
        n = len(notas_hoy)
        partes.append(f"Agregaste {n} nota{'s' if n != 1 else ''} rápida{'s' if n != 1 else ''}.")

    partes.append("Buen trabajo hoy.")
    return " ".join(partes)

def generar_celebracion(titulo):
    """Genera un mensaje corto de felicitación cuando se completa una tarea."""
    if GROQ_API_KEY_MEM:
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
                json={
                    "model": "openai/gpt-oss-20b",
                    "reasoning_effort": "low",
                    "messages": [
                        {"role": "system", "content": (
                            "Eres OTTO, el asistente de Elías. Él acaba de completar una tarea. "
                            "Felicítalo con una frase corta, genuina y con personalidad (no genérica), "
                            "estilo un mayordomo alemán que refunfuña con cariño reconociendo el trabajo de Tony. Máximo 1-2 frases."
                        )},
                        {"role": "user", "content": f"Completé: {titulo}"}
                    ],
                    "max_tokens": 80,
                    "temperature": 0.9
                },
                timeout=10
            )
            if resp.ok:
                return "🎉 " + resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"⚠ Error generando celebracion: {e}")
    return f"🎉 ¡Completaste \"{titulo}\"! Buen trabajo, Elías."

def despedida_fin_dia():
    """Cierre cálido del día, con resumen de lo que se hizo."""
    resumen = resumen_del_dia()
    return f"Buenas noches, Elías. {resumen} Que descanses."

MODO_SEGURO_PATH = os.path.join(os.path.dirname(__file__), "modo_seguro.flag")

def esta_en_modo_seguro():
    return os.path.exists(MODO_SEGURO_PATH)

def activar_modo_seguro(motivo=""):
    with open(MODO_SEGURO_PATH, "w", encoding="utf-8") as f:
        f.write(motivo)

def desactivar_modo_seguro():
    if os.path.exists(MODO_SEGURO_PATH):
        os.remove(MODO_SEGURO_PATH)

MEMORIA_PATH = os.path.join(os.path.dirname(__file__), "memoria_semantica.json")
GROQ_API_KEY_MEM = os.getenv("GROQ_API_KEY", "")
VOZ = "es-MX-JorgeNeural"
VOZ_RATE = "+0%"    # velocidad natural, sin acelerar (acelerar sonaba más robótico, no menos)
VOZ_PITCH = "+0Hz"  # tono natural, sin forzar

# Reconocedor de voz (reutilizable)
_recognizer = sr.Recognizer()
_recognizer.pause_threshold = 1.0   # espera 1s de silencio antes de cortar
_recognizer.energy_threshold = 300  # sensibilidad al ruido

# ── Helpers ──────────────────────────────────────────────────────────────────
# ── Síntesis de voz ───────────────────────────────────────────────────────
def hablar(texto):
    """Convierte texto a voz con Edge TTS (gratuito, sin cuenta)."""
    print(f"🤖 Otto: {texto}")
    tmp = None
    try:
        # Generar archivo mp3 en carpeta temporal
        tmp = generar_audio_mp3(texto, output_path=os.path.join(tempfile.gettempdir(), "jarvis_audio.mp3"))
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

        # Método 3: afpAlay (macOS)
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
def generar_audio_mp3(texto, output_path=None, rate=VOZ_RATE, pitch=VOZ_PITCH):
    """Genera audio con Edge TTS (voz neuronal), con velocidad y tono ajustados para sonar más humano."""
    if output_path is None:
        output_path = os.path.join(
            tempfile.gettempdir(), f"jarvis_tts_{os.getpid()}_{int(time.time() * 1000)}.mp3"
        )

    async def _generar():
        comunicar = edge_tts.Communicate(texto, VOZ, rate=rate, pitch=pitch)
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
]  # Respaldo, solo se usa si Groq no está disponible

def generar_chiste_llm():
    """Genera un chiste corto y original con Groq. Si falla, usa la lista local como respaldo."""
    if GROQ_API_KEY_MEM:
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
                json={
                    "model": "openai/gpt-oss-20b",
                    "reasoning_effort": "low",
                    "messages": [
                        {"role": "system", "content": (
                            "Eres OTTO. Cuenta UN chiste corto, ingenioso y original en español "
                            "de Chile (puede ser de programación, de la vida cotidiana, un juego de "
                            "palabras, o humor absurdo). Máximo 2 líneas. Responde SOLO con el "
                            "chiste, sin introducción, sin explicación, sin comillas."
                        )},
                        {"role": "user", "content": "Cuéntame un chiste"}
                    ],
                    "max_tokens": 120,
                    "temperature": 1.0
                },
                timeout=10
            )
            if resp.ok:
                chiste = resp.json()["choices"][0]["message"]["content"].strip()
                if chiste:
                    return chiste
        except Exception as e:
            print(f"⚠ Error generando chiste con Groq: {e}")
    return random.choice(CHISTES)

def reporte_estado_sistema():
    """Genera un reporte hablado del estado de la VM, estilo Otto."""
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disco = psutil.disk_usage("/")
        swap = psutil.swap_memory()

        uptime_seg = time.time() - psutil.boot_time()
        horas = int(uptime_seg // 3600)
        dias = horas // 24
        horas_restantes = horas % 24

        if dias > 0:
            tiempo_txt = f"{dias} día{'s' if dias != 1 else ''} y {horas_restantes} hora{'s' if horas_restantes != 1 else ''}"
        else:
            tiempo_txt = f"{horas_restantes} hora{'s' if horas_restantes != 1 else ''}"

        estado_general = "todo dentro de parámetros normales" if cpu < 80 and mem.percent < 85 else "hay carga elevada en el sistema"

        return (
            f"CPU al {cpu:.0f} por ciento, memoria al {mem.percent:.0f} por ciento, "
            f"disco al {disco.percent:.0f} por ciento. Activo hace {tiempo_txt}. "
            f"{estado_general.capitalize()}, señor."
        )

    except Exception as e:
        return f"No pude generar el reporte de estado: {e}"

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

    if any(p in comando for p in ["estado de los sistemas", "diagnóstico de sistemas", "diagnostico de sistemas",
                                    "cómo están los sistemas", "como estan los sistemas", "diagnóstico", "diagnostico"]):
        return {"respuesta": diagnostico_sistemas(), "continuar": True, "accion": "diagnostico"}

    m = re.search(r"investiga(?:r)?(?:\s+a\s+fondo)?(?:\s+sobre)?\s+(.+)", comando)
    if m and "investiga" in comando:
        tema = m.group(1).strip()
        return {"respuesta": investigar_profundo(tema), "continuar": True, "accion": "investigar"}

    m = re.search(r"traduce?\s+(.+?)\s+al\s+(\w+)$", comando)
    if m:
        texto_a_traducir, idioma = m.group(1).strip(), m.group(2).strip()
        return {"respuesta": traducir_texto(texto_a_traducir, idioma), "continuar": True, "accion": "traducir"}

    if any(p in comando for p in ["busca noticias", "noticias de hoy", "stark intel", "abre stark intel"]):
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
    
    if "correo" in comando or "gmail" in comando or "email" in comando or "e-mail" in comando:
        return {"respuesta": "Abriendo tu correo", "continuar": True, "accion": "abrir_gmail"}

    if "calculadora" in comando:
        return {"respuesta": "Abriendo la calculadora", "continuar": True, "accion": "abrir_calculadora"}

    if "bloc de notas" in comando or "abre notas" in comando:
        return {"respuesta": "Abriendo el bloc de notas", "continuar": True, "accion": "abrir_notas"}

    if "chiste" in comando:
        return {"respuesta": generar_chiste_llm(), "continuar": True, "accion": "chiste"}

    if comando.startswith("anota esto") or comando.startswith("anota:") or comando.startswith("toma nota"):
        for disparador in ["anota esto:", "anota esto", "toma nota:", "toma nota", "anota:"]:
            if comando.startswith(disparador):
                texto_nota = comando[len(disparador):].strip(" :")
                break
        else:
            texto_nota = ""
        if texto_nota:
            agregar_nota(texto_nota)
            return {"respuesta": f"Anotado: {texto_nota}", "continuar": True, "accion": "nota_agregada"}
        return {"respuesta": "¿Qué quieres que anote?", "continuar": True, "accion": "nota_vacia"}

    if "modo trabajo" in comando:
        recordatorios = obtener_recordatorios()
        n = len(recordatorios)
        extra = f" Tienes {n} recordatorio{'s' if n != 1 else ''} pendiente{'s' if n != 1 else ''}." if n else ""
        return {"respuesta": f"Modo trabajo activado.{extra} Concentrémonos.", "continuar": True, "accion": "modo_trabajo"}

    if "resume mi día" in comando or "resumen del día" in comando or "cómo estuvo mi día" in comando:
        return {"respuesta": resumen_del_dia(), "continuar": True, "accion": "resumen_dia"}
    
    if ("me voy a dormir" in comando or "me voy a acostar" in comando or "hasta mañana" in comando
            or "nos vemos mañana" in comando or "me voy a la cama" in comando):
        return {"respuesta": despedida_fin_dia(), "continuar": True, "accion": "despedida_dia"}
    
    if ("qué tengo hoy" in comando or "que tengo hoy" in comando or "mi agenda" in comando
            or "mis eventos" in comando or "qué tengo en el calendario" in comando
            or "que tengo en el calendario" in comando):
        return {"respuesta": resumen_agenda_hoy(), "continuar": True, "accion": "agenda"}

    if "reporte de estado" in comando or "estado del sistema" in comando or "cómo está el sistema" in comando or "diagnostico" in comando:
        r = reporte_estado_sistema()
        return {"respuesta": r, "continuar": True, "accion": "reporte_estado"}

    if "ayuda" in comando or "qué puedes" in comando or "comandos" in comando:
        return {"respuesta": "Puedo decirte la hora, la fecha, el clima, buscar en Google, "
                             "abrir YouTube, Spotify, la calculadora, guardar recordatorios y contarte un chiste.",
                "continuar": True, "accion": "ayuda"}

    if any(p in comando for p in ["para", "pausa", "detente", "silencio"]):
        return {"respuesta": "Entendido, me pongo en pausa. Di Otto cuando me necesites.",
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

    if any(p in comando for p in ["stark ops", "abre stark ops", "mis tareas", "abre mis tareas"]):
        return {"respuesta": "Abriendo Stark Ops", "continuar": True, "accion": "abrir_stark_ops"}

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

    if any(frase in comando for frase in FRASES_ANIMO):
        return {"respuesta": responder_con_animo(comando), "continuar": True, "accion": "animo"}
    
    if "sesión de enfoque" in comando or "sesion de enfoque" in comando or "modo enfoque" in comando or "pomodoro" in comando:
        return {"respuesta": iniciar_pomodoro(comando), "continuar": True, "accion": "pomodoro"}

    return {"respuesta": "No sé cómo hacer eso todavía. Estoy aprendiendo.",
            "continuar": True, "accion": "desconocido"}

FRASES_ANIMO = [
    "estoy estresado", "estoy cansado", "qué día tan largo", "que dia tan largo",
    "estoy agotado", "un día pesado", "un dia pesado", "necesito un descanso",
    "estoy muy cansado", "qué cansado estoy", "que cansado estoy",
    "ha sido un día difícil", "ha sido un dia dificil", "estoy abrumado",
    "no doy más", "no doy mas", "estoy quebrado",
]

def responder_con_animo(comando_original):
    """Respuesta cálida y breve cuando Elías menciona cansancio o estrés casual."""
    if not GROQ_API_KEY_MEM:
        return "Te escucho. Tómate un respiro si lo necesitas, aquí estoy."
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [
                    {"role": "system", "content": (
                        "Eres OTTO, el asistente personal de Elías. Él acaba de mencionar que está "
                        "cansado, estresado, o que tuvo un día difícil. Respóndele con calidez genuina, "
                        "como lo haría un amigo cercano: valida cómo se siente en una frase, y sugiere "
                        "algo simple y breve (un descanso corto, algo de música, estirar las piernas) "
                        "sin sonar clínico ni dar consejos largos. Máximo 2 frases. No le digas que eres "
                        "una IA ni menciones que 'no puedes reemplazar' nada — solo sé cálido y natural, "
                        "como Otto lo haría con Elías, con su resignación característica."
                    )},
                    {"role": "user", "content": comando_original}
                ],
                "max_tokens": 120,
                "temperature": 0.8
            },
            timeout=15
        )
        if resp.ok:
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"⚠ Error en respuesta de ánimo: {e}")
    return "Te escucho. Tómate un respiro si lo necesitas, aquí estoy."

_pomodoro_estado = {"activo": False}
_avisos_proactivos = queue.Queue()

def anunciar_proactivo(mensaje, telegram=True):
    """Mecanismo general para que Otto hable sin que se lo pidan: lo usan Pomodoro,
    logros, y cualquier chequeo proactivo (horario, calendario, etc). Lo consume el
    frontend vía /api/wake-poll y opcionalmente lo reenvía a Telegram."""
    if telegram:
        enviar_texto_telegram(f"🗣️ {mensaje}")
    _avisos_proactivos.put(mensaje)


_proactividad_estado = {"resumen_nocturno_hecho": None, "eventos_avisados": set()}

def _chequeo_proactivo():
    """Corre una vez, evalúa si vale la pena que Otto hable sin que le pregunten.
    Se llama periódicamente desde el hilo de proactividad."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/Santiago")
    ahora = datetime.datetime.now(tz)
    hoy_str = ahora.date().isoformat()

    # ── Resumen nocturno (una vez al día, a partir de las 22:00) ──────────
    if ahora.hour >= 22 and _proactividad_estado["resumen_nocturno_hecho"] != hoy_str:
        _proactividad_estado["resumen_nocturno_hecho"] = hoy_str
        resumen = resumen_agenda_hoy()
        anunciar_proactivo(f"Antes de que termines el día: {resumen}")

    # ── Eventos de calendario que empiezan en los próximos 15 minutos ─────
    try:
        service = _obtener_servicio_calendar()
        if service:
            en_15 = ahora + datetime.timedelta(minutes=15)
            eventos_result = service.events().list(
                calendarId='primary', timeMin=ahora.isoformat(), timeMax=en_15.isoformat(),
                singleEvents=True, orderBy='startTime', timeZone='America/Santiago'
            ).execute()
            for ev in eventos_result.get('items', []):
                ev_id = ev.get('id')
                if ev_id in _proactividad_estado["eventos_avisados"]:
                    continue
                inicio_ev = ev['start'].get('dateTime')
                if not inicio_ev:
                    continue
                titulo = ev.get('summary', 'un evento')
                hora = inicio_ev[11:16]
                _proactividad_estado["eventos_avisados"].add(ev_id)
                anunciar_proactivo(f"Recordatorio: tienes \"{titulo}\" a las {hora}, en menos de 15 minutos.")
    except Exception as e:
        print(f"⚠ Error en chequeo proactivo de calendario: {e}")


def iniciar_proactividad():
    """Arranca el hilo en segundo plano que revisa cada 5 minutos si Otto debería hablar."""
    def _loop():
        while True:
            try:
                _chequeo_proactivo()
            except Exception as e:
                print(f"⚠ Error en hilo de proactividad: {e}")
            time.sleep(300)  # cada 5 minutos
    threading.Thread(target=_loop, daemon=True).start()

def iniciar_pomodoro(comando):
    """Inicia una sesión de enfoque; avisa por voz en el navegador y por Telegram cuando termina."""
    match = re.search(r'(\d+)\s*minuto', comando)
    minutos = int(match.group(1)) if match else 25
    minutos = max(1, min(minutos, 180))  # límite razonable: 1 a 180 minutos

    _pomodoro_estado["activo"] = True

    def _avisar():
        time.sleep(minutos * 60)
        if _pomodoro_estado["activo"]:
            _pomodoro_estado["activo"] = False
            mensaje = f"Se acabó tu sesión de enfoque de {minutos} minutos, Elías. Buen trabajo, tómate un respiro."
            anunciar_proactivo(mensaje)

    threading.Thread(target=_avisar, daemon=True).start()
    return f"Modo enfoque activado por {minutos} minutos. Te aviso cuando termine — concentrémonos."

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
    memorias = memorias[-MEMORIA_MAX:]
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

_FRASES_META_MEMORIA = (
    "qué sabes de mí", "que sabes de mi", "qué sabes sobre mí", "que sabes sobre mi",
    "recuerdas algo de mí", "recuerdas algo de mi", "qué recuerdas de mí", "que recuerdas de mi",
    "qué tienes guardado", "que tienes guardado", "borra tu memoria", "olvida lo que sabes",
)

def extraer_memoria_llm(mensaje_usuario):
    """Le pregunta a Groq si el mensaje trae un dato personal NUEVO y concreto, digno de recordar."""
    if not GROQ_API_KEY_MEM:
        return None

    texto_lower = mensaje_usuario.strip().lower()
    # No extraer nada de preguntas que son sobre la memoria misma (evita ruido/basura)
    if any(frase in texto_lower for frase in _FRASES_META_MEMORIA):
        return None
    # Mensajes muy cortos casi nunca traen un dato nuevo digno de guardar
    if len(mensaje_usuario.strip()) < 8:
        return None

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [
                    {"role": "system", "content": (
                        "Tu única tarea es decidir si el mensaje del usuario contiene un HECHO "
                        "PERSONAL CONCRETO y NUEVO, digno de recordar a largo plazo: su nombre, una "
                        "preferencia real (gusto, comida, música), dónde vive o trabaja, un proyecto "
                        "en el que trabaja, una relación (familiar, mascota), o un dato de contexto "
                        "claramente útil.\n"
                        "NO extraigas nada de: saludos, preguntas casuales, preguntas sobre el clima "
                        "o la hora, preguntas dirigidas a ti mismo (OTTO), charla genérica sin "
                        "información nueva, ni de mensajes ambiguos donde no haya un hecho explícito.\n"
                        "Ante cualquier duda, responde NADA — es preferible no guardar algo a guardar "
                        "basura o inventar contenido que el usuario no dijo explícitamente.\n"
                        "Si NO hay nada digno de recordar, responde exactamente: NADA\n"
                        "Si SÍ hay algo, responde SOLO con un JSON válido de una línea, sin texto "
                        "adicional ni markdown, con esta forma exacta: "
                        '{"categoria":"TAREA|LUGAR|ARCHIVO|CONTEXTO|CLIMA|OTRO","texto":"resumen breve, literal y verificable en tercera persona","relacion":null}'
                    )},
                    {"role": "user", "content": mensaje_usuario}
                ],
                "max_tokens": 150,
                "temperature": 0.1
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
        if not dato.get("texto"):
            return None
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

def obtener_historial():
    if os.path.exists(HISTORIAL_PATH):
        try:
            with open(HISTORIAL_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def agregar_historial(comando, respuesta, accion=None, fuente=None):
    historial = obtener_historial()
    historial.append({
        "comando": comando,
        "respuesta": (respuesta or "")[:300],
        "accion": accion,
        "fuente": fuente,
        "fecha": datetime.datetime.now().isoformat(),
    })
    historial = historial[-HISTORIAL_MAX:]
    with open(HISTORIAL_PATH, "w", encoding="utf-8") as f:
        json.dump(historial, f, ensure_ascii=False, indent=2)
    return historial

# ── Utilidades de texto ──────────────────────────────────────────────────────

def _limpiar_markdown(texto):
    """Quita símbolos de Markdown (headers, negritas, listas, código) que a veces
    devuelven los modelos, para que el texto se lea bien hablado o en la tarjeta."""
    texto = re.sub(r"```.*?```", "", texto, flags=re.DOTALL)   # bloques de código
    texto = re.sub(r"^#{1,6}\s*", "", texto, flags=re.MULTILINE)  # ### Títulos
    texto = re.sub(r"\*\*(.+?)\*\*", r"\1", texto)              # **negrita**
    texto = re.sub(r"__(.+?)__", r"\1", texto)                  # __negrita__
    texto = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", texto)     # *cursiva*
    texto = re.sub(r"^[\s]*[-*•]\s+", "", texto, flags=re.MULTILINE)  # - viñetas
    texto = re.sub(r"^[\s]*\d+\.\s+", "", texto, flags=re.MULTILINE)  # 1. numeradas
    texto = re.sub(r"`(.+?)`", r"\1", texto)                    # `código inline`
    texto = re.sub(r"\n{2,}", " ", texto)                       # colapsar párrafos
    texto = re.sub(r"\n", " ", texto)
    return re.sub(r"\s{2,}", " ", texto).strip()


# ── Diagnóstico de sistemas, investigación profunda y traducción ───────────

GROQ_COMPOUND_MODEL = "groq/compound-mini"

def diagnostico_sistemas():
    """Reporte de estado del servidor, estilo mayordomo alemán reportando el estado de la casa."""
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disco = psutil.disk_usage("/")

        if cpu < 60 and mem.percent < 70 and disco.percent < 85:
            apertura = "Todos los sistemas dentro de parámetros normales."
        elif cpu > 85 or mem.percent > 90:
            apertura = "Aviso: hay sistemas bajo carga considerable."
        else:
            apertura = "Sistemas operativos, con algunos valores a vigilar."

        return (
            f"{apertura} CPU al {cpu:.0f} por ciento, memoria al {mem.percent:.0f} por ciento "
            f"({mem.used // (1024**2)} de {mem.total // (1024**2)} megabytes), "
            f"disco al {disco.percent:.0f} por ciento."
        )
    except Exception as e:
        print(f"⚠ Error en diagnóstico de sistemas: {e}")
        return "No pude generar el diagnóstico de sistemas en este momento."


def investigar_profundo(consulta):
    """Investigación con búsqueda web real, vía el sistema Compound de Groq
    (usa la misma GROQ_API_KEY, sin proveedores ni claves nuevas). Incluye las
    fuentes que el modelo realmente consultó, no solo el resumen."""
    if not GROQ_API_KEY_MEM:
        return "No tengo configurada la clave de Groq para investigar."
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": GROQ_COMPOUND_MODEL,
                "messages": [{
                    "role": "user",
                    "content": (
                        f"Investiga sobre esto y dame un resumen claro y actualizado en español: {consulta}. "
                        "Responde en prosa conversacional de 3-5 frases, directo al punto, sin markdown, "
                        "como si se lo contaras a alguien en voz alta."
                    ),
                }],
                "max_tokens": 500,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        mensaje = data["choices"][0]["message"]
        texto = _limpiar_markdown(mensaje.get("content", ""))

        # Extraer las fuentes reales que consultó (no inventadas por el modelo)
        dominios = []
        for tool in mensaje.get("executed_tools") or []:
            resultados = tool.get("search_results") or {}
            items = resultados.get("results") if isinstance(resultados, dict) else resultados
            for item in (items or []):
                url = item.get("url") if isinstance(item, dict) else None
                if not url:
                    continue
                dominio = re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
                if dominio and dominio not in dominios:
                    dominios.append(dominio)

        if dominios:
            texto += f" Fuentes consultadas: {', '.join(dominios[:5])}."

        return texto
    except Exception as e:
        print(f"⚠ Error en investigación profunda: {e}")
        return "No pude completar la investigación en este momento."


def traducir_texto(texto, idioma_destino):
    """Traduce un texto usando Groq (modelo rápido, sin búsqueda)."""
    if not GROQ_API_KEY_MEM:
        return "No tengo configurada la clave de Groq para traducir."
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [{
                    "role": "user",
                    "content": (
                        f"Traduce el siguiente texto al {idioma_destino}. Responde solo con la "
                        f"traducción, sin explicaciones ni comillas ni markdown:\n\n{texto}"
                    ),
                }],
                "max_tokens": 500,
                "temperature": 0.3,
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"⚠ Error traduciendo: {e}")
        return "No pude traducir el texto en este momento."