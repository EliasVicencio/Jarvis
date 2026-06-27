import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import Noticias from "./Noticias";
import "./Noticias.css";

const API = "http://localhost:5000/api";

const COMANDOS = [
  { texto: "qué hora es",           icono: "◷" },
  { texto: "qué fecha es",          icono: "◴" },
  { texto: "clima en Santiago",     icono: "☁" },
  { texto: "busca noticias de hoy", icono: "⌕" },
  { texto: "abre youtube",          icono: "▶" },
  { texto: "abre spotify",          icono: "♫" },
  { texto: "abre calculadora",      icono: "⬚" },
  { texto: "cuéntame un chiste",    icono: "✦" },
  { texto: "mis recordatorios",     icono: "✎" },
  { texto: "qué puedes hacer",      icono: "?" },
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
  const [vista,         setVista]         = useState("principal"); // "principal" | "noticias"
  const [mensajes,      setMensajes]      = useState([]);
  const [estado,        setEstado]        = useState("inactivo");
  const [recordatorios, setRecordatorios] = useState([]);
  const [inputManual,   setInputManual]   = useState("");
  const [backendOk,     setBackendOk]     = useState(null);
  const [wakeActivo,    setWakeActivo]    = useState(false);
  const [wakeFlash,     setWakeFlash]     = useState(null);

  const scrollRef         = useRef(null);
  const estadoRef         = useRef("inactivo");
  const escucharRef       = useRef(null); // ref para poder llamar desde el polling
  const hora = useReloj();

  useEffect(() => { estadoRef.current = estado; }, [estado]);

  const agregarMensaje = useCallback((rol, texto) => {
    setMensajes(prev => [...prev, { rol, texto, id: Date.now() + Math.random() }]);
  }, []);

  const refrescarRecordatorios = useCallback(() => {
    fetch(`${API}/recordatorios`)
      .then(r => r.json())
      .then(data => setRecordatorios(data.recordatorios || []))
      .catch(() => {});
  }, []);

  // ── Enviar comando ─────────────────────────────────────────────────────
  const enviarComando = useCallback(async (texto) => {
    if (!texto.trim() || estadoRef.current !== "inactivo") return;
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
      setTimeout(() => setEstado("inactivo"), 1000);
    } catch {
      agregarMensaje("sistema", "Error al contactar a Jarvis.");
      setEstado("inactivo");
    }
  }, [agregarMensaje, refrescarRecordatorios]);

  // ── Escuchar micrófono ─────────────────────────────────────────────────
  const escucharMicrofono = useCallback(async () => {
    if (estadoRef.current !== "inactivo") return;
    setEstado("escuchando");
    try {
      const resp = await fetch(`${API}/escuchar`, { method: "POST" });
      const data = await resp.json();
      if (data.ok && data.texto) {
        await enviarComando(data.texto);
      } else if (data.mensaje === "Wake word ignorada como comando") {
        // Azure captó "jarvis" — re-escuchar automáticamente para capturar el comando real
        setEstado("inactivo");
        setTimeout(() => escucharRef.current?.(), 300);
      } else {
        agregarMensaje("sistema", "No te entendí. Intenta de nuevo.");
        setEstado("inactivo");
      }
    } catch {
      agregarMensaje("sistema", "Error al acceder al micrófono.");
      setEstado("inactivo");
    }
  }, [agregarMensaje, enviarComando]);

  // Mantener la ref siempre actualizada con la versión más reciente
  useEffect(() => {
    escucharRef.current = escucharMicrofono;
  }, [escucharMicrofono]);

  // ── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/saludo`)
      .then(r => r.json())
      .then(data => {
        setBackendOk(true);
        setWakeActivo(data.wake_activo || false);
        agregarMensaje("jarvis", data.saludo);
        setRecordatorios(data.recordatorios || []);
      })
      .catch(() => {
        setBackendOk(false);
        agregarMensaje("sistema", "⚠ No se pudo conectar con el backend.");
      });
  }, [agregarMensaje]);

  // ── Polling wake word (cada 500ms) ─────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/wake-poll`);
        const data = await resp.json();

        if (data.activado) {
          const fuente = data.fuente;

          setWakeFlash(fuente);
          setTimeout(() => setWakeFlash(null), 1500);

          if (estadoRef.current === "inactivo") {
            setMensajes(prev => [...prev, {
              rol: "sistema",
              texto: fuente === "jarvis" ? "🎤 Wake word detectada: «Jarvis»" : "👏 Doble aplauso detectado",
              id: Date.now() + Math.random()
            }]);
            // Usar la ref — siempre tiene la versión actualizada de escucharMicrofono
            setTimeout(() => escucharRef.current?.(), 400);
          }
        }
      } catch {
        // silencioso
      }
    }, 500);

    return () => clearInterval(interval);
  }, []); // sin dependencias — usa refs para todo

  // ── Scroll automático ──────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes]);

  const handleEnviar = e => {
    e.preventDefault();
    enviarComando(inputManual);
    setInputManual("");
  };

  const horaStr  = hora.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fechaStr = hora.toLocaleDateString("es-CL",  { weekday: "long", day: "numeric", month: "long" });

  if (vista === "noticias") {
    return <Noticias onVolver={() => setVista("principal")} />;
  }

  return (
    <div className="shell">
      <div className="bg-grid" />

      {wakeFlash && (
        <div className={`wake-flash wake-flash-${wakeFlash}`}>
          {wakeFlash === "jarvis" ? "🎤 «Jarvis» detectado" : "👏 Doble aplauso detectado"}
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <div className="brand-name">JARVIS</div>
            <div className="brand-sub">asistente personal · Jorge Neural</div>
          </div>
        </div>
        <button className="nav-btn" onClick={() => setVista("noticias")}>
          ◈ Stark Intel
        </button>

        <div className="status-pills">
          <div className="status-pill" data-ok={backendOk}>
            <span className="status-dot" />
            {backendOk === null ? "Conectando…" : backendOk ? "Backend activo" : "Backend offline"}
          </div>
          <div className="status-pill" data-ok={wakeActivo}>
            <span className="status-dot" />
            {wakeActivo ? "Wake word activo" : "Wake word inactivo"}
          </div>
        </div>

        <div className="clock">
          <div className="clock-time">{horaStr}</div>
          <div className="clock-date">{fechaStr}</div>
        </div>
      </header>

      <main className="grid">

        <section className="panel core-panel">
          <div
            className={`ring estado-${estado}${wakeFlash ? " ring-wake" : ""}`}
            onClick={escucharMicrofono}
            role="button"
            tabIndex={0}
            aria-label="Activar micrófono"
            onKeyDown={e => e.key === "Enter" && escucharMicrofono()}
          >
            <div className="ring-outer" />
            <div className="ring-mid"   />
            <div className="ring-inner" />
            <div className="ring-core"><MicSVG /></div>
          </div>

          <p className="estado-label">{labelEstado(estado)}</p>

          <div className="wake-badges">
            <span className="wake-badge" data-activo={wakeActivo}>🗣 «Jarvis»</span>
            <span className="wake-badge" data-activo={wakeActivo}>👏 Doble aplauso</span>
          </div>

          <p className="hint">
            {wakeActivo ? "Di «Jarvis» o aplaude dos veces" : "Toca el núcleo o escribe abajo"}
          </p>

          <form className="input-row" onSubmit={handleEnviar}>
            <input
              className="txt-input"
              type="text"
              placeholder="Escribe un comando…"
              value={inputManual}
              onChange={e => setInputManual(e.target.value)}
              disabled={estado !== "inactivo"}
            />
            <button className="btn-send" type="submit" disabled={estado !== "inactivo"}>➤</button>
          </form>
        </section>

        <section className="panel log-panel">
          <div className="panel-header">Registro de conversación</div>
          <div className="log-scroll" ref={scrollRef}>
            {mensajes.length === 0 && (
              <div className="empty-hint">Di «Jarvis», aplaude dos veces, o escribe algo.</div>
            )}
            {mensajes.map(m => (
              <div key={m.id} className={`bubble bubble-${m.rol}`}>
                <span className="bubble-tag">{labelRol(m.rol)}</span>
                <span className="bubble-texto">{m.texto}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel side-panel">
          <div className="panel-header">Comandos rápidos</div>
          <div className="chip-list">
            {COMANDOS.map(c => (
              <button
                key={c.texto}
                className="chip"
                onClick={() => enviarComando(c.texto)}
                disabled={estado !== "inactivo"}
              >
                <span className="chip-icon">{c.icono}</span>
                {c.texto}
              </button>
            ))}
          </div>

          <div className="panel-header panel-header-mt">
            Recordatorios
            <span className="badge">{recordatorios.length}</span>
          </div>
          <div className="reminder-list">
            {recordatorios.length === 0
              ? <div className="empty-hint">Sin recordatorios.</div>
              : recordatorios.map((r, i) => (
                  <div key={i} className="reminder-item">
                    <span className="reminder-dot" />{r}
                  </div>
                ))
            }
          </div>
        </section>

      </main>
    </div>
  );
}

function labelEstado(e) {
  return { escuchando: "Escuchando…", procesando: "Procesando…", hablando: "Respondiendo…" }[e]
    ?? "Listo — di «Jarvis» o aplaude";
}
function labelRol(r) {
  return { usuario: "Tú", jarvis: "Jarvis", sistema: "Sistema" }[r] ?? r;
}
function MicSVG() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3z"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19 11a7 7 0 01-14 0M12 18v3"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}