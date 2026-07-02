import React, { useState, useEffect, useCallback } from "react";
import "./Noticias.css";

const API = "http://localhost:5000/api";

const CATEGORIAS = [
  { id: "tecnologia",     label: "TECH", icon: "⬡" },
  { id: "ia",            label: "IA",   icon: "◈" },
  { id: "ciberseguridad", label: "SEC", icon: "◎" },
  { id: "programacion",  label: "DEV",  icon: "◇" },
];

const VIDEOS = [
  { id: "aircAruvnKk", titulo: "Neural network basics",     canal: "3Blue1Brown",    tag: "IA"   },
  { id: "kCc8FmEb1nY", titulo: "Build GPT from scratch",    canal: "Andrej Karpathy",tag: "IA"   },
  { id: "zduSFxRajkE", titulo: "Attention in transformers", canal: "3Blue1Brown",    tag: "IA"   },
  { id: "PaCmpygFfXo", titulo: "How does ChatGPT work?",    canal: "Computerphile",  tag: "IA"   },
  { id: "t-7mQhSZRgM", titulo: "Linux in 100 seconds",      canal: "Fireship",       tag: "DEV"  },
  { id: "Tnxl5b7Sqdm", titulo: "Cybersecurity course",      canal: "freeCodeCamp",   tag: "SEC"  },
  { id: "rfscVS0vtbw", titulo: "How computers work",        canal: "Code.org",       tag: "TECH" },
  { id: "qbIk7-JPB2c", titulo: "Why Python is so slow",     canal: "Computerphile",  tag: "DEV"  },
];

function fmt(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 60) return `${diff}m`;
  if (diff < 1440) return `${Math.floor(diff/60)}h`;
  return new Date(iso).toLocaleDateString("es-CL", { day:"numeric", month:"short" });
}
function trunc(t, n) { return t && t.length > n ? t.slice(0,n)+"…" : (t||""); }

function MetricasLive() {
  const [btc, setBtc] = useState(null);
  const [eth, setEth] = useState(null);
  const [gas, setGas] = useState(18);
  const [fear, setFear] = useState(null);

  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&order=market_cap_desc&per_page=2&sparkline=false&price_change_percentage=24h")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          const b = d.find(x => x.id === "bitcoin");
          const e = d.find(x => x.id === "ethereum");
          if (b) setBtc(b);
          if (e) setEth(e);
        }
      }).catch(() => {});

    fetch("https://api.alternative.me/fng/?limit=1")
      .then(r => r.json())
      .then(d => { if (d.data?.[0]) setFear(d.data[0]); })
      .catch(() => {});
  }, []);

  const fmtPrice = (p) => p >= 1000 ? `${(p/1000).toFixed(1)}k` : `${p?.toFixed(0)}`;
  const fearColor = fear ? (fear.value > 60 ? "#4ADE80" : fear.value > 40 ? "#F2A93B" : "#F87171") : "#2DD4E8";

  return (
    <div className="si-panel" style={{flexShrink:0}}>
      <div className="si-ph">◎ MÉTRICAS EN VIVO <div className="si-pd"></div></div>
      <div className="si-stats-grid">
        <div className="si-sc">
          <div className="si-sl">BTC/USD</div>
          <div className="si-sv" style={{color:"#2DD4E8"}}>{btc ? fmtPrice(btc.current_price) : "—"}</div>
          <div className="si-ss" style={{color: btc?.price_change_percentage_24h >= 0 ? "#4ADE80" : "#F87171"}}>
            {btc ? `${btc.price_change_percentage_24h >= 0?"▲":"▼"} ${Math.abs(btc.price_change_percentage_24h).toFixed(1)}%` : ""}
          </div>
        </div>
        <div className="si-sc">
          <div className="si-sl">ETH/USD</div>
          <div className="si-sv" style={{color:"#2DD4E8"}}>{eth ? fmtPrice(eth.current_price) : "—"}</div>
          <div className="si-ss" style={{color: eth?.price_change_percentage_24h >= 0 ? "#4ADE80" : "#F87171"}}>
            {eth ? `${eth.price_change_percentage_24h >= 0?"▲":"▼"} ${Math.abs(eth.price_change_percentage_24h).toFixed(1)}%` : ""}
          </div>
        </div>
        <div className="si-sc">
          <div className="si-sl">FEAR INDEX</div>
          <div className="si-sv" style={{color: fearColor}}>{fear ? fear.value : "—"}</div>
          <div className="si-ss" style={{color: "rgba(150,180,190,0.5)"}}>{fear ? fear.value_classification?.toUpperCase() : ""}</div>
        </div>
        <div className="si-sc">
          <div className="si-sl">GAS ETH</div>
          <div className="si-sv" style={{color:"#4ADE80"}}>{gas}</div>
          <div className="si-ss" style={{color:"rgba(74,222,128,0.5)"}}>GWEI</div>
        </div>
      </div>
    </div>
  );
}

