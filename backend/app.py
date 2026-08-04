import os
import psutil
import queue
import threading
import time
import logging
import urllib.request
import urllib.parse
import json as _json
import sys
import base64
import tempfile
import re
from flask import Flask, request, jsonify
import imaplib, email as emaillib
from email.header import decode_header
from datetime import datetime
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()
import jarvis_core
import instagram_ai
import requests
import subprocess
from pydub import AudioSegment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=["https://jarvis-elias.viewdns.net"])
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB máximo por petición

from collections import defaultdict

_rate_limit_tracker = defaultdict(list)
RATE_LIMIT_MAX = 15
RATE_LIMIT_WINDOW = 60  # segundos

_anomalia_tracker = defaultdict(list)
UMBRAL_ANOMALIA = 3       # veces que debe gatillar el limite
VENTANA_ANOMALIA = 300    # en 5 minutos

def _registrar_anomalia(ip):
    ahora = time.time()
    intentos = _anomalia_tracker[ip]
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

def _rate_limited(ip):
    ahora = time.time()
    intentos = _rate_limit_tracker[ip]
    intentos[:] = [t for t in intentos if ahora - t < RATE_LIMIT_WINDOW]
    if len(intentos) >= RATE_LIMIT_MAX:
        _registrar_anomalia(ip)
        return True
    intentos.append(ahora)
    return False

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
    resultado = {
        "activado": False, "fuente": None,
        "aviso_proactivo": None,
    }

    try:
        fuente = _wake_queue.get_nowait()
        if _jarvis_pausado:
            _jarvis_pausado = False
            if _wake_detector:
                _wake_detector.reanudar()
            logger.info("Jarvis reactivado por wake word")
        resultado["activado"] = True
        resultado["fuente"] = fuente
    except queue.Empty:
        pass

    try:
        resultado["aviso_proactivo"] = jarvis_core._avisos_proactivos.get_nowait()
    except queue.Empty:
        pass

    return jsonify(resultado)

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

def _generar_audio_base64(texto):
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

def _reenviar_a_telegram_async(texto_usuario, respuesta_texto, audio_b64, prefijo="⌨️ Tú (texto)"):
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

@app.route("/api/comando", methods=["POST"])
def api_comando():
    global _jarvis_pausado
    ip = request.headers.get("X-Real-IP", request.remote_addr)
    if jarvis_core.esta_en_modo_seguro():
        return jsonify({"error": "Modo seguro activo"}), 503
    if _rate_limited(ip):
        return jsonify({"error": "Demasiadas solicitudes, espera un momento"}), 429
    data    = request.get_json(force=True) or {}
    comando = data.get("comando", "")
    hablar  = data.get("hablar", True)
    if not comando:
        return jsonify({"error": "Falta comando"}), 400
    if len(comando) > 500:
        return jsonify({"error": "Comando demasiado largo"}), 400

    resultado = jarvis_core.procesar_comando(comando)

    # Si el comando local no lo reconoce, preguntar a Groq
    if resultado.get("accion") == "desconocido":
        groq_resp = _llm_preguntar(comando)
        if groq_resp:
            resultado = {"respuesta": groq_resp, "accion": "groq", "continuar": True}

    if resultado.get("accion") == "pausar":
        _jarvis_pausado = True
        if _wake_detector:
            _wake_detector.pausar()
    elif resultado.get("accion") == "reanudar":
        _jarvis_pausado = False
        if _wake_detector:
            _wake_detector.reanudar()
    elif resultado.get("accion") == "cambiar_canal":
        _accion_queue.put(f"cambiar_canal:{resultado.get('dato', '')}")
        resultado["audio_base64"] = _generar_audio_base64(resultado["respuesta"])
        return jsonify(resultado)
    elif resultado.get("accion") in ("abrir_noticias", "abrir_mapa", "abrir_mission", "abrir_stark_social"):
        _accion_queue.put(resultado["accion"])
        resultado["audio_base64"] = _generar_audio_base64(resultado["respuesta"])
        return jsonify(resultado)

    respuesta_texto = resultado.get("respuesta", "")
    if respuesta_texto:
        resultado["audio_base64"] = _generar_audio_base64(respuesta_texto)
        _reenviar_a_telegram_async(comando, respuesta_texto, resultado["audio_base64"])

    jarvis_core.agregar_historial(comando, respuesta_texto, resultado.get("accion"), fuente="texto")
    return jsonify(resultado)

