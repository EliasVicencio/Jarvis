"""
wake_word.py — Detector de wake word y aplauso para Jarvis.

Pausa automáticamente mientras Azure Speech está usando el micrófono,
para evitar conflictos de dispositivo de audio.
"""

import threading
import struct
import math
import time
import json
import logging
import os

logger = logging.getLogger(__name__)

CLAP_THRESHOLD    = 3500
CLAP_MIN_INTERVAL = 0.4
CLAP_WINDOW       = 1.5
CLAP_COUNT_NEEDED = 2
FRAME_LENGTH      = 8000
SAMPLE_RATE       = 16000

WAKE_WORDS = ["jarvis", "jarvi", "jarbes", "harvis"]

MODEL_PATH_DEFAULT = os.path.join(os.path.dirname(__file__), "vosk-model-es")


class WakeWordDetector:
    def __init__(self, callback, model_path: str = None, sensitivity: float = 0.6):
        self.callback    = callback
        self.model_path  = model_path or MODEL_PATH_DEFAULT
        self._running    = False
        self._pausado    = False   # True mientras Azure usa el micrófono
        self._thread     = None
        self._clap_times = []

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread  = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("WakeWordDetector iniciado (Vosk offline)")

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)

    def pausar(self):
        """Llamar antes de que Azure Speech empiece a escuchar."""
        self._pausado = True
        logger.info("WakeWordDetector pausado (Azure usando micrófono)")

    def reanudar(self):
        """Llamar cuando Azure Speech termina de escuchar."""
        self._pausado = False
        logger.info("WakeWordDetector reanudado")

    def _loop(self):
        try:
            import pyaudio
            from vosk import Model, KaldiRecognizer
        except ImportError as e:
            logger.error(f"Dependencia faltante: {e}")
            return

        if not os.path.exists(self.model_path):
            logger.error(f"Modelo Vosk no encontrado en: {self.model_path}")
            return

        try:
            model      = Model(self.model_path)
            recognizer = KaldiRecognizer(model, SAMPLE_RATE)
            pa         = pyaudio.PyAudio()
            stream     = None

            logger.info("Escuchando wake word 'Jarvis' y aplausos...")

            while self._running:
                # Si está pausado, cerrar el stream y esperar
                if self._pausado:
                    if stream is not None:
                        try:
                            stream.stop_stream()
                            stream.close()
                        except Exception:
                            pass
                        stream = None
                    time.sleep(0.1)
                    continue

                # Si no hay stream activo, abrirlo
                if stream is None:
                    try:
                        stream = pa.open(
                            rate=SAMPLE_RATE,
                            channels=1,
                            format=pyaudio.paInt16,
                            input=True,
                            frames_per_buffer=FRAME_LENGTH,
                        )
                    except Exception as e:
                        logger.error(f"No se pudo abrir micrófono: {e}")
                        time.sleep(1)
                        continue

                try:
                    raw = stream.read(FRAME_LENGTH, exception_on_overflow=False)
                except Exception:
                    stream = None
                    continue

                pcm = struct.unpack_from(f"{FRAME_LENGTH}h", raw)

                # Wake word con Vosk
                if recognizer.AcceptWaveform(raw):
                    resultado = json.loads(recognizer.Result())
                    texto = resultado.get("text", "").lower()
                    if texto and any(w in texto for w in WAKE_WORDS):
                        logger.info(f"Wake word detectada: '{texto}'")
                        self._activar("jarvis")
                        recognizer.Reset()
                        continue

                # Aplauso
                if self._es_aplauso(pcm):
                    self._registrar_aplauso()

        except Exception as e:
            logger.error(f"Error en WakeWordDetector: {e}")
        finally:
            try:
                if stream:
                    stream.stop_stream()
                    stream.close()
                pa.terminate()
            except Exception:
                pass

    def _es_aplauso(self, pcm) -> bool:
        peak = max(abs(s) for s in pcm)
        if peak < CLAP_THRESHOLD:
            return False
        rms = math.sqrt(sum(s * s for s in pcm) / len(pcm))
        return rms > (CLAP_THRESHOLD * 0.5)

    def _registrar_aplauso(self):
        ahora = time.time()
        if self._clap_times and (ahora - self._clap_times[-1]) < CLAP_MIN_INTERVAL:
            return
        self._clap_times.append(ahora)
        self._clap_times = [t for t in self._clap_times if ahora - t <= CLAP_WINDOW]
        if len(self._clap_times) >= CLAP_COUNT_NEEDED:
            self._clap_times.clear()
            logger.info("Doble aplauso detectado")
            self._activar("aplauso")

    def _activar(self, fuente: str):
        threading.Thread(target=self.callback, args=(fuente,), daemon=True).start()