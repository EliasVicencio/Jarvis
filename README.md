# Jarvis — App de Escritorio con Tauri + OpenClaw 🦞

Asistente de voz personal con ventana nativa (Tauri), frontend React/Vite,
backend Python/Flask con Azure Speech, y **OpenClaw** como cerebro AI.

```
┌──────────────────────────────────────────┐
│  Ventana Tauri (app nativa de escritorio) │
│  ┌────────────────────────────────────┐  │
│  │   Frontend React  (Vite)           │  │
│  └──────────────┬─────────────────────┘  │
└─────────────────┼────────────────────────┘
                  │  HTTP → localhost:5000
          ┌───────▼────────┐
          │  Flask backend  │
          │  Azure Speech   │
          └────────────────┘
```

---

## ⚠️ Antes de empezar — regenera tu clave de Azure

Tu clave anterior quedó expuesta en el código. Regenerarla es gratis y tarda
30 segundos:

1. Entra a https://portal.azure.com
2. Busca tu recurso de Speech → "Claves y punto de conexión"
3. Clic en "Regenerar clave 1"
4. Copia la clave nueva

---

## Prerequisitos

| Herramienta | Cómo instalar                        | Verificar           |
|-------------|--------------------------------------|---------------------|
| Rust        | https://rustup.rs                    | `rustc --version`   |
| C++ Build Tools (solo Windows) | https://visualstudio.microsoft.com/visual-cpp-build-tools → marcar "Desarrollo de escritorio con C++" | — |
| Node.js 18+ | https://nodejs.org (versión LTS)     | `node --version`    |
| Python 3.10+| https://python.org                   | `python --version`  |

---

## Estructura del proyecto

```
jarvis_tauri/
├── .openclaw/              ← configuración de OpenClaw
│   ├── openclaw.json       ← agente, canales, skills
│   └── workspace/skills/jarvis/SKILL.md
├── backend/
│   ├── app.py              ← servidor Flask (API REST + OpenClaw bridge)
│   ├── jarvis_core.py      ← lógica de Jarvis: voz + comandos + OC fallback
│   ├── config.py           ← lee la clave desde .env
│   ├── .env.example        ← plantilla → copiar como .env
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx         ← interfaz React (con OC status)
│   │   ├── App.css         ← estilos HUD oscuro
│   │   └── index.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── src-tauri/
│   ├── src/main.rs         ← código Rust de Tauri
│   ├── build.rs
│   ├── Cargo.toml
│   └── tauri.conf.json     ← configuración de la ventana y build
├── scripts/
│   ├── arrancar_openclaw.bat
│   └── arrancar_jarvis_completo.bat
└── .gitignore
```

---

## Instalación paso a paso

### 1. Configurar el backend

```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

Crea el archivo `.env` (nunca lo subas a git):

```bash
cp .env.example .env
```

Abre `.env` y pega tu clave nueva de Azure:

```
AZURE_SPEECH_KEY=pega_tu_clave_aqui
AZURE_SPEECH_REGION=eastus
AZURE_SPEECH_VOICE=es-MX-JorgeNeural
SPEECH_RECOGNITION_LANGUAGE=es-MX
```

### 2. Instalar dependencias del frontend

```bash
cd frontend
npm install
```

### 3. Instalar la CLI de Tauri

```bash
npm install -g @tauri-apps/cli
```

---

## Instalar OpenClaw (nuevo cerebro AI)

OpenClaw es el agente AI que le da inteligencia real a Jarvis.

```bash
npm install -g openclaw@latest
openclaw onboard   # primera vez: configura el agente
```

Configura tu modelo en `.openclaw/openclaw.json`. Por defecto usa `copilot/gpt-4o`.

## Correr en modo desarrollo

### Opción 1 — Todo junto (recomendado)

```bash
scripts\arrancar_jarvis_completo.bat
```

Esto arranca: OpenClaw Gateway → Backend Flask → App Tauri

### Opción 2 — Manual (tres terminales)

**Terminal 1 — OpenClaw Gateway:**
```bash
openclaw gateway --port 18789 --verbose
```

**Terminal 2 — Backend Flask:**
```bash
cd backend
venv\Scripts\activate     # o source venv/bin/activate en Mac/Linux
python app.py
```
Deberías ver: `🤖 Jarvis backend corriendo en http://localhost:5000`

**Terminal 3 — App Tauri (React + ventana nativa):**
```bash
# desde la raíz del proyecto (jarvis_tauri/)
npm run tauri dev
```

Esto:
1. Arranca Vite con el frontend React en localhost:5173
2. Compila el código Rust de Tauri
3. Abre la ventana nativa de escritorio con la interfaz de Jarvis

> La primera vez que compila Rust puede tardar 2-5 minutos. Las siguientes
> veces es mucho más rápido.

---

## Generar el instalador (.exe / .dmg / .deb)

```bash
# Asegúrate de que el backend esté detenido antes de hacer el build
npm run tauri build
```

El instalador queda en `src-tauri/target/release/bundle/`.

---

## Comandos disponibles en Jarvis

| Lo que dices                  | Qué hace                            |
|-------------------------------|-------------------------------------|
| "qué hora es"                 | Dice la hora actual                 |
| "qué fecha es"                | Dice la fecha de hoy                |
| "recuérdame [algo]"           | Guarda un recordatorio              |
| "mis recordatorios"           | Lista los recordatorios             |
| "clima en [ciudad]"           | Clima actual (Open-Meteo, gratis)   |
| "busca [algo]"                | Abre Google con la búsqueda         |
| "abre youtube"                | Abre YouTube en el navegador        |
| "abre spotify"                | Abre Spotify                        |
| "abre calculadora"            | Abre la calculadora del sistema     |
| "abre bloc de notas"          | Abre el bloc de notas               |
| "cuéntame un chiste"          | Dice un chiste                      |
| "qué puedes hacer" / "ayuda"  | Lista todos los comandos            |
| "adiós"                       | Se despide                          |

### Comandos potenciados por OpenClaw

Cualquier comando que Jarvis no reconozca se envía automáticamente a OpenClaw.
Ejemplos: *"organiza mis archivos del escritorio"*, *"resume este artículo"*, *"envía un correo"*, etc.

### Comunicación remota

Con OpenClaw también puedes hablar con Jarvis desde:
- **WhatsApp**: escanea el QR con `openclaw channels login --channel whatsapp`
- **Telegram**: configura tu bot token en `.openclaw/openclaw.json`
- **Discord**: configura tu bot token
- **WebChat**: `http://localhost:18789`

### Email

Jarvis puede leer y enviar correos electrónicos:
1. Configura `EMAIL_USER` y `EMAIL_PASS` en `backend/.env`
2. Usa una **contraseña de aplicación** de Google (no tu contraseña normal)
3. Desde OpenClaw: pídele que revise tu bandeja de entrada o que envíe un correo

---

## Solución de problemas comunes

**"No se pudo conectar con el backend"**
→ Asegúrate de que `python app.py` esté corriendo en otra terminal.

**Error de clave de Azure**
→ Verifica que el archivo `.env` existe en la carpeta `backend/` y que la
  clave es correcta (sin espacios extra).

**Error al compilar Rust la primera vez**
→ En Windows, verifica que instalaste las C++ Build Tools y reiniciaste
  la terminal después de instalar Rust.

**El micrófono no responde**
→ Azure Speech usa el micrófono predeterminado del sistema. Verifica en
  Configuración → Sonido que el micrófono correcto esté seleccionado.
