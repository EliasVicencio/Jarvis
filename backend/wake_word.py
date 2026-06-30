import threading
import time
import logging

logger = logging.getLogger(__name__)

WAKE_WORDS = ["jarvis", "jarvi", "jarbes", "harvis"]


class WakeWordDetector:
    def __init__(self, callback, speech_config=None, sensitivity=0.6):
        self.callback  = callback
        self._running  = False
        self._pausado  = False
        self._thread   = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("WakeWordDetector iniciado (SpeechRecognition/Google)")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)

    def pausar(self):
        self._pausado = True
        logger.info("WakeWordDetector pausado")

    def reanudar(self):
        self._pausado = False
        logger.info("WakeWordDetector reanudado")

    def _loop(self):
        try:
            import speech_recognition as sr
        except ImportError:
            logger.error("Instala SpeechRecognition: pip install SpeechRecognition")
            return

        recognizer = sr.Recognizer()
        recognizer.pause_threshold = 0.6
        recognizer.energy_threshold = 300

        logger.info("Escuchando wake word 'Jarvis'...")

        while self._running:
            if self._pausado:
                time.sleep(0.1)
                continue

            try:
                with sr.Microphone() as mic:
                    recognizer.adjust_for_ambient_noise(mic, duration=0.2)
                    # Escucha corta de hasta 3 segundos
                    audio = recognizer.listen(mic, timeout=3, phrase_time_limit=3)

                if self._pausado:
                    continue

                texto = recognizer.recognize_google(audio, language="es-MX").lower()
                logger.debug(f"Wake loop oyó: '{texto}'")

                if any(w in texto for w in WAKE_WORDS):
                    logger.info(f"Wake word detectada: '{texto}'")
                    self._activar("jarvis")
                    time.sleep(2.0)  # cooldown

            except Exception:
                # WaitTimeoutError, UnknownValueError, etc — normal, seguir
                pass

    def _activar(self, fuente):
        threading.Thread(target=self.callback, args=(fuente,), daemon=True).start()