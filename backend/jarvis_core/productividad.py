"""Notas rápidas, recordatorios, resumen del día, modo seguro y Pomodoro."""
import os
import re
import json
import time
import threading
import datetime
import requests

from .proactividad import anunciar_proactivo
from .memoria import obtener_historial

GROQ_API_KEY_MEM = os.getenv("GROQ_API_KEY", "")
RECORDATORIOS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "recordatorios.txt")
_pomodoro_estado = {"activo": False}

NOTAS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "notas_rapidas.json")

def obtener_notas():
    if os.path.exists(NOTAS_PATH):
        try:
            with open(NOTAS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def agregar_nota(texto):
    notas = obtener_notas()
    notas.append({"texto": texto.strip(), "fecha": datetime.datetime.now().isoformat()})
    notas = notas[-200:]
    with open(NOTAS_PATH, "w", encoding="utf-8") as f:
        json.dump(notas, f, ensure_ascii=False, indent=2)
    return notas

def eliminar_nota(indice):
    notas = obtener_notas()
    if 0 <= indice < len(notas):
        notas.pop(indice)
        with open(NOTAS_PATH, "w", encoding="utf-8") as f:
            json.dump(notas, f, ensure_ascii=False, indent=2)
    return notas

def resumen_del_dia():
    """Resumen hablado de la actividad de hoy, usando el historial y las notas."""
    hoy = datetime.datetime.now().date().isoformat()
    comandos_hoy = [h for h in obtener_historial() if h.get("fecha", "").startswith(hoy)]
    notas_hoy = [n for n in obtener_notas() if n.get("fecha", "").startswith(hoy)]

    n_comandos = len(comandos_hoy)
    if n_comandos == 0:
        return "Todavía no hemos interactuado hoy, señor."

    vez_txt = "vez" if n_comandos == 1 else "veces"
    partes = [f"Hoy me usaste {n_comandos} {vez_txt}."]

    if notas_hoy:
        n = len(notas_hoy)
        partes.append(f"Agregaste {n} nota{'s' if n != 1 else ''} rápida{'s' if n != 1 else ''}.")

    partes.append("Buen trabajo hoy.")
    return " ".join(partes)

def generar_celebracion(titulo):
    """Genera un mensaje corto de felicitación cuando se completa una tarea."""
    if GROQ_API_KEY_MEM:
        try:
            resp = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
                json={
                    "model": "openai/gpt-oss-20b",
                    "reasoning_effort": "low",
                    "messages": [
                        {"role": "system", "content": (
                            "Eres SATURDAY, el asistente de Elías. Él acaba de completar una tarea. "
                            "Felicítalo con una frase corta, genuina y con personalidad (no genérica), "
                            "estilo un mayordomo alemán que refunfuña con cariño reconociendo el trabajo de Tony. Máximo 1-2 frases."
                        )},
                        {"role": "user", "content": f"Completé: {titulo}"}
                    ],
                    "max_tokens": 80,
                    "temperature": 0.9
                },
                timeout=10
            )
            if resp.ok:
                return "🎉 " + resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"⚠ Error generando celebracion: {e}")
    return f"🎉 ¡Completaste \"{titulo}\"! Buen trabajo, Elías."

def despedida_fin_dia():
    """Cierre cálido del día, con resumen de lo que se hizo."""
    resumen = resumen_del_dia()
    return f"Buenas noches, Elías. {resumen} Que descanses."

MODO_SEGURO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "modo_seguro.flag")

def esta_en_modo_seguro():
    return os.path.exists(MODO_SEGURO_PATH)

def activar_modo_seguro(motivo=""):
    with open(MODO_SEGURO_PATH, "w", encoding="utf-8") as f:
        f.write(motivo)

def desactivar_modo_seguro():
    if os.path.exists(MODO_SEGURO_PATH):
        os.remove(MODO_SEGURO_PATH)


def iniciar_pomodoro(comando):
    """Inicia una sesión de enfoque; avisa por voz en el navegador y por Telegram cuando termina."""
    match = re.search(r'(\d+)\s*minuto', comando)
    minutos = int(match.group(1)) if match else 25
    minutos = max(1, min(minutos, 180))  # límite razonable: 1 a 180 minutos

    _pomodoro_estado["activo"] = True

    def _avisar():
        time.sleep(minutos * 60)
        if _pomodoro_estado["activo"]:
            _pomodoro_estado["activo"] = False
            mensaje = f"Se acabó tu sesión de enfoque de {minutos} minutos, Elías. Buen trabajo, tómate un respiro."
            anunciar_proactivo(mensaje)

    threading.Thread(target=_avisar, daemon=True).start()
    return f"Modo enfoque activado por {minutos} minutos. Te aviso cuando termine — concentrémonos."

def obtener_recordatorios():
    if os.path.exists(RECORDATORIOS_PATH):
        with open(RECORDATORIOS_PATH, "r", encoding="utf-8") as f:
            return [l.strip() for l in f if l.strip()]
    return []

def agregar_recordatorio(texto):
    texto = texto.strip()
    if not texto:
        return obtener_recordatorios()
    with open(RECORDATORIOS_PATH, "a", encoding="utf-8") as f:
        f.write(texto + "\n")
    return obtener_recordatorios()

def eliminar_recordatorio(indice):
    recs = obtener_recordatorios()
    if 0 <= indice < len(recs):
        recs.pop(indice)
        with open(RECORDATORIOS_PATH, "w", encoding="utf-8") as f:
            for r in recs:
                f.write(r + "\n")
    return recs