import React, { useState, useEffect, useCallback, useRef } from "react";
import "./Noticias.css";

const API = "/api";

// ── Canales disponibles ────────────────────────────────────────────────────
const CANALES = [
  // Noticias generales
  { id: "UCupvZG-5ko_eiXAupbDfxWw", nombre: "CNN",           tag: "NEWS",  alias: ["cnn","canal de cnn"] },
  { id: "UC16niRr50-MSBwiO3YDb3RA", nombre: "BBC News",      tag: "NEWS",  alias: ["bbc","bbc news"] },
  { id: "UCknLrEdhRCp1aegoMqRaCZg", nombre: "DW News",       tag: "NEWS",  alias: ["dw","dw news","deutsche welle"] },
  { id: "UCF9IOB2TExg3QIBupFtBDxg", nombre: "Al Jazeera",    tag: "NEWS",  alias: ["al jazeera","aljazeera"] },
  { id: "UCQfwfsi5VrQ8yKZ-UWmAEFg", nombre: "France 24",     tag: "NEWS",  alias: ["france 24","france24"] },
  { id: "UCeY0bbntWzzVIaj2z3QigXg", nombre: "NBC News",      tag: "NEWS",  alias: ["nbc","nbc news"] },
  // Tech / IA
  { id: "UCsBjURrPoezykLs9EqgamOA", nombre: "Fireship",      tag: "DEV",   alias: ["fireship"] },
  { id: "UCNJ1Ymd5yFuUPtn21xtRbbw", nombre: "AI Explained",  tag: "IA",    alias: ["ai explained","inteligencia artificial"] },
  { id: "UCP7jMXSY2xbc3KCAE0MHQ-A", nombre: "Google DeepMind",tag:"IA",   alias: ["deepmind","google deepmind"] },
  { id: "UCBJycsmduvYEL83R_U4JriQ", nombre: "MKBHD",         tag: "TECH",  alias: ["mkbhd","marques"] },
  { id: "UC9x0AN7BWHpCDHSm9NiJFJQ", nombre: "NetworkChuck",  tag: "SEC",   alias: ["networkchuck","network chuck"] },
  { id: "UCVls1GmFKf6WlTraIb_IaJg", nombre: "Linus Tech",    tag: "TECH",  alias: ["linus","linus tech tips"] },
];

// Videos de fallback si no hay API key
const VIDEOS_FALLBACK = [
  { id: "aircAruvnKk", titulo: "But what is a neural network?",  canal: "3Blue1Brown",    tag: "IA",   canalIdx: 6  },
  { id: "kCc8FmEb1nY", titulo: "Let's build GPT from scratch",   canal: "Andrej Karpathy",tag: "IA",   canalIdx: 6  },
  { id: "t-7mQhSZRgM", titulo: "Linux in 100 seconds",           canal: "Fireship",       tag: "DEV",  canalIdx: 6  },
  { id: "PaCmpygFfXo", titulo: "How does ChatGPT work?",         canal: "Computerphile",  tag: "IA",   canalIdx: 7  },
  { id: "rfscVS0vtbw", titulo: "How computers work",             canal: "Code.org",       tag: "TECH", canalIdx: 9  },
  { id: "qbIk7-JPB2c", titulo: "Why Python is so slow",          canal: "Computerphile",  tag: "DEV",  canalIdx: 6  },
];

const TAG_COLORS = { NEWS:"#F87171", DEV:"#4ADE80", IA:"#2DD4E8", TECH:"#F2A93B", SEC:"#A78BFA" };

function fmt(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 60) return `${diff}m`;
  if (diff < 1440) return `${Math.floor(diff/60)}h`;
  return new Date(iso).toLocaleDateString("es-CL", { day:"numeric", month:"short" });
}
function trunc(t, n) { return t && t.length > n ? t.slice(0,n)+"…" : (t||""); }

const TICKERS = ["AAPL", "TSLA", "NVDA", "GOOGL", "MSFT", "AMZN"];

function StockTicker() {
  const [precios, setPrecios] = useState([]);

  useEffect(() => {
    let activo = true;
    Promise.all(
      TICKERS.map(t =>
        fetch(`https://stockprices.dev/api/stocks/${t}`)
          .then(r => r.json())
          .catch(() => null)
      )
    ).then(resultados => {
      if (activo) setPrecios(resultados.filter(Boolean));
    });
    return () => { activo = false; };
  }, []);

  if (precios.length === 0) return null;

  const fila = precios.map((p, i) => {
    const sube = (p.ChangePercentage ?? 0) >= 0;
    return (
      <span key={i} className="si-ticker-item">
        <span className="si-ticker-sym">{p.Ticker}</span>
        <span className="si-ticker-price">${p.Price?.toFixed(2)}</span>
        <span className={sube ? "si-ticker-up" : "si-ticker-dn"}>
          {sube ? "▲" : "▼"} {Math.abs(p.ChangePercentage ?? 0).toFixed(2)}%
        </span>
      </span>
    );
  });

  return (
    <div className="si-ticker-wrap">
      <div className="si-ticker-track">{fila}{fila}</div>
    </div>
  );
}

