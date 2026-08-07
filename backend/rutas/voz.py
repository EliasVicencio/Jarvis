"""Rutas de voz: wake word, procesamiento de comandos (texto y audio), saludo inicial,
y estado general del sistema (pausado/activo)."""
import os
import time
import queue
import logging
import tempfile
from datetime import datetime
from flask import Blueprint, request, jsonify
from pydub import AudioSegment
import jarvis_core
import estado_compartido as estado

logger = logging.getLogger("app")
bp = Blueprint("voz", __name__)


@bp.route("/api/wake-poll")
def api_wake_poll():
    resultado = {"activado": False, "fuente": None, "aviso_proactivo": None}

    try:
        fuente = estado.wake_queue.get_nowait()
        if estado.jarvis_pausado:
            estado.jarvis_pausado = False
            if estado.wake_detector:
                estado.wake_detector.reanudar()
            logger.info("Saturday reactivado por wake word")
        resultado["activado"] = True
        resultado["fuente"] = fuente
    except queue.Empty:
        pass

    try:
        resultado["aviso_proactivo"] = jarvis_core._avisos_proactivos.get_nowait()
        resultado["audio_base64"] = estado.generar_audio_base64(resultado["aviso_proactivo"])
    except queue.Empty:
        pass

    return jsonify(resultado)


@bp.route("/api/escuchar", methods=["POST"])
def api_escuchar():
    if estado.wake_detector:
        estado.wake_detector.pausar()
    try:
        texto = jarvis_core.reconocer_voz()
    finally:
        if estado.wake_detector:
            estado.wake_detector.reanudar()

    if not texto:
        return jsonify({"texto": "", "ok": False})

    texto_limpio = texto.strip().rstrip(".").lower()
    if texto_limpio in ("jarvis", "jarvi", "jarbes", "harvis"):
        logger.info("Ignorando 'jarvis' como comando (era la wake word)")
        estado.ultimo_wake = time.time()
        return jsonify({"texto": "", "ok": False, "mensaje": "Wake word ignorada como comando"})

    return jsonify({"texto": texto, "ok": True})


@bp.route("/api/comando", methods=["POST"])
def api_comando():
    ip = request.headers.get("X-Real-IP", request.remote_addr)
    if jarvis_core.esta_en_modo_seguro():
        return jsonify({"error": "Modo seguro activo"}), 503
    if estado.rate_limited(ip):
        return jsonify({"error": "Demasiadas solicitudes, espera un momento"}), 429
    data    = request.get_json(force=True) or {}
    comando = data.get("comando", "")
    if not comando:
        return jsonify({"error": "Falta comando"}), 400
    if len(comando) > 500:
        return jsonify({"error": "Comando demasiado largo"}), 400

    resultado = jarvis_core.procesar_comando(comando)

    # Si el comando local no lo reconoce, preguntar a Groq
    if resultado.get("accion") == "desconocido":
        groq_resp = jarvis_core.preguntar_llm(comando)
        if groq_resp:
            resultado = {"respuesta": groq_resp, "accion": "groq", "continuar": True}

    if resultado.get("accion") == "pausar":
        estado.jarvis_pausado = True
        if estado.wake_detector:
            estado.wake_detector.pausar()
    elif resultado.get("accion") == "reanudar":
        estado.jarvis_pausado = False
        if estado.wake_detector:
            estado.wake_detector.reanudar()
    elif resultado.get("accion") == "cambiar_canal":
        estado.accion_queue.put(f"cambiar_canal:{resultado.get('dato', '')}")
        resultado["audio_base64"] = estado.generar_audio_base64(resultado["respuesta"])
        return jsonify(resultado)
    elif resultado.get("accion") in ("abrir_noticias", "abrir_mapa", "abrir_stark_ops"):
        estado.accion_queue.put(resultado["accion"])
        resultado["audio_base64"] = estado.generar_audio_base64(resultado["respuesta"])
        return jsonify(resultado)

    respuesta_texto = resultado.get("respuesta", "")
    if respuesta_texto:
        resultado["audio_base64"] = estado.generar_audio_base64(respuesta_texto)
        estado.reenviar_a_telegram_async(comando, respuesta_texto, resultado["audio_base64"])

    jarvis_core.agregar_historial(comando, respuesta_texto, resultado.get("accion"), fuente="texto")
    return jsonify(resultado)


