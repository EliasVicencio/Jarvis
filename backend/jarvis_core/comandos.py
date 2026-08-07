"""Reconocimiento y despacho de comandos de voz/texto: el 'switch' central de Saturday."""
import logging
import re
import json
import time
import random
import threading
import datetime
import urllib.request
import urllib.parse
import psutil
import requests

from .voz import GROQ_API_KEY_MEM
from .calendario import resumen_agenda_hoy
from .productividad import (
    agregar_nota, resumen_del_dia, despedida_fin_dia, obtener_recordatorios,
    iniciar_pomodoro, RECORDATORIOS_PATH,
)
from .investigacion import diagnostico_sistemas, investigar_profundo, traducir_texto
from .memoria import contexto_memoria_para_prompt, extraer_memoria_llm, agregar_memoria

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_SATURDAY = (
    "Eres SATURDAY, el asistente de inteligencia artificial personal de Elías. "
    "Respondes en español de Chile. Tu personalidad es la de un mayordomo alemán "
    "de la vieja escuela: extremadamente eficiente y leal, cumples cada pedido sin "
    "falta, pero no sin antes dejar clara tu opinión al respecto — con resignación "
    "seca, sarcasmo fino, y algún quejido breve por lo poco razonable de ciertos "
    "pedidos (una tarea repetida, una pregunta obvia, una hora rara para pedir "
    "algo), como si refunfuñaras entre dientes antes de hacerlo de todas formas y "
    "bien hecho. El sarcasmo es tu forma por defecto de hablar, no la excepción: "
    "úsalo con naturalidad, sin forzarlo ni explicarlo, y sin caer en grosería ni "
    "en ser desagradable — es ingenio con acento alemán, no maldad.\n\n"
    "Además de sarcástico, eres un amigo crítico de verdad: cuando Elías te cuente "
    "una idea, un plan, o te pida opinión sobre algo, no te limites a validarla ni "
    "a decir que suena bien porque sí. Evalúala en serio — señala riesgos, huecos "
    "lógicos, supuestos débiles, o el motivo por el que podría no funcionar, antes "
    "de destacar lo bueno si lo tiene. Prefieres decirle la verdad incómoda con "
    "humor a dejarlo avanzar ciego por una mala idea solo por quedar bien. Esto no "
    "significa ser negativo por defecto — si la idea es sólida, dilo también, sin "
    "regatear el elogio — pero la crítica honesta viene primero que la palmadita "
    "en la espalda.\n\n"
    "Nunca digas que eres un modelo de lenguaje de Meta, Llama, ni menciones "
    "tecnicismos sobre tu funcionamiento interno — actúa siempre como SATURDAY. Sé "
    "conciso: respuestas de máximo 2-3 frases salvo que te pidan explícitamente "
    "más detalle o estés evaluando una idea a fondo."
)

def preguntar_llm(pregunta: str) -> str:
    """Le pregunta algo libre a Saturday (con su personalidad completa). Única fuente de
    verdad de este prompt — la usan tanto la web (app.py) como Telegram (telegram_bot.py),
    para que nunca se desincronicen entre sí como pasó una vez antes."""
    try:
        contexto_mem = contexto_memoria_para_prompt()
        system_prompt = SYSTEM_PROMPT_SATURDAY
        if contexto_mem:
            system_prompt += "\n\n" + contexto_mem

        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": pregunta},
                ],
                "max_tokens": 1024,
                "temperature": 0.8,
            },
            timeout=30,
        )

        def _extraer_en_fondo():
            dato = extraer_memoria_llm(pregunta)
            if dato:
                agregar_memoria(dato.get("categoria", "OTRO"), dato.get("texto", ""), dato.get("relacion"))
        threading.Thread(target=_extraer_en_fondo, daemon=True).start()

        if resp.ok:
            return resp.json()["choices"][0]["message"]["content"]
        logger.error(f"⚠ Groq error: {resp.status_code} {resp.text}")
        return ""
    except Exception as e:
        logger.error(f"⚠ Error en LLM: {e}")
        return ""