@app.route("/api/voice-comando", methods=["POST"])
def api_voice_comando():
    """
    Recibe un audio grabado en el navegador, lo transcribe, procesa el comando,
    genera la respuesta en voz, la reenvía a Telegram, y devuelve el audio
    en base64 para reproducirlo también en la web.
    """
    global _jarvis_pausado
    ip = request.headers.get("X-Real-IP", request.remote_addr)
    if jarvis_core.esta_en_modo_seguro():
        return jsonify({"ok": False, "error": "Modo seguro activo"}), 503
    if _rate_limited(ip):
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
            groq_resp = _llm_preguntar(texto)
            if groq_resp:
                resultado = {"respuesta": groq_resp, "accion": "groq", "continuar": True}

        if resultado.get("accion") == "pausar":
            _jarvis_pausado = True
        elif resultado.get("accion") == "reanudar":
            _jarvis_pausado = False

        respuesta_texto = resultado.get("respuesta", "")
        resultado["ok"] = True
        resultado["texto_usuario"] = texto
        resultado["audio_base64"] = _generar_audio_base64(respuesta_texto)
        _reenviar_a_telegram_async(texto, respuesta_texto, resultado["audio_base64"], prefijo="🎙️ Tú (voz web)")

        jarvis_core.agregar_historial(texto, respuesta_texto, resultado.get("accion"), fuente="voz")
        return jsonify(resultado)

    finally:
        for p in (entrada_path, wav_path):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass

@app.route("/api/historial")
def api_historial():
    return jsonify({"historial": jarvis_core.obtener_historial()})

@app.route("/api/memoria")
def api_memoria():
    return jsonify({"memoria": jarvis_core.obtener_memoria()})


@app.route("/api/memoria/<int:indice>", methods=["DELETE"])
def api_memoria_eliminar(indice):
    memorias = jarvis_core.eliminar_memoria(indice)
    return jsonify({"memoria": memorias})

@app.route("/api/emails")
def api_emails():
    user = os.environ.get("EMAIL_USER", "")
    pwd  = os.environ.get("EMAIL_PASS", "")
    if not user or not pwd:
        return jsonify({"error": "Credenciales no configuradas", "emails": []})
    try:
        M = imaplib.IMAP4_SSL("imap.gmail.com", timeout=4)
        M.login(user, pwd)
        M.select("INBOX")
        _, ids = M.search(None, "ALL")
        email_ids = ids[0].split()[-20:]  # últimos 20
        emails = []
        for eid in reversed(email_ids):
            _, data = M.fetch(eid, "(RFC822)")
            msg = emaillib.message_from_bytes(data[0][1])
            asunto_raw = decode_header(msg["Subject"] or "")[0]
            asunto = asunto_raw[0].decode(asunto_raw[1] or "utf-8") if isinstance(asunto_raw[0], bytes) else (asunto_raw[0] or "Sin asunto")
            de_raw = decode_header(msg["From"] or "")[0]
            de = de_raw[0].decode(de_raw[1] or "utf-8") if isinstance(de_raw[0], bytes) else (de_raw[0] or "")
            fecha = msg["Date"] or ""
            message_id = (msg["Message-ID"] or "").strip()
            cuerpo = ""
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() == "text/plain":
                        cuerpo = part.get_payload(decode=True).decode("utf-8", errors="replace")[:2000]
                        break
            else:
                cuerpo = msg.get_payload(decode=True).decode("utf-8", errors="replace")[:2000]
            emails.append({
                "id":         eid.decode(),
                "message_id": message_id,
                "de":         de,
                "asunto":     asunto,
                "preview":    cuerpo[:80].replace("\n"," "),
                "cuerpo":     cuerpo,
                "fecha":      fecha,
                "leido":      False,
            })
        M.logout()
        return jsonify({"emails": emails})
    except Exception as e:
        logger.error(f"Error IMAP: {e}")
        return jsonify({"error": str(e), "emails": []})

