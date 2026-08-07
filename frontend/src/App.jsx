import React, { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import Noticias from "./Noticias";
import "./Noticias.css";
import Mapa from "./Mapa";
import "./Mapa.css";
import StarkOps from "./StarkOps";
import HoloCore from "./HoloCore";

const API = "/api";

const URLS_EXTERNAS = {
  abrir_navegador: "https://www.google.com",
  abrir_youtube: "https://www.youtube.com",
  abrir_spotify: "https://open.spotify.com",
  abrir_calculadora: "https://www.google.com/search?q=calculadora",
  abrir_gmail: "https://mail.google.com/mail/u/0/#inbox",
};

function abrirEnlaceExterno(accion, dato) {
  if (accion === "buscar" && dato) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(dato)}`, "_blank");
    return;
  }
  if (URLS_EXTERNAS[accion]) {
    window.open(URLS_EXTERNAS[accion], "_blank");
  }
}

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
  { texto: "estado de los sistemas", icono: "◉" },
  { texto: "qué puedes hacer",   icono: "?" },
];

export default function App() {
  const [vista,       setVista]       = useState("principal");
  const [estado,      setEstado]      = useState("inactivo");
  const [inputManual, setInputManual] = useState("");
  const [backendOk,   setBackendOk]   = useState(null);
  const [wakeActivo,  setWakeActivo]  = useState(false);
  const [wakeFlash,   setWakeFlash]   = useState(null);
  const [busquedaMapa,    setBusquedaMapa]    = useState(null);
  const [mostrarMasChips, setMostrarMasChips] = useState(false);
  const CHIPS_FAVORITOS = ["qué hora es", "clima en Santiago", "stark intel", "mis recordatorios", "qué puedes hacer"];
  const chipsAMostrar = mostrarMasChips ? COMANDOS : COMANDOS.filter(c => CHIPS_FAVORITOS.includes(c.texto));
  const [canalNoticias,   setCanalNoticias]   = useState(null);
  const [tarjetas, setTarjetas] = useState([]);

  const estadoRef   = useRef("inactivo");
  const escucharRef = useRef(null);
  const scrollRef   = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const streamRef        = useRef(null);

  useEffect(() => { estadoRef.current = estado; }, [estado]);

  // ── Browser TTS ────────────────────────────────────────────────────────
  const utterRef = useRef(null);

  const hablarBrowser = useCallback((texto) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const textoLimpio = texto
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    const utter = new SpeechSynthesisUtterance(textoLimpio);
    utter.lang = "es-MX";
    utter.rate = 1.1;
    utterRef.current = utter; // evita que el navegador lo recolecte antes de sonar
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
        setTarjetas([{ pregunta: texto, respuesta: data.respuesta, accion: data.accion }]);
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
      abrirEnlaceExterno(data.accion, data.dato);
      if (data.accion === "cambiar_canal" && data.dato) {
        setEstado("hablando"); estadoRef.current = "hablando";
        setCanalNoticias(data.dato);
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      if (data.accion === "modo_trabajo") {
        setEstado("hablando"); estadoRef.current = "hablando";
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      if (data.accion === "abrir_noticias") {
        setEstado("hablando"); estadoRef.current = "hablando";
        setTimeout(() => { setVista("noticias"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      if (data.accion === "abrir_mapa") {
        if (data.dato) setBusquedaMapa(data.dato);
        setEstado("hablando"); estadoRef.current = "hablando";
        setTimeout(() => { setVista("mapa"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      }
      if (data.accion === "abrir_stark_ops") {
        setEstado("hablando"); estadoRef.current = "hablando";
        setTimeout(() => { setVista("stark_ops"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
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
      setTarjetas([{ pregunta: data.texto_usuario || "", respuesta: data.respuesta || "", accion: data.accion }]);
      if (data.respuesta) hablarBrowser(data.respuesta);

      abrirEnlaceExterno(data.accion, data.dato);

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
        if (data.dato) setBusquedaMapa(data.dato);
        setTimeout(() => { setVista("mapa"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      } else if (data.accion === "abrir_stark_ops") {
        setTimeout(() => { setVista("stark_ops"); setEstado("inactivo"); estadoRef.current = "inactivo"; }, 800);
      } else {
        setTimeout(() => { setEstado("inactivo"); estadoRef.current = "inactivo"; }, 1000);
      }
    } catch (err) {
      console.error("Error enviando audio:", err);
      setEstado("inactivo");
      estadoRef.current = "inactivo";
    }
  }, [hablarBrowser]);
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
          if (data.audio_base64) {
            const audio = new Audio(`data:audio/mpeg;base64,${data.audio_base64}`);
            audio.play().catch(() => hablarBrowser(data.saludo));
          } else {
            hablarBrowser(data.saludo);
          }
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
        if (data.aviso_proactivo) {
          setTarjetas([{ pregunta: "Saturday", respuesta: data.aviso_proactivo }]);
          if (data.audio_base64) {
            const audio = new Audio(`data:audio/mpeg;base64,${data.audio_base64}`);
            audio.play().catch(() => hablarBrowser(data.aviso_proactivo));
          } else {
            hablarBrowser(data.aviso_proactivo);
          }
        }
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, [hablarBrowser]);

  const handleEnviar = e => {
    e.preventDefault();
    if (inputManual.trim()) {
      enviarComando(inputManual);
      setInputManual("");
    }
  };

  if (vista === "noticias") {
    return <Noticias onVolver={() => { setVista("principal"); setCanalNoticias(null); }} canalInicial={canalNoticias} />;
  }

  if (vista === "mapa") {
    return <Mapa onVolver={() => { setVista("principal"); setBusquedaMapa(null); }} busquedaInicial={busquedaMapa} />;
  }

  if (vista === "stark_ops") {
    return <StarkOps onVolver={() => setVista("principal")} />;
  }

  return (
    <div className="shell">
      <div className="bg-grid" />

      {wakeFlash && (
        <div className="wake-flash">🎤 «Saturday» detectado</div>
      )}

      {/* ── Topbar ─────────────────────────────────────────── */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">SATURDAY</div>
            <div className="brand-sub">asistente personal</div>
          </div>
        </div>

        <div className="status-pills">
          <div
            className="status-pill"
            data-estado={backendOk === null ? "conectando" : backendOk ? "ok" : "offline"}
            title={`${backendOk === null ? "Conectando…" : backendOk ? "Backend activo" : "Backend offline"}`}
          >
            <span className="status-dot" />
            {backendOk === null ? "Conectando…" : backendOk ? "Sistema OK" : "Sistema offline"}
          </div>
        </div>
      </header>

      {/* ── Cuerpo ─────────────────────────────────────────── */}
      <main className="main-body">

        <div className="scroll-area" ref={scrollRef}>
          {/* Chips arriba */}
          <div className="chips-row">
            {chipsAMostrar.map(c => (
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
            <button
              className="chip chip-toggle"
              onClick={() => setMostrarMasChips(v => !v)}
            >
              {mostrarMasChips ? "− menos comandos" : "⋯ más comandos"}
            </button>
          </div>

          {/* Núcleo holográfico central */}
          <div className="core-wrap">
            <HoloCore estado={estado} wakeFlash={wakeFlash} onClick={escucharMicrofono} />
            <p className="estado-label">{labelEstado(estado)}</p>
            <p className="hint">
              {wakeActivo ? "Di «Saturday» para activar" : "Toca el núcleo o escribe abajo"}
            </p>
          </div>
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
    ?? "Listo — di «Saturday»";
}