function LineaGrande({ datos, sube }) {
  if (!datos || datos.length < 2) return null;
  const min = Math.min(...datos), max = Math.max(...datos);
  const rango = max - min || 1;
  const puntos = datos.map((v, i) => {
    const x = (i / (datos.length - 1)) * 300;
    const y = 90 - ((v - min) / rango) * 82 - 4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 300 90" preserveAspectRatio="none" className="si-market-svg">
      <polyline points={puntos} fill="none" stroke={sube ? "#4ADE80" : "#F87171"} strokeWidth="2" />
    </svg>
  );
}

function CryptoPanel() {
  const [moneda, setMoneda] = useState(null);
  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&sparkline=true&price_change_percentage=24h")
      .then(r => r.json()).then(d => { if (Array.isArray(d) && d[0]) setMoneda(d[0]); }).catch(() => {});
  }, []);

  if (!moneda) {
    return (
      <div className="si-panel" style={{flexShrink:0}}>
        <div className="si-ph">◈ MARKET OVERVIEW <div className="si-pd"/></div>
        <div className="si-empty">Cargando…</div>
      </div>
    );
  }

  const cambio = moneda.price_change_percentage_24h || 0;
  const sube = cambio >= 0;
  const datos = moneda.sparkline_in_7d?.price;

  return (
    <div className="si-panel" style={{flexShrink:0}}>
      <div className="si-ph">◈ MARKET OVERVIEW <div className="si-pd"/></div>
      <div className="si-market-body">
        <div className="si-market-precio">${moneda.current_price?.toLocaleString("en-US")}</div>
        <div className={sube ? "si-cup" : "si-cdn"}>{sube ? "▲" : "▼"} {Math.abs(cambio).toFixed(2)}%</div>
        <LineaGrande datos={datos} sube={sube} />
      </div>
    </div>
  );
}


