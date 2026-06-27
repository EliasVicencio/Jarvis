import React, { useState, useEffect, useCallback } from "react";

const API = "http://localhost:5000/api";

const CATEGORIAS = [
  { id: "tecnologia",    label: "Tecnología",      icon: "⬡" },
  { id: "ia",           label: "IA",               icon: "◈" },
  { id: "ciberseguridad", label: "Ciberseguridad", icon: "◎" },
  { id: "programacion", label: "Programación",     icon: "◇" },
];

function formatFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function truncar(texto, max) {
  if (!texto) return "";
  return texto.length > max ? texto.slice(0, max) + "…" : texto;
}

export default function Noticias({ onVolver }) {
  const [noticias,   setNoticias]   = useState([]);
  const [cargando,   setCargando]   = useState(true);
  const [error,      setError]      = useState(null);
  const [categoria,  setCategoria]  = useState("tecnologia");
  const [destacada,  setDestacada]  = useState(null);
  const [ultimaAct,  setUltimaAct]  = useState(null);

  const cargarNoticias = useCallback(async (cat) => {
    setCargando(true);
    setError(null);
    try {
      const resp = await fetch(`${API}/noticias?categoria=${cat}`);
      const data = await resp.json();
      if (data.error && !data.noticias?.length) {
        setError(data.error);
      } else {
        setNoticias(data.noticias || []);
        setDestacada(data.noticias?.[0] || null);
        setUltimaAct(new Date());
      }
    } catch (e) {
      setError("No se pudo conectar con el backend.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarNoticias(categoria); }, [categoria, cargarNoticias]);

  const secundarias = noticias.slice(1, 4);
  const grid        = noticias.slice(4);

  return (
    <div className="news-shell">
      <div className="news-bg-grid" />
      <div className="news-scan" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="news-header">
        <button className="news-back" onClick={onVolver}>
          ← Volver
        </button>

        <div className="news-title-block">
          <span className="news-title-tag">STARK INTEL</span>
          <span className="news-title-main">INTELIGENCIA DE CAMPO</span>
        </div>

        <div className="news-cats">
          {CATEGORIAS.map(c => (
            <button
              key={c.id}
              className={`news-cat${categoria === c.id ? " news-cat-active" : ""}`}
              onClick={() => setCategoria(c.id)}
            >
              <span>{c.icon}</span> {c.label}
            </button>
          ))}
        </div>

        <div className="news-meta">
          {ultimaAct && (
            <span className="news-update">
              ⟳ {ultimaAct.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button className="news-refresh" onClick={() => cargarNoticias(categoria)}>
            Actualizar
          </button>
        </div>
      </header>

      {/* ── Contenido ──────────────────────────────────────────── */}
      {cargando ? (
        <div className="news-loading">
          <div className="news-spinner" />
          <p>Obteniendo inteligencia…</p>
        </div>
      ) : error ? (
        <div className="news-error">
          <span className="news-error-icon">⚠</span>
          <p>{error}</p>
          {error.includes("NEWS_API_KEY") && (
            <p className="news-error-hint">
              Agrega <code>NEWS_API_KEY=tu_clave</code> al archivo <code>backend/.env</code><br />
              Obtén tu clave gratis en <strong>newsapi.org</strong>
            </p>
          )}
        </div>
      ) : (
        <div className="news-body">

          {/* Noticia destacada */}
          {destacada && (
            <a href={destacada.url} target="_blank" rel="noreferrer" className="news-featured">
              {destacada.imagen && (
                <div className="news-featured-img">
                  <img src={destacada.imagen} alt="" onError={e => e.target.style.display="none"} />
                  <div className="news-featured-overlay" />
                </div>
              )}
              <div className="news-featured-body">
                <div className="news-featured-meta">
                  <span className="news-badge">DESTACADO</span>
                  <span className="news-fuente">{destacada.fuente}</span>
                  <span className="news-fecha">{formatFecha(destacada.fecha)}</span>
                </div>
                <h2 className="news-featured-titulo">{destacada.titulo}</h2>
                <p className="news-featured-desc">{truncar(destacada.descripcion, 200)}</p>
              </div>
            </a>
          )}

          {/* Secundarias */}
          {secundarias.length > 0 && (
            <div className="news-secundarias">
              {secundarias.map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noreferrer" className="news-sec-card">
                  {n.imagen && (
                    <img className="news-sec-img" src={n.imagen} alt=""
                      onError={e => e.target.style.display="none"} />
                  )}
                  <div className="news-sec-body">
                    <div className="news-sec-meta">
                      <span className="news-fuente">{n.fuente}</span>
                      <span className="news-fecha">{formatFecha(n.fecha)}</span>
                    </div>
                    <p className="news-sec-titulo">{truncar(n.titulo, 90)}</p>
                    <p className="news-sec-desc">{truncar(n.descripcion, 100)}</p>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Grid de noticias restantes */}
          {grid.length > 0 && (
            <div className="news-grid">
              {grid.map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noreferrer" className="news-grid-card">
                  <div className="news-grid-index">{String(i + 5).padStart(2, "0")}</div>
                  <div className="news-grid-body">
                    <div className="news-grid-meta">
                      <span className="news-fuente">{n.fuente}</span>
                      <span className="news-fecha">{formatFecha(n.fecha)}</span>
                    </div>
                    <p className="news-grid-titulo">{truncar(n.titulo, 100)}</p>
                  </div>
                  <span className="news-grid-arrow">→</span>
                </a>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}