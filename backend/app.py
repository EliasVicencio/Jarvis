"""
app.py — Backend Flask para Jarvis.
Pausa el WakeWordDetector mientras Azure Speech usa el micrófono.
"""

import os
import queue
import threading
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


def _on_wake(fuente: str):
    logger.info(f"Wake activada: {fuente}")
    _wake_queue.put(fuente)


def iniciar_wake_detector():
    global _wake_detector, _wake_activo
    try:
        from wake_word import WakeWordDetector
        _wake_detector = WakeWordDetector(callback=_on_wake)
        _wake_detector.start()
        _wake_activo = True
        logger.info("Wake word detector activo (Vosk offline)")
    except Exception as e:
        logger.error(f"No se pudo iniciar el wake detector: {e}")


@app.route("/api/wake-poll", methods=["GET"])
def api_wake_poll():
    try:
        fuente = _wake_queue.get_nowait()
        return jsonify({"activado": True, "fuente": fuente})
    except queue.Empty:
        return jsonify({"activado": False, "fuente": None})


@app.route("/api/escuchar", methods=["POST"])
def api_escuchar():
    # Pausar Vosk antes de que Azure tome el micrófono
    if _wake_detector:
        _wake_detector.pausar()

    try:
        texto = jarvis_core.reconocer_voz()
    finally:
        # Siempre reanudar, aunque Azure falle
        if _wake_detector:
            _wake_detector.reanudar()

    if not texto:
        return jsonify({"texto": "", "ok": False, "mensaje": "No se entendió nada"})
    return jsonify({"texto": texto, "ok": True})


@app.route("/api/comando", methods=["POST"])
def api_comando():
    data    = request.get_json(force=True) or {}
    comando = data.get("comando", "")
    hablar  = data.get("hablar", True)
    if not comando:
        return jsonify({"error": "Falta el campo 'comando'"}), 400
    resultado = jarvis_core.procesar_comando(comando)
    if hablar:
        # Pausar Vosk mientras Jarvis habla (evita que se escuche a sí mismo)
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
        return jsonify({"error": "Falta el campo 'texto'"}), 400
    if _wake_detector:
        _wake_detector.pausar()
    try:
        jarvis_core.hablar(texto)
    finally:
        if _wake_detector:
            _wake_detector.reanudar()
    return jsonify({"ok": True})


@app.route("/api/recordatorios", methods=["GET"])
def api_recordatorios():
    return jsonify({"recordatorios": jarvis_core.obtener_recordatorios()})


@app.route("/api/saludo", methods=["GET"])
def api_saludo():
    return jsonify({
        "saludo": "Hola, soy Jarvis. ¿En qué te ayudo?",
        "recordatorios": jarvis_core.obtener_recordatorios(),
        "wake_activo": _wake_activo,
    })


@app.route("/api/wake-status", methods=["GET"])
def api_wake_status():
    return jsonify({
        "activo": _wake_activo,
        "metodos": ["jarvis", "aplauso"] if _wake_activo else [],
    })


if __name__ == "__main__":
    threading.Thread(target=iniciar_wake_detector, daemon=True).start()
    print("🤖 Jarvis backend corriendo en http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)