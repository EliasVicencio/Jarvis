# SATURDAY — Asistente Personal de Escritorio

Asistente personal con voz, investigación con IA y control por comandos, construido con React + Flask.
Desplegado en **Oracle Cloud** — https://jarvis-elias.viewdns.net

---

## Stack

- **Frontend:** React 18 + Vite
- **Backend:** Flask (Python) — Oracle Cloud Always Free (`VM.Standard.E2.1.Micro`)
- **Voz:** Edge TTS (`es-MX-JorgeNeural`) + Google STT
- **IA:** Groq — `openai/gpt-oss-20b` (chat/personalidad), `groq/compound-mini` (investigación con búsqueda web real)
- **Mapas:** Mapbox GL JS — un solo motor para el globo 3D (proyección nativa `globe`) y la vista de calles (edificios reales, cámara inclinable)
- **Núcleo holográfico:** Three.js (cargado por CDN)
- **APIs:** NewsAPI, CoinGecko, Google Calendar (OAuth2), Gmail IMAP, YouTube (RSS + Data API v3 opcional), Telegram Bot API

---

## Personalidad

Saturday tiene la personalidad de un mayordomo alemán de la vieja escuela: eficiente y leal,
pero con sarcasmo seco y crítica honesta — no es un asistente que solo valida ideas, las
evalúa de verdad antes de aplaudirlas. Se activa por voz diciendo **"Saturday"**.

---

## Módulos

- **Stark Intel** — Reproductor de video (YouTube) por canal, ticker de acciones, feed de
  noticias por categoría, análisis de titulares con IA, y overview del mercado cripto (Bitcoin).
- **Stark Maps** — Globo 3D interactivo con ciudades y vista de calles en 3D real, ambos
  sobre el mismo motor (Mapbox GL JS: edificios con volumen, cámara inclinable 2D/3D, cálculo de rutas).
- **Stark Ops** — Tablero Kanban de tareas y recordatorios.
- **Mission Control** — Panel interno de sistema (memoria, estado de red). Sin acceso desde
  la interfaz a propósito — es de uso interno, no un módulo navegable.

### Funcionalidad general (sin vista propia)
- Investigación profunda con búsqueda web real y fuentes citadas
- Diagnóstico de sistemas por voz (CPU/RAM/disco del servidor)
- Traducción de texto
- Recordatorios y notas rápidas
- Modo enfoque (Pomodoro) con aviso por voz
- Mecanismo proactivo: avisa sin que se lo pidan (resumen nocturno, eventos de calendario
  próximos, logros completados)
- Memoria semántica: recuerda contexto sobre Elías entre conversaciones
- Bot de Telegram como canal alternativo (mismos comandos que la web)

---

## Variables de entorno

Crea `backend/.env`:

```env
GROQ_API_KEY=
NEWS_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EMAIL_USER=
EMAIL_PASS=
YOUTUBE_API_KEY=       # opcional — sin esto usa RSS público y videos de muestra
PUBLIC_BASE_URL=       # opcional — dominio público del backend
```

Google Calendar usa OAuth2 vía `backend/credentials.json` + `backend/token.json`
(no son variables de entorno — nunca deben subirse al repo).

El token de Mapbox está embebido directo en `frontend/src/Mapa.jsx` (los tokens de Mapbox
son públicos por diseño, pero si haces un fork, reemplázalo por el tuyo).

---

## Comandos de voz principales

`qué hora es` · `qué fecha es` · `clima en [ciudad]` · `stark intel` · `abre mapa` ·
`stark ops` · `mis recordatorios` · `estado de los sistemas` · `investiga sobre [tema]` ·
`traduce [texto] al [idioma]` · `cuéntame un chiste` · `mis tareas` · `qué puedes hacer`

---

Desarrollado por **Elías Vicencio** — Analista Programador, Duoc UC