export default function Noticias({ onVolver, canalInicial = null }) {
  const [canalIdx,   setCanalIdx]   = useState(0);
  const [videos,     setVideos]     = useState(VIDEOS_FALLBACK);
  const [videoIdx,   setVideoIdx]   = useState(0);
  const [cargando,   setCargando]   = useState(false);
  const [noticias,   setNoticias]   = useState([]);
  const [categoria,  setCategoria]  = useState("tecnologia");
  const [error,      setError]      = useState(null);
  const [apiKey,     setApiKey]     = useState(null);
  const [canalDinamico, setCanalDinamico] = useState(null);

  const canalActual = canalDinamico || CANALES[canalIdx];
  const video       = videos[videoIdx];

  // Cargar API key del backend al iniciar
  useEffect(() => {
    fetch(`${API}/youtube-key`)
      .then(r => r.json())
      .then(d => { if (d.key) setApiKey(d.key); })
      .catch(() => {});
  }, []);

 // Cambiar canal por prop (desde comando de voz) — busca en la lista fija, si no está, lo resuelve en YouTube
  useEffect(() => {
    if (!canalInicial) return;
    const q = canalInicial.toLowerCase();
    const idx = CANALES.findIndex(c => c.alias.some(a => q.includes(a)) || q.includes(c.nombre.toLowerCase()));
    if (idx !== -1) {
      setCanalDinamico(null);
      setCanalIdx(idx);
      return;
    }
    // No está en la lista fija: buscarlo dinámicamente en YouTube
    fetch(`${API}/youtube-buscar-canal?q=${encodeURIComponent(canalInicial)}`)
      .then(r => r.json())
      .then(d => {
        if (d.channel_id) {
          setCanalDinamico({ id: d.channel_id, nombre: d.nombre, tag: "YT", alias: [] });
        }
      })
      .catch(() => {});
  }, [canalInicial]);

 // Cargar videos del canal actual (fijo o dinámico)
  const cargarVideos = useCallback(async (canal) => {
    if (!canal) return;
    setCargando(true);
    try {
      const r = await fetch(`${API}/youtube-videos?channel_id=${canal.id}`);
      const data = await r.json();
      const videosFinales = (data.videos || []).map(v => ({
        id:       v.id,
        titulo:   v.titulo,
        canal:    v.canal,
        tag:      canal.tag,
        lang:     "es",
      }));
      if (videosFinales.length) {
        setVideos(videosFinales);
        setVideoIdx(0);
      } else {
        setVideos(VIDEOS_FALLBACK);
      }
    } catch { setVideos(VIDEOS_FALLBACK); }
    setCargando(false);
  }, []);
  useEffect(() => { cargarVideos(canalActual); }, [canalActual, cargarVideos]);

  // Cargar noticias
  const cargarNoticias = useCallback(async (cat) => {
    try {
      const r = await fetch(`${API}/noticias?categoria=${cat}`);
      const d = await r.json();
      setNoticias(d.noticias || []);
    } catch {}
  }, []);

  useEffect(() => { cargarNoticias(categoria); }, [categoria, cargarNoticias]);

  // Análisis con IA sobre los titulares actuales
  const [analisisIA, setAnalisisIA] = useState("");
  const [cargandoAnalisis, setCargandoAnalisis] = useState(false);
  useEffect(() => {
    if (noticias.length === 0) return;
    setCargandoAnalisis(true);
    fetch(`${API}/noticias-analisis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulares: noticias.slice(0, 8).map(n => n.titulo) }),
    })
      .then(r => r.json())
      .then(d => setAnalisisIA(d.analisis || ""))
      .catch(() => setAnalisisIA(""))
      .finally(() => setCargandoAnalisis(false));
  }, [noticias]);

  const destacada = noticias[0] || null;
  const lista     = noticias.slice(1, 12);

  return (
    <div className="si-shell">
      <div className="si-grid-bg"/>
      <div className="si-cn si-tl"/><div className="si-cn si-tr"/>
      <div className="si-cn si-bl"/><div className="si-cn si-br"/>

      <header className="si-hdr">
        <button className="si-back" onClick={onVolver}>← VOLVER</button>
        <div className="si-brand">
          <span className="si-brand-tag">STARK INTEL</span>
          <span className="si-brand-name">SALA DE CONTROL</span>
        </div>

        <div className="si-live"><div className="si-live-dot"/>EN VIVO</div>
      </header>

      <div className="si-canales-bar">
        {CANALES.map((c, i) => (
          <button
            key={c.id}
            className={`si-canal-chip ${!canalDinamico && canalIdx === i ? "si-canal-on" : ""}`}
            style={{ "--tag-color": TAG_COLORS[c.tag] }}
            onClick={() => { setCanalDinamico(null); setCanalIdx(i); }}
          >
            <span className="si-canal-tag">{c.tag}</span>
            {c.nombre}
          </button>
        ))}
      </div>

      <StockTicker />

      <div className="si-body">

        {/* Columna izquierda: reproductor de video */}
        <div className="si-left">
          <div className="si-panel" style={{flexShrink:0}}>
            <div className="si-video-hdr">
              <div className="si-dot-green"/>
              <span className="si-vcanal">{canalActual.nombre}</span>
              <span className="si-vtag" style={{background:`${TAG_COLORS[canalActual.tag]}22`,color:TAG_COLORS[canalActual.tag]}}>{canalActual.tag}</span>
              <span className="si-vtitulo">{trunc(video?.titulo||"",60)}</span>
              {video?.lang === "en" && <span className="si-lang-badge">🌐 EN · SUB ES</span>}
              {video?.lang === "es" && <span className="si-lang-badge si-lang-es">🔊 ES</span>}
              {!apiKey && <span className="si-no-key">Sin API key — videos de muestra</span>}
            </div>
            {/* Video con autoplay */}
            <div className="si-player">
              {video && (
                <iframe
                  key={`${video.id}-${canalIdx}`}
                  src={`https://www.youtube.com/embed/${video.id}?autoplay=1&mute=0&rel=0&modestbranding=1&enablejsapi=1&cc_lang_pref=es&cc_load_policy=${video.lang==="en"?1:0}&hl=es`}
                  title={video.titulo}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
	  </div>

          {/* Noticias, debajo del reproductor */}
          <div className="si-panel si-news-panel">
            <div className="si-ph">
              ◎ INTELIGENCIA DE CAMPO
              <div className="si-cat-tabs">
                {["tecnologia","ia","ciberseguridad","programacion"].map(c => (
                  <button key={c}
                    className={`si-cat-tab ${categoria===c?"si-cat-active":""}`}
                    onClick={() => setCategoria(c)}>
                    {c.slice(0,3).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {destacada && (
              <a href={destacada.url} target="_blank" rel="noreferrer" className="si-feat">
                {destacada.imagen && <img src={destacada.imagen} alt="" className="si-feat-img" onError={e=>e.target.style.display="none"}/>}
                <div className="si-feat-body">
                  <div className="si-feat-meta">
                    <span className="si-badge">DESTACADO</span>
                    <span className="si-fuente">{destacada.fuente}</span>
                    <span className="si-fecha">{fmt(destacada.fecha)}</span>
                  </div>
                  <p className="si-feat-title">{trunc(destacada.titulo,90)}</p>
                </div>
              </a>
            )}
            <div className="si-nlist">
              {lista.map((n,i) => (
                <a key={i} href={n.url} target="_blank" rel="noreferrer" className="si-nrow">
                  <span className="si-nidx">{String(i+2).padStart(2,"0")}</span>
                  <div className="si-nbody">
                    <div className="si-nmeta"><span className="si-fuente">{n.fuente}</span><span className="si-fecha">{fmt(n.fecha)}</span></div>
                    <p className="si-ntit">{trunc(n.titulo,80)}</p>
                  </div>
                  <span className="si-arr">→</span>
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Columna derecha */}
        <div className="si-right">
          <CryptoPanel />
          <div className="si-panel si-panel-flex" style={{flex:1,minHeight:0}}>
            <div className="si-ph">◆ INTELIGENCIA IA <div className="si-pd"/></div>
            <div className="si-ia-body">
              {cargandoAnalisis ? (
                <span className="si-ia-loading">Analizando…</span>
              ) : (
                analisisIA || "Sin análisis disponible todavía."
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}