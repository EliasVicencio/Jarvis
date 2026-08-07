"""Telegram bot process - runs independently, communicates via shared logic."""
import sys, os, logging, asyncio
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_core

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("telegram_bot")

TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID_AUTORIZADO = os.environ.get("TELEGRAM_CHAT_ID", "")

async def main():
    from telegram import Update
    from telegram.ext import Application, MessageHandler, filters

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

        resultado = jarvis_core.procesar_comando(texto)
        if resultado.get("accion") == "desconocido":
            groq_resp = jarvis_core.preguntar_llm(texto)
            if groq_resp:
                resultado = {"respuesta": groq_resp, "accion": "groq"}
        respuesta_texto = resultado.get("respuesta", "No entendí.")
        jarvis_core.agregar_historial(texto, respuesta_texto, resultado.get("accion"), fuente="telegram")
        await update.message.reply_text(respuesta_texto)

    app = Application.builder().token(TELEGRAM_TOKEN).build()
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handler))
    logger.info("Telegram bot iniciando (long polling)...")
    await app.initialize()
    await app.start()
    await app.updater.start_polling(allowed_updates=["message"])
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())