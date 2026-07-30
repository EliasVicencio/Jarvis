import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import Noticias from "./Noticias";
import "./Noticias.css";
import Mapa from "./Mapa";
import "./Mapa.css";
import MissionControl from "./MissionControl";
import "./MissionControl.css";

const API = "/api";

const COMANDOS = [
  { texto: "qué hora es",        icono: "◷" },
  { texto: "qué fecha es",       icono: "◴" },
  { texto: "clima en Santiago",  icono: "☁" },
  { texto: "stark intel",        icono: "◈", accion: "noticias" },
  { texto: "abre mapa",         icono: "◎", accion: "mapa" },
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
  const [busquedaMapa,    setBusquedaMapa]    = useState(null);
  const [canalNoticias,   setCanalNoticias]   = useState(null);
  const [tarjetas, setTarjetas] = useState([]);

  const estadoRef   = useRef("inactivo");
  const escucharRef = useRef(null);
  const scrollRef   = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const streamRef        = useRef(null);
  const hora = useReloj();

  useEffect(() => { estadoRef.current = estado; }, [estado]);

  const refrescarRecordatorios = useCallback(() => {}, []);

  // ── Browser TTS ────────────────────────────────────────────────────────
  const hablarBrowser = useCallback((texto) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = "es-MX";
    utter.rate = 1.1;
    window.speechSynthesis.speak(utter);
  }, []);

  // ── Enviar comando ─────────────────────────────────────────────────────
  const enviarComando = useCallback(async (texto, forzar = false) => {
    if (!texto.trim()) return;
    if (!forzar && estadoRef.current !== "inactivo") return;
    setEstado("procesando");
    estadoRef.current = "procesando";
    setTarjetas([]);

    try {
      const resp = await fetch(`${API}/comando`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comando: texto, hablar: false }),
      });
      const data = await resp.json();
      setEstado("hablando");
      estadoRef.current = "hablando";
      if (data.respuesta) {
        setTarjetas([{ pregunta: texto, respuesta: data.respuesta }]);
        if (data.audio_base64) {
          const audio = new Audio(`data:audio/mpeg;base64,${data.audio_base64}`);
          audio.play().catch(() => hablarBrowser(data.respuesta));
        } else {
          hablarBrowser(data.respuesta);
        }
      }
      if (data.accion && data.accion.startsWith("cambiar_canal:")) {
        const canal = data.accion.replace("cambiar_canal:", "");
        setEstado("hablando"); estadoRef.current = "hablando";
        setCanalNoticias(canal);
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      if (data.accion === "cambiar_canal" && data.dato) {
        setEstado("hablando"); estadoRef.current = "hablando";
        setCanalNoticias(data.dato);
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      if (data.accion === "abrir_noticias") {
        setEstado("hablando"); estadoRef.current = "hablando";
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      if (data.accion === "abrir_mapa") {
        setEstado("hablando"); estadoRef.current = "hablando";
        setTimeout(() => { setVista("mapa"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      setTimeout(() => {
        setEstado("inactivo");
        estadoRef.current = "inactivo";
      }, 1000);
    } catch {
      setEstado("inactivo");
      estadoRef.current = "inactivo";
    }
  }, []);

  // ── Browser Speech Recognition (fallback a server-side si no disponible) ─
  const reconocerVozBrowser = useCallback(() => {
    return new Promise((resolve) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { resolve(""); return; }
      const sr = new SpeechRecognition();
      sr.lang = "es-MX";
      sr.interimResults = false;
      sr.maxAlternatives = 1;
      sr.continuous = false;
      let resolved = false;
      const done = (text) => { if (!resolved) { resolved = true; resolve(text); } };
      sr.onresult = (e) => done(e.results[0][0].transcript.toLowerCase());
      sr.onerror = (e) => { console.error("SpeechRecognition error:", e.error); done(""); };
      sr.onend = () => done("");
      sr.start();
    });
  }, []);

  // ── Auto-scroll cuando llegan nuevas tarjetas ──────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [tarjetas]);

  // ── Enviar el audio grabado al backend (transcribe, procesa, responde) ──
  const enviarAudioGrabado = useCallback(async () => {
    setEstado("procesando");
    estadoRef.current = "procesando";
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];

    if (blob.size < 1000) {
      setEstado("inactivo");
      estadoRef.current = "inactivo";
      return;
    }

    const formData = new FormData();
    formData.append("audio", blob, "voz.webm");

    try {
      const resp = await fetch(`${API}/voice-comando`, { method: "POST", body: formData });
      const data = await resp.json();

      if (!data.ok) {
        setEstado("inactivo");
        estadoRef.current = "inactivo";
        if (data.mensaje === "Wake word ignorada como comando") {
          setTimeout(() => escucharRef.current?.(), 300);
        }
        return;
      }

      setEstado("hablando");
      estadoRef.current = "hablando";
      setTarjetas([{ pregunta: data.texto_usuario || "", respuesta: data.respuesta || "" }]);
      if (data.respuesta) hablarBrowser(data.respuesta);

      if (data.accion && data.accion.startsWith("cambiar_canal:")) {
        const canal = data.accion.replace("cambiar_canal:", "");
        setCanalNoticias(canal);
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      } else if (data.accion === "cambiar_canal" && data.dato) {
        setCanalNoticias(data.dato);
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      } else if (data.accion === "abrir_noticias") {
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      } else if (data.accion === "abrir_mapa") {
        setTimeout(() => { setVista("mapa"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      } else {
        setTimeout(() => { setEstado("inactivo"); estadoRef.current = "inactivo"; }, 1000);
      }
    } catch (err) {
      console.error("Error enviando audio:", err);
      setEstado("inactivo");
      estadoRef.current = "inactivo";
    }
  }, [hablarBrowser]);

  // ── Escuchar micrófono (grabación real en el navegador, transcripción en el servidor) ──
  const escucharMicrofono = useCallback(async () => {
    if (estadoRef.current === "escuchando") {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (estadoRef.current !== "inactivo") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        enviarAudioGrabado();
      };
      mediaRecorderRef.current = mr;
      mr.start();

      setEstado("escuchando");
      estadoRef.current = "escuchando";

      setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 10000);
    } catch (err) {
      console.error("No se pudo acceder al micrófono:", err);
      setEstado("inactivo");
      estadoRef.current = "inactivo";
    }
  }, [enviarAudioGrabado]);

  // ── Carga inicial ──────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/saludo`)
      .then(r => r.json())
      .then(data => {
        setBackendOk(true);
        setWakeActivo(data.wake_activo || false);
        if (data.saludo) {
          setTarjetas([{ pregunta: "Bienvenida", respuesta: data.saludo }]);
          hablarBrowser(data.saludo);
        }
      })
      .catch(() => setBackendOk(false));
  }, [hablarBrowser]);

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
    return <Noticias onVolver={() => { setVista("principal"); setCanalNoticias(null); }} canalInicial={canalNoticias} />;
  }

  if (vista === "mapa") {
    return <Mapa onVolver={() => { setVista("principal"); setBusquedaMapa(null); }} busquedaInicial={busquedaMapa} />;
  }

  if (vista === "mission") {
    return <MissionControl onVolver={() => setVista("principal")} />;
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
        <button className="nav-btn" onClick={() => setVista("mapa")}>
          ◎ Stark Maps
        </button>
        <button className="nav-btn" onClick={() => setVista("mission")}>
          ▸ Mission Control
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

        <div className="scroll-area" ref={scrollRef}>
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

          {/* Tarjetas de respuesta */}
          {tarjetas.map((t, i) => (
            <div key={i} className="tarjeta">
              <div className="tarjeta-pregunta">❯ {t.pregunta}</div>
              <div className="tarjeta-respuesta">{t.respuesta}</div>
            </div>
          ))}
        </div>

        <div className="bottom-area">
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
        </div>

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
