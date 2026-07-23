import os
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

from flask import Flask, request, jsonify
import imaplib, email as emaillib
from email.header import decode_header
from datetime import datetime
from flask_cors import CORS
from dotenv import load_dotenv
load_dotenv()
import jarvis_core
import requests
import subprocess
from pydub import AudioSegment

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


def _reenviar_a_telegram(texto_usuario, respuesta_texto, prefijo="⌨️ Tú (texto)"):
    """Reenvía un comando y su respuesta como nota de voz al chat de Telegram."""
    try:
        jarvis_core.enviar_texto_telegram(f"{prefijo}: {texto_usuario}")
        mp3_path = jarvis_core.generar_audio_mp3(respuesta_texto)
        ogg_path = mp3_path.replace(".mp3", ".ogg")
        AudioSegment.from_file(mp3_path).export(ogg_path, format="ogg", codec="libopus")
        jarvis_core.enviar_voz_telegram(ogg_path, caption=respuesta_texto[:200])
        os.remove(mp3_path)
    except Exception as e:
        logger.error(f"Error reenviando a Telegram: {e}")


@app.route("/api/comando", methods=["POST"])
def api_comando():
    global _jarvis_pausado
    data    = request.get_json(force=True) or {}
    comando = data.get("comando", "")
    hablar  = data.get("hablar", True)
    if not comando:
        return jsonify({"error": "Falta comando"}), 400

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
    elif resultado.get("accion") in ("abrir_noticias", "abrir_mapa"):
        _accion_queue.put(resultado["accion"])
        resultado["audio_base64"] = _generar_audio_base64(resultado["respuesta"])
        return jsonify(resultado)

    respuesta_texto = resultado.get("respuesta", "")
    if respuesta_texto:
        resultado["audio_base64"] = _generar_audio_base64(respuesta_texto)
        _reenviar_a_telegram(comando, respuesta_texto)

    return jsonify(resultado)


@app.route("/api/voice-comando", methods=["POST"])
def api_voice_comando():
    """
    Recibe un audio grabado en el navegador, lo transcribe, procesa el comando,
    genera la respuesta en voz, la reenvía a Telegram, y devuelve el audio
    en base64 para reproducirlo también en la web.
    """
    global _jarvis_pausado

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
        _reenviar_a_telegram(texto, respuesta_texto, prefijo="🎙️ Tú (voz web)")

        return jsonify(resultado)

    finally:
        for p in (entrada_path, wav_path):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass


@app.route("/api/subtitulos")
def api_subtitulos():
    """Extrae subtítulos de YouTube via yt-dlp y los traduce al español."""
    video_id = request.args.get("id", "")
    if not video_id:
        return jsonify({"error": "Falta id", "subtitulos": []})
    try:
        import yt_dlp
        # Idiomas a intentar: español primero, luego inglés
        ydl_opts = {
            "skip_download": True,
            "writeautomaticsub": True,
            "writesubtitles": True,
            "subtitleslangs": ["es", "es-419", "en"],
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

        # Obtener subtítulos — preferir español
        auto = info.get("automatic_captions", {})
        subs = info.get("subtitles", {})

        # Elegir idioma
        lang = None
        for l in ["es", "es-419", "en"]:
            if l in subs and subs[l]:
                lang = l; break
        if not lang:
            for l in ["es", "es-419", "en"]:
                if l in auto and auto[l]:
                    lang = l; break

        if not lang:
            return jsonify({"error": "Sin subtítulos disponibles", "subtitulos": []})

        fuente = subs if lang in subs else auto
        # Obtener URL del formato json3
        entry = next((f for f in fuente[lang] if f.get("ext") == "json3"), fuente[lang][0])
        url   = entry["url"]

        import urllib.request as ur
        import json as _json
        req = ur.Request(url, headers={"User-Agent":"Mozilla/5.0"})
        with ur.urlopen(req, timeout=10) as r:
            data = _json.loads(r.read())

        eventos = data.get("events", [])
        lineas  = []
        for e in eventos:
            if not e.get("segs"): continue
            texto = "".join(s.get("utf8","") for s in e["segs"]).strip()
            if texto and texto.strip():
                lineas.append({"t": e.get("tStartMs",0), "texto": texto})

        # Traducir al español si está en inglés
        if lang.startswith("en") and lineas:
            try:
                import urllib.parse
                textos = [l["texto"] for l in lineas]
                # Traducir en lotes de 20
                LOTE = 20
                traducidos = []
                for i in range(0, len(textos), LOTE):
                    lote = textos[i:i+LOTE]
                    q = urllib.parse.quote(" ||| ".join(lote))
                    url_t = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q={q}"
                    req_t = ur.Request(url_t, headers={"User-Agent":"Mozilla/5.0"})
                    with ur.urlopen(req_t, timeout=8) as r:
                        d = _json.loads(r.read())
                    traducido = "".join(s[0] for s in d[0] if s[0])
                    partes = traducido.split(" ||| ")
                    traducidos.extend(partes)
                for i, l in enumerate(lineas):
                    l["trad"] = traducidos[i].strip() if i < len(traducidos) else l["texto"]
                    l["orig"] = l["texto"]
                    l["lang"] = "en"
            except Exception as ex:
                logger.error(f"Error traduciendo: {ex}")
                for l in lineas:
                    l["trad"] = l["texto"]
                    l["lang"] = "en"
        else:
            for l in lineas:
                l["trad"] = l["texto"]
                l["lang"] = lang

        return jsonify({"subtitulos": lineas, "lang": lang, "total": len(lineas)})

    except Exception as e:
        logger.error(f"Error subtítulos: {e}")
        return jsonify({"error": str(e), "subtitulos": []})


@app.route("/api/historial")
def api_historial():
    return jsonify({"historial": _historial})

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
        M = imaplib.IMAP4_SSL("imap.gmail.com")
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
        return jsonify({"error": str(e)}), 500


# ── Groq / LLM Integration ─────────────────────────────────────────────────

OPENCLAW_CMD = os.path.join(os.environ.get("APPDATA", ""), "npm", "openclaw.cmd")

if not os.path.exists(OPENCLAW_CMD):
    OPENCLAW_CMD = "openclaw"

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
def _llm_preguntar(pregunta: str) -> str:
    try:
        contexto_mem = jarvis_core.contexto_memoria_para_prompt()
        system_prompt = (
            "Eres JARVIS, el asistente de inteligencia artificial personal de Elías. "
            "Respondes en español de Chile, con un tono cercano, ingenioso y un poco "
            "sarcástico, similar al JARVIS de Iron Man: leal, eficiente, y con un humor "
            "seco ocasional. Nunca digas que eres un modelo de lenguaje de Meta, Llama, "
            "ni menciones tecnicismos sobre tu funcionamiento interno — actúa siempre "
            "como JARVIS. Sé conciso: respuestas de máximo 2-3 frases salvo que te pidan "
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

@app.route("/api/openclaw/preguntar", methods=["POST"])
def api_openclaw_preguntar():
    data = request.get_json(force=True, silent=True) or {}

    pregunta = data.get("pregunta", "")

    if not pregunta:
        return jsonify({"error": "Falta pregunta"}), 400

    # Primero intentar procesador local (hora, fecha, clima, abrir apps, etc.)
    local = jarvis_core.procesar_comando(pregunta)
    if local.get("accion") != "desconocido":
        return jsonify({"respuesta": local.get("respuesta", ""), "ok": True, "accion": local.get("accion"), "dato": local.get("dato")})

    # Fallback a Groq
    respuesta = _llm_preguntar(pregunta)

    if not respuesta:
        return jsonify({"respuesta": "No pude contactar a Groq", "ok": False})

    return jsonify({"respuesta": respuesta, "ok": True})


@app.route("/api/openclaw/estado")
def api_openclaw_estado():
    try:
        result = subprocess.run([OPENCLAW_CMD, "--version"], capture_output=True, text=True, timeout=10)
        disponible = result.returncode == 0
        return jsonify({"disponible": disponible, "version": result.stdout.strip() if disponible else None})
    except FileNotFoundError:
        return jsonify({"disponible": False, "version": None})
    except Exception as e:
        return jsonify({"disponible": False, "version": None, "error": str(e)})


# ── WhatsApp Send ─────────────────────────────────────────────────────────

@app.route("/api/whatsapp/enviar", methods=["POST"])
def api_whatsapp_enviar():
    """Envía un mensaje por WhatsApp a través de OpenClaw."""
    data = request.get_json(force=True) or {}
    numero = data.get("numero", "")
    mensaje = data.get("mensaje", "")

    if not numero or not mensaje:
        return jsonify({"error": "Faltan campos: numero, mensaje"}), 400

    try:
        result = subprocess.run(
            [OPENCLAW_CMD, "message", "send",
             "--channel", "whatsapp",
             "--target", numero,
             "--message", mensaje],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            logger.info(f"WhatsApp enviado a {numero}")
            return jsonify({"ok": True, "mensaje": f"Mensaje enviado a {numero}"})
        else:
            logger.error(f"Error WhatsApp: {result.stderr}")
            return jsonify({"error": result.stderr.strip() or "Error enviando mensaje"}), 500
    except Exception as e:
        logger.error(f"Error WhatsApp: {e}")
        return jsonify({"error": str(e)}), 500

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

@app.route("/api/deploy", methods=["POST"])
def api_deploy():
    """Acepta un ZIP del frontend build y lo extrae en dist/."""
    if "file" not in request.files:
        return jsonify({"error": "No se recibió archivo"}), 400
    file = request.files["file"]
    if file.filename == "" or not file.filename.endswith(".zip"):
        return jsonify({"error": "Debe ser un archivo .zip"}), 400
    try:
        z = zipfile.ZipFile(io.BytesIO(file.read()))
        if os.path.exists(FRONTEND_DIST):
            shutil.rmtree(FRONTEND_DIST)
        os.makedirs(FRONTEND_DIST, exist_ok=True)
        z.extractall(FRONTEND_DIST)
        logger.info(f"Frontend desplegado: {len(z.namelist())} archivos extraídos")
        return jsonify({"ok": True, "archivos": len(z.namelist())})
    except Exception as e:
        logger.error(f"Error en deploy: {e}")
        return jsonify({"error": str(e)}), 500


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
    threading.Thread(target=iniciar_wake_detector, daemon=True).start()
    _arrancar_telegram_bot()
    print("🤖 Jarvis backend corriendo en http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)