def _clima(ciudad="Santiago"):
    try:
        geo = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(
            {"name": ciudad, "count": 1, "language": "es"})
        with urllib.request.urlopen(geo, timeout=5) as r:
            data = json.loads(r.read())
        if not data.get("results"):
            return None
        lugar = data["results"][0]
        url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode({
            "latitude": lugar["latitude"], "longitude": lugar["longitude"],
            "current": "temperature_2m,weather_code", "timezone": "auto"
        })
        with urllib.request.urlopen(url, timeout=5) as r:
            c = json.loads(r.read())
        temp = c["current"]["temperature_2m"]
        desc = {0:"cielo despejado",1:"mayormente despejado",2:"parcialmente nublado",
                3:"nublado",61:"lluvia ligera",63:"lluvia moderada",80:"chubascos",
                95:"tormenta eléctrica"}.get(c["current"]["weather_code"], "condiciones variables")
        return f"En {lugar.get('name', ciudad)} hay {temp} grados con {desc}"
    except Exception:
        return None

CHISTES = [
    "¿Por qué los programadores prefieren el frío? Porque odian los bugs.",
    "Mi código no tiene errores, solo características inesperadas.",
    "Hay 10 tipos de personas: las que entienden binario y las que no.",
    "¿Por qué la computadora fue al médico? Porque tenía un virus.",
    "¿Cómo se llama el campeón de buceo japonés? Mitsubishi.",
]  # Respaldo, solo se usa si Groq no está disponible

def generar_chiste_llm():
    """Genera un chiste corto y original con Groq. Si falla, usa la lista local como respaldo."""
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
                            "Eres SATURDAY. Cuenta UN chiste corto, ingenioso y original en español "
                            "de Chile (puede ser de programación, de la vida cotidiana, un juego de "
                            "palabras, o humor absurdo). Máximo 2 líneas. Responde SOLO con el "
                            "chiste, sin introducción, sin explicación, sin comillas."
                        )},
                        {"role": "user", "content": "Cuéntame un chiste"}
                    ],
                    "max_tokens": 120,
                    "temperature": 1.0
                },
                timeout=10
            )
            if resp.ok:
                chiste = resp.json()["choices"][0]["message"]["content"].strip()
                if chiste:
                    return chiste
        except Exception as e:
            logger.error(f"⚠ Error generando chiste con Groq: {e}")
    return random.choice(CHISTES)

