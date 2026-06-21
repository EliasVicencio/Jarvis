# Jarvis — Asistente Personal de Voz

Proyecto con backend en Python (Flask + Azure Speech) y frontend en React,
con interfaz tipo consola/HUD.

## ⚠️ Seguridad — Leer primero

Tu clave anterior de Azure quedó expuesta en texto plano en `config.py` y
`jarvis.py`. **Regenera la clave en Azure Portal** antes de continuar:

1. Entra a [portal.azure.com](https://portal.azure.com)
2. Ve a tu recurso de Speech
3. "Claves y punto de conexión" → Regenerar clave
4. Usa la clave nueva en el `.env` (ver abajo), nunca en el código

Si planeas subir este proyecto a GitHub, el `.gitignore` ya excluye `.env`
para que la clave no quede pública.

## Estructura del proyecto

```
jarvis_project/
├── backend/
│   ├── app.py              # Servidor Flask (API REST)
│   ├── jarvis_core.py      # Lógica de Jarvis: voz, comandos
│   ├── config.py           # Carga la clave desde variables de entorno
│   ├── .env.example        # Plantilla — cópiala como .env
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js          # Interfaz principal (React)
│   │   ├── App.css         # Estilos HUD
│   │   └── index.js
│   └── package.json
└── .gitignore
```

## 1. Configurar el backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # En Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edita .env y pega tu clave de Azure (la nueva, regenerada)
```

Tu `.env` debe verse así:

```
AZURE_SPEECH_KEY=tu_clave_nueva_aqui
AZURE_SPEECH_REGION=eastus
AZURE_SPEECH_VOICE=es-MX-JorgeNeural
SPEECH_RECOGNITION_LANGUAGE=es-MX
```

## 2. Compilar el frontend

```bash
cd frontend
npm install
npm run build
```

Esto genera `frontend/build/`, que Flask sirve automáticamente.

## 3. Ejecutar

```bash
cd backend
python app.py
```

Abre **http://localhost:5000** en tu navegador. Verás la interfaz de Jarvis.

### Modo desarrollo (opcional)

Si quieres editar el frontend con recarga automática, en una terminal corre
el backend (`python app.py`) y en otra:

```bash
cd frontend
npm start
```

React se abrirá en `http://localhost:3000` y llamará automáticamente al
backend en el puerto 5000 (gracias al `proxy` configurado en `package.json`).

## Cómo funciona el micrófono

Azure Speech SDK usa el micrófono y los parlantes **del computador donde
corre `app.py`**, no los del navegador. Esto es perfecto para uso local en tu
propia máquina. Si en el futuro quieres correr el backend en un servidor
remoto, habría que cambiar a captura de audio desde el navegador (Web Speech
API o MediaRecorder) y enviar el audio al backend.

## Comandos disponibles

| Comando (ejemplos)              | Qué hace                                  |
|----------------------------------|--------------------------------------------|
| "qué hora es"                    | Dice la hora actual                        |
| "qué fecha es"                   | Dice la fecha actual                       |
| "recuérdame [algo]"              | Guarda un recordatorio                     |
| "mis recordatorios"              | Lista los recordatorios guardados          |
| "clima en [ciudad]"              | Da el clima actual de esa ciudad           |
| "busca [algo]"                   | Busca en Google                            |
| "abre navegador" / "abre google" | Abre Google                                |
| "abre youtube"                   | Abre YouTube                               |
| "abre spotify"                   | Abre Spotify                               |
| "abre calculadora"               | Abre la calculadora del sistema            |
| "abre bloc de notas"             | Abre el bloc de notas del sistema          |
| "cuéntame un chiste"             | Dice un chiste                             |
| "qué puedes hacer" / "ayuda"     | Lista los comandos disponibles             |
| "adiós"                          | Se despide                                 |

## Próximos pasos sugeridos

- Agregar más voces de Azure y dejar que el usuario elija desde la interfaz
- Guardar recordatorios con fecha/hora y avisos
- Integrar reconocimiento de voz desde el navegador para poder desplegar en
  un servidor remoto (no solo localhost)