@bp.route("/api/voice-comando", methods=["POST"])
def api_voice_comando():
    """
    Recibe un audio grabado en el navegador, lo transcribe, procesa el comando,
    genera la respuesta en voz, la reenvía a Telegram, y devuelve el audio
    en base64 para reproducirlo también en la web.
    """
    ip = request.headers.get("X-Real-IP", request.remote_addr)
    if jarvis_core.esta_en_modo_seguro():
        return jsonify({"ok": False, "error": "Modo seguro activo"}), 503
    if estado.rate_limited(ip):
        return jsonify({"ok": False, "error": "Demasiadas solicitudes, espera un momento"}), 429

    if "audio" not in request.files:
        return jsonify({"ok": False, "error": "Falta el archivo de audio"}), 400

    audio_file = request.files["audio"]
    tmp_dir = tempfile.gettempdir()
    ts = int(time.time() * 1000)
    entrada_path = os.path.join(tmp_dir, f"jarvis_in_{ts}.webm")
    wav_path     = os.path.join(tmp_dir, f"jarvis_in_{ts}.wav")
    audio_file.save(entrada_path)

    try:
        try:
            audio = AudioSegment.from_file(entrada_path)
            audio.export(wav_path, format="wav")
        except Exception as e:
            logger.error(f"Error convirtiendo audio: {e}")
            return jsonify({"ok": False, "error": "No se pudo procesar el audio"}), 500

        texto = jarvis_core.transcribir_archivo(wav_path)
        if not texto:
            return jsonify({"ok": False, "error": "No se entendió el audio"})

        texto_limpio = texto.strip().rstrip(".").lower()
        if texto_limpio in ("jarvis", "jarvi", "jarbes", "harvis"):
            return jsonify({"ok": False, "mensaje": "Wake word ignorada como comando"})

        resultado = jarvis_core.procesar_comando(texto)

        if resultado.get("accion") == "desconocido":
            groq_resp = jarvis_core.preguntar_llm(texto)
            if groq_resp:
                resultado = {"respuesta": groq_resp, "accion": "groq", "continuar": True}

        if resultado.get("accion") == "pausar":
            estado.jarvis_pausado = True
        elif resultado.get("accion") == "reanudar":
            estado.jarvis_pausado = False

        respuesta_texto = resultado.get("respuesta", "")
        resultado["ok"] = True
        resultado["texto_usuario"] = texto
        resultado["audio_base64"] = estado.generar_audio_base64(respuesta_texto)
        estado.reenviar_a_telegram_async(texto, respuesta_texto, resultado["audio_base64"], prefijo="🎙️ Tú (voz web)")

        jarvis_core.agregar_historial(texto, respuesta_texto, resultado.get("accion"), fuente="voz")
        return jsonify(resultado)

    finally:
        for p in (entrada_path, wav_path):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass


@bp.route("/api/hablar", methods=["POST"])
def api_hablar():
    data  = request.get_json(force=True) or {}
    texto = data.get("texto", "")
    if not texto:
        return jsonify({"error": "Falta texto"}), 400
    if estado.wake_detector:
        estado.wake_detector.pausar()
    try:
        jarvis_core.hablar(texto)
    finally:
        if estado.wake_detector:
            estado.wake_detector.reanudar()
    return jsonify({"ok": True})


@bp.route("/api/saludo")
def api_saludo():
    """Saludo que se dispara una vez al abrir la app (ver App.jsx). Menciona correos sin
    leer solo si EMAIL_USER/EMAIL_PASS están configurados."""
    hora = datetime.now().hour
    if hora < 12:
        saludo_base = "Buenos días"
    elif hora < 19:
        saludo_base = "Buenas tardes"
    else:
        saludo_base = "Buenas noches"

    no_leidos = estado.contar_correos_no_leidos()
    if no_leidos:
        extra = "un correo sin leer" if no_leidos == 1 else f"{no_leidos} correos sin leer"
        saludo_texto = f"{saludo_base}, Elías, tienes {extra}. ¿En qué puedo ayudarte?"
    else:
        saludo_texto = f"{saludo_base}, Elías. ¿En qué puedo ayudarte?"

    return jsonify({"saludo": saludo_texto, "audio_base64": estado.generar_audio_base64(saludo_texto)})


@bp.route("/api/wake-status")
def api_wake_status():
    return jsonify({
        "activo": estado.wake_activo,
        "metodos": ["jarvis"] if estado.wake_activo else [],
    })


@bp.route("/api/estado")
def api_estado():
    return jsonify({"pausado": estado.jarvis_pausado})


@bp.route("/api/accion-poll")
def api_accion_poll():
    """El frontend consulta esto para saber si debe ejecutar una acción de UI."""
    try:
        accion = estado.accion_queue.get_nowait()
        return jsonify({"accion": accion})
    except queue.Empty:
        return jsonify({"accion": None})