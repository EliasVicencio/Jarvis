import React, { useState, useEffect, useRef, useCallback } from "react";
import "./MissionControl.css";

const API = "/api";

// ── Utilidades ────────────────────────────────────────────────────────────────
function fmtHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-CL", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function fmtFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const diff = Math.floor((hoy - d) / 86400000);
  if (diff === 0) return `hoy ${d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}`;
  if (diff === 1) return "ayer";
  return d.toLocaleDateString("es-CL",{day:"numeric",month:"short"});
}
function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; }
    catch { return init; }
  });
  const set = useCallback(v => {
    setVal(v);
    localStorage.setItem(key, JSON.stringify(typeof v === "function" ? v(val) : v));
  }, [key, val]);
  return [val, set];
}

// ── PESTAÑA 1: SISTEMA ────────────────────────────────────────────────────────
function SistemaTab() {
  const [modulos,  setModulos]  = useState([]);
  const [historial,setHistorial]= useState([]);
  const [memoria,  setMemoria]  = useState([]);
  const [tick,     setTick]     = useState(0);
  const logRef = useRef(null);

  const MODULOS_BASE = [
    { nombre:"Backend Flask",  desc:"Puerto 5000",          key:"backend"  },
    { nombre:"Wake Word",      desc:'Escucha "Jarvis"',     key:"wake"     },
    { nombre:"Edge TTS",       desc:"Jorge Neural · es-MX", key:"tts"      },
    { nombre:"Google STT",     desc:"Reconocimiento voz",   key:"stt"      },
    { nombre:"Stark Intel",    desc:"NewsAPI · YouTube",    key:"intel"    },
    { nombre:"Stark Maps",     desc:"Globe.gl · Leaflet",   key:"maps"     },
    { nombre:"Mission Control",desc:"Activo",               key:"mc"       },
    { nombre:"Memoria",        desc:"SQLite local",         key:"memoria"  },
  ];

  const verificarBackend = useCallback(async () => {
    try {
      const r = await fetch(`${API}/estado`, { signal: AbortSignal.timeout(2000) });
      const d = await r.json();
      setModulos(MODULOS_BASE.map(m => ({
        ...m,
        ok: true,
        val: m.key === "backend" ? "OK·5000" :
             m.key === "wake"    ? (d.wake_activo ? "ACTIVO" : "INACTIVO") :
             m.key === "mc"      ? "ACTIVO" : "ONLINE",
      })));
    } catch {
      setModulos(MODULOS_BASE.map(m => ({
        ...m, ok: m.key === "mc", val: m.key === "mc" ? "ACTIVO" : "OFFLINE"
      })));
    }
  }, []);

  const cargarHistorial = useCallback(async () => {
    try {
      const r = await fetch(`${API}/historial`);
      const d = await r.json();
      setHistorial(d.historial || []);
    } catch {}
  }, []);

  const cargarMemoria = useCallback(async () => {
    try {
      const r = await fetch(`${API}/memoria`);
      const d = await r.json();
      setMemoria(d.memoria || []);
    } catch {}
  }, []);

  useEffect(() => {
    verificarBackend(); cargarHistorial(); cargarMemoria();
    const id = setInterval(() => {
      setTick(t => t+1);
      verificarBackend(); cargarHistorial(); cargarMemoria();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [historial]);

  const activos = modulos.filter(m => m.ok).length;
  const alertas = modulos.filter(m => !m.ok).length;

  const CAT_COLOR = {
    TAREA:   "#2DD4E8", LUGAR: "#4ADE80", ARCHIVO: "#F2A93B",
    CONTEXTO:"#A78BFA", CLIMA: "#F87171", OTRO:    "#6E8B9A",
  };

  return (
    <div className="mc-grid-3">
      {/* Módulos */}
      <div className="mc-panel">
        <div className="mc-ph">◎ MÓDULOS DEL SISTEMA<div className="mc-pd"/></div>
        <div className="mc-scroll">
          {modulos.map((m,i) => (
            <div key={i} className="mc-mod-row">
              <div className={`mc-mdot ${m.ok?"mc-green":"mc-red"}`}/>
              <div className="mc-mod-body">
                <div className="mc-mod-name">{m.nombre}</div>
                <div className="mc-mod-desc">{m.desc}</div>
              </div>
              <div className="mc-mod-val" style={{color: m.ok?"rgba(45,212,232,0.7)":"#F87171"}}>{m.val}</div>
            </div>
          ))}
        </div>
        <div className="mc-stats-row">
          <div className="mc-stat"><div className="mc-stat-val">{modulos.length}</div><div className="mc-stat-lbl">TOTAL</div></div>
          <div className="mc-stat"><div className="mc-stat-val" style={{color:"#4ADE80"}}>{activos}</div><div className="mc-stat-lbl">ACTIVOS</div></div>
          <div className="mc-stat"><div className="mc-stat-val" style={{color: alertas>0?"#F87171":"#4ADE80"}}>{alertas}</div><div className="mc-stat-lbl">OFFLINE</div></div>
        </div>
      </div>

      {/* Historial */}
      <div className="mc-panel">
        <div className="mc-ph">◈ HISTORIAL DE COMANDOS<div className="mc-pd"/></div>
        <div className="mc-scroll" ref={logRef} style={{flex:1}}>
          {historial.length === 0 ? (
            <div className="mc-empty">Sin comandos registrados aún</div>
          ) : historial.slice().reverse().map((h,i) => (
            <div key={i} className="mc-log-entry">
              <div className="mc-log-time">{fmtHora(h.fecha)}</div>
              <div className="mc-log-cmd">
                <span className={`mc-log-tag mc-tag-${h.accion==="desconocido"?"err":h.accion?.startsWith("abrir")?"nav":"ok"}`}>
                  {h.accion==="desconocido"?"ERR":h.accion?.startsWith("abrir")?"NAV":"OK"}
                </span>
                {h.comando}
              </div>
              <div className="mc-log-resp">{h.respuesta}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Memoria */}
      <div className="mc-panel">
        <div className="mc-ph">⬡ MEMORIA SEMÁNTICA<div className="mc-pd"/></div>
        <div className="mc-scroll" style={{flex:1}}>
          {memoria.length === 0 ? (
            <div className="mc-empty">La memoria se llena con el uso de Jarvis</div>
          ) : memoria.slice().reverse().map((m,i) => {
            const color = CAT_COLOR[m.categoria] || CAT_COLOR.OTRO;
            return (
              <div key={i} className="mc-mem-entry">
                <div className="mc-mem-top">
                  <span className="mc-mem-cat" style={{background:`${color}18`,color,border:`1px solid ${color}40`}}>{m.categoria}</span>
                  <span className="mc-mem-date">{fmtFecha(m.fecha)}</span>
                </div>
                <div className="mc-mem-txt">{m.texto}</div>
                {m.relacion && <div className="mc-mem-rel">→ {m.relacion}</div>}
              </div>
            );
          })}
        </div>
        <div className="mc-stats-row">
          <div className="mc-stat"><div className="mc-stat-val">{memoria.length}</div><div className="mc-stat-lbl">ENTRADAS</div></div>
          <div className="mc-stat"><div className="mc-stat-val" style={{color:"#4ADE80"}}>{memoria.filter(m=>{const d=new Date(m.fecha);return d>new Date(Date.now()-86400000);}).length}</div><div className="mc-stat-lbl">HOY</div></div>
          <div className="mc-stat"><div className="mc-stat-val" style={{color:"#A78BFA"}}>{[...new Set(memoria.map(m=>m.categoria))].length}</div><div className="mc-stat-lbl">TIPOS</div></div>
        </div>
      </div>
    </div>
  );
}

// ── PESTAÑA 2: CONTENIDO ─────────────────────────────────────────────────────
const COLS = ["IDEA","EN PROGRESO","REVISIÓN","COMPLETADO"];
const COL_COLORS = {"IDEA":"#A78BFA","EN PROGRESO":"#2DD4E8","REVISIÓN":"#F2A93B","COMPLETADO":"#4ADE80"};
const TAGS = ["WEB","BACKEND","IA","DB","MOBILE","DEVOPS","DISEÑO","OTRO"];
const TAG_COLORS = {WEB:"#2DD4E8",BACKEND:"#4ADE80",IA:"#A78BFA",DB:"#F2A93B",MOBILE:"#F87171",DEVOPS:"#6E8B9A",DISEÑO:"#F472B6",OTRO:"#9BBACB"};

function ContenidoTab() {
  const [cards,    setCards]    = useLocalStorage("mc-cards", [
    {id:1,col:"EN PROGRESO",tag:"WEB",  titulo:"Jarvis Desktop",  desc:"Asistente personal con Tauri + React + Flask",fecha:""},
    {id:2,col:"EN PROGRESO",tag:"BACKEND",titulo:"API REST Flask", desc:"Endpoints para comandos de voz e integraciones",fecha:"15 jul"},
    {id:3,col:"IDEA",       tag:"IA",   titulo:"Chatbot soporte",  desc:"Integrar LLM local para responder tickets",fecha:""},
    {id:4,col:"IDEA",       tag:"WEB",  titulo:"Portfolio web",    desc:"Mostrar proyectos con animaciones HUD",fecha:""},
    {id:5,col:"REVISIÓN",   tag:"DB",   titulo:"Memoria semántica",desc:"SQLite + embeddings locales",fecha:""},
    {id:6,col:"COMPLETADO", tag:"WEB",  titulo:"Stark Maps 3D",    desc:"Globe.gl + Leaflet integrado",fecha:""},
    {id:7,col:"COMPLETADO", tag:"WEB",  titulo:"Stark Intel HUD",  desc:"Panel de noticias y métricas en tiempo real",fecha:""},
  ]);
  const [notas,    setNotas]    = useLocalStorage("mc-notas", [
    {id:1,titulo:"Ideas rápidas",      texto:"— Agregar comando 'toma nota'\n— Integrar Notion API\n— Modelo embeddings offline",fecha:"hoy"},
    {id:2,titulo:"Entrega Duoc UC",    texto:"Subir repo con README actualizado. Incluir capturas del HUD y demostración en video.",fecha:"15 jul"},
    {id:3,titulo:"Stack tecnológico",  texto:"Tauri · React · Flask · SQLite · Globe.gl · Leaflet · Edge TTS · Google STT",fecha:"esta semana"},
  ]);
  const [modal,    setModal]    = useState(null); // null | "card" | "nota"
  const [editCard, setEditCard] = useState(null);
  const [editNota, setEditNota] = useState(null);
  const [drag,     setDrag]     = useState(null);

  const nextId = arr => Math.max(0, ...arr.map(x=>x.id)) + 1;

  const addCard = (col) => {
    setEditCard({id:nextId(cards),col,tag:"WEB",titulo:"",desc:"",fecha:""});
    setModal("card");
  };
  const saveCard = () => {
    if (!editCard.titulo.trim()) return;
    setCards(prev => prev.find(c=>c.id===editCard.id)
      ? prev.map(c=>c.id===editCard.id?editCard:c)
      : [...prev, editCard]);
    setModal(null);
  };
  const delCard = (id) => setCards(prev => prev.filter(c=>c.id!==id));

  const addNota = () => {
    setEditNota({id:nextId(notas),titulo:"",texto:"",fecha:"hoy"});
    setModal("nota");
  };
  const saveNota = () => {
    if (!editNota.titulo.trim()) return;
    setNotas(prev => prev.find(n=>n.id===editNota.id)
      ? prev.map(n=>n.id===editNota.id?editNota:n)
      : [...prev, editNota]);
    setModal(null);
  };
  const delNota = (id) => setNotas(prev => prev.filter(n=>n.id!==id));

  const onDrop = (col) => {
    if (!drag) return;
    setCards(prev => prev.map(c=>c.id===drag?{...c,col}:c));
    setDrag(null);
  };

  return (
    <div className="mc-grid-contenido">
      {/* Kanban */}
      <div className="mc-panel">
        <div className="mc-ph">⬡ PROYECTOS<div style={{display:"flex",gap:6,alignItems:"center"}}><span className="mc-badge-small">{cards.filter(c=>c.col!=="COMPLETADO").length} activos</span><div className="mc-pd"/></div></div>
        <div className="mc-kanban">
          {COLS.map(col => {
            const color = COL_COLORS[col];
            const colCards = cards.filter(c=>c.col===col);
            return (
              <div key={col} className="mc-kol"
                onDragOver={e=>{e.preventDefault();}}
                onDrop={()=>onDrop(col)}>
                <div className="mc-kol-hdr" style={{background:`${color}12`,borderColor:`${color}35`,color}}>
                  {col==="COMPLETADO"?"✓":col==="REVISIÓN"?"◷":col==="EN PROGRESO"?"◎":"◈"} {col}
                  <span className="mc-kol-count">{colCards.length}</span>
                </div>
                {colCards.map(card => (
                  <div key={card.id} className="mc-kcard"
                    draggable onDragStart={()=>setDrag(card.id)}
                    onClick={()=>{setEditCard({...card});setModal("card");}}>
                    <span className="mc-ktag" style={{background:`${TAG_COLORS[card.tag]||"#2DD4E8"}18`,color:TAG_COLORS[card.tag]||"#2DD4E8",border:`1px solid ${TAG_COLORS[card.tag]||"#2DD4E8"}35`}}>{card.tag}</span>
                    <div className="mc-ktitulo">{card.titulo}</div>
                    <div className="mc-kdesc">{card.desc}</div>
                    <div className="mc-kfecha-row">
                      {card.fecha && <span className="mc-kfecha">{card.fecha}</span>}
                      <button className="mc-kdel" onClick={e=>{e.stopPropagation();delCard(card.id);}}>✕</button>
                    </div>
                  </div>
                ))}
                <div className="mc-kadd" onClick={()=>addCard(col)}>+ agregar</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notas */}
      <div className="mc-notas-col">
        <div className="mc-panel-hdr-notas">
          <span>▸ NOTAS RÁPIDAS</span>
          <button className="mc-nota-add-btn" onClick={addNota}>+ nueva</button>
        </div>
        <div className="mc-notas-scroll">
          {notas.map(n => (
            <div key={n.id} className="mc-nota" onClick={()=>{setEditNota({...n});setModal("nota");}}>
              <div className="mc-nota-hdr">
                <span className="mc-nota-titulo">{n.titulo}</span>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span className="mc-nota-fecha">{n.fecha}</span>
                  <button className="mc-kdel" onClick={e=>{e.stopPropagation();delNota(n.id);}}>✕</button>
                </div>
              </div>
              <div className="mc-nota-txt">{n.texto}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal tarjeta */}
      {modal==="card" && editCard && (
        <div className="mc-modal-bg" onClick={()=>setModal(null)}>
          <div className="mc-modal" onClick={e=>e.stopPropagation()}>
            <div className="mc-modal-title">{editCard.id&&cards.find(c=>c.id===editCard.id)?"EDITAR TARJETA":"NUEVA TARJETA"}</div>
            <div className="mc-form-row"><label>Título</label><input className="mc-input" value={editCard.titulo} onChange={e=>setEditCard({...editCard,titulo:e.target.value})} placeholder="Nombre del proyecto…"/></div>
            <div className="mc-form-row"><label>Descripción</label><textarea className="mc-input mc-textarea" value={editCard.desc} onChange={e=>setEditCard({...editCard,desc:e.target.value})} placeholder="Descripción…"/></div>
            <div className="mc-form-2col">
              <div className="mc-form-row"><label>Tag</label>
                <select className="mc-input" value={editCard.tag} onChange={e=>setEditCard({...editCard,tag:e.target.value})}>
                  {TAGS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="mc-form-row"><label>Columna</label>
                <select className="mc-input" value={editCard.col} onChange={e=>setEditCard({...editCard,col:e.target.value})}>
                  {COLS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="mc-form-row"><label>Fecha límite</label><input className="mc-input" value={editCard.fecha} onChange={e=>setEditCard({...editCard,fecha:e.target.value})} placeholder="ej: 15 jul"/></div>
            <div className="mc-modal-btns">
              <button className="mc-btn-cancel" onClick={()=>setModal(null)}>CANCELAR</button>
              <button className="mc-btn-save" onClick={saveCard}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nota */}
      {modal==="nota" && editNota && (
        <div className="mc-modal-bg" onClick={()=>setModal(null)}>
          <div className="mc-modal" onClick={e=>e.stopPropagation()}>
            <div className="mc-modal-title">NOTA RÁPIDA</div>
            <div className="mc-form-row"><label>Título</label><input className="mc-input" value={editNota.titulo} onChange={e=>setEditNota({...editNota,titulo:e.target.value})} placeholder="Título de la nota…"/></div>
            <div className="mc-form-row"><label>Contenido</label><textarea className="mc-input mc-textarea" style={{height:120}} value={editNota.texto} onChange={e=>setEditNota({...editNota,texto:e.target.value})} placeholder="Escribe aquí…"/></div>
            <div className="mc-form-row"><label>Fecha</label><input className="mc-input" value={editNota.fecha} onChange={e=>setEditNota({...editNota,fecha:e.target.value})} placeholder="ej: hoy"/></div>
            <div className="mc-modal-btns">
              <button className="mc-btn-cancel" onClick={()=>setModal(null)}>CANCELAR</button>
              <button className="mc-btn-save" onClick={saveNota}>GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PESTAÑA 3: BANDEJA ────────────────────────────────────────────────────────
function BandejaTab() {
  const [emails,    setEmails]    = useState([]);
  const [selEmail,  setSelEmail]  = useState(null);
  const [cargando,  setCargando]  = useState(true);
  const [error,     setError]     = useState(null);
  const [reply,     setReply]     = useState("");
  const [filtro,    setFiltro]    = useState("todos"); // todos | no-leídos
  const [conectado, setConectado] = useState(false);

  const LEIDOS_KEY = "jarvis_emails_leidos";

  const obtenerLeidosGuardados = () => {
    try { return new Set(JSON.parse(localStorage.getItem(LEIDOS_KEY) || "[]")); }
    catch { return new Set(); }
  };

  const guardarComoLeido = (messageId) => {
    if (!messageId) return;
    const set = obtenerLeidosGuardados();
    set.add(messageId);
    localStorage.setItem(LEIDOS_KEY, JSON.stringify([...set]));
  };

  const cargarEmails = useCallback(async () => {
    try {
      const r = await fetch(`${API}/emails`);
      const d = await r.json();
      if (d.error) { setError(d.error); setConectado(false); }
      else {
        const leidosGuardados = obtenerLeidosGuardados();
        const emailsConLeido = (d.emails || []).map(e => ({
          ...e,
          leido: e.leido || leidosGuardados.has(e.message_id),
        }));
        setEmails(emailsConLeido);
        setConectado(true);
        if (emailsConLeido.length) setSelEmail(emailsConLeido[0]);
      }
    } catch { setError("No se pudo conectar con el backend."); setConectado(false); }
    setCargando(false);
  }, []);

  useEffect(() => { cargarEmails(); }, [cargarEmails]);

  const marcarLeido = (email) => {
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, leido: true } : e));
    guardarComoLeido(email.message_id);
  };
  const seleccionar = (email) => { setSelEmail(email); marcarLeido(email); setReply(""); };
  const noLeidos = emails.filter(e=>!e.leido).length;

  const AVATAR_COLORS = ["#2DD4E8","#4ADE80","#F2A93B","#F87171","#A78BFA","#F472B6"];

  const emailsFiltrados = filtro === "no-leídos" ? emails.filter(e=>!e.leido) : emails;

  return (
    <div className="mc-grid-bandeja">
      <div className="mc-panel">
        <div className="mc-ph">
          ◈ CORREOS
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {noLeidos > 0 && <span className="mc-badge-new">{noLeidos} nuevos</span>}
            <select className="mc-select-mini" value={filtro} onChange={e=>setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="no-leídos">No leídos</option>
            </select>
            <button className="mc-refresh-btn" onClick={cargarEmails}>↺</button>
            <div className={`mc-pd ${conectado?"":"mc-pd-err"}`}/>
          </div>
        </div>

        {cargando ? (
          <div className="mc-loading"><div className="mc-spin"/></div>
        ) : error ? (
          <div className="mc-bandeja-setup">
            <div className="mc-setup-icon">◈</div>
            <div className="mc-setup-title">Conectar correo</div>
            <div className="mc-setup-desc">Para ver tus correos necesitas configurar el acceso IMAP en el backend de Jarvis.</div>
            <div className="mc-setup-steps">
              <div className="mc-step"><span className="mc-step-num">1</span>Agrega en <code>.env</code>:<br/><code>EMAIL_USER=tu@gmail.com<br/>EMAIL_PASS=contraseña_app</code></div>
              <div className="mc-step"><span className="mc-step-num">2</span>Activa acceso IMAP en Gmail → Configuración → Reenvío e IMAP</div>
              <div className="mc-step"><span className="mc-step-num">3</span>Crea contraseña de aplicación en tu cuenta Google</div>
            </div>
            <button className="mc-btn-save" style={{marginTop:8}} onClick={cargarEmails}>↺ REINTENTAR</button>
          </div>
        ) : emailsFiltrados.length === 0 ? (
          <div className="mc-empty">No hay correos {filtro==="no-leídos"?"sin leer":""}</div>
        ) : (
          <div className="mc-scroll" style={{flex:1}}>
            {emailsFiltrados.map((e,i) => (
              <div key={e.id} className={`mc-erow ${selEmail?.id===e.id?"mc-erow-active":""}`} onClick={()=>seleccionar(e)}>
                <div className="mc-eavatar" style={{background:`${AVATAR_COLORS[i%AVATAR_COLORS.length]}18`,color:AVATAR_COLORS[i%AVATAR_COLORS.length],border:`1px solid ${AVATAR_COLORS[i%AVATAR_COLORS.length]}30`}}>
                  {(e.de||"?")[0].toUpperCase()}
                </div>
                <div className="mc-ebody">
                  <div className="mc-efrom" style={{fontWeight:e.leido?400:700}}>{e.de?.split("<")[0].trim() || e.de}</div>
                  <div className="mc-esubj">{e.asunto}</div>
                  <div className="mc-eprev">{e.preview}</div>
                </div>
                <div className="mc-emeta">
                  <div className="mc-etime">{fmtFecha(e.fecha)}</div>
                  {!e.leido && <div className="mc-eunread"/>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vista del correo */}
      <div className="mc-panel mc-email-detail">
        {!selEmail ? (
          <div className="mc-empty" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>Selecciona un correo</div>
        ) : <>
          <div className="mc-detail-hdr">
            <div className="mc-detail-subj">{selEmail.asunto}</div>
            <div className="mc-detail-meta">
              <span className="mc-detail-from">De: {selEmail.de}</span>
              <span className="mc-detail-date">{fmtFecha(selEmail.fecha)}</span>
            </div>
          </div>
          <div className="mc-detail-body mc-scroll">
            <div className="mc-detail-txt" dangerouslySetInnerHTML={{__html: selEmail.cuerpo?.replace(/\n/g,"<br>") || ""}}/>
          </div>
          <div className="mc-reply-box">
            <input className="mc-reply-input" placeholder={`Responder a ${selEmail.de?.split("<")[0].trim()}…`}
              value={reply} onChange={e=>setReply(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter" && reply.trim()) { alert("Función de respuesta próximamente"); setReply(""); } }}/>
            <button className="mc-reply-btn" onClick={()=>{ if(reply.trim()) { alert("Función de respuesta próximamente"); setReply(""); }}}>▶ ENVIAR</button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ── PESTAÑA 4: RECORDATORIOS ───────────────────────────────────────────────
function RecordatoriosTab() {
  const [recordatorios, setRecordatorios] = useState([]);
  const [nuevo, setNuevo] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/recordatorios`);
      const d = await r.json();
      setRecordatorios(d.recordatorios || []);
    } catch {}
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const agregar = async () => {
    if (!nuevo.trim()) return;
    try {
      const r = await fetch(`${API}/recordatorios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: nuevo }),
      });
      const d = await r.json();
      setRecordatorios(d.recordatorios || []);
      setNuevo("");
    } catch {}
  };

  const eliminar = async (idx) => {
    try {
      const r = await fetch(`${API}/recordatorios/${idx}`, { method: "DELETE" });
      const d = await r.json();
      setRecordatorios(d.recordatorios || []);
    } catch {}
  };

  return (
    <div style={{ padding: 10, height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="mc-panel" style={{ flex: 1, minHeight: 0 }}>
        <div className="mc-ph">▸ RECORDATORIOS <div className="mc-pd" /></div>

        <div style={{ display: "flex", gap: 8, padding: 10 }}>
          <input
            className="mc-input"
            placeholder="Escribe un nuevo recordatorio…"
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => e.key === "Enter" && agregar()}
          />
          <button className="mc-btn-save" onClick={agregar}>+ AGREGAR</button>
        </div>

        <div className="mc-scroll" style={{ flex: 1 }}>
          {cargando ? (
            <div className="mc-loading"><div className="mc-spin" /></div>
          ) : recordatorios.length === 0 ? (
            <div className="mc-empty">No tienes recordatorios pendientes</div>
          ) : recordatorios.map((r, i) => (
            <div key={i} className="mc-mod-row">
              <div className="mc-mdot mc-green" />
              <div className="mc-mod-body">
                <div className="mc-mod-name">{r}</div>
              </div>
              <button
                className="mc-btn-cancel"
                style={{ flexShrink: 0 }}
                onClick={() => eliminar(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function MissionControl({ onVolver }) {
  const [tab, setTab] = useState("sistema");
  const [hora, setHora] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mc-shell">
      <div className="mc-gbg"/>
      <div className="mc-cn mc-tl"/><div className="mc-cn mc-tr"/>
      <div className="mc-cn mc-bl"/><div className="mc-cn mc-br"/>

      <header className="mc-hdr">
        <button className="mc-back" onClick={onVolver}>← VOLVER</button>
        <div className="mc-brand">
          <span className="mc-btag">JARVIS</span>
          <span className="mc-bname">MISSION CONTROL</span>
        </div>

        <nav className="mc-tabs">
          {[
            {id:"sistema",   icon:"◎", label:"SISTEMA"},
            {id:"contenido", icon:"⬡", label:"CONTENIDO"},
            {id:"bandeja",   icon:"◈", label:"BANDEJA"},
            {id:"recordatorios", icon:"✎", label:"RECORDATORIOS"},
          ].map(t => (
            <button key={t.id}
              className={`mc-tab ${tab===t.id?"mc-tab-on":""}`}
              onClick={()=>setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>

        <div className="mc-hdr-right">
          <span className="mc-hora">{hora.toLocaleTimeString("es-CL")}</span>
          <div className="mc-live"><div className="mc-live-dot"/>ACTIVO</div>
        </div>
      </header>

      <div className="mc-body">
        {tab === "sistema"   && <SistemaTab />}
        {tab === "contenido" && <ContenidoTab />}
        {tab === "bandeja"   && <BandejaTab />}
        {tab === "recordatorios" && <RecordatoriosTab />}
      </div>
    </div>
  );
}