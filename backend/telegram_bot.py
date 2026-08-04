"""Telegram bot process - runs independently, communicates via shared logic."""
import sys, os, logging, asyncio, threading
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_core
import instagram_ai

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("telegram_bot")

TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
CHAT_ID_AUTORIZADO = os.environ.get("TELEGRAM_CHAT_ID", "")

def _llm_preguntar(pregunta):
    import requests
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
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
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
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"Groq error: {e}")
    return ""

async def main():
    from telegram import Update
    from telegram.ext import Application, MessageHandler, filters

    async def handler_foto(update: Update, _context):
        if not update.message or not update.message.photo:
            return
        chat_id = str(update.message.chat_id)
        if CHAT_ID_AUTORIZADO and chat_id != CHAT_ID_AUTORIZADO:
            logger.warning(f"Foto ignorada de chat_id no autorizado: {chat_id}")
            return
        import base64
        foto = update.message.photo[-1]  # la de mayor resolución
        archivo = await foto.get_file()
        contenido = await archivo.download_as_bytearray()
        contenido = bytes(contenido)
        caption_original = (update.message.caption or "").strip()

        if caption_original.lower().startswith("instagram"):
            indicacion = caption_original[len("instagram"):].strip(" :,-") or None
            await update.message.reply_text("Dale, preparando el post...")
            imagen_b64 = base64.b64encode(contenido).decode("utf-8")
            url_publica = jarvis_core.guardar_imagen_publica(contenido, prefijo="ig")
            draft = instagram_ai.generar_caption(imagen_b64, indicacion)
            if draft.get("error"):
                await update.message.reply_text(f"No pude preparar el post: {draft['error']}")
                return
            caption_completo = draft["caption"]
            if draft.get("hashtags"):
                caption_completo += "\n\n" + " ".join(draft["hashtags"])
            jarvis_core.guardar_post_pendiente(url_publica, caption_completo)
            await update.message.reply_text(
                f"Esto es lo que se me ocurrió:\n\n{caption_completo}\n\n"
                "Respóndeme \"publicar\" para subirlo tal cual, o mándame el texto que "
                "quieres usar en su lugar."
            )
            return

        imagen_b64 = base64.b64encode(contenido).decode("utf-8")
        pregunta = caption_original or None

        await update.message.reply_text("Dame un segundo, mirando la imagen...")
        respuesta = jarvis_core.analizar_imagen(imagen_b64, pregunta)
        jarvis_core.agregar_historial(pregunta or "[imagen]", respuesta, "analizar_imagen", fuente="telegram")
        await update.message.reply_text(respuesta)

    async def handler(update: Update, _context):
        if not update.message or not update.message.text:
            return
        chat_id = str(update.message.chat_id)
        if CHAT_ID_AUTORIZADO and chat_id != CHAT_ID_AUTORIZADO:
            logger.warning(f"Mensaje ignorado de chat_id no autorizado: {chat_id}")
            return
        texto = update.message.text.strip()
        user = update.message.from_user
        logger.info(f"Telegram [{user.first_name}]: {texto}")

        if "desactiva" in texto.lower() and "modo seguro" in texto.lower():
            jarvis_core.desactivar_modo_seguro()
            await update.message.reply_text("Modo seguro desactivado. Todo vuelve a la normalidad, Elías.")
            return

        pendiente = jarvis_core.obtener_post_pendiente()
        if pendiente:
            if texto.lower().strip() == "publicar":
                await update.message.reply_text("Publicando...")
                resultado = instagram_ai.publicar_post(pendiente["imagen_url"], pendiente["caption"])
                jarvis_core.borrar_post_pendiente()
                if resultado.get("ok"):
                    await update.message.reply_text("Publicado. Ya debería verse en tu feed.")
                else:
                    await update.message.reply_text(f"No se pudo publicar: {resultado.get('error')}")
                return
            else:
                jarvis_core.guardar_post_pendiente(pendiente["imagen_url"], texto)
                await update.message.reply_text(
                    "Listo, actualicé el caption. Respóndeme \"publicar\" cuando quieras subirlo así."
                )
                return

        if "ideas para instagram" in texto.lower() or "sugerencias de instagram" in texto.lower():
            await update.message.reply_text("Dame un segundo, revisando cómo te ha ido...")
            await update.message.reply_text(instagram_ai.sugerir_ideas_contenido())
            return

        resultado = jarvis_core.procesar_comando(texto)
        if resultado.get("accion") == "desconocido":
            groq_resp = _llm_preguntar(texto)
            if groq_resp:
                resultado = {"respuesta": groq_resp, "accion": "groq"}
        respuesta_texto = resultado.get("respuesta", "No entendí.")
        jarvis_core.agregar_historial(texto, respuesta_texto, resultado.get("accion"), fuente="telegram")
        await update.message.reply_text(respuesta_texto)

    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.PHOTO, handler_foto))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handler))
    logger.info("Telegram bot iniciando (long polling)...")
    await app.initialize()
    await app.start()
    await app.updater.start_polling(allowed_updates=["message"])
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())