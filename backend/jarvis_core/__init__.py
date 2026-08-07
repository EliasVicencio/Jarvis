"""
Paquete jarvis_core: dividido en módulos por responsabilidad para que ningún
archivo crezca sin control. Este __init__.py re-exporta todo bajo el mismo
nombre de siempre, así que el resto del proyecto (app.py, telegram_bot.py)
sigue llamando `jarvis_core.funcion(...)` exactamente igual que antes — no
hace falta tocar esos archivos.

Estructura:
  voz.py           -> síntesis/reconocimiento de voz, mensajería a Telegram
  calendario.py    -> Google Calendar
  productividad.py -> notas, recordatorios, resumen del día, modo seguro, Pomodoro
  memoria.py       -> memoria semántica e historial de comandos
  proactividad.py  -> mecanismo para que Saturday hable sin que se lo pidan
  investigacion.py -> diagnóstico de sistemas, investigación con IA, traducción
  comandos.py      -> procesar_comando(), el despachador central
"""

from ..rutas.voz import *
from .calendario import *
from .productividad import *
from .memoria import *
from .proactividad import *
from .investigacion import *
from .comandos import *

# `import *` no trae nombres que empiezan con "_" — estos dos sí los usa
# app.py directamente (jarvis_core._avisos_proactivos, jarvis_core._limpiar_markdown)
from .proactividad import _avisos_proactivos  # noqa: F401 — re-exportado para jarvis_core._avisos_proactivos
from .investigacion import _limpiar_markdown  # noqa: F401 — re-exportado para jarvis_core._limpiar_markdown