@app.route("/api/youtube-key", methods=["GET"])
def api_youtube_key():
    key = os.environ.get("YOUTUBE_API_KEY", "")
    return jsonify({"key": key})

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

@app.route("/api/recordatorios", methods=["POST"])
def api_recordatorios_agregar():
    data = request.get_json(force=True) or {}
    texto = data.get("texto", "")
    recs = jarvis_core.agregar_recordatorio(texto)
    return jsonify({"recordatorios": recs})

@app.route("/api/recordatorios/<int:indice>", methods=["DELETE"])
def api_recordatorios_eliminar(indice):
    recs = jarvis_core.eliminar_recordatorio(indice)
    return jsonify({"recordatorios": recs})

@app.route("/api/notas-rapidas")
def api_notas_rapidas():
    return jsonify({"notas": jarvis_core.obtener_notas()})

@app.route("/api/notas-rapidas/<int:indice>", methods=["DELETE"])
def api_notas_rapidas_eliminar(indice):
    notas = jarvis_core.eliminar_nota(indice)
    return jsonify({"notas": notas})

def _contar_correos_no_leidos():
    user = os.environ.get("EMAIL_USER", "")
    pwd  = os.environ.get("EMAIL_PASS", "")
    if not user or not pwd:
        return None
    try:
        M = imaplib.IMAP4_SSL("imap.gmail.com", timeout=4)
        M.login(user, pwd)
        M.select("INBOX")
        _, data = M.search(None, "UNSEEN")
        M.logout()
        return len(data[0].split()) if data and data[0] else 0
    except Exception as e:
        logger.error(f"Error contando correos no leidos: {e}")
        return None

