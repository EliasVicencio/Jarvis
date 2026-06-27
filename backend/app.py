import os
import queue
import threading
import time
import logging

from flask import Flask, request, jsonify
from flask_cors import CORS

import jarvis_core

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

_wake_queue    = queue.Queue()
_wake_detector = None
_wake_activo   = False
_ultimo_wake   = 0       # timestamp del último wake procesado
WAKE_COOLDOWN  = 4.0     # segundos de bloqueo tras activación


def _on_wake(fuente: str):
    global _ultimo_wake
    ahora = time.time()
    # Ignorar si está en cooldown
    if ahora - _ultimo_wake < WAKE_COOLDOWN:
        logger.info(f"Wake ignorada (cooldown): {fuente}")
        return
    _ultimo_wake = ahora
    logger.info(f"Wake activada: {fuente}")
    _wake_queue.put(fuente)


def iniciar_wake_detector():
    global _wake_detector, _wake_activo
    try:
        from wake_word import WakeWordDetector
        _wake_detector = WakeWordDetector(callback=_on_wake)
        _wake_detector.start()
        _wake_activo = True
        logger.info("Wake word detector activo")
    except Exception as e:
        logger.error(f"No se pudo iniciar el wake detector: {e}")


@app.route("/api/wake-poll")
def api_wake_poll():
    try:
        fuente = _wake_queue.get_nowait()
        return jsonify({"activado": True, "fuente": fuente})
    except queue.Empty:
        return jsonify({"activado": False, "fuente": None})


@app.route("/api/escuchar", methods=["POST"])
def api_escuchar():
    global _ultimo_wake
    if _wake_detector:
        _wake_detector.pausar()
    try:
        texto = jarvis_core.reconocer_voz()
    finally:
        if _wake_detector:
            _wake_detector.reanudar()

    if not texto:
        return jsonify({"texto": "", "ok": False})

    # Si Azure captó "jarvis" como comando, ignorarlo — no es un comando real
    texto_limpio = texto.strip().rstrip(".").lower()
    if texto_limpio in ("jarvis", "jarvi", "jarbes", "harvis"):
        logger.info(f"Ignorando 'jarvis' como comando (era la wake word)")
        # Resetear cooldown para que la próxima detección funcione
        _ultimo_wake = time.time()
        return jsonify({"texto": "", "ok": False, "mensaje": "Wake word ignorada como comando"})

    return jsonify({"texto": texto, "ok": True})


@app.route("/api/comando", methods=["POST"])
def api_comando():
    data    = request.get_json(force=True) or {}
    comando = data.get("comando", "")
    hablar  = data.get("hablar", True)
    if not comando:
        return jsonify({"error": "Falta comando"}), 400
    resultado = jarvis_core.procesar_comando(comando)
    if hablar:
        if _wake_detector:
            _wake_detector.pausar()
        try:
            jarvis_core.hablar(resultado["respuesta"])
        finally:
            if _wake_detector:
                _wake_detector.reanudar()
    return jsonify(resultado)


@app.route("/api/hablar", methods=["POST"])
def api_hablar():
    data  = request.get_json(force=True) or {}
    texto = data.get("texto", "")
    if not texto:
        return jsonify({"error": "Falta texto"}), 400
    if _wake_detector:
        _wake_detector.pausar()
    try:
        jarvis_core.hablar(texto)
    finally:
        if _wake_detector:
            _wake_detector.reanudar()
    return jsonify({"ok": True})


@app.route("/api/recordatorios")
def api_recordatorios():
    return jsonify({"recordatorios": jarvis_core.obtener_recordatorios()})


@app.route("/api/saludo")
def api_saludo():
    return jsonify({
        "saludo": "Hola, soy Jarvis. ¿En qué te ayudo?",
        "recordatorios": jarvis_core.obtener_recordatorios(),
        "wake_activo": _wake_activo,
    })


@app.route("/api/wake-status")
def api_wake_status():
    return jsonify({
        "activo": _wake_activo,
        "metodos": ["jarvis", "aplauso"] if _wake_activo else [],
    })


if __name__ == "__main__":
    threading.Thread(target=iniciar_wake_detector, daemon=True).start()
    print("🤖 Jarvis backend corriendo en http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)