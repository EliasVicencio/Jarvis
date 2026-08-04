"""Integración con Instagram Graph API: lee posts y métricas, genera captions
con Groq Vision, sugiere ideas de contenido, y publica.

Requiere que la cuenta de Instagram sea profesional (Business/Creator) y esté
vinculada a una Página de Facebook. Como esta app solo maneja tu propia cuenta,
NO requiere Meta App Review — basta con dejar la app en modo desarrollo y ser
tú mismo admin/developer de ella.

Variables de entorno necesarias en backend/.env:
    IG_ACCESS_TOKEN         -> token de acceso de larga duración (Meta Developer App)
    IG_BUSINESS_ACCOUNT_ID  -> ID numérico de tu cuenta de Instagram profesional
"""
import os
import re
import requests

IG_ACCESS_TOKEN = os.getenv("IG_ACCESS_TOKEN", "")
IG_BUSINESS_ACCOUNT_ID = os.getenv("IG_BUSINESS_ACCOUNT_ID", "")
IG_GRAPH_URL = "https://graph.facebook.com/v21.0"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_VISION_MODEL = "qwen/qwen3.6-27b"
GROQ_TEXT_MODEL = "llama-3.1-8b-instant"


def configurado():
    return bool(IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID)


def _limpiar_respuesta(texto):
    texto = re.sub(r"<think>.*?</think>", "", texto, flags=re.DOTALL).strip()
    texto = re.sub(r"\*\*(.+?)\*\*", r"\1", texto)
    texto = re.sub(r"^[\s]*[-*•]\s+", "", texto, flags=re.MULTILINE)
    return texto.strip()


def obtener_posts_recientes(limite=12):
    """Trae los últimos posts publicados con sus métricas básicas."""
    if not configurado():
        return []
    try:
        resp = requests.get(
            f"{IG_GRAPH_URL}/{IG_BUSINESS_ACCOUNT_ID}/media",
            params={
                "fields": "caption,like_count,comments_count,media_type,media_url,thumbnail_url,timestamp,permalink",
                "limit": limite,
                "access_token": IG_ACCESS_TOKEN,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("data", [])
    except Exception as e:
        print(f"⚠ Error obteniendo posts de Instagram: {e}")
        return []


def _contexto_rendimiento():
    """Resume en texto qué contenido ha funcionado mejor, como contexto para el modelo."""
    posts = obtener_posts_recientes()
    if not posts:
        return ""
    posts_ordenados = sorted(posts, key=lambda p: p.get("like_count", 0), reverse=True)
    lineas = []
    for p in posts_ordenados[:6]:
        caption = (p.get("caption") or "sin caption").replace("\n", " ")[:120]
        lineas.append(f"- \"{caption}\" -> {p.get('like_count', 0)} likes, {p.get('comments_count', 0)} comentarios")
    return "Posts recientes y cómo les fue (de mejor a peor desempeño):\n" + "\n".join(lineas)


def generar_caption(imagen_base64, indicacion=None):
    """Analiza una imagen y genera un caption + hashtags para Instagram."""
    if not GROQ_API_KEY:
        return {"caption": "", "hashtags": [], "error": "Falta GROQ_API_KEY"}

    if not imagen_base64.startswith("data:"):
        imagen_base64 = f"data:image/jpeg;base64,{imagen_base64}"

    contexto = _contexto_rendimiento()
    prompt = (
        "Eres un community manager experto para una cuenta de Instagram empresarial. "
        "Mira esta imagen (probablemente un producto o algo del negocio) y escribe un "
        "caption atractivo en español de Chile, cercano pero profesional, de 2-4 frases. "
        "Después del caption, en una línea nueva y separada, agrega entre 5 y 10 hashtags "
        "relevantes en minúscula separados por espacio.\n\n"
        + (f"Instrucción del dueño de la cuenta: {indicacion}\n\n" if indicacion else "")
        + (contexto + "\n\n" if contexto else "")
        + "Responde solo con el caption y los hashtags, nada más, sin markdown ni explicaciones."
    )

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_VISION_MODEL,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": imagen_base64}},
                    ],
                }],
                "max_tokens": 500,
                "reasoning_effort": "none",
            },
            timeout=30,
        )
        resp.raise_for_status()
        texto = _limpiar_respuesta(resp.json()["choices"][0]["message"]["content"])
        partes = [l for l in texto.split("\n") if l.strip()]
        hashtags_linea = next((l for l in reversed(partes) if l.strip().startswith("#")), "")
        caption = texto.replace(hashtags_linea, "").strip()
        hashtags = re.findall(r"#\w+", hashtags_linea)
        return {"caption": caption, "hashtags": hashtags}
    except Exception as e:
        print(f"⚠ Error generando caption con Groq: {e}")
        return {"caption": "", "hashtags": [], "error": str(e)}


def sugerir_ideas_contenido():
    """Genera ideas de próximos posts basadas en el rendimiento histórico."""
    if not GROQ_API_KEY:
        return "Falta configurar GROQ_API_KEY."
    contexto = _contexto_rendimiento()
    if not contexto:
        return "Aún no tengo datos de tus posts. Revisa que IG_ACCESS_TOKEN e IG_BUSINESS_ACCOUNT_ID estén configurados."

    prompt = (
        "Eres un community manager experto. Basado en el rendimiento de estos posts:\n\n"
        + contexto +
        "\n\nSugiere 4 ideas concretas de próximos posts para esta cuenta (qué mostrar, "
        "qué ángulo, por qué crees que funcionaría). Responde en prosa conversacional, "
        "sin markdown ni listas — como si se lo contaras a alguien en voz alta."
    )
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": GROQ_TEXT_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 600,
                "temperature": 0.9,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return _limpiar_respuesta(resp.json()["choices"][0]["message"]["content"])
    except Exception as e:
        print(f"⚠ Error generando sugerencias: {e}")
        return "No pude generar sugerencias en este momento."


def publicar_post(imagen_url, caption):
    """Publica una imagen en el feed de Instagram. imagen_url debe ser una URL
    pública (accesible por Meta desde internet), no base64 ni una ruta local."""
    if not configurado():
        return {"ok": False, "error": "Falta configurar IG_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID en .env"}
    try:
        r1 = requests.post(
            f"{IG_GRAPH_URL}/{IG_BUSINESS_ACCOUNT_ID}/media",
            data={"image_url": imagen_url, "caption": caption, "access_token": IG_ACCESS_TOKEN},
            timeout=30,
        )
        r1.raise_for_status()
        contenedor_id = r1.json()["id"]

        r2 = requests.post(
            f"{IG_GRAPH_URL}/{IG_BUSINESS_ACCOUNT_ID}/media_publish",
            data={"creation_id": contenedor_id, "access_token": IG_ACCESS_TOKEN},
            timeout=30,
        )
        r2.raise_for_status()
        return {"ok": True, "media_id": r2.json()["id"]}
    except Exception as e:
        print(f"⚠ Error publicando en Instagram: {e}")
        return {"ok": False, "error": str(e)}