# Jarvis — Asistente Personal 24/7 en Oracle Cloud 🚀

Asistente de voz personal con interfaz web React, backend Python/Flask,
cerebro **Groq** (LLM gratuito) y canales **Telegram/WhatsApp** vía OpenClaw Gateway.

```
┌── Tu navegador (PC/celular) ──────────────────────┐
│  https://129.80.59.180:8080                        │
│  ┌──────────────────────────────────────────────┐  │
│  │  Frontend React + Vite                       │  │
│  │  • Reconocimiento de voz (Web Speech API)    │  │
│  │  • Síntesis de voz (speechSynthesis)         │  │
│  └──────────────────┬───────────────────────────┘  │
└─────────────────────┼──────────────────────────────┘
                      │ HTTPS (nginx proxy)
          ┌───────────▼───────────┐
          │   Oracle Cloud VM     │
          │   (Always Free)       │
          │  ┌─────────────────┐  │
          │  │ Flask Backend   │  │
          │  │ :5000           │  │
          │  │ • Procesador    │  │
          │  │   local (hora,  │  │
          │  │   clima, etc.)  │  │
          │  │ • Fallback Groq │  │
          │  └────────┬────────┘  │
          │           │           │
          │  ┌────────▼────────┐  │
          │  │ OpenClaw Gateway│  │
          │  │ :18789          │  │
          │  │ • Telegram Bot  │  │
          │  │ • WhatsApp      │  │
          │  └─────────────────┘  │
          └───────────────────────┘
```

---

## 🌐 Acceso

| Vía | URL / Datos |
|-----|-------------|
| **Web** | `https://129.80.59.180:8080` |
| **Telegram** | `@jarvis_elias_vicencio_bot` |
| **API** | `POST https://129.80.59.180:8080/api/openclaw/preguntar` |

El certificado es autofirmado → al entrar por primera vez hacé clic en
**Advanced → Proceed to 129.80.59.180 (unsafe)**.

---

## 🧠 Arquitectura

| Componente | Tecnología | Función |
|------------|-----------|---------|
| **Frontend** | React + Vite | Interfaz web, voz por Web Speech API |
| **Backend** | Python Flask | Comandos locales + proxy a Groq |
| **LLM** | Groq (`llama-3.1-8b-instant`) | Respuestas inteligentes |
| **Gateway** | OpenClaw 2026.6 | Canales Telegram/WhatsApp |
| **Servidor** | Oracle Cloud VM.Standard.E2.1.Micro | 1 GB RAM, 2 GB swap |
| **Web server** | nginx | HTTPS + proxy inverso |

---

## 📋 Comandos disponibles

### Procesador local (rápidos, sin IA)

| Comando | Respuesta |
|---------|-----------|
| "qué hora es" | Hora actual del servidor |
| "qué fecha es" | Fecha actual |
| "clima en [ciudad]" | Clima vía Open-Meteo (gratis) |
| "cuéntame un chiste" | Chiste aleatorio |
| "mis recordatorios" | Lista recordatorios guardados |
| "recuérdame [algo]" | Guarda recordatorio |
| "abre youtube" | Abre YouTube en tu navegador |
| "abre spotify" | Abre Spotify Web |
| "busca [algo]" | Busca en Google |
| "stark intel" | Abre vista de noticias |
| "abre mapa" | Abre Stark Maps |
| "qué puedes hacer" / "ayuda" | Lista de comandos |

### Groq (IA, cualquier pregunta)

Cualquier comando que el procesador local no reconozca se envía a Groq.

Ejemplos: *"cuanto es 2+2"*, *"explica la teoría de la relatividad"*, *"escribe un poema"*, etc.

---

## 🚀 Despliegue en Oracle Cloud

### Prerrequisitos

- VM Ubuntu 22.04 (Always Free) con puerto 8080 abierto
- Node.js 22+, Python 3.10+, nginx

### 1. Clonar el repositorio

```bash
git clone <repo> /home/ubuntu/Jarvis
cd /home/ubuntu/Jarvis
```

### 2. Backend

```bash
python3 -m venv venv
source venv/bin/activate
cd backend
pip install -r requirements.txt
```

Crear `.env`:

```env
GROQ_API_KEY=gsk_tu_clave_aqui
OPENAI_API_KEY=gsk_tu_clave_aqui
OPENAI_BASE_URL=https://api.groq.com/openai/v1
```

### 3. Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run build
```

### 4. nginx

```nginx
server {
    listen 8080 ssl;
    server_name _;

    ssl_certificate     /etc/ssl/certs/jarvis-selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/jarvis-selfsigned.key;

    root /home/ubuntu/Jarvis/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 5. Certificado autofirmado

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/jarvis-selfsigned.key \
  -out /etc/ssl/certs/jarvis-selfsigned.crt \
  -subj '/CN=129.80.59.180'
```

### 6. systemd (servicios automáticos)

**jarvis-backend.service**:
```ini
[Unit]
Description=Jarvis Flask Backend
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/Jarvis/backend
ExecStart=/home/ubuntu/Jarvis/venv/bin/python app.py
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

**jarvis-gateway.service**:
```ini
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
ExecStart=/usr/bin/openclaw gateway run --force
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
```

### 7. Telegram Bot

En `/home/ubuntu/.openclaw/openclaw.json`:

```json
{
  "agents": { "main": { "model": "openai/llama-3.1-8b-instant" } },
  "gateway": {
    "mode": "local",
    "auth": { "token": "jarvis-dev-token-2026" },
    "channels": {
      "telegram": { "botToken": "8899539220:AAFacmqK0Azb-ZKMC5o4B5a5hxBdFirQwVs" }
    }
  }
}
```

### 8. Firewall

```bash
sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
```

---

## 🔧 Desarrollo local (Windows)

### Prerrequisitos

| Herramienta | Versión |
|-------------|---------|
| Node.js | 18+ |
| Python | 3.10+ |
| OpenClaw CLI | 2026.x (`npm install -g openclaw@latest`) |

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # editar con tu GROQ_API_KEY
python app.py
```

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

### OpenClaw Gateway (Telegram/WhatsApp)

```bash
openclaw gateway run --force
```

---

## 🤝 Canales

| Canal | Estado |
|-------|--------|
| 🌐 Web UI | ✅ `https://129.80.59.180:8080` |
| ✈️ Telegram | ✅ `@jarvis_elias_vicencio_bot` |
| 💬 WhatsApp | Configurable vía OpenClaw |
| 💻 Discord | Configurable vía OpenClaw |

---

## 📁 Estructura del proyecto

```
Jarvis/
├── backend/
│   ├── app.py              ← Flask: API REST + Groq + proxy
│   ├── jarvis_core.py      ← Lógica local: hora, clima, comandos
│   ├── wake_word.py        ← Detector de wake word (Azure/Google)
│   ├── config.py           ← Config desde .env
│   ├── .env                ← Claves (GROQ_API_KEY)
│   ├── requirements.txt
│   └── venv/               ← Entorno virtual Python
├── frontend/
│   ├── src/
│   │   ├── App.jsx         ← React: UI + voz browser + TTS
│   │   ├── App.css         ← Estilos HUD oscuro
│   │   ├── index.jsx
│   │   ├── Noticias.jsx    ← Stark Intel
│   │   ├── Mapa.jsx        ← Stark Maps
│   │   └── MissionControl.jsx
│   ├── index.html
│   ├── package.json
│   └── dist/               ← Build estático (servido por nginx)
└── README.md
```

---

## ❓ Solución de problemas

**"Backend offline" en la web**
→ Verificar que el backend esté corriendo: `sudo systemctl status jarvis-backend`

**El micrófono no funciona**
→ El sitio requiere HTTPS. Usar `https://129.80.59.180:8080`
→ En Brave, desactivar el escudo (🛡️ → Shields Down) para el sitio

**No se escucha la voz**
→ El navegador debe tener permisos de audio. Usar speechSynthesis del browser.
→ Brave: desactivar Shields

**Error 502 Bad Gateway**
→ nginx no puede conectar con Flask. Verificar: `sudo systemctl restart jarvis-backend`

**OpenClaw no responde**
→ Verificar gateway: `sudo systemctl status jarvis-gateway`
→ Verificar modelo en `~/.openclaw/openclaw.json`