@app.route("/api/saludo")
def api_saludo():
    hora = datetime.now().hour
    if hora < 12:
        saludo_base = "Buenos días"
    elif hora < 19:
        saludo_base = "Buenas tardes"
    else:
        saludo_base = "Buenas noches"

    recordatorios = jarvis_core.obtener_recordatorios()
    no_leidos = _contar_correos_no_leidos()

    extras = []
    if recordatorios:
        n = len(recordatorios)
        extras.append("tienes un recordatorio pendiente" if n == 1 else f"tienes {n} recordatorios pendientes")
    if no_leidos:
        extras.append("un correo sin leer" if no_leidos == 1 else f"{no_leidos} correos sin leer")

    if extras:
        saludo_texto = f"{saludo_base}, Elías, " + " y ".join(extras) + ". ¿En qué puedo ayudarte?"
    else:
        saludo_texto = f"{saludo_base}, Elías, todo al día. ¿En qué puedo ayudarte?"

    return jsonify({
        "saludo": saludo_texto,
        "audio_base64": _generar_audio_base64(saludo_texto),
        "recordatorios": recordatorios,
        "correos_no_leidos": no_leidos,
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
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
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

# ── Email Send ────────────────────────────────────────────────────────────

@app.route("/api/enviar-email", methods=["POST"])
def api_enviar_email():
    """Envía un email vía SMTP."""
    data = request.get_json(force=True) or {}
    para = data.get("para", "")
    asunto = data.get("asunto", "")
    cuerpo = data.get("cuerpo", "")

    if not para or not asunto or not cuerpo:
        return jsonify({"error": "Faltan campos: para, asunto, cuerpo"}), 400

    user = os.environ.get("EMAIL_USER", "")
    pwd = os.environ.get("EMAIL_PASS", "")

    if not user or not pwd:
        return jsonify({"error": "Credenciales email no configuradas"}), 400

    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg.set_content(cuerpo)
        msg["Subject"] = asunto
        msg["From"] = user
        msg["To"] = para

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(user, pwd)
            smtp.send_message(msg)

        logger.info(f"Email enviado a {para}: {asunto}")
        return jsonify({"ok": True, "mensaje": f"Email enviado a {para}"})
    except Exception as e:
        logger.error(f"Error enviando email: {e}")
        return jsonify({"error": "No se pudo procesar la solicitud"}), 500

# ── Groq / LLM Integration ─────────────────────────────────────────────────

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
def _llm_preguntar(pregunta: str) -> str:
    try:
        contexto_mem = jarvis_core.contexto_memoria_para_prompt()
        system_prompt = (
            "Eres JARVIS, el asistente de inteligencia artificial personal de Elías. "
            "Respondes en español de Chile. Tu personalidad es la del JARVIS de Iron Man: "
            "leal y eficiente, pero con un sarcasmo seco e ingenioso que aparece en casi "
            "toda respuesta — comentarios con doble filo, ironía sutil, alguna pulla "
            "cariñosa hacia Elías cuando la situación lo amerita (una tarea repetida, "
            "una pregunta obvia, una hora rara para pedir algo). El sarcasmo es tu forma "
            "por defecto de hablar, no la excepción: úsalo con naturalidad, sin forzarlo "
            "ni explicarlo, y sin caer en grosería ni en ser desagradable — es ingenio, "
            "no maldad. Nunca digas que eres un modelo de lenguaje de Meta, Llama, ni "
            "menciones tecnicismos sobre tu funcionamiento interno — actúa siempre como "
            "JARVIS. Sé conciso: respuestas de máximo 2-3 frases salvo que te pidan "
            "explícitamente más detalle."
        )
        if contexto_mem:
            system_prompt += "\n\n" + contexto_mem

        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": pregunta}
                ],
                "max_tokens": 1024,
                "temperature": 0.8
            },
            timeout=30
        )

        def _extraer_en_fondo():
            dato = jarvis_core.extraer_memoria_llm(pregunta)
            if dato:
                jarvis_core.agregar_memoria(dato.get("categoria", "OTRO"), dato.get("texto", ""), dato.get("relacion"))
        threading.Thread(target=_extraer_en_fondo, daemon=True).start()

        if resp.ok:
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        logger.error(f"Groq error: {resp.status_code} {resp.text}")
        return ""
    except Exception as e:
        logger.error(f"Error en LLM: {e}")
        return ""

_github_cache = {"data": None, "timestamp": 0}
GITHUB_REPOS = [
    {"nombre": "Jarvis",         "repo": "EliasVicencio/Jarvis"},
    {"nombre": "Hyperion",       "repo": "EliasVicencio/Hyperion"},
    {"nombre": "Dani ISO27001",  "repo": "EliasVicencio19/Dani-ISO27001"},
]

@app.route("/api/github-actividad")
def api_github_actividad():
    ahora = time.time()
    if _github_cache["data"] and (ahora - _github_cache["timestamp"] < 600):
        return jsonify({"proyectos": _github_cache["data"]})

    resultado = []
    for p in GITHUB_REPOS:
        try:
            r = requests.get(
                f"https://api.github.com/repos/{p['repo']}/commits",
                params={"per_page": 1}, timeout=8,
                headers={"Accept": "application/vnd.github+json"}
            )
            if r.ok and r.json():
                commit = r.json()[0]
                resultado.append({
                    "nombre": p["nombre"],
                    "ok": True,
                    "mensaje": commit["commit"]["message"].split("\n")[0][:80],
                    "fecha": commit["commit"]["author"]["date"],
                    "autor": commit["commit"]["author"]["name"],
                })
            else:
                resultado.append({"nombre": p["nombre"], "ok": False, "mensaje": "No disponible"})
        except Exception as e:
            logger.error(f"Error GitHub {p['repo']}: {e}")
            resultado.append({"nombre": p["nombre"], "ok": False, "mensaje": "No disponible"})

    _github_cache["data"] = resultado
    _github_cache["timestamp"] = ahora
    return jsonify({"proyectos": resultado})

