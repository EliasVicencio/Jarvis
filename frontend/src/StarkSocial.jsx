import React, { useState, useEffect, useCallback } from "react";
import "./StarkSocial.css";

const API = "/api";

export default function StarkSocial({ onVolver }) {
  const [pendiente, setPendiente] = useState(null);
  const [caption, setCaption] = useState("");
  const [posts, setPosts] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [publicando, setPublicando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const cargarTodo = useCallback(() => {
    setCargando(true);
    Promise.all([
      fetch(`${API}/instagram/pendiente`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/instagram/posts-recientes`).then(r => r.json()).catch(() => ({ posts: [] })),
      fetch(`${API}/instagram/sugerencias`).then(r => r.json()).catch(() => ({ sugerencias: "" })),
    ]).then(([pend, recientes, sug]) => {
      if (pend && pend.imagen_url) {
        setPendiente(pend);
        setCaption(pend.caption || "");
      } else {
        setPendiente(null);
      }
      const ordenados = (recientes.posts || []).slice().sort((a, b) => (b.like_count || 0) - (a.like_count || 0));
      setPosts(ordenados.slice(0, 8));
      const texto = (sug.sugerencias || "").trim();
      setIdeas(texto ? texto.split(/(?<=\.)\s+/).filter(s => s.trim().length > 8) : []);
      setCargando(false);
    });
  }, []);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  const aprobarYPublicar = async () => {
    if (!pendiente) return;
    setPublicando(true);
    setMensaje(null);
    try {
      const resp = await fetch(`${API}/instagram/publicar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagen_url: pendiente.imagen_url, caption }),
      });
      const data = await resp.json();
      if (data.ok) {
        setMensaje({ tipo: "ok", texto: "Publicado. Ya debería verse en tu feed." });
        setPendiente(null);
        cargarTodo();
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo publicar." });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el backend." });
    } finally {
      setPublicando(false);
    }
  };

  const descartar = async () => {
    await fetch(`${API}/instagram/descartar`, { method: "POST" }).catch(() => {});
    setPendiente(null);
    setMensaje(null);
  };

  return (
    <div className="ss-shell">
      <div className="ss-grid-bg" />

      <header className="ss-hdr">
        <button className="ss-back" onClick={onVolver}>← VOLVER</button>
        <div className="ss-brand">
          <span className="ss-brand-tag">STARK SOCIAL</span>
          <span className="ss-brand-name">CONTENIDO DE INSTAGRAM</span>
        </div>
        <div className="ss-status">
          <div className="ss-status-dot" />CUENTA CONECTADA
        </div>
      </header>

      <div className="ss-body">
        <div className="ss-panel ss-panel-pend">
          <div className="ss-ph ss-ph-amber">PENDIENTE DE APROBACIÓN</div>
          {cargando ? (
            <div className="ss-empty">Cargando…</div>
          ) : !pendiente ? (
            <div className="ss-empty">
              No hay ningún post esperando revisión.<br />
              Mándale una foto a Jarvis por Telegram con "instagram" en el texto para preparar uno.
            </div>
          ) : (
            <div className="ss-pend-body">
              <img className="ss-pend-img" src={pendiente.imagen_url} alt="Post pendiente" />
              <div className="ss-pend-content">
                <textarea
                  className="ss-caption-input"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  rows={5}
                />
                <div className="ss-pend-actions">
                  <button className="ss-btn-approve" onClick={aprobarYPublicar} disabled={publicando}>
                    {publicando ? "Publicando…" : "Aprobar y publicar"}
                  </button>
                  <button className="ss-btn-discard" onClick={descartar} disabled={publicando}>Descartar</button>
                </div>
                {mensaje && <div className={`ss-msg ss-msg-${mensaje.tipo}`}>{mensaje.texto}</div>}
              </div>
            </div>
          )}
        </div>

        <div className="ss-panel">
          <div className="ss-ph">RENDIMIENTO RECIENTE</div>
          {cargando ? (
            <div className="ss-empty">Cargando…</div>
          ) : posts.length === 0 ? (
            <div className="ss-empty">Sin datos todavía — revisa que IG_ACCESS_TOKEN esté configurado.</div>
          ) : (
            <div className="ss-grid-posts">
              {posts.map(p => (
                <a key={p.id} href={p.permalink} target="_blank" rel="noreferrer" className="ss-post-thumb">
                  <img src={p.media_url || p.thumbnail_url} alt="" />
                  <span className="ss-post-likes">{p.like_count ?? 0}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="ss-panel">
          <div className="ss-ph">IDEAS SUGERIDAS</div>
          {cargando ? (
            <div className="ss-empty">Cargando…</div>
          ) : ideas.length === 0 ? (
            <div className="ss-empty">Sin sugerencias por ahora.</div>
          ) : (
            <div className="ss-ideas">
              {ideas.map((idea, i) => (
                <div key={i} className="ss-idea">{idea}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}