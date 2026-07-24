"""Telegram bot process - runs independently, communicates via shared logic."""
import sys, os, logging, asyncio, threading
from dotenv import load_dotenv
load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jarvis_core

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
        resultado = jarvis_core.procesar_comando(texto)
        if resultado.get("accion") == "desconocido":
            groq_resp = _llm_preguntar(texto)
            if groq_resp:
                resultado = {"respuesta": groq_resp, "accion": "groq"}
        await update.message.reply_text(resultado.get("respuesta", "No entendí."))

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
