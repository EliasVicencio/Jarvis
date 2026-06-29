import asyncio
import edge_tts
import tempfile
import os
import pygame
import time

async def test():
    tmp = os.path.join(tempfile.gettempdir(), "jarvis_test.mp3")
    print("Generando audio...")
    c = edge_tts.Communicate("Hola soy Jarvis probando la voz", "es-MX-JorgeNeural")
    await c.save(tmp)
    print(f"Audio generado: {tmp} — {os.path.getsize(tmp)} bytes")

    try:
        pygame.mixer.pre_init(44100, -16, 2, 512)
        pygame.mixer.init()
        pygame.mixer.music.load(tmp)
        pygame.mixer.music.play()
        time.sleep(4)
        pygame.mixer.quit()
        print("pygame OK")
    except Exception as e:
        print(f"pygame ERROR: {e}")

    os.unlink(tmp)

asyncio.run(test())