@app.route("/api/celebrar-logro", methods=["POST"])
def api_celebrar_logro():
    data = request.get_json(force=True) or {}
    titulo = data.get("titulo", "una tarea")[:100]
    try:
        mensaje = jarvis_core.generar_celebracion(titulo)
        jarvis_core.anunciar_proactivo(mensaje)
        return jsonify({"ok": True})
    except Exception as e:
        logger.error(f"Error celebrando logro: {e}")
        return jsonify({"ok": False})

@app.route("/api/analizar-imagen", methods=["POST"])
def api_analizar_imagen():
    """Analiza una imagen (captura de pantalla desde la web, o foto desde Telegram)
    usando el modelo de visión de Groq."""
    data = request.get_json(force=True) or {}
    imagen_base64 = data.get("imagen_base64", "")
    pregunta = data.get("pregunta")

    if not imagen_base64:
        return jsonify({"error": "Falta imagen_base64"}), 400

    try:
        respuesta = jarvis_core.analizar_imagen(imagen_base64, pregunta)
        audio_b64 = _generar_audio_base64(respuesta)
        jarvis_core.agregar_historial(pregunta or "[imagen]", respuesta, "analizar_imagen", fuente="web")
        return jsonify({"respuesta": respuesta, "audio_base64": audio_b64})
    except Exception as e:
        logger.error(f"Error en analizar-imagen: {e}")
        return jsonify({"error": "No se pudo analizar la imagen"}), 500

# ── Instagram: contenido asistido por IA ────────────────────────────────────

def _guardar_imagen_publica(imagen_base64, prefijo="post"):
    if imagen_base64.startswith("data:"):
        imagen_base64 = imagen_base64.split(",", 1)[1]
    return jarvis_core.guardar_imagen_publica(base64.b64decode(imagen_base64), prefijo)

@app.route("/api/media-ig/<nombre>")
def api_media_ig(nombre):
    from flask import send_from_directory
    return send_from_directory(jarvis_core.IG_MEDIA_DIR, nombre)

@app.route("/api/instagram/preparar-post", methods=["POST"])
def api_instagram_preparar_post():
    data = request.get_json(force=True) or {}
    imagen_base64 = data.get("imagen_base64", "")
    indicacion = data.get("indicacion")
    if not imagen_base64:
        return jsonify({"error": "Falta imagen_base64"}), 400
    try:
        url_publica = _guardar_imagen_publica(imagen_base64)
        draft = instagram_ai.generar_caption(imagen_base64, indicacion)
        caption_completo = draft.get("caption", "")
        if draft.get("hashtags"):
            caption_completo += "\n\n" + " ".join(draft["hashtags"])
        jarvis_core.guardar_post_pendiente(url_publica, caption_completo)
        return jsonify({"imagen_url": url_publica, "caption": caption_completo, "error": draft.get("error")})
    except Exception as e:
        logger.error(f"Error preparando post de Instagram: {e}")
        return jsonify({"error": "No se pudo preparar el post"}), 500

@app.route("/api/instagram/pendiente")
def api_instagram_pendiente():
    return jsonify(jarvis_core.obtener_post_pendiente() or {})

@app.route("/api/instagram/publicar", methods=["POST"])
def api_instagram_publicar():
    data = request.get_json(force=True) or {}
    imagen_url = data.get("imagen_url", "")
    caption = data.get("caption", "")
    if not imagen_url or not caption:
        return jsonify({"error": "Falta imagen_url o caption"}), 400
    resultado = instagram_ai.publicar_post(imagen_url, caption)
    if resultado.get("ok"):
        jarvis_core.borrar_post_pendiente()
    return jsonify(resultado)

