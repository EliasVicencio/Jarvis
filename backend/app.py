"""
app.py — Servidor Flask para Jarvis.

Expone una API REST que el frontend de React consume:

  POST /api/escuchar     -> graba del micrófono del SERVIDOR y devuelve el texto
  POST /api/comando      -> recibe un texto y devuelve la respuesta procesada
  POST /api/hablar       -> recibe un texto y lo reproduce por el parlante del SERVIDOR
  GET  /api/recordatorios -> devuelve la lista de recordatorios guardados

NOTA IMPORTANTE sobre el micrófono:
Azure Speech SDK usa el micrófono y parlantes de la máquina donde corre este
servidor Python (no el navegador). Esto funciona perfecto en uso local
(tu propio computador). Si en el futuro quieres desplegar esto en un servidor
remoto, habría que cambiar a reconocimiento de voz desde el navegador
(Web Speech API) y enviar el audio al backend.

Para correr:
  cd backend
  pip install -r requirements.txt
  python app.py

Luego abre el frontend (ver README) o, si ya compilaste el build de React,
Flask lo sirve automáticamente en http://localhost:5000
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

import jarvis_core

FRONTEND_BUILD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "frontend", "build"
)

app = Flask(__name__, static_folder=FRONTEND_BUILD_DIR, static_url_path="")
CORS(app)  # Permite que React (en otro puerto durante desarrollo) llame a esta API


@app.route("/api/escuchar", methods=["POST"])
def api_escuchar():
    """Escucha el micrófono y devuelve el texto reconocido."""
    texto = jarvis_core.reconocer_voz()
    if not texto:
        return jsonify({"texto": "", "ok": False, "mensaje": "No se entendió nada"})
    return jsonify({"texto": texto, "ok": True})


@app.route("/api/comando", methods=["POST"])
def api_comando():
    """Recibe un comando de texto, lo procesa, y opcionalmente lo dice en voz alta."""
    data = request.get_json(force=True) or {}
    comando = data.get("comando", "")
    hablar_respuesta = data.get("hablar", True)

    if not comando:
        return jsonify({"error": "Falta el campo 'comando'"}), 400

    resultado = jarvis_core.procesar_comando(comando)

    if hablar_respuesta:
        jarvis_core.hablar(resultado["respuesta"])

    return jsonify(resultado)


@app.route("/api/hablar", methods=["POST"])
def api_hablar():
    """Hace que Jarvis diga un texto específico en voz alta."""
    data = request.get_json(force=True) or {}
    texto = data.get("texto", "")
    if not texto:
        return jsonify({"error": "Falta el campo 'texto'"}), 400
    jarvis_core.hablar(texto)
    return jsonify({"ok": True})


@app.route("/api/recordatorios", methods=["GET"])
def api_recordatorios():
    """Devuelve la lista de recordatorios guardados."""
    return jsonify({"recordatorios": jarvis_core.obtener_recordatorios()})


@app.route("/api/saludo", methods=["GET"])
def api_saludo():
    """Saludo inicial + recordatorios pendientes, para mostrar al cargar la app."""
    return jsonify(
        {
            "saludo": "Hola, soy Jarvis. ¿En qué te ayudo?",
            "recordatorios": jarvis_core.obtener_recordatorios(),
        }
    )


# ── Servir el frontend de React ya compilado (build de producción) ─────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def servir_react(path):
    full_path = os.path.join(app.static_folder, path)
    if path and os.path.exists(full_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    print("🤖 Jarvis backend corriendo en http://localhost:5000")
    app.run(debug=True, port=5000)
