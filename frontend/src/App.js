import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

const API = "/api";

const COMANDOS_SUGERIDOS = [
  { texto: "qué hora es", icono: "◷" },
  { texto: "qué fecha es", icono: "◴" },
  { texto: "clima en Santiago", icono: "☁" },
  { texto: "busca recetas de pasta", icono: "⌕" },
  { texto: "abre youtube", icono: "▶" },
  { texto: "cuéntame un chiste", icono: "✦" },
  { texto: "recuérdame comprar pan", icono: "✎" },
  { texto: "qué puedes hacer", icono: "?" },
];

function useReloj() {
  const [hora, setHora] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return hora;
}

export default function App() {
  const [mensajes, setMensajes] = useState([]);
  const [estado, setEstado] = useState("inactivo"); // inactivo | escuchando | procesando | hablando
  const [recordatorios, setRecordatorios] = useState([]);
  const [inputManual, setInputManual] = useState("");
  const scrollRef = useRef(null);
  const hora = useReloj();

  const agregarMensaje = useCallback((rol, texto) => {
    setMensajes((prev) => [...prev, { rol, texto, ts: Date.now() }]);
  }, []);

  // Carga inicial: saludo + recordatorios
  useEffect(() => {
    fetch(`${API}/saludo`)
      .then((r) => r.json())
      .then((data) => {
        agregarMensaje("jarvis", data.saludo);
        setRecordatorios(data.recordatorios || []);
      })
      .catch(() => {
        agregarMensaje(
          "sistema",
          "No se pudo conectar con el backend. ¿Está corriendo app.py?"
        );
      });
  }, [agregarMensaje]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes]);

  const refrescarRecordatorios = useCallback(() => {
    fetch(`${API}/recordatorios`)
      .then((r) => r.json())
      .then((data) => setRecordatorios(data.recordatorios || []))
      .catch(() => {});
  }, []);

  const enviarComando = useCallback(
    async (texto) => {
      if (!texto.trim()) return;
      agregarMensaje("usuario", texto);
      setEstado("procesando");
      try {
        const resp = await fetch(`${API}/comando`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comando: texto, hablar: true }),
        });
        const data = await resp.json();
        setEstado("hablando");
        agregarMensaje("jarvis", data.respuesta);
        if (data.accion === "recordatorio_agregado") refrescarRecordatorios();
        setTimeout(() => setEstado("inactivo"), 900);
      } catch (e) {
        agregarMensaje("sistema", "Error al contactar a Jarvis.");
        setEstado("inactivo");
      }
    },
    [agregarMensaje, refrescarRecordatorios]
  );

  const escucharMicrofono = useCallback(async () => {
    setEstado("escuchando");
    try {
      const resp = await fetch(`${API}/escuchar`, { method: "POST" });
      const data = await resp.json();
      if (data.ok && data.texto) {
        await enviarComando(data.texto);
      } else {
        agregarMensaje("sistema", "No te entendí. Intenta de nuevo.");
        setEstado("inactivo");
      }
    } catch (e) {
      agregarMensaje("sistema", "No se pudo acceder al micrófono del servidor.");
      setEstado("inactivo");
    }
  }, [agregarMensaje, enviarComando]);

  const handleEnviarManual = (e) => {
    e.preventDefault();
    enviarComando(inputManual);
    setInputManual("");
  };

  const horaStr = hora.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fechaStr = hora.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="jarvis-shell">
      <div className="bg-grid" />
      <div className="bg-scanline" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">J</span>
          <div className="brand-text">
            <span className="brand-name">JARVIS</span>
            <span className="brand-sub">asistente personal · voz Jorge</span>
          </div>
        </div>
        <div className="clock">
          <span className="clock-time">{horaStr}</span>
          <span className="clock-date">{fechaStr}</span>
        </div>
      </header>

      <main className="main-grid">
        {/* Columna izquierda: núcleo de voz */}
        <section className="panel core-panel">
          <div className={`core-ring estado-${estado}`} onClick={escucharMicrofono} role="button" tabIndex={0}
               onKeyDown={(e) => e.key === "Enter" && escucharMicrofono()}>
            <div className="core-ring-outer" />
            <div className="core-ring-mid" />
            <div className="core-center">
              <MicIcon estado={estado} />
            </div>
          </div>
          <p className="core-estado-label">{etiquetaEstado(estado)}</p>
          <p className="core-hint">Toca el núcleo o usa el campo de texto para hablar con Jarvis</p>

          <form className="input-row" onSubmit={handleEnviarManual}>
            <input
              type="text"
              value={inputManual}
              onChange={(e) => setInputManual(e.target.value)}
              placeholder="Escribe un comando…"
              className="text-input"
            />
            <button type="submit" className="btn-send" aria-label="Enviar comando">
              ➤
            </button>
          </form>
        </section>

        {/* Columna central: conversación */}
        <section className="panel log-panel">
          <div className="panel-header">
            <span>Registro de conversación</span>
          </div>
          <div className="log-scroll" ref={scrollRef}>
            {mensajes.length === 0 && (
              <div className="log-empty">Aún no hay mensajes. Di algo para comenzar.</div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`bubble bubble-${m.rol}`}>
                <span className="bubble-tag">{etiquetaRol(m.rol)}</span>
                <span className="bubble-texto">{m.texto}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Columna derecha: comandos + recordatorios */}
        <section className="panel side-panel">
          <div className="panel-header">
            <span>Comandos rápidos</span>
          </div>
          <div className="chip-grid">
            {COMANDOS_SUGERIDOS.map((c) => (
              <button
                key={c.texto}
                className="chip"
                onClick={() => enviarComando(c.texto)}
              >
                <span className="chip-icono">{c.icono}</span>
                {c.texto}
              </button>
            ))}
          </div>

          <div className="panel-header panel-header-mt">
            <span>Recordatorios</span>
            <span className="badge">{recordatorios.length}</span>
          </div>
          <div className="reminders-list">
            {recordatorios.length === 0 && (
              <div className="log-empty">Sin recordatorios pendientes.</div>
            )}
            {recordatorios.map((r, i) => (
              <div key={i} className="reminder-item">
                <span className="reminder-dot" />
                {r}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function etiquetaEstado(estado) {
  switch (estado) {
    case "escuchando":
      return "Escuchando…";
    case "procesando":
      return "Procesando…";
    case "hablando":
      return "Respondiendo…";
    default:
      return "Listo — toca para hablar";
  }
}

function etiquetaRol(rol) {
  if (rol === "usuario") return "Tú";
  if (rol === "jarvis") return "Jarvis";
  return "Sistema";
}

function MicIcon({ estado }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M19 11a7 7 0 01-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
