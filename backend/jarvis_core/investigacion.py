"""Diagnóstico de sistemas, investigación profunda con búsqueda web, y traducción."""
import os
import re
import requests
import psutil

GROQ_API_KEY_MEM = os.getenv("GROQ_API_KEY", "")

# ── Utilidades de texto ──────────────────────────────────────────────────────

def _limpiar_markdown(texto):
    """Quita símbolos de Markdown (headers, negritas, listas, código) que a veces
    devuelven los modelos, para que el texto se lea bien hablado o en la tarjeta."""
    texto = re.sub(r"```.*?```", "", texto, flags=re.DOTALL)   # bloques de código
    texto = re.sub(r"^#{1,6}\s*", "", texto, flags=re.MULTILINE)  # ### Títulos
    texto = re.sub(r"\*\*(.+?)\*\*", r"\1", texto)              # **negrita**
    texto = re.sub(r"__(.+?)__", r"\1", texto)                  # __negrita__
    texto = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", texto)     # *cursiva*
    texto = re.sub(r"^[\s]*[-*•]\s+", "", texto, flags=re.MULTILINE)  # - viñetas
    texto = re.sub(r"^[\s]*\d+\.\s+", "", texto, flags=re.MULTILINE)  # 1. numeradas
    texto = re.sub(r"`(.+?)`", r"\1", texto)                    # `código inline`
    texto = re.sub(r"\n{2,}", " ", texto)                       # colapsar párrafos
    texto = re.sub(r"\n", " ", texto)
    return re.sub(r"\s{2,}", " ", texto).strip()


# ── Diagnóstico de sistemas, investigación profunda y traducción ───────────

GROQ_COMPOUND_MODEL = "groq/compound-mini"

def diagnostico_sistemas():
    """Reporte de estado del servidor, estilo mayordomo alemán reportando el estado de la casa."""
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disco = psutil.disk_usage("/")

        if cpu < 60 and mem.percent < 70 and disco.percent < 85:
            apertura = "Todos los sistemas dentro de parámetros normales."
        elif cpu > 85 or mem.percent > 90:
            apertura = "Aviso: hay sistemas bajo carga considerable."
        else:
            apertura = "Sistemas operativos, con algunos valores a vigilar."

        return (
            f"{apertura} CPU al {cpu:.0f} por ciento, memoria al {mem.percent:.0f} por ciento "
            f"({mem.used // (1024**2)} de {mem.total // (1024**2)} megabytes), "
            f"disco al {disco.percent:.0f} por ciento."
        )
    except Exception as e:
        print(f"⚠ Error en diagnóstico de sistemas: {e}")
        return "No pude generar el diagnóstico de sistemas en este momento."


def investigar_profundo(consulta):
    """Investigación con búsqueda web real, vía el sistema Compound de Groq
    (usa la misma GROQ_API_KEY, sin proveedores ni claves nuevas). Incluye las
    fuentes que el modelo realmente consultó, no solo el resumen."""
    if not GROQ_API_KEY_MEM:
        return "No tengo configurada la clave de Groq para investigar."
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": GROQ_COMPOUND_MODEL,
                "messages": [{
                    "role": "user",
                    "content": (
                        f"Investiga sobre esto y dame un resumen claro y actualizado en español: {consulta}. "
                        "Responde en prosa conversacional de 3-5 frases, directo al punto, sin markdown, "
                        "como si se lo contaras a alguien en voz alta."
                    ),
                }],
                "max_tokens": 500,
            },
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        mensaje = data["choices"][0]["message"]
        texto = _limpiar_markdown(mensaje.get("content", ""))

        # Extraer las fuentes reales que consultó (no inventadas por el modelo)
        dominios = []
        for tool in mensaje.get("executed_tools") or []:
            resultados = tool.get("search_results") or {}
            items = resultados.get("results") if isinstance(resultados, dict) else resultados
            for item in (items or []):
                url = item.get("url") if isinstance(item, dict) else None
                if not url:
                    continue
                dominio = re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
                if dominio and dominio not in dominios:
                    dominios.append(dominio)

        if dominios:
            texto += f" Fuentes consultadas: {', '.join(dominios[:5])}."

        return texto
    except Exception as e:
        print(f"⚠ Error en investigación profunda: {e}")
        return "No pude completar la investigación en este momento."


def traducir_texto(texto, idioma_destino):
    """Traduce un texto usando Groq (modelo rápido, sin búsqueda)."""
    if not GROQ_API_KEY_MEM:
        return "No tengo configurada la clave de Groq para traducir."
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [{
                    "role": "user",
                    "content": (
                        f"Traduce el siguiente texto al {idioma_destino}. Responde solo con la "
                        f"traducción, sin explicaciones ni comillas ni markdown:\n\n{texto}"
                    ),
                }],
                "max_tokens": 500,
                "temperature": 0.3,
            },
            timeout=20,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"⚠ Error traduciendo: {e}")
        return "No pude traducir el texto en este momento."