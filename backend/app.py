import os
import queue
import threading
import time
import logging
import urllib.request
import urllib.parse
import json as _json

from flask import Flask, request, jsonify
from flask_cors import CORS

import jarvis_core

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

_wake_queue    = queue.Queue()
_accion_queue  = queue.Queue()   # acciones para el frontend (abrir_noticias, etc.)
_wake_detector = None
_wake_activo   = False
_ultimo_wake   = 0
_jarvis_pausado = False
WAKE_COOLDOWN  = 4.0


def _on_wake(fuente: str):
    global _ultimo_wake
    ahora = time.time()
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
        _wake_detector = WakeWordDetector(
            callback=_on_wake,
        )
        _wake_detector.start()
        _wake_activo = True
        logger.info("Wake word detector activo (Azure Speech loop)")
    except Exception as e:
        logger.error(f"No se pudo iniciar el wake detector: {e}")


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.route("/api/wake-poll")
def api_wake_poll():
    global _jarvis_pausado
    try:
        fuente = _wake_queue.get_nowait()
        if _jarvis_pausado:
            _jarvis_pausado = False
            if _wake_detector:
                _wake_detector.reanudar()
            logger.info("Jarvis reactivado por wake word")
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

    texto_limpio = texto.strip().rstrip(".").lower()
    if texto_limpio in ("jarvis", "jarvi", "jarbes", "harvis"):
        logger.info("Ignorando 'jarvis' como comando (era la wake word)")
        _ultimo_wake = time.time()
        return jsonify({"texto": "", "ok": False, "mensaje": "Wake word ignorada como comando"})

    return jsonify({"texto": texto, "ok": True})


@app.route("/api/comando", methods=["POST"])
def api_comando():
    global _jarvis_pausado
    data    = request.get_json(force=True) or {}
    comando = data.get("comando", "")
    hablar  = data.get("hablar", True)
    if not comando:
        return jsonify({"error": "Falta comando"}), 400

    resultado = jarvis_core.procesar_comando(comando)

    if resultado.get("accion") == "pausar":
        _jarvis_pausado = True
        if _wake_detector:
            _wake_detector.pausar()
    elif resultado.get("accion") == "reanudar":
        _jarvis_pausado = False
        if _wake_detector:
            _wake_detector.reanudar()
    elif resultado.get("accion") == "abrir_noticias":
        _accion_queue.put("abrir_noticias")
        # Responder inmediatamente sin esperar que Flask hable
        # para que el frontend abra el panel sin delay
        threading.Thread(
            target=lambda: jarvis_core.hablar(resultado["respuesta"]),
            daemon=True
        ).start()
        return jsonify(resultado)

    if hablar:
        if _wake_detector and resultado.get("accion") not in ("pausar", "reanudar"):
            _wake_detector.pausar()
        try:
            jarvis_core.hablar(resultado["respuesta"])
        finally:
            if _wake_detector and resultado.get("accion") != "pausar":
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
        "metodos": ["jarvis"] if _wake_activo else [],
    })


@app.route("/api/estado")
def api_estado():
    return jsonify({"pausado": _jarvis_pausado})


@app.route("/api/accion-poll")
def api_accion_poll():
    """El frontend consulta esto para saber si debe ejecutar una acción de UI."""
    try:
        accion = _accion_queue.get_nowait()
        return jsonify({"accion": accion})
    except queue.Empty:
        return jsonify({"accion": None})


# ── Noticias ───────────────────────────────────────────────────────────────

@app.route("/api/noticias")
def api_noticias():
    """Obtiene noticias de tecnología e IA via NewsAPI."""
    api_key   = os.getenv("NEWS_API_KEY", "")
    categoria = request.args.get("categoria", "tecnologia")

    queries = {
        "tecnologia":     "tecnologia OR inteligencia artificial OR software",
        "ia":             "inteligencia artificial OR machine learning OR ChatGPT OR AI",
        "ciberseguridad": "ciberseguridad OR hacking OR cybersecurity",
        "programacion":   "programacion OR Python OR JavaScript OR desarrollador",
    }

    if not api_key:
        return jsonify({"error": "Falta NEWS_API_KEY en .env", "noticias": []})

    try:
        q   = urllib.parse.quote(queries.get(categoria, queries["tecnologia"]))
        url = (
            f"https://newsapi.org/v2/everything"
            f"?q={q}"
            f"&language=es"
            f"&sortBy=publishedAt"
            f"&pageSize=12"
            f"&apiKey={api_key}"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "Jarvis/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = _json.loads(resp.read())

        noticias = []
        for art in data.get("articles", []):
            if art.get("title") and art.get("title") != "[Removed]":
                noticias.append({
                    "titulo":      art.get("title", ""),
                    "descripcion": art.get("description", "") or "",
                    "fuente":      art.get("source", {}).get("name", ""),
                    "url":         art.get("url", ""),
                    "imagen":      art.get("urlToImage", ""),
                    "fecha":       art.get("publishedAt", ""),
                })

        return jsonify({"noticias": noticias, "total": len(noticias)})

    except Exception as e:
        logger.error(f"Error obteniendo noticias: {e}")
        return jsonify({"error": str(e), "noticias": []})


# ── Arranque ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    threading.Thread(target=iniciar_wake_detector, daemon=True).start()
    print("🤖 Jarvis backend corriendo en http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)