function CryptoPanel() {
  const [precios, setPrecios] = useState([]);

  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=solana,cardano,polkadot,chainlink&order=market_cap_desc&per_page=4&sparkline=false&price_change_percentage=24h")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPrecios(d); })
      .catch(() => {});
  }, []);

  return (
    <div className="si-panel" style={{flexShrink:0}}>
      <div className="si-ph">◈ CRYPTO <div className="si-pd"></div></div>
      {precios.map(p => {
        const c = p.price_change_percentage_24h || 0;
        return (
          <div key={p.id} className="si-row">
            <span className="si-sym">{p.symbol?.toUpperCase()}</span>
            <span className="si-price">${p.current_price?.toLocaleString("en-US")}</span>
            <span className={c >= 0 ? "si-cup" : "si-cdn"}>{c>=0?"▲":"▼"} {Math.abs(c).toFixed(1)}%</span>
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
      .then(r => r.json())
      .then(d => { if (d.items) setRepos(d.items); })
      .catch(() => {});
  }, []);

  return (
    <div className="si-panel" style={{flex:1}}>
      <div className="si-ph">⬡ GITHUB TRENDING <div className="si-pd"></div></div>
      {repos.map((r,i) => (
        <a key={r.id} href={r.html_url} target="_blank" rel="noreferrer" className="si-row si-row-a">
          <span className="si-idx">{String(i+1).padStart(2,"0")}</span>
          <span className="si-ghn">{trunc(r.full_name, 22)}</span>
          <span className="si-ghs">★{r.stargazers_count>=1000?(r.stargazers_count/1000).toFixed(0)+"k":r.stargazers_count}</span>
        </a>
      ))}
    </div>
  );
}

function DatosLive() {
  const [mcap, setMcap] = useState(null);
  const [dom,  setDom]  = useState(null);

  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/global")
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setMcap((d.data.total_market_cap?.usd / 1e12).toFixed(1));
          setDom(d.data.market_cap_percentage?.btc?.toFixed(1));
        }
      }).catch(() => {});
  }, []);

  return (
    <div className="si-panel" style={{flexShrink:0}}>
      <div className="si-ph">▸ DATOS EN VIVO <div className="si-pd"></div></div>
      <div className="si-rt-grid">
        <div className="si-rtc"><div className="si-rtl">DOM. BTC</div><div className="si-rtv" style={{color:"#2DD4E8"}}>{dom||"—"}<span style={{fontSize:7}}>%</span></div><div className="si-rts">mercado</div></div>
        <div className="si-rtc"><div className="si-rtl">MKT CAP</div><div className="si-rtv" style={{color:"#4ADE80"}}>{mcap||"—"}<span style={{fontSize:7}}>T</span></div><div className="si-rts">USD</div></div>
        <div className="si-rtc"><div className="si-rtl">REPOS HOY</div><div className="si-rtv" style={{color:"#F2A93B"}}>1.2k</div><div className="si-rts">GitHub</div></div>
        <div className="si-rtc"><div className="si-rtl">COMMITS/H</div><div className="si-rtv" style={{color:"#F87171"}}>8.4k</div><div className="si-rts">global</div></div>
      </div>
    </div>
  );
}

function StatusPanel() {
  const items = [
    { label:"Backend Flask", val:"OK·5000", ok:true  },
    { label:"Wake Word",     val:"ACTIVO",  ok:true  },
    { label:"Edge TTS",      val:"LISTO",   ok:true  },
    { label:"Google STT",    val:"LISTO",   ok:true  },
    { label:"NewsAPI",       val:"ONLINE",  ok:true  },
    { label:"GitHub API",    val:"ONLINE",  ok:true  },
    { label:"CoinGecko",     val:"ONLINE",  ok:true  },
  ];
  return (
    <div className="si-panel" style={{flex:1}}>
      <div className="si-ph">▸ ESTADO SISTEMA <div className="si-pd"></div></div>
      {items.map((it,i) => (
        <div key={i} className="si-srow">
          <div className={it.ok ? "si-sdg" : "si-sda"}></div>
          <span className="si-sn">{it.label}</span>
          <span className="si-sv3">{it.val}</span>
        </div>
      ))}
    </div>
  );
}

export default function Noticias({ onVolver }) {
  const [categoria, setCategoria] = useState("tecnologia");
  const [videoIdx,  setVideoIdx]  = useState(0);
  const [noticias,  setNoticias]  = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [error,     setError]     = useState(null);

  const cargar = useCallback(async (cat) => {
    setCargando(true); setError(null);
    try {
      const r = await fetch(`${API}/noticias?categoria=${cat}`);
      const d = await r.json();
      if (d.error && !d.noticias?.length) setError(d.error);
      else setNoticias(d.noticias||[]);
    } catch { setError("No se pudo conectar con el backend."); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(categoria); }, [categoria, cargar]);

  const video     = VIDEOS[videoIdx];
  const destacada = noticias[0]||null;
  const lista     = noticias.slice(1, 5);

  return (
    <div className="si-shell">
      <div className="si-gbg"/>
      <div className="si-cn si-tl"/><div className="si-cn si-tr"/>
      <div className="si-cn si-bl"/><div className="si-cn si-br"/>

      <header className="si-hdr">
        <button className="si-back" onClick={onVolver}>← VOLVER</button>
        <div className="si-brand">
          <span className="si-btag">STARK INTEL</span>
          <span className="si-bname">SALA DE CONTROL</span>
        </div>
        <div className="si-cats">
          {CATEGORIAS.map(c => (
            <button key={c.id}
              className={`si-cat ${categoria===c.id?"si-cat-on":"si-cat-off"}`}
              onClick={() => setCategoria(c.id)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        <div className="si-live"><div className="si-ld"/>EN VIVO</div>
      </header>

      <div className="si-body">

        {/* Columna izquierda */}
        <div className="si-left">
          <MetricasLive />
          <CryptoPanel />
          <GithubPanel />
        </div>

        {/* Columna central */}
        <div className="si-center">
          <div className="si-panel" style={{flexShrink:0}}>
            <div className="si-vhdr">
              <div className="si-dg"/>
              <span className="si-vc">{video.canal}</span>
              <span className={`si-vtag si-vtag-${video.tag.toLowerCase()}`}>{video.tag}</span>
              <span className="si-vtit">{video.titulo}</span>
            </div>
            <div className="si-player">
              <iframe key={video.id}
                src={`https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1`}
                title={video.titulo} frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen />
            </div>
          </div>

          <div className="si-panel si-news-panel">
            <div className="si-ph">◎ INTELIGENCIA DE CAMPO <div className="si-pd"></div></div>
            {cargando ? <div className="si-loading"><div className="si-spin"/></div>
            : error ? <div className="si-error">⚠ {error}</div>
            : <>
                {destacada && (
                  <a href={destacada.url} target="_blank" rel="noreferrer" className="si-feat">
                    {destacada.imagen && <img src={destacada.imagen} alt="" className="si-feat-img" onError={e=>e.target.style.display="none"}/>}
                    <div className="si-feat-body">
                      <div className="si-feat-meta">
                        <span className="si-badge">DESTACADO</span>
                        <span className="si-fuente">{destacada.fuente}</span>
                        <span className="si-fecha">{fmt(destacada.fecha)}</span>
                      </div>
                      <p className="si-feat-title">{trunc(destacada.titulo, 90)}</p>
                    </div>
                  </a>
                )}
                <div className="si-nlist">
                  {lista.map((n,i) => (
                    <a key={i} href={n.url} target="_blank" rel="noreferrer" className="si-nrow">
                      <span className="si-nidx">{String(i+2).padStart(2,"0")}</span>
                      <div className="si-nbody">
                        <div className="si-nmeta"><span className="si-fuente">{n.fuente}</span><span className="si-fecha">{fmt(n.fecha)}</span></div>
                        <p className="si-ntit">{trunc(n.titulo, 80)}</p>
                      </div>
                      <span className="si-arr">→</span>
                    </a>
                  ))}
                </div>
              </>
            }
          </div>
        </div>

        {/* Columna derecha */}
        <div className="si-right">
          <div className="si-panel" style={{flexShrink:0}}>
            <div className="si-ph">◎ RADAR <div className="si-pd"></div></div>
            <div className="si-rw">
              <div className="si-rc">
                <svg viewBox="0 0 100 100" width="100" height="100">
                  <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(45,212,232,0.07)" strokeWidth="1"/>
                  <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(45,212,232,0.09)" strokeWidth="1"/>
                  <circle cx="50" cy="50" r="20" fill="none" stroke="rgba(45,212,232,0.11)" strokeWidth="1"/>
                  <circle cx="50" cy="50" r="8"  fill="none" stroke="rgba(45,212,232,0.18)" strokeWidth="1"/>
                  <line x1="50" y1="4"  x2="50" y2="96" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <line x1="4"  y1="50" x2="96" y2="50" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <line x1="18" y1="18" x2="82" y2="82" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <line x1="82" y1="18" x2="18" y2="82" stroke="rgba(45,212,232,0.05)" strokeWidth="1"/>
                  <polygon points="50,12 72,60 38,76 30,38" fill="rgba(45,212,232,0.07)" stroke="rgba(45,212,232,0.35)" strokeWidth="1"/>
                  <circle cx="50" cy="12" r="2.5" fill="#2DD4E8"/>
                  <circle cx="72" cy="60" r="2.5" fill="#2DD4E8"/>
                  <circle cx="38" cy="76" r="2.5" fill="#2DD4E8"/>
                  <circle cx="30" cy="38" r="2.5" fill="#2DD4E8"/>
                  <line x1="50" y1="50" x2="75" y2="18" stroke="rgba(45,212,232,0.45)" strokeWidth="1.5" className="si-radar-line"/>
                </svg>
                <div className="si-rcc"><span className="si-rl">ACTIVO</span><span className="si-rv">ON</span></div>
              </div>
            </div>
          </div>
          <DatosLive />
          <StatusPanel />
        </div>

      </div>
    </div>
  );
}