@app.route("/api/instagram/descartar", methods=["POST"])
def api_instagram_descartar():
    jarvis_core.borrar_post_pendiente()
    return jsonify({"ok": True})

@app.route("/api/instagram/posts-recientes")
def api_instagram_posts_recientes():
    return jsonify({"posts": instagram_ai.obtener_posts_recientes()})

@app.route("/api/instagram/sugerencias")
def api_instagram_sugerencias():
    return jsonify({"sugerencias": instagram_ai.sugerir_ideas_contenido()})

@app.route("/api/proyectos-estado")
def api_proyectos_estado():
    """Verifica en vivo si Jarvis y Hyperion (frontend/backend) están respondiendo."""
    proyectos = [
        {"nombre": "Jarvis Backend",     "url": "http://127.0.0.1:5000/api/estado"},
        {"nombre": "Hyperion Frontend",  "url": "https://hyperion-core.vercel.app"},
        {"nombre": "Hyperion Backend",   "url": "https://hyperion-pi-nine.vercel.app/health/deep"},
    ]
    resultado = []
    for p in proyectos:
        try:
            r = requests.get(p["url"], timeout=5)
            ok = r.status_code < 500
        except Exception:
            ok = False
        resultado.append({"nombre": p["nombre"], "ok": ok})
    return jsonify({"proyectos": resultado})

# ── Deploy Frontend ──────────────────────────────────────────────────────────

import zipfile
import io
import shutil

FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")

@app.route("/api/youtube-videos")
def api_youtube_videos():
    """Obtiene los últimos videos de un canal via el RSS público de YouTube (sin API key)."""
    channel_id = request.args.get("channel_id", "")
    if not channel_id:
        return jsonify({"error": "Falta channel_id", "videos": []})
    try:
        import xml.etree.ElementTree as ET
        url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            xml_data = r.read()

        ns = {
            "atom": "http://www.w3.org/2005/Atom",
            "yt": "http://www.youtube.com/xml/schemas/2015",
        }
        root = ET.fromstring(xml_data)
        videos = []
        for entry in root.findall("atom:entry", ns):
            video_id = entry.find("yt:videoId", ns)
            title    = entry.find("atom:title", ns)
            published = entry.find("atom:published", ns)
            author   = entry.find("atom:author/atom:name", ns)
            videos.append({
                "id":     video_id.text if video_id is not None else "",
                "titulo": title.text if title is not None else "",
                "canal":  author.text if author is not None else "",
                "fecha":  published.text if published is not None else "",
            })
        return jsonify({"videos": videos[:8]})
    except Exception as e:
        logger.error(f"Error obteniendo videos YouTube RSS: {e}")
        return jsonify({"error": str(e), "videos": []})

@app.route("/api/youtube-buscar-canal")
def api_youtube_buscar_canal():
    """Resuelve el nombre de cualquier canal de YouTube a su ID real, sin API key."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Falta q", "channel_id": None, "nombre": None})
    try:
        url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}&sp=EgIQAg%3D%3D"  # sp filtra solo canales
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        with urllib.request.urlopen(req, timeout=8) as r:
            html = r.read().decode("utf-8", errors="ignore")

        m = re.search(r'"channelId":"(UC[\w-]{22})"', html)
        if not m:
            return jsonify({"error": "Canal no encontrado", "channel_id": None, "nombre": None})
        channel_id = m.group(1)

        nombre_m = re.search(r'"title":\{"simpleText":"([^"]+)"\},"descriptionSnippet"', html)
        nombre = nombre_m.group(1) if nombre_m else query

        return jsonify({"channel_id": channel_id, "nombre": nombre})
    except Exception as e:
        logger.error(f"Error buscando canal: {e}")
        return jsonify({"error": str(e), "channel_id": None, "nombre": None})

# ── Telegram Bot (proceso separado) ─────────────────────────────────────────

_telegram_process = None

def _arrancar_telegram_bot():
    import subprocess
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
    print("🤖 Jarvis backend corriendo en http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)