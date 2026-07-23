import React, { useState, useEffect, useCallback, useRef } from "react";
import "./Noticias.css";

const API = "/api";

// ── Canales disponibles ────────────────────────────────────────────────────
const CANALES = [
  // Noticias generales
  { id: "UCupvZG-5ko_eiXAupbDfxWw", nombre: "CNN",           tag: "NEWS",  alias: ["cnn","canal de cnn"] },
  { id: "UC16niRr50-MSBwiO3He_3-Q", nombre: "BBC News",      tag: "NEWS",  alias: ["bbc","bbc news"] },
  { id: "UCknLrEdhRCp1aegoMqRaCZg", nombre: "DW News",       tag: "NEWS",  alias: ["dw","dw news","deutsche welle"] },
  { id: "UCF9IOB2TExg3QIBupFtBDxg", nombre: "Al Jazeera",    tag: "NEWS",  alias: ["al jazeera","aljazeera"] },
  { id: "UCHqGgKiTorByDs9fqoiYefA", nombre: "France 24",     tag: "NEWS",  alias: ["france 24","france24"] },
  { id: "UCeY0bbntWzzVIaj2z3QigXg", nombre: "NBC News",      tag: "NEWS",  alias: ["nbc","nbc news"] },
  // Tech / IA
  { id: "UCsBjURrPoezykLs9EqgamOA", nombre: "Fireship",      tag: "DEV",   alias: ["fireship"] },
  { id: "UCWX3yGbODI3HMKollQ1YBKQ", nombre: "AI Explained",  tag: "IA",    alias: ["ai explained","inteligencia artificial"] },
  { id: "UCnUYZLuoy1rq1aVMwx4aTzw", nombre: "Google DeepMind",tag:"IA",   alias: ["deepmind","google deepmind"] },
  { id: "UC0RhatS1pyxInC00YKjjBqQ", nombre: "MKBHD",         tag: "TECH",  alias: ["mkbhd","marques"] },
  { id: "UCXv0mDud2ACKmy8ViR9Kp_Q", nombre: "NetworkChuck",  tag: "SEC",   alias: ["networkchuck","network chuck"] },
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

function CryptoPanel() {
  const [precios, setPrecios] = useState([]);
  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,cardano,polkadot&order=market_cap_desc&per_page=5&sparkline=false&price_change_percentage=24h")
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setPrecios(d); }).catch(() => {});
  }, []);
  return (
    <div className="si-panel" style={{flexShrink:0}}>
      <div className="si-ph">◈ MERCADOS CRYPTO <div className="si-pd"/></div>
      {precios.map(p => {
        const c = p.price_change_percentage_24h || 0;
        return (
          <div key={p.id} className="si-row">
            <span className="si-sym">{p.symbol?.toUpperCase()}</span>
            <span className="si-price">${p.current_price?.toLocaleString("en-US")}</span>
            <span className={c>=0?"si-cup":"si-cdn"}>{c>=0?"▲":"▼"} {Math.abs(c).toFixed(1)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function GithubPanel() {
  const [repos, setRepos] = useState([]);
  useEffect(() => {
    const d = new Date(); d.setDate(d.getDate()-7);
    fetch(`https://api.github.com/search/repositories?q=created:>${d.toISOString().split("T")[0]}&sort=stars&order=desc&per_page=8`)
      .then(r => r.json()).then(d => { if (d.items) setRepos(d.items); }).catch(() => {});
  }, []);
  return (
    <div className="si-panel si-panel-flex">
      <div className="si-ph">⬡ GITHUB TRENDING <div className="si-pd"/></div>
      {repos.map((r,i) => (
        <a key={r.id} href={r.html_url} target="_blank" rel="noreferrer" className="si-row si-row-a">
          <span className="si-idx">{String(i+1).padStart(2,"0")}</span>
          <span className="si-ghn">{trunc(r.full_name,22)}</span>
          <span className="si-ghs">★{r.stargazers_count>=1000?(r.stargazers_count/1000).toFixed(1)+"k":r.stargazers_count}</span>
        </a>
      ))}
    </div>
  );
}

function ProyectosPanel() {
  const [proyectos, setProyectos] = useState([]);

  useEffect(() => {
    const cargar = () => {
      fetch(`${API}/proyectos-estado`)
        .then(r => r.json())
        .then(d => setProyectos(d.proyectos || []))
        .catch(() => {});
    };
    cargar();
    const id = setInterval(cargar, 60000); // revisa cada 60s
    return () => clearInterval(id);
  }, []);

  return (
    <div className="si-panel si-panel-flex">
      <div className="si-ph">▸ ESTADO DE PROYECTOS <div className="si-pd"/></div>
      {proyectos.length === 0 ? (
        <div className="si-srow"><span className="si-sn">Verificando…</span></div>
      ) : proyectos.map((p, i) => (
        <div key={i} className="si-srow">
          <div className={p.ok ? "si-sdg" : "si-sda"}/>
          <span className="si-sn">{p.nombre}</span>
          <span className="si-sv3">{p.ok ? "ONLINE" : "CAÍDO"}</span>
        </div>
      ))}
    </div>
  );
}

// ── Panel de subtítulos con traducción ────────────────────────────────────
function SubtitulosPanel({ video }) {
  const [lineas,    setLineas]    = useState([]);
  const [cargando,  setCargando]  = useState(false);
  const [error,     setError]     = useState(null);
  const [lang,      setLang]      = useState(null);
  const scrollRef = useRef(null);

  const cargar = useCallback(async (id) => {
    if (!id) return;
    setCargando(true); setError(null); setLineas([]); setLang(null);
    try {
      const r = await fetch(`${API}/subtitulos?id=${id}`);
      const d = await r.json();
      if (d.error) { setError(d.error); }
      else {
        setLineas(d.subtitulos || []);
        setLang(d.lang);
      }
    } catch { setError("No se pudo conectar con el backend."); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(video?.id); }, [video?.id, cargar]);

  // Auto-scroll al final
  useEffect(() => {
    if (scrollRef.current && lineas.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lineas]);

  return (
    <div className="si-panel si-trad-panel">
      <div className="si-ph">
        ◎ SUBTÍTULOS
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {lang && <span style={{fontSize:7,color:"rgba(45,212,232,0.5)"}}>
            {lang.startsWith("en") ? "EN→ES" : "ES"}
          </span>}
          {video && (
            <button
              style={{fontSize:7,padding:"1px 5px",background:"rgba(45,212,232,0.08)",border:"1px solid rgba(45,212,232,0.2)",borderRadius:2,color:"rgba(45,212,232,0.6)",cursor:"pointer"}}
              onClick={() => cargar(video?.id)}>
              ↺
            </button>
          )}
          <div className="si-pd"/>
        </div>
      </div>

      {cargando ? (
        <div className="si-loading">
          <div className="si-spin"/>
        </div>
      ) : error ? (
        <div className="si-trad-empty">
          <div style={{fontSize:20,opacity:.3,marginBottom:6}}>⚠</div>
          <div style={{fontSize:9,color:"rgba(45,212,232,0.4)",textAlign:"center",lineHeight:1.5}}>{error}</div>
        </div>
      ) : lineas.length === 0 ? (
        <div className="si-trad-empty">Selecciona un video para ver los subtítulos</div>
      ) : (
        <div className="si-trad-scroll" ref={scrollRef}>
          {lineas.map((l, i) => (
            <div key={i} className="si-trad-linea">
              {l.orig && l.orig !== l.trad && (
                <div className="si-trad-orig">{l.orig}</div>
              )}
              <div className="si-trad-texto">{l.trad || l.texto}</div>
            </div>
          ))}
        </div>
      )}
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

  const canalActual = CANALES[canalIdx];
  const video       = videos[videoIdx];

  // Cargar API key del backend al iniciar
  useEffect(() => {
    fetch(`${API}/youtube-key`)
      .then(r => r.json())
      .then(d => { if (d.key) setApiKey(d.key); })
      .catch(() => {});
  }, []);

  // Cambiar canal por prop (desde comando de voz)
  useEffect(() => {
    if (!canalInicial) return;
    const q = canalInicial.toLowerCase();
    const idx = CANALES.findIndex(c => c.alias.some(a => q.includes(a)) || q.includes(c.nombre.toLowerCase()));
    if (idx !== -1) setCanalIdx(idx);
  }, [canalInicial]);

  // Cargar videos del canal — español primero, inglés con subtítulos como fallback
  const cargarVideos = useCallback(async (idx) => {
    setCargando(true);
    try {
      const canal = CANALES[idx];
      const r = await fetch(`${API}/youtube-videos?channel_id=${canal.id}`);
      const data = await r.json();
      const videosFinales = (data.videos || []).map(v => ({
        id:       v.id,
        titulo:   v.titulo,
        canal:    v.canal,
        tag:      canal.tag,
        lang:     "es",
        canalIdx: idx,
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

  useEffect(() => { cargarVideos(canalIdx); }, [canalIdx, cargarVideos]);

  // Cargar noticias
  const cargarNoticias = useCallback(async (cat) => {
    try {
      const r = await fetch(`${API}/noticias?categoria=${cat}`);
      const d = await r.json();
      setNoticias(d.noticias || []);
    } catch {}
  }, []);

  useEffect(() => { cargarNoticias(categoria); }, [categoria, cargarNoticias]);

  const destacada = noticias[0] || null;
  const lista     = noticias.slice(1, 5);

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

        {/* Selector de canales */}
        <div className="si-canales">
          {CANALES.map((c, i) => (
            <button key={c.id}
              className={`si-canal-btn ${canalIdx===i?"si-canal-active":""}`}
              style={canalIdx===i?{borderColor:TAG_COLORS[c.tag],color:TAG_COLORS[c.tag]}:{}}
              onClick={() => setCanalIdx(i)}>
              <span className="si-canal-tag" style={{background:`${TAG_COLORS[c.tag]}22`,color:TAG_COLORS[c.tag]}}>{c.tag}</span>
              {c.nombre}
            </button>
          ))}
        </div>

        <div className="si-live"><div className="si-live-dot"/>EN VIVO</div>
      </header>

      <div className="si-body">

        {/* Columna izquierda */}
        <div className="si-left">
          <CryptoPanel />
          <GithubPanel />
        </div>

        {/* Columna central */}
        <div className="si-center">
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

            {/* Playlist horizontal */}
            <div className="si-playlist">
              {videos.map((v,i) => (
                <button key={v.id}
                  className={`si-thumb ${videoIdx===i?"si-thumb-on":""}`}
                  onClick={() => setVideoIdx(i)}>
                  <img src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`} alt="" className="si-thumb-img"/>
                  <span className="si-vtag" style={{fontSize:6,margin:"2px 3px 0",background:`${TAG_COLORS[v.tag]||"#2DD4E8"}22`,color:TAG_COLORS[v.tag]||"#2DD4E8"}}>{v.tag}</span>
                  <span className="si-thumb-title">{trunc(v.titulo,28)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Noticias */}
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
          <div className="si-panel" style={{flexShrink:0}}>
            <div className="si-ph">◎ RADAR <div className="si-pd"/></div>
            <div className="si-radar-wrap">
              <div className="si-radar">
                <svg viewBox="0 0 120 120" width="120" height="120">
                  <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(45,212,232,0.07)" strokeWidth="1"/>
                  <circle cx="60" cy="60" r="40" fill="none" stroke="rgba(45,212,232,0.09)" strokeWidth="1"/>
                  <circle cx="60" cy="60" r="25" fill="none" stroke="rgba(45,212,232,0.11)" strokeWidth="1"/>
                  <circle cx="60" cy="60" r="10" fill="none" stroke="rgba(45,212,232,0.18)" strokeWidth="1"/>
                  <line x1="60" y1="5" x2="60" y2="115" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <line x1="5" y1="60" x2="115" y2="60" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <line x1="21" y1="21" x2="99" y2="99" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <line x1="99" y1="21" x2="21" y2="99" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <polygon points="60,15 85,70 45,90 35,45" fill="rgba(45,212,232,0.07)" stroke="rgba(45,212,232,0.35)" strokeWidth="1"/>
                  <circle cx="60" cy="15" r="3" fill="#2DD4E8"/>
                  <circle cx="85" cy="70" r="3" fill="#2DD4E8"/>
                  <circle cx="45" cy="90" r="3" fill="#2DD4E8"/>
                  <circle cx="35" cy="45" r="3" fill="#2DD4E8"/>
                  <line x1="60" y1="60" x2="90" y2="20" stroke="rgba(45,212,232,0.45)" strokeWidth="1.5" className="si-radar-line"/>
                </svg>
                <div className="si-radar-center">
                  <span className="si-radar-label">ACTIVO</span>
                  <span className="si-radar-val">ON</span>
                </div>
              </div>
            </div>
          </div>
          <ProyectosPanel />
          <SubtitulosPanel video={video} />
        </div>

      </div>
    </div>
  );
}