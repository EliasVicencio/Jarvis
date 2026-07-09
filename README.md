# JARVIS — Asistente Personal de Escritorio

Asistente personal tipo Iron Man construido con Tauri + React + Flask.
Desplegado en **Oracle Cloud** — https://129.80.59.180:8080

---

## Stack

- **Desktop:** Tauri (Rust)
- **Frontend:** React 18 + Vite
- **Backend:** Flask (Python) — Oracle Cloud Always Free
- **Voz:** Edge TTS (es-MX-JorgeNeural) + Google STT
- **IA local:** Ollama — llama3
- **Mapas:** Globe.gl + Leaflet.js
- **APIs:** YouTube Data v3, NewsAPI, CoinGecko, Google Calendar, Gmail IMAP

---

## Módulos

- **Stark Intel** — Noticias, YouTube con subtítulos traducidos, métricas crypto
- **Stark Maps** — Globo 3D interactivo con 386 ciudades, rutas y geolocalización
- **Mission Control** — Agentes IA (Ollama), Kanban de proyectos, correos y Google Calendar

---

## Variables de entorno

Crea `backend/.env`:

```env
NEWS_API_KEY=
YOUTUBE_API_KEY=
EMAIL_USER=
EMAIL_PASS=
```

---

## Comandos de voz principales

`qué hora es` · `clima en [ciudad]` · `stark intel` · `mapa` · `localiza [lugar]` · `mission control` · `crea carpeta [nombre]` · `mis eventos` · `busca [algo]` · `adiós`

---

Desarrollado por **Elías Vicencio** — Analista Programador, Duoc UC
