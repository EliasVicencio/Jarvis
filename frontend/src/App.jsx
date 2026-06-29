import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import Noticias from "./Noticias";
import "./Noticias.css";

const API = "http://localhost:5000/api";

const COMANDOS = [
  { texto: "qué hora es",        icono: "◷" },
  { texto: "qué fecha es",       icono: "◴" },
  { texto: "clima en Santiago",  icono: "☁" },
  { texto: "stark intel",        icono: "◈", accion: "noticias" },
  { texto: "abre youtube",       icono: "▶" },
  { texto: "abre spotify",       icono: "♫" },
  { texto: "abre calculadora",   icono: "⬚" },
  { texto: "cuéntame un chiste", icono: "✦" },
  { texto: "mis recordatorios",  icono: "✎" },
  { texto: "qué puedes hacer",   icono: "?" },
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
  const [vista,       setVista]       = useState("principal");
  const [estado,      setEstado]      = useState("inactivo");
  const [inputManual, setInputManual] = useState("");
  const [backendOk,   setBackendOk]   = useState(null);
  const [wakeActivo,  setWakeActivo]  = useState(false);
  const [wakeFlash,   setWakeFlash]   = useState(null);

  const estadoRef   = useRef("inactivo");
  const escucharRef = useRef(null);
  const hora = useReloj();

  useEffect(() => { estadoRef.current = estado; }, [estado]);

  const refrescarRecordatorios = useCallback(() => {}, []);

  // ── Enviar comando ─────────────────────────────────────────────────────
  const enviarComando = useCallback(async (texto, forzar = false) => {
    if (!texto.trim()) return;
    if (!forzar && estadoRef.current !== "inactivo") return;
    setEstado("procesando");
    estadoRef.current = "procesando";
    try {
      const resp = await fetch(`${API}/comando`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comando: texto, hablar: true }),
      });
      const data = await resp.json();
      setEstado("hablando");
      estadoRef.current = "hablando";
      if (data.accion === "abrir_noticias") setVista("noticias");
      setTimeout(() => {
        setEstado("inactivo");
        estadoRef.current = "inactivo";
      }, 1000);
    } catch {
      setEstado("inactivo");
      estadoRef.current = "inactivo";
    }
  }, []);

  // ── Escuchar micrófono ─────────────────────────────────────────────────
  const escucharMicrofono = useCallback(async () => {
    if (estadoRef.current !== "inactivo") return;
    setEstado("escuchando");
    try {
      const resp = await fetch(`${API}/escuchar`, { method: "POST" });
      const data = await resp.json();
      if (data.ok && data.texto) {
        setEstado("inactivo");
        estadoRef.current = "inactivo";
        await enviarComando(data.texto, true);
      } else if (data.mensaje === "Wake word ignorada como comando") {
        setEstado("inactivo");
        estadoRef.current = "inactivo";
        setTimeout(() => escucharRef.current?.(), 300);
      } else {
        setEstado("inactivo");
        estadoRef.current = "inactivo";
      }
    } catch {
      setEstado("inactivo");
      estadoRef.current = "inactivo";
    }
  }, [enviarComando]);

  useEffect(() => { escucharRef.current = escucharMicrofono; }, [escucharMicrofono]);

  // ── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/saludo`)
      .then(r => r.json())
      .then(data => {
        setBackendOk(true);
        setWakeActivo(data.wake_activo || false);
      })
      .catch(() => setBackendOk(false));
  }, []);

  // ── Polling wake word ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${API}/wake-poll`);
        const data = await resp.json();
        if (data.activado) {
          setWakeFlash(data.fuente);
          setTimeout(() => setWakeFlash(null), 1500);
          if (estadoRef.current === "inactivo") {
            setTimeout(() => escucharRef.current?.(), 400);
          }
        }
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleEnviar = e => {
    e.preventDefault();
    if (inputManual.trim()) {
      enviarComando(inputManual);
      setInputManual("");
    }
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
        <div className="wake-flash">🎤 «Jarvis» detectado</div>
      )}

      {/* ── Topbar ─────────────────────────────────────────── */}
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

      {/* ── Cuerpo ─────────────────────────────────────────── */}
      <main className="main-body">

        {/* Chips arriba */}
        <div className="chips-row">
          {COMANDOS.map(c => (
            <button
              key={c.texto}
              className="chip"
              onClick={() => c.accion === "noticias" ? setVista("noticias") : enviarComando(c.texto)}
              disabled={estado !== "inactivo"}
            >
              <span className="chip-icon">{c.icono}</span>
              {c.texto}
            </button>
          ))}
        </div>

        {/* Anillo central */}
        <div className="core-wrap">
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
          <p className="hint">
            {wakeActivo ? "Di «Jarvis» para activar" : "Toca el núcleo o escribe abajo"}
          </p>
        </div>

        {/* Input centrado abajo */}
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

      </main>
    </div>
  );
}

function labelEstado(e) {
  return { escuchando: "Escuchando…", procesando: "Procesando…", hablando: "Respondiendo…" }[e]
    ?? "Listo — di «Jarvis»";
}

function MicSVG() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
      <path d="M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3z"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19 11a7 7 0 01-14 0M12 18v3"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}