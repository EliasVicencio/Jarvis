"""Memoria semántica (contexto persistente sobre Elías) e historial de comandos."""
import logging
import os
import json
import datetime
import requests


logger = logging.getLogger(__name__)
GROQ_API_KEY_MEM = os.getenv("GROQ_API_KEY", "")
HISTORIAL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "historial.json")
HISTORIAL_MAX = 15
MEMORIA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memoria_semantica.json")
MEMORIA_MAX = 300

def obtener_memoria():
    if os.path.exists(MEMORIA_PATH):
        try:
            with open(MEMORIA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def agregar_memoria(categoria, texto, relacion=None):
    memorias = obtener_memoria()
    texto_norm = (texto or "").strip().lower()
    if not texto_norm:
        return memorias
    if any(m.get("texto", "").strip().lower() == texto_norm for m in memorias):
        return memorias  # ya existe, evitar duplicados
    memorias.append({
        "categoria": categoria or "OTRO",
        "texto": texto.strip(),
        "relacion": relacion,
        "fecha": datetime.datetime.now().isoformat(),
    })
    memorias = memorias[-MEMORIA_MAX:]
    with open(MEMORIA_PATH, "w", encoding="utf-8") as f:
        json.dump(memorias, f, ensure_ascii=False, indent=2)
    return memorias

def eliminar_memoria(indice):
    memorias = obtener_memoria()
    if 0 <= indice < len(memorias):
        memorias.pop(indice)
        with open(MEMORIA_PATH, "w", encoding="utf-8") as f:
            json.dump(memorias, f, ensure_ascii=False, indent=2)
    return memorias

def contexto_memoria_para_prompt(limite=25):
    """Arma un resumen de la memoria guardada para inyectarlo en el system prompt de Groq."""
    memorias = obtener_memoria()[-limite:]
    if not memorias:
        return ""
    lineas = [f"- {m['texto']}" for m in memorias]
    return "Datos que ya sabes sobre Elías (úsalos si son relevantes para responder):\n" + "\n".join(lineas)

_FRASES_META_MEMORIA = (
    "qué sabes de mí", "que sabes de mi", "qué sabes sobre mí", "que sabes sobre mi",
    "recuerdas algo de mí", "recuerdas algo de mi", "qué recuerdas de mí", "que recuerdas de mi",
    "qué tienes guardado", "que tienes guardado", "borra tu memoria", "olvida lo que sabes",
)

def extraer_memoria_llm(mensaje_usuario):
    """Le pregunta a Groq si el mensaje trae un dato personal NUEVO y concreto, digno de recordar."""
    if not GROQ_API_KEY_MEM:
        return None

    texto_lower = mensaje_usuario.strip().lower()
    # No extraer nada de preguntas que son sobre la memoria misma (evita ruido/basura)
    if any(frase in texto_lower for frase in _FRASES_META_MEMORIA):
        return None
    # Mensajes muy cortos casi nunca traen un dato nuevo digno de guardar
    if len(mensaje_usuario.strip()) < 8:
        return None

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [
                    {"role": "system", "content": (
                        "Tu única tarea es decidir si el mensaje del usuario contiene un HECHO "
                        "PERSONAL CONCRETO y NUEVO, digno de recordar a largo plazo: su nombre, una "
                        "preferencia real (gusto, comida, música), dónde vive o trabaja, un proyecto "
                        "en el que trabaja, una relación (familiar, mascota), o un dato de contexto "
                        "claramente útil.\n"
                        "NO extraigas nada de: saludos, preguntas casuales, preguntas sobre el clima "
                        "o la hora, preguntas dirigidas a ti mismo (SATURDAY), charla genérica sin "
                        "información nueva, ni de mensajes ambiguos donde no haya un hecho explícito.\n"
                        "Ante cualquier duda, responde NADA — es preferible no guardar algo a guardar "
                        "basura o inventar contenido que el usuario no dijo explícitamente.\n"
                        "Si NO hay nada digno de recordar, responde exactamente: NADA\n"
                        "Si SÍ hay algo, responde SOLO con un JSON válido de una línea, sin texto "
                        "adicional ni markdown, con esta forma exacta: "
                        '{"categoria":"TAREA|LUGAR|ARCHIVO|CONTEXTO|CLIMA|OTRO","texto":"resumen breve, literal y verificable en tercera persona","relacion":null}'
                    )},
                    {"role": "user", "content": mensaje_usuario}
                ],
                "max_tokens": 150,
                "temperature": 0.1
            },
            timeout=15
        )
        if not resp.ok:
            return None
        contenido = resp.json()["choices"][0]["message"]["content"].strip()
        if contenido.upper().startswith("NADA"):
            return None
        contenido = contenido.strip("`").strip()
        if contenido.lower().startswith("json"):
            contenido = contenido[4:].strip()
        dato = json.loads(contenido)
        if not dato.get("texto"):
            return None
        if dato.get("categoria") not in ("TAREA", "LUGAR", "ARCHIVO", "CONTEXTO", "CLIMA", "OTRO"):
            dato["categoria"] = "OTRO"
        return dato
    except Exception as e:
        logger.error(f"⚠ Error extrayendo memoria: {e}")
        return None

def obtener_historial():
    if os.path.exists(HISTORIAL_PATH):
        try:
            with open(HISTORIAL_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def agregar_historial(comando, respuesta, accion=None, fuente=None):
    historial = obtener_historial()
    historial.append({
        "comando": comando,
        "respuesta": (respuesta or "")[:300],
        "accion": accion,
        "fuente": fuente,
        "fecha": datetime.datetime.now().isoformat(),
    })
    historial = historial[-HISTORIAL_MAX:]
    with open(HISTORIAL_PATH, "w", encoding="utf-8") as f:
        json.dump(historial, f, ensure_ascii=False, indent=2)
    return historial