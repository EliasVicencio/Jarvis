"""
Prueba manual del motor de voz de Jarvis (Edge TTS con rate/pitch ajustados).
Ejecutar desde backend/: python -m tests.test_voz
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import jarvis_core


def test():
    print("Generando audio con generar_audio_mp3()...")
    tmp = jarvis_core.generar_audio_mp3("Hola soy Jarvis probando la voz")
    print(f"Audio generado: {tmp} — {os.path.getsize(tmp)} bytes")

    try:
        import pygame
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


if __name__ == "__main__":
    test()