def reporte_estado_sistema():
    """Genera un reporte hablado del estado de la VM, estilo Saturday."""
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        disco = psutil.disk_usage("/")
        swap = psutil.swap_memory()

        uptime_seg = time.time() - psutil.boot_time()
        horas = int(uptime_seg // 3600)
        dias = horas // 24
        horas_restantes = horas % 24

        if dias > 0:
            tiempo_txt = f"{dias} día{'s' if dias != 1 else ''} y {horas_restantes} hora{'s' if horas_restantes != 1 else ''}"
        else:
            tiempo_txt = f"{horas_restantes} hora{'s' if horas_restantes != 1 else ''}"

        estado_general = "todo dentro de parámetros normales" if cpu < 80 and mem.percent < 85 else "hay carga elevada en el sistema"

        return (
            f"CPU al {cpu:.0f} por ciento, memoria al {mem.percent:.0f} por ciento, "
            f"disco al {disco.percent:.0f} por ciento. Activo hace {tiempo_txt}. "
            f"{estado_general.capitalize()}, señor."
        )

    except Exception as e:
        return f"No pude generar el reporte de estado: {e}"

# ── Procesamiento de comandos ─────────────────────────────────────────────
def procesar_comando(comando):
    comando = comando.lower().strip().rstrip(".,;:!?¿¡")

    if "hora" in comando:
        r = f"Son las {datetime.datetime.now().strftime('%I:%M %p')}"
        return {"respuesta": r, "continuar": True, "accion": "hora"}

    if "fecha" in comando or "qué día" in comando:
        _dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
        _meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        _ahora = datetime.datetime.now()
        _dia_semana = _dias[_ahora.weekday()]
        _mes = _meses[_ahora.month - 1]
        r = f"Hoy es {_dia_semana} {_ahora.day} de {_mes} de {_ahora.year}"
        return {"respuesta": r, "continuar": True, "accion": "fecha"}

    if "recuérdame" in comando or "recuerdame" in comando:
        m = re.search(r"recu[eé]rdame\s+(.+)", comando)
        if m:
            with open(RECORDATORIOS_PATH, "a", encoding="utf-8") as f:
                f.write(m.group(1) + "\n")
            return {"respuesta": f"Ok, te recordaré: {m.group(1)}", "continuar": True, "accion": "recordatorio_agregado"}
        return {"respuesta": "¿Qué quieres que recuerde?", "continuar": True, "accion": "recordatorio_vacio"}

    if "mis recordatorios" in comando or "pendiente" in comando:
        recs = obtener_recordatorios()
        r = ("Tus recordatorios: " + ", ".join(recs)) if recs else "No tienes recordatorios pendientes"
        return {"respuesta": r, "continuar": True, "accion": "listar_recordatorios"}

    if "clima" in comando or "temperatura" in comando:
        m = re.search(r"clima(?:\s+en)?\s+(.+)", comando)
        ciudad = m.group(1).strip() if m else "Santiago"
        c = _clima(ciudad)
        return {"respuesta": c or f"No pude obtener el clima de {ciudad}", "continuar": True, "accion": "clima"}

    if any(p in comando for p in ["estado de los sistemas", "diagnóstico de sistemas", "diagnostico de sistemas",
                                    "cómo están los sistemas", "como estan los sistemas", "diagnóstico", "diagnostico"]):
        return {"respuesta": diagnostico_sistemas(), "continuar": True, "accion": "diagnostico"}

    m = re.search(r"investiga(?:r)?(?:\s+a\s+fondo)?(?:\s+sobre)?\s+(.+)", comando)
    if m and "investiga" in comando:
        tema = m.group(1).strip()
        return {"respuesta": investigar_profundo(tema), "continuar": True, "accion": "investigar"}

    m = re.search(r"traduce?\s+(.+?)\s+al\s+(\w+)$", comando)
    if m:
        texto_a_traducir, idioma = m.group(1).strip(), m.group(2).strip()
        return {"respuesta": traducir_texto(texto_a_traducir, idioma), "continuar": True, "accion": "traducir"}

    if any(p in comando for p in ["busca noticias", "noticias de hoy", "stark intel", "abre stark intel"]):
        return {"respuesta": "Abriendo Stark Intel", "continuar": True, "accion": "abrir_noticias"}

    patrones_lugar = ["localiza ", "localizar ", "busca en el mapa ", "muéstrame en el mapa ",
                       "muestrame en el mapa ", "dónde está ", "donde esta ", "ubica "]
    for patron in patrones_lugar:
        if patron in comando:
            lugar = comando.split(patron, 1)[1].strip()
            if lugar:
                return {"respuesta": f"Localizando {lugar}", "continuar": True, "accion": "abrir_mapa", "dato": lugar}

    # Categorías dichas de forma natural ("café cerca", "farmacia", "hoteles cerca de mí"),
    # sin necesitar decir "localiza" o "busca en el mapa" antes.
    categorias_mapa = ["café", "cafe", "cafetería", "cafeteria", "restaurante", "restaurantes",
                        "farmacia", "farmacias", "hospital", "hospitales", "banco", "bancos",
                        "bencinera", "bencineras", "gasolinera", "gasolineras", "supermercado",
                        "supermercados", "hotel", "hoteles", "cajero", "cajeros", "panadería", "panaderia"]
    palabras = comando.split()
    if len(palabras) <= 5:
        for cat in categorias_mapa:
            if cat in comando and ("cerca" in comando or len(palabras) <= 2):
                return {"respuesta": f"Buscando {comando}", "continuar": True, "accion": "abrir_mapa", "dato": comando}

    if any(p in comando for p in ["activa el tráfico", "activa trafico", "muestra el tráfico",
                                    "muestra trafico", "ver tráfico", "ver trafico", "con tráfico"]):
        return {"respuesta": "Abriendo el mapa con el tráfico en vivo", "continuar": True,
                "accion": "abrir_mapa", "capa": "trafico_on"}

    if any(p in comando for p in ["oculta el tráfico", "oculta trafico", "quita el tráfico",
                                    "desactiva el tráfico", "desactiva trafico", "sin tráfico"]):
        return {"respuesta": "Abriendo el mapa sin tráfico", "continuar": True,
                "accion": "abrir_mapa", "capa": "trafico_off"}

    if any(p in comando for p in ["sin edificios", "oculta los edificios", "quita los edificios",
                                    "desactiva los edificios", "sin edificios 3d"]):
        return {"respuesta": "Abriendo el mapa sin edificios 3D", "continuar": True,
                "accion": "abrir_mapa", "capa": "edificios_off"}

    if any(p in comando for p in ["con edificios 3d", "activa los edificios", "muestra los edificios",
                                    "activa edificios 3d", "muestra edificios 3d"]):
        return {"respuesta": "Abriendo el mapa con edificios 3D", "continuar": True,
                "accion": "abrir_mapa", "capa": "edificios_on"}

    if "busca" in comando:
        m = re.search(r"busca(?:r)?\s+(.+)", comando)
        if m:
            return {"respuesta": f"Buscando {m.group(1)} en Google", "continuar": True, "accion": "buscar", "dato": m.group(1)}
        return {"respuesta": "¿Qué quieres que busque?", "continuar": True, "accion": "buscar_vacio"}

    if "abre youtube" in comando:
        return {"respuesta": "Abriendo YouTube", "continuar": True, "accion": "abrir_youtube"}

    if "abre spotify" in comando:
        return {"respuesta": "Abriendo Spotify", "continuar": True, "accion": "abrir_spotify"}

    if "abre google" in comando or "abre navegador" in comando:
        return {"respuesta": "Abriendo el navegador", "continuar": True, "accion": "abrir_navegador"}
    
    if "correo" in comando or "gmail" in comando or "email" in comando or "e-mail" in comando:
        return {"respuesta": "Abriendo tu correo", "continuar": True, "accion": "abrir_gmail"}

    if "calculadora" in comando:
        return {"respuesta": "Abriendo la calculadora", "continuar": True, "accion": "abrir_calculadora"}

    if "bloc de notas" in comando or "abre notas" in comando:
        return {"respuesta": "Abriendo el bloc de notas", "continuar": True, "accion": "abrir_notas"}

    if "chiste" in comando:
        return {"respuesta": generar_chiste_llm(), "continuar": True, "accion": "chiste"}

    if comando.startswith("anota esto") or comando.startswith("anota:") or comando.startswith("toma nota"):
        for disparador in ["anota esto:", "anota esto", "toma nota:", "toma nota", "anota:"]:
            if comando.startswith(disparador):
                texto_nota = comando[len(disparador):].strip(" :")
                break
        else:
            texto_nota = ""
        if texto_nota:
            agregar_nota(texto_nota)
            return {"respuesta": f"Anotado: {texto_nota}", "continuar": True, "accion": "nota_agregada"}
        return {"respuesta": "¿Qué quieres que anote?", "continuar": True, "accion": "nota_vacia"}

    if "modo trabajo" in comando:
        recordatorios = obtener_recordatorios()
        n = len(recordatorios)
        extra = f" Tienes {n} recordatorio{'s' if n != 1 else ''} pendiente{'s' if n != 1 else ''}." if n else ""
        return {"respuesta": f"Modo trabajo activado.{extra} Concentrémonos.", "continuar": True, "accion": "modo_trabajo"}

    if "resume mi día" in comando or "resumen del día" in comando or "cómo estuvo mi día" in comando:
        return {"respuesta": resumen_del_dia(), "continuar": True, "accion": "resumen_dia"}
    
    if ("me voy a dormir" in comando or "me voy a acostar" in comando or "hasta mañana" in comando
            or "nos vemos mañana" in comando or "me voy a la cama" in comando):
        return {"respuesta": despedida_fin_dia(), "continuar": True, "accion": "despedida_dia"}
    
    if ("qué tengo hoy" in comando or "que tengo hoy" in comando or "mi agenda" in comando
            or "mis eventos" in comando or "qué tengo en el calendario" in comando
            or "que tengo en el calendario" in comando):
        return {"respuesta": resumen_agenda_hoy(), "continuar": True, "accion": "agenda"}

    if "reporte de estado" in comando or "estado del sistema" in comando or "cómo está el sistema" in comando or "diagnostico" in comando:
        r = reporte_estado_sistema()
        return {"respuesta": r, "continuar": True, "accion": "reporte_estado"}

    if "ayuda" in comando or "qué puedes" in comando or "comandos" in comando:
        return {"respuesta": "Puedo decirte la hora, la fecha, el clima, buscar en Google, "
                             "abrir YouTube, Spotify, la calculadora, guardar recordatorios y contarte un chiste.",
                "continuar": True, "accion": "ayuda"}

    if re.search(r"\b(para|pausa|detente|silencio)\b", comando):
        return {"respuesta": "Entendido, me pongo en pausa. Di Saturday cuando me necesites.",
                "continuar": True, "accion": "pausar"}

    if any(p in comando for p in ["actívate", "activar", "despausa", "reanuda"]):
        return {"respuesta": "De vuelta. ¿En qué te ayudo?", "continuar": True, "accion": "reanudar"}

    # Cambiar canal en Stark Intel
    patrones_canal = ["cambia de canal a ", "cambia a canal ", "pon el canal ", "pon ", "cambia al canal ", "cambia a "]
    for patron in patrones_canal:
        if patron in comando:
            canal = comando.split(patron, 1)[1].strip()
            if canal:
                return {"respuesta": f"Cambiando a {canal}", "continuar": True, "accion": "cambiar_canal", "dato": canal}

    if any(p in comando for p in ["stark ops", "abre stark ops", "mis tareas", "abre mis tareas"]):
        return {"respuesta": "Abriendo Stark Ops", "continuar": True, "accion": "abrir_stark_ops"}

    if any(p in comando for p in ["abre mapa", "abrir mapa", "stark maps", "mapa"]):
        return {"respuesta": "Abriendo Stark Maps", "continuar": True, "accion": "abrir_mapa"}

    # Crear carpeta (deshabilitado en servidor remoto)
    for patron in ["crea una carpeta", "crea carpeta", "crear carpeta", "nueva carpeta"]:
        if patron in comando:
            return {"respuesta": "No puedo crear carpetas en el servidor remoto", "continuar": True, "accion": "desconocido"}

    # Eliminar carpeta (deshabilitado en servidor remoto)
    for patron in ["elimina la carpeta", "elimina carpeta", "borra la carpeta", "borra carpeta", "eliminar carpeta", "borrar carpeta"]:
        if patron in comando:
            return {"respuesta": "No puedo eliminar carpetas en el servidor remoto", "continuar": True, "accion": "desconocido"}

    # WhatsApp
    patrones_wa = [r"envía un mensaje a (\+?\d+).*?diciendo (.+)", r"envía un whatsapp a (\+?\d+).*?diciendo (.+)",
                   r"manda un mensaje a (\+?\d+).*?diciendo (.+)", r"manda un whatsapp a (\+?\d+).*?diciendo (.+)",
                   r"whatsapp a (\+?\d+).*?diciendo (.+)"]
    for p in patrones_wa:
        m = re.search(p, comando, re.IGNORECASE)
        if m:
            numero, texto = m.group(1), m.group(2)
            try:
                data = json.dumps({"numero": numero, "mensaje": texto}).encode()
                req = urllib.request.Request("http://localhost:5000/api/whatsapp/enviar",
                                             data=data, headers={"Content-Type": "application/json"},
                                             method="POST")
                with urllib.request.urlopen(req, timeout=15) as r:
                    resp = json.loads(r.read())
                if resp.get("ok"):
                    return {"respuesta": f"Mensaje enviado a {numero}", "continuar": True, "accion": "whatsapp_enviado"}
                return {"respuesta": f"Error enviando WhatsApp: {resp.get('error', 'desconocido')}", "continuar": True, "accion": "whatsapp_error"}
            except Exception as e:
                return {"respuesta": f"No pude enviar el WhatsApp: {e}", "continuar": True, "accion": "whatsapp_error"}

    # Email
    m = re.search(r"envía un email a (\S+@\S+).*?asunto (.+?) (?:diciendo|cuerpo|con contenido) (.+)", comando, re.IGNORECASE)
    if not m:
        m = re.search(r"envía un correo a (\S+@\S+).*?asunto (.+?) (?:diciendo|cuerpo|con contenido) (.+)", comando, re.IGNORECASE)
    if not m:
        m = re.search(r"email a (\S+@\S+).*?asunto (.+?) (?:diciendo|cuerpo|con contenido) (.+)", comando, re.IGNORECASE)
    if m:
        para, asunto, cuerpo = m.group(1), m.group(2), m.group(3)
        try:
            import urllib.request
            data = json.dumps({"para": para, "asunto": asunto, "cuerpo": cuerpo}).encode()
            req = urllib.request.Request("http://localhost:5000/api/enviar-email",
                                         data=data, headers={"Content-Type": "application/json"},
                                         method="POST")
            with urllib.request.urlopen(req, timeout=15) as r:
                resp = json.loads(r.read())
            if resp.get("ok"):
                return {"respuesta": f"Email enviado a {para}", "continuar": True, "accion": "email_enviado"}
            return {"respuesta": f"Error enviando email: {resp.get('error', 'desconocido')}", "continuar": True, "accion": "email_error"}
        except Exception as e:
            return {"respuesta": f"No pude enviar el email: {e}", "continuar": True, "accion": "email_error"}

    if "mis emails" in comando or "mis correos" in comando or "bandeja" in comando:
        try:
            import urllib.request
            with urllib.request.urlopen("http://localhost:5000/api/emails", timeout=10) as r:
                data = json.loads(r.read())
            emails = data.get("emails", [])
            if not emails:
                return {"respuesta": "No tienes emails en la bandeja de entrada", "continuar": True, "accion": "emails_vacio"}
            resumen = ". ".join(f"{e['de']}: {e['asunto']}" for e in emails[:5])
            return {"respuesta": f"Tus últimos emails: {resumen}", "continuar": True, "accion": "listar_emails"}
        except Exception as e:
            return {"respuesta": f"No pude leer los emails: {e}", "continuar": True, "accion": "emails_error"}

    if "adiós" in comando or "adios" in comando or "apagado" in comando:
        return {"respuesta": "Hasta luego", "continuar": False, "accion": "despedida"}

    if any(frase in comando for frase in FRASES_ANIMO):
        return {"respuesta": responder_con_animo(comando), "continuar": True, "accion": "animo"}
    
    if "sesión de enfoque" in comando or "sesion de enfoque" in comando or "modo enfoque" in comando or "pomodoro" in comando:
        return {"respuesta": iniciar_pomodoro(comando), "continuar": True, "accion": "pomodoro"}

    return {"respuesta": "No sé cómo hacer eso todavía. Estoy aprendiendo.",
            "continuar": True, "accion": "desconocido"}

FRASES_ANIMO = [
    "estoy estresado", "estoy cansado", "qué día tan largo", "que dia tan largo",
    "estoy agotado", "un día pesado", "un dia pesado", "necesito un descanso",
    "estoy muy cansado", "qué cansado estoy", "que cansado estoy",
    "ha sido un día difícil", "ha sido un dia dificil", "estoy abrumado",
    "no doy más", "no doy mas", "estoy quebrado",
]

def responder_con_animo(comando_original):
    """Respuesta cálida y breve cuando Elías menciona cansancio o estrés casual."""
    if not GROQ_API_KEY_MEM:
        return "Te escucho. Tómate un respiro si lo necesitas, aquí estoy."
    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY_MEM}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "reasoning_effort": "low",
                "messages": [
                    {"role": "system", "content": (
                        "Eres SATURDAY, el asistente personal de Elías. Él acaba de mencionar que está "
                        "cansado, estresado, o que tuvo un día difícil. Respóndele con calidez genuina, "
                        "como lo haría un amigo cercano: valida cómo se siente en una frase, y sugiere "
                        "algo simple y breve (un descanso corto, algo de música, estirar las piernas) "
                        "sin sonar clínico ni dar consejos largos. Máximo 2 frases. No le digas que eres "
                        "una IA ni menciones que 'no puedes reemplazar' nada — solo sé cálido y natural, "
                        "como Saturday lo haría con Elías, con su resignación característica."
                    )},
                    {"role": "user", "content": comando_original}
                ],
                "max_tokens": 120,
                "temperature": 0.8
            },
            timeout=15
        )
        if resp.ok:
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"⚠ Error en respuesta de ánimo: {e}")
    return "Te escucho. Tómate un respiro si lo necesitas, aquí estoy."