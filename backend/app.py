"""Punto de entrada del backend: crea la app de Flask, registra los Blueprints de rutas/,
y arranca los servicios de fondo (wake word, monitor de memoria, bot de Telegram)."""
import os
import sys
import time
import threading
import logging
import subprocess
import psutil
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()

import jarvis_core
import estado_compartido as estado

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app")

app = Flask(__name__)
CORS(app, origins=["https://saturday.viewdns.net"])
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB máximo por petición

from rutas.voz import bp as voz_bp
from rutas.datos import bp as datos_bp
from rutas.noticias import bp as noticias_bp

app.register_blueprint(voz_bp)
app.register_blueprint(datos_bp)
app.register_blueprint(noticias_bp)


# ── Servicios de fondo ───────────────────────────────────────────────────
def _monitor_memoria():
    """Chequea la memoria cada 5 minutos; si se pone critica, avisa por Telegram y se reinicia solo."""
    UMBRAL_ALERTA = 90
    INTERVALO = 300  # 5 minutos
    ya_alertado = False
    while True:
        time.sleep(INTERVALO)
        try:
            mem = psutil.virtual_memory()
            if mem.percent >= UMBRAL_ALERTA:
                if not ya_alertado:
                    logger.warning(f"⚠ Memoria critica ({mem.percent:.0f}%), reiniciando servicio...")
                    jarvis_core.enviar_texto_telegram(
                        f"⚠️ Alerta, Elías. La memoria de la VM llegó a {mem.percent:.0f} por ciento. "
                        f"Me voy a reiniciar para liberarla preventivamente. Vuelvo en unos segundos."
                    )
                    ya_alertado = True
                    time.sleep(3)
                    os._exit(1)
            else:
                ya_alertado = False
        except Exception as e:
            logger.error(f"Error monitoreando memoria: {e}")


def iniciar_wake_detector():
    try:
        from wake_word import WakeWordDetector
        estado.wake_detector = WakeWordDetector(callback=estado.on_wake)
        estado.wake_detector.start()
        estado.wake_activo = True
        logger.info("Wake word detector activo (Azure Speech loop)")
    except Exception as e:
        logger.error(f"No se pudo iniciar el wake detector: {e}")


_telegram_process = None

def _arrancar_telegram_bot():
    global _telegram_process
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telegram_bot.py")
    _telegram_process = subprocess.Popen(
        [sys.executable, script],
        stdout=open("/tmp/telegram_bot.log", "a"),
        stderr=subprocess.STDOUT,
    )
    logger.info(f"Telegram bot iniciado (PID {_telegram_process.pid})")


# ── Arranque ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    threading.Thread(target=_monitor_memoria, daemon=True).start()
    jarvis_core.iniciar_proactividad()
    _arrancar_telegram_bot()
    print("🤖 Saturday backend corriendo en http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)