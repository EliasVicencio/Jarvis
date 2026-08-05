"""Mecanismo general para que Saturday hable sin que se lo pidan (Pomodoro, logros, horario, calendario)."""
import time
import threading
import datetime
import queue

from .voz import enviar_texto_telegram
from .calendario import _obtener_servicio_calendar, resumen_agenda_hoy

_avisos_proactivos = queue.Queue()

def anunciar_proactivo(mensaje, telegram=True):
    """Mecanismo general para que Saturday hable sin que se lo pidan: lo usan Pomodoro,
    logros, y cualquier chequeo proactivo (horario, calendario, etc). Lo consume el
    frontend vía /api/wake-poll y opcionalmente lo reenvía a Telegram."""
    if telegram:
        enviar_texto_telegram(f"🗣️ {mensaje}")
    _avisos_proactivos.put(mensaje)


_proactividad_estado = {"resumen_nocturno_hecho": None, "eventos_avisados": set()}

def _chequeo_proactivo():
    """Corre una vez, evalúa si vale la pena que Saturday hable sin que le pregunten.
    Se llama periódicamente desde el hilo de proactividad."""
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("America/Santiago")
    ahora = datetime.datetime.now(tz)
    hoy_str = ahora.date().isoformat()

    # ── Resumen nocturno (una vez al día, a partir de las 22:00) ──────────
    if ahora.hour >= 22 and _proactividad_estado["resumen_nocturno_hecho"] != hoy_str:
        _proactividad_estado["resumen_nocturno_hecho"] = hoy_str
        resumen = resumen_agenda_hoy()
        anunciar_proactivo(f"Antes de que termines el día: {resumen}")

    # ── Eventos de calendario que empiezan en los próximos 15 minutos ─────
    try:
        service = _obtener_servicio_calendar()
        if service:
            en_15 = ahora + datetime.timedelta(minutes=15)
            eventos_result = service.events().list(
                calendarId='primary', timeMin=ahora.isoformat(), timeMax=en_15.isoformat(),
                singleEvents=True, orderBy='startTime', timeZone='America/Santiago'
            ).execute()
            for ev in eventos_result.get('items', []):
                ev_id = ev.get('id')
                if ev_id in _proactividad_estado["eventos_avisados"]:
                    continue
                inicio_ev = ev['start'].get('dateTime')
                if not inicio_ev:
                    continue
                titulo = ev.get('summary', 'un evento')
                hora = inicio_ev[11:16]
                _proactividad_estado["eventos_avisados"].add(ev_id)
                anunciar_proactivo(f"Recordatorio: tienes \"{titulo}\" a las {hora}, en menos de 15 minutos.")
    except Exception as e:
        print(f"⚠ Error en chequeo proactivo de calendario: {e}")


def iniciar_proactividad():
    """Arranca el hilo en segundo plano que revisa cada 5 minutos si Saturday debería hablar."""
    def _loop():
        while True:
            try:
                _chequeo_proactivo()
            except Exception as e:
                print(f"⚠ Error en hilo de proactividad: {e}")
            time.sleep(300)  # cada 5 minutos
    threading.Thread(target=_loop, daemon=True).start()