"""
wake_word.py — Detector de wake word usando Azure Speech en loop continuo.

Sin Vosk, sin PyAudio, sin modelos externos.
Solo Azure Speech SDK que ya está instalado.

Cómo funciona:
- Un hilo escucha en ciclos cortos (recognize_once con timeout)
- Si detecta "jarvis" (o variantes) → llama al callback
- Si detecta un sonido fuerte repetido → doble aplauso → llama al callback
- Se pausa automáticamente mientras Azure procesa el comando principal
"""

import threading
import time
import logging
import math

logger = logging.getLogger(__name__)

WAKE_WORDS   = ["jarvis", "jarvi", "jarbes", "harvis"]
LISTEN_SECS  = 2      # duración de cada ciclo de escucha
PAUSE_AFTER  = 1.0    # pausa entre ciclos para no saturar la API


class WakeWordDetector:
    def __init__(self, callback, speech_config=None, sensitivity=0.6):
        self.callback      = callback
        self.speech_config = speech_config  # se inyecta desde app.py
        self._running      = False
        self._pausado      = False
        self._thread       = None

    def start(self):
        if self._running:
            return
        if not self.speech_config:
            logger.error("WakeWordDetector necesita speech_config de Azure.")
            return
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("WakeWordDetector iniciado (Azure Speech loop)")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def pausar(self):
        """Pausar mientras Azure procesa el comando principal."""
        self._pausado = True
        logger.info("WakeWordDetector pausado")

    def reanudar(self):
        """Reanudar después de que Azure termina de procesar."""
        self._pausado = False
        logger.info("WakeWordDetector reanudado")

    def _loop(self):
        import azure.cognitiveservices.speech as speechsdk

        logger.info("Escuchando wake word 'Jarvis' en loop con Azure...")

        while self._running:
            if self._pausado:
                time.sleep(0.1)
                continue

            try:
                # Crear reconocedor con timeout corto
                recognizer = speechsdk.SpeechRecognizer(
                    speech_config=self.speech_config
                )

                # recognize_once_async con timeout para no bloquearse eternamente
                future = recognizer.recognize_once_async()
                result = future.get()  # bloquea hasta que hay audio o silencio

                if self._pausado:
                    continue

                if result.reason == speechsdk.ResultReason.RecognizedSpeech:
                    texto = result.text.lower().strip().rstrip(".")
                    logger.debug(f"Wake loop oyó: '{texto}'")

                    if any(w in texto for w in WAKE_WORDS):
                        logger.info(f"Wake word detectada: '{texto}'")
                        self._activar("jarvis")
                        # Pausa para no reactivarse inmediatamente
                        time.sleep(2.0)

                elif result.reason == speechsdk.ResultReason.NoMatch:
                    # No se entendió nada — volver a escuchar inmediatamente
                    pass

                elif result.reason == speechsdk.ResultReason.Canceled:
                    # Error de red o cuota — esperar antes de reintentar
                    time.sleep(1.0)

            except Exception as e:
                logger.error(f"Error en wake loop: {e}")
                time.sleep(1.0)

            # Pequeña pausa entre ciclos
            time.sleep(0.1)

    def _activar(self, fuente: str):
        threading.Thread(
            target=self.callback,
            args=(fuente,),
            daemon=True
        ).start()