"""Integración con Google Calendar: agenda del día."""
import os
import datetime

CALENDAR_TOKEN_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "token.json")
CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def _obtener_servicio_calendar():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    if not os.path.exists(CALENDAR_TOKEN_PATH):
        return None
    creds = Credentials.from_authorized_user_file(CALENDAR_TOKEN_PATH, CALENDAR_SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        with open(CALENDAR_TOKEN_PATH, "w") as f:
            f.write(creds.to_json())
    return build('calendar', 'v3', credentials=creds)

def resumen_agenda_hoy():
    """Genera un resumen hablado de los eventos de hoy en Google Calendar."""
    try:
        service = _obtener_servicio_calendar()
        if not service:
            return "No tengo acceso a tu calendario configurado, señor."

        from zoneinfo import ZoneInfo
        tz = ZoneInfo("America/Santiago")
        hoy = datetime.datetime.now(tz).date()
        inicio = datetime.datetime.combine(hoy, datetime.time.min, tzinfo=tz).isoformat()
        fin = datetime.datetime.combine(hoy, datetime.time.max, tzinfo=tz).isoformat()

        eventos_result = service.events().list(
            calendarId='primary', timeMin=inicio, timeMax=fin,
            singleEvents=True, orderBy='startTime', timeZone='America/Santiago'
        ).execute()
        eventos = eventos_result.get('items', [])

        if not eventos:
            return "No tienes eventos programados para hoy."

        partes = [f"Tienes {len(eventos)} evento{'s' if len(eventos) != 1 else ''} hoy."]
        for ev in eventos[:5]:
            titulo = ev.get('summary', 'Sin título')
            inicio_ev = ev['start'].get('dateTime')
            if inicio_ev:
                hora = inicio_ev[11:16]
                partes.append(f"A las {hora}, {titulo}.")
            else:
                partes.append(f"{titulo}, todo el día.")
        return " ".join(partes)
    except Exception as e:
        print(f"⚠ Error obteniendo eventos del calendario: {e}")
        return "No pude acceder a tu calendario en este momento, señor."