"""Síntesis y reconocimiento de voz (Edge TTS + Google STT), y mensajería a Telegram."""
import os
import time
import platform
import subprocess
import tempfile
import requests
import edge_tts
import asyncio
import speech_recognition as sr

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID   = os.getenv("TELEGRAM_CHAT_ID", "")

GROQ_API_KEY_MEM = os.getenv("GROQ_API_KEY", "")
VOZ = "es-MX-JorgeNeural"
VOZ_RATE = "+0%"    # velocidad natural, sin acelerar (acelerar sonaba más robótico, no menos)
VOZ_PITCH = "+0Hz"  # tono natural, sin forzar

# Google Cloud TTS (Chirp 3 HD, voz natural) — si no está configurado, usa Edge TTS gratis.
GOOGLE_TTS_API_KEY = os.getenv("GOOGLE_TTS_API_KEY", "")
GOOGLE_TTS_LANG = os.getenv("GOOGLE_TTS_LANG", "es-US")
GOOGLE_TTS_VOICE = os.getenv("GOOGLE_TTS_VOICE", "es-US-Chirp3-HD-Charon")  # masculina, profunda/autoritaria — elegida

# Reconocedor de voz (reutilizable)
_recognizer = sr.Recognizer()
_recognizer.pause_threshold = 1.0   # espera 1s de silencio antes de cortar
_recognizer.energy_threshold = 300  # sensibilidad al ruido

# ── Helpers ──────────────────────────────────────────────────────────────────
# ── Síntesis de voz ───────────────────────────────────────────────────────
def hablar(texto):
    """Convierte texto a voz con Edge TTS (gratuito, sin cuenta)."""
    print(f"🤖 Saturday: {texto}")
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
def _generar_audio_google(texto, output_path):
    """Genera audio con Google Cloud TTS (Chirp 3 HD, voz natural), vía REST con API key.
    Devuelve True si funcionó."""
    if not GOOGLE_TTS_API_KEY:
        return False
    try:
        import base64
        resp = requests.post(
            f"https://texttospeech.googleapis.com/v1/text:synthesize?key={GOOGLE_TTS_API_KEY}",
            json={
                "input": {"text": texto},
                "voice": {"languageCode": GOOGLE_TTS_LANG, "name": GOOGLE_TTS_VOICE},
                "audioConfig": {"audioEncoding": "MP3"},
            },
            timeout=20,
        )
        data = resp.json()
        if "audioContent" not in data:
            print(f"⚠ Google Cloud TTS devolvió error: {data}")
            return False
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(data["audioContent"]))
        return True
    except Exception as e:
        print(f"⚠ Google Cloud TTS falló, usando Edge TTS de respaldo: {e}")
        return False


def generar_audio_mp3(texto, output_path=None, rate=VOZ_RATE, pitch=VOZ_PITCH):
    """Genera audio: intenta Google Cloud TTS primero (si está configurado, más natural), y si
    falla o no está configurado, usa Edge TTS (gratuito) como respaldo automático."""
    if output_path is None:
        output_path = os.path.join(
            tempfile.gettempdir(), f"jarvis_tts_{os.getpid()}_{int(time.time() * 1000)}.mp3"
        )

    if _generar_audio_google(texto, output_path):
        return output_path

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