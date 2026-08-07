"""Estado compartido entre app.py y los Blueprints de rutas/ — rate limiting, cola de
wake word, y helpers de audio/Telegram que varias rutas necesitan usar."""
import os
import time
import queue
import base64
import logging
import tempfile
import threading
from collections import defaultdict
from pydub import AudioSegment
import jarvis_core

logger = logging.getLogger("app")

# ── Rate limiting ────────────────────────────────────────────────────────
rate_limit_tracker = defaultdict(list)
RATE_LIMIT_MAX = 15
RATE_LIMIT_WINDOW = 60  # segundos

anomalia_tracker = defaultdict(list)
UMBRAL_ANOMALIA = 3       # veces que debe gatillar el límite
VENTANA_ANOMALIA = 300    # en 5 minutos

def registrar_anomalia(ip):
    ahora = time.time()
    intentos = anomalia_tracker[ip]
    intentos[:] = [t for t in intentos if ahora - t < VENTANA_ANOMALIA]
    intentos.append(ahora)
    if len(intentos) >= UMBRAL_ANOMALIA and not jarvis_core.esta_en_modo_seguro():
        jarvis_core.activar_modo_seguro(f"Actividad sospechosa desde {ip}")
        logger.warning(f"⚠ MODO SEGURO ACTIVADO — anomalia desde {ip}")
        jarvis_core.enviar_texto_telegram(
            f"⚠️ Alerta, Elías. Detecté actividad sospechosa (varias ráfagas de peticiones "
            f"seguidas desde una misma dirección). Activé el modo seguro por mi cuenta — "
            f"los comandos por la web quedan bloqueados. Escríbeme aquí 'desactiva modo seguro' "
            f"cuando confirmes que todo está bien."
        )

def rate_limited(ip):
    ahora = time.time()
    intentos = rate_limit_tracker[ip]
    intentos[:] = [t for t in intentos if ahora - t < RATE_LIMIT_WINDOW]
    if len(intentos) >= RATE_LIMIT_MAX:
        registrar_anomalia(ip)
        return True
    intentos.append(ahora)
    return False

# ── Wake word / estado general (mutado con "estado_compartido.X = ...") ────
wake_queue     = queue.Queue()
accion_queue   = queue.Queue()   # acciones para el frontend (abrir_noticias, etc.)
wake_detector  = None
wake_activo    = False
ultimo_wake    = 0
jarvis_pausado = False
WAKE_COOLDOWN  = 4.0

def on_wake(fuente: str):
    global ultimo_wake
    ahora = time.time()
    if ahora - ultimo_wake < WAKE_COOLDOWN:
        logger.info(f"Wake ignorada (cooldown): {fuente}")
        return
    ultimo_wake = ahora
    logger.info(f"Wake activada: {fuente}")
    wake_queue.put(fuente)

# ── Helpers de audio / Telegram compartidos por varias rutas ───────────────
def generar_audio_base64(texto):
    """Genera el mp3 de una respuesta y lo devuelve en base64 para el navegador."""
    try:
        mp3_path = jarvis_core.generar_audio_mp3(texto)
        with open(mp3_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")
        os.remove(mp3_path)
        return b64
    except Exception as e:
        logger.error(f"Error generando audio: {e}")
        return None

def reenviar_a_telegram_async(texto_usuario, respuesta_texto, audio_b64, prefijo="⌨️ Tú (texto)"):
    """Reenvía a Telegram en un hilo aparte, reutilizando el audio ya generado (sin duplicar la síntesis de voz)."""
    def _hacer():
        try:
            jarvis_core.enviar_texto_telegram(f"{prefijo}: {texto_usuario}")
            if not audio_b64:
                return
            mp3_path = os.path.join(tempfile.gettempdir(), f"jarvis_tg_{int(time.time()*1000)}.mp3")
            with open(mp3_path, "wb") as f:
                f.write(base64.b64decode(audio_b64))
            ogg_path = mp3_path.replace(".mp3", ".ogg")
            AudioSegment.from_file(mp3_path).export(ogg_path, format="ogg", codec="libopus")
            jarvis_core.enviar_voz_telegram(ogg_path, caption=respuesta_texto[:200])
            os.remove(mp3_path)
            os.remove(ogg_path)
        except Exception as e:
            logger.error(f"Error reenviando a Telegram: {e}")
    threading.Thread(target=_hacer, daemon=True).start()

def contar_correos_no_leidos():
    """Devuelve el número de correos sin leer, o None si EMAIL_USER/EMAIL_PASS no están
    configurados (en cuyo caso el saludo simplemente no menciona correos)."""
    user = os.environ.get("EMAIL_USER", "")
    pwd  = os.environ.get("EMAIL_PASS", "")
    if not user or not pwd:
        return None
    try:
        import imaplib
        M = imaplib.IMAP4_SSL("imap.gmail.com", timeout=4)
        M.login(user, pwd)
        M.select("INBOX")
        _, data = M.search(None, "UNSEEN")
        M.logout()
        return len(data[0].split()) if data and data[0] else 0
    except Exception as e:
        logger.error(f"Error contando correos no leidos: {e}")
        return None

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")