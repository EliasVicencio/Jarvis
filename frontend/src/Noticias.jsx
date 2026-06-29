import React, { useState, useEffect, useCallback } from "react";
import "./Noticias.css";

const VIDEOS_TECH = [
  { id: "aircAruvnKk",  titulo: "But what is a neural network?",   canal: "3Blue1Brown",    tag: "IA"   },
  { id: "kCc8FmEb1nY",  titulo: "Let's build GPT from scratch",    canal: "Andrej Karpathy",tag: "IA"   },
  { id: "zduSFxRajkE",  titulo: "Attention in transformers",       canal: "3Blue1Brown",    tag: "IA"   },
  { id: "PaCmpygFfXo",  titulo: "How does ChatGPT work?",          canal: "Computerphile",  tag: "IA"   },
  { id: "t-7mQhSZRgM",  titulo: "Linux in 100 seconds",            canal: "Fireship",       tag: "DEV"  },
  { id: "Tnxl5b7Sqdm",  titulo: "Cybersecurity full course",       canal: "freeCodeCamp",   tag: "SEC"  },
  { id: "rfscVS0vtbw",  titulo: "How computers work",              canal: "Code.org",       tag: "TECH" },
  { id: "qbIk7-JPB2c",  titulo: "Why Python is so slow",           canal: "Computerphile",  tag: "DEV"  },
];

function GithubTrending() {
  const [repos,    setRepos]    = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    setCargando(true);
    const hoy = new Date();
    hoy.setDate(hoy.getDate() - 7);
    const fecha = hoy.toISOString().split("T")[0];
    fetch(`https://api.github.com/search/repositories?q=created:>${fecha}&sort=stars&order=desc&per_page=8`)
      .then(r => r.json())
      .then(data => {
        setRepos(data.items ? data.items.slice(0, 8) : []);
        setCargando(false);
      })
      .catch(() => { setError("No se pudo cargar GitHub Trending"); setCargando(false); });
  }, []);

  if (cargando) return <div className="stat-loading"><div className="news-spinner" /></div>;
  if (error)    return <div className="stat-error">⚠ {error}</div>;

  return (
    <div className="stat-list">
      {repos.map((r, i) => (
        <a key={r.id} href={r.html_url} target="_blank" rel="noreferrer" className="stat-row">
          <span className="stat-idx">{String(i + 1).padStart(2, "0")}</span>
          <div className="stat-body">
            <span className="stat-name">{r.full_name}</span>
            <span className="stat-desc">{(r.description || "").slice(0, 55) || "—"}</span>
          </div>
          <div className="stat-meta">
            <span className="stat-stars">★ {r.stargazers_count >= 1000 ? (r.stargazers_count / 1000).toFixed(1) + "k" : r.stargazers_count}</span>
            <span className="stat-lang">{r.language || ""}</span>
          </div>
        </a>
      ))}
    </div>
  );
}

function CryptoPrecios() {
  const [precios,  setPrecios]  = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState(null);
  const [mins,     setMins]     = useState(0);

  const cargar = useCallback(() => {
    fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana,cardano,polkadot,chainlink&order=market_cap_desc&per_page=6&sparkline=false&price_change_percentage=24h")
      .then(r => r.json())
      .then(data => { setPrecios(Array.isArray(data) ? data : []); setCargando(false); setError(null); setMins(0); })
      .catch(() => { setError("No se pudo cargar precios"); setCargando(false); });
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const id = setInterval(() => { setMins(m => m + 1); if (mins > 0 && mins % 2 === 0) cargar(); }, 60000);
    return () => clearInterval(id);
  }, [cargar, mins]);

  if (cargando) return <div className="stat-loading"><div className="news-spinner" /></div>;
  if (error)    return <div className="stat-error">⚠ {error}</div>;

  return (
    <div className="stat-list">
      {precios.map(p => {
        const cambio = p.price_change_percentage_24h || 0;
        const sube   = cambio >= 0;
        return (
          <div key={p.id} className="stat-row stat-price-row">
            <img src={p.image} alt={p.name} className="stat-coin-img" onError={e => e.target.style.display="none"} />
            <div className="stat-body">
              <span className="stat-name">{p.name}</span>
              <span className="stat-desc">{p.symbol?.toUpperCase()}</span>
            </div>
            <div className="stat-meta">
              <span className="stat-price">${p.current_price?.toLocaleString("en-US")}</span>
              <span className={`stat-change ${sube ? "stat-up" : "stat-down"}`}>
                {sube ? "▲" : "▼"} {Math.abs(cambio).toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })}
      <div className="stat-footer">⟳ Actualiza cada 2 min · hace {mins} min</div>
    </div>
  );
}

export default function Noticias({ onVolver }) {
  const [videoIdx, setVideoIdx] = useState(0);
  const [panelDer, setPanelDer] = useState("github");
  const video = VIDEOS_TECH[videoIdx];

  return (
    <div className="news-shell">
      <div className="news-bg-grid" />
      <div className="news-scan" />

      <header className="news-header">
        <button className="news-back" onClick={onVolver}>← Volver</button>
        <div className="news-title-block">
          <span className="news-title-tag">STARK INTEL</span>
          <span className="news-title-main">SALA DE CONTROL</span>
        </div>
        <div className="news-meta" style={{marginLeft:"auto"}}>
          <span className="news-update">🔴 TECH &amp; IA FEED</span>
        </div>
      </header>

      <div className="control-room">

        <div className="video-panel">
          <div className="video-header">
            <span className="video-live-dot" />
            <span className="video-canal">{video.canal}</span>
            <span className={`stream-tag stream-tag-${video.tag.toLowerCase()}`}>{video.tag}</span>
            <span className="video-titulo">{video.titulo}</span>
          </div>

          <div className="video-wrapper">
            <iframe
              key={video.id}
              src={`https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1`}
              title={video.titulo}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          <div className="video-playlist">
            {VIDEOS_TECH.map((v, i) => (
              <button
                key={v.id}
                className={`playlist-item${videoIdx === i ? " playlist-item-active" : ""}`}
                onClick={() => setVideoIdx(i)}
              >
                <img
                  src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`}
                  alt={v.titulo}
                  className="playlist-thumb"
                />
                <div className="playlist-info">
                  <span className={`stream-tag stream-tag-${v.tag.toLowerCase()}`}>{v.tag}</span>
                  <span className="playlist-titulo">{v.titulo.slice(0, 40)}</span>
                  <span className="playlist-canal">{v.canal}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="stats-panel">
          <div className="stats-tabs">
            <button className={`stats-tab${panelDer === "github" ? " stats-tab-active" : ""}`} onClick={() => setPanelDer("github")}>
              ⬡ GitHub Trending
            </button>
            <button className={`stats-tab${panelDer === "crypto" ? " stats-tab-active" : ""}`} onClick={() => setPanelDer("crypto")}>
              ◈ Mercados Crypto
            </button>
          </div>
          <div className="stats-content">
            {panelDer === "github" ? <GithubTrending /> : <CryptoPrecios />}
          </div>
        </div>

      </div>
    </div>
  );
}