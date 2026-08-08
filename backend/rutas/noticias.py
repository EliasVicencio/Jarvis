"""Rutas de noticias y YouTube: NewsData.io, análisis de titulares con IA, videos por RSS
(sin API key), búsqueda de canales, y celebración de logros (Stark Ops)."""
import os
import re
import json
import logging
import urllib.request
import urllib.parse
import requests
from flask import Blueprint, request, jsonify
import jarvis_core
import estado_compartido as estado

logger = logging.getLogger("app")
bp = Blueprint("noticias", __name__)


@bp.route("/api/noticias")
def api_noticias():
    """Obtiene noticias de tecnología e IA via NewsData.io."""
    api_key   = os.getenv("NEWS_DATA_API_KEY", "") or os.getenv("NEWS_API_KEY", "")
    categoria = request.args.get("categoria", "tecnologia")

    queries = {
        "tecnologia":     "tecnologia OR inteligencia artificial OR software",
        "ia":             "inteligencia artificial OR machine learning OR ChatGPT OR AI",
        "ciberseguridad": "ciberseguridad OR hacking OR cybersecurity",
        "programacion":   "programacion OR Python OR JavaScript OR desarrollador",
    }

    if not api_key:
        return jsonify({"error": "Falta NEWS_DATA_API_KEY en .env", "noticias": []})

    try:
        q   = urllib.parse.quote(queries.get(categoria, queries["tecnologia"]))
        url = (
            f"https://newsdata.io/api/1/news"
            f"?apikey={api_key}"
            f"&q={q}"
            f"&language=es"
            f"&size=10"
        )
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())

        noticias = []
        for art in data.get("results", []):
            title = art.get("title", "")
            if title and title.lower() != "[removed]":
                img = art.get("image_url", "")
                if isinstance(img, list):
                    img = img[0] if img else ""
                noticias.append({
                    "titulo":      title,
                    "descripcion": art.get("description", "") or "",
                    "fuente":      art.get("source_name", ""),
                    "url":         art.get("link", ""),
                    "imagen":      img,
                    "fecha":       art.get("pubDate", ""),
                })

        return jsonify({"noticias": noticias, "total": len(noticias)})

    except Exception as e:
        logger.error(f"Error obteniendo noticias: {e}")
        return jsonify({"error": str(e), "noticias": []})


@bp.route("/api/noticias-analisis", methods=["POST"])
def api_noticias_analisis():
    """Genera un análisis breve con IA sobre un conjunto de titulares de noticias."""
    data = request.get_json(force=True) or {}
    titulares = data.get("titulares", [])
    if not titulares:
        return jsonify({"analisis": ""})

    lista = "\n".join(f"- {t}" for t in titulares[:10])
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {estado.GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [{
                    "role": "user",
                    "content": (
                        "Eres un analista. Basado en estos titulares recientes, escribe un análisis "
                        "breve (2 párrafos cortos) que conecte los puntos en común, el contexto detrás "
                        "de las noticias, y por qué importan. En español de Chile, prosa conversacional, "
                        "sin markdown, sin listas, sin títulos:\n\n" + lista
                    ),
                }],
                "max_tokens": 400,
            },
            timeout=25,
        )
        resp.raise_for_status()
        texto = resp.json()["choices"][0]["message"]["content"]
        texto = jarvis_core._limpiar_markdown(texto)
        return jsonify({"analisis": texto})
    except Exception as e:
        logger.error(f"Error en análisis de noticias: {e}")
        return jsonify({"analisis": "No pude generar el análisis en este momento."})


@bp.route("/api/celebrar-logro", methods=["POST"])
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


@bp.route("/api/youtube-key", methods=["GET"])
def api_youtube_key():
    """Nunca devuelve la clave real — solo si está configurada, para que el frontend
    sepa si mostrar el aviso 'Sin API key'."""
    return jsonify({"configurada": bool(os.environ.get("YOUTUBE_API_KEY", ""))})


@bp.route("/api/youtube-videos")
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


@bp.route("/api/youtube-buscar-canal")
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