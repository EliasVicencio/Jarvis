import React, { useState, useEffect, useCallback } from "react";
import "./MissionControl.css";

const API = "/api";

// ── Utilidades ────────────────────────────────────────────────────────────────
function fmtFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const diff = Math.floor((hoy - d) / 86400000);
  if (diff === 0) return `hoy ${d.toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"})}`;
  if (diff === 1) return "ayer";
  return d.toLocaleDateString("es-CL",{day:"numeric",month:"short"});
}

// ── PESTAÑA 1: SISTEMA ────────────────────────────────────────────────────────
function SistemaTab() {
  const [modulos,  setModulos]  = useState([]);
  const [memoria,  setMemoria]  = useState([]);
  const [tick,     setTick]     = useState(0);

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

  const cargarMemoria = useCallback(async () => {
    try {
      const r = await fetch(`${API}/memoria`);
      const d = await r.json();
      setMemoria(d.memoria || []);
    } catch {}
  }, []);

  useEffect(() => {
    verificarBackend(); cargarMemoria();
    const id = setInterval(() => {
      setTick(t => t+1);
      verificarBackend(); cargarMemoria();
    }, 5000);
    return () => clearInterval(id);
  }, []);

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

function RedTab() {
  const NODOS = [
    { nombre: "Groq LLM",       x: 170, y: 110, color: "#A78BFA", labelY: 140 },
    { nombre: "Piper TTS",      x: 520, y: 90,  color: "#2DD4E8", labelY: 72  },
    { nombre: "Google STT",     x: 610, y: 210, color: "#2DD4E8", labelY: 196 },
    { nombre: "Telegram",       x: 140, y: 300, color: "#4ADE80", labelY: 332 },
    { nombre: "Gmail",          x: 240, y: 440, color: "#4ADE80", labelY: 472 },
    { nombre: "Google Calendar",x: 520, y: 300, color: "#4ADE80", labelY: 332 },
    { nombre: "NewsAPI",        x: 460, y: 440, color: "#F2A93B", labelY: 472 },
    { nombre: "YouTube",        x: 590, y: 380, color: "#F2A93B", labelY: 412 },
    { nombre: "Mapbox",         x: 90,  y: 180, color: "#F2A93B", labelY: 166 },
    { nombre: "GitHub Actions", x: 380, y: 60,  color: "#F87171", labelY: 42  },
    { nombre: "Oracle VM",      x: 80,  y: 420, color: "#F87171", labelY: 452 },
  ];
  const CX = 350, CY = 260;
  const duraciones = [2.6, 3.1, 2.3, 2.9, 2.5, 2.8, 3.4, 2.7, 3.0, 2.4, 3.2];

  return (
    <div style={{ padding: 10, height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div className="mc-panel" style={{ padding: 16, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="mc-ph">
          ◉ RED NEURONAL · CEREBRO DE JARVIS
          <div className="mc-pd" />
        </div>

        <svg viewBox="0 0 700 520" style={{ display: "block", marginTop: 10, width: "100%", flex: 1, minHeight: 0 }}>
          <defs>
            <radialGradient id="starglow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* estrellas de fondo */}
          {[[50,60],[120,30],[650,80],[600,450],[30,400],[680,300],[200,480],[450,20]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r={0.8} fill="#fff" opacity={0.4} />
          ))}

          {/* lineas de conexion */}
          {NODOS.map((n, i) => (
            <line key={i} x1={CX} y1={CY} x2={n.x} y2={n.y} stroke="#2DD4E8" strokeWidth={0.6} opacity={0.35} />
          ))}

          {/* pulsos animados */}
          {NODOS.map((n, i) => (
            <circle key={i} r={2.5} fill="#2DD4E8">
              <animateMotion dur={`${duraciones[i]}s`} repeatCount="indefinite" path={`M${CX},${CY} L${n.x},${n.y}`} />
            </circle>
          ))}

          {/* nodos de servicios */}
          {NODOS.map((n, i) => (
            <g key={i}>
              <circle cx={n.x} cy={n.y} r={26} fill="url(#starglow)" opacity={0.15} />
              <circle cx={n.x} cy={n.y} r={5} fill="#0A121C" stroke={n.color} strokeWidth={1.3} />
              <text x={n.x} y={n.labelY} fill="#DCEFF5" fontSize={11} fontFamily="monospace" textAnchor="middle">
                {n.nombre}
              </text>
            </g>
          ))}

          {/* nucleo central: JARVIS */}
          <circle cx={CX} cy={CY} r={42} fill="url(#starglow)" opacity={0.3} />
          <circle cx={CX} cy={CY} r={24} fill="#0A121C" stroke="#2DD4E8" strokeWidth={1.8} />
          <text x={CX} y={CY + 6} fill="#2DD4E8" fontSize={15} fontWeight="bold" fontFamily="monospace" textAnchor="middle">
            J
          </text>
        </svg>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginTop: 14, fontSize: 10, color: "rgba(220,239,245,0.5)" }}>
          <span><span style={{ color: "#A78BFA" }}>●</span> Inteligencia</span>
          <span><span style={{ color: "#2DD4E8" }}>●</span> Voz</span>
          <span><span style={{ color: "#4ADE80" }}>●</span> Comunicación</span>
          <span><span style={{ color: "#F2A93B" }}>●</span> Datos externos</span>
          <span><span style={{ color: "#F87171" }}>●</span> Infraestructura</span>
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
            {id:"red", icon:"◉", label:"RED"},
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
        {tab === "sistema" && <SistemaTab />}
        {tab === "red" && <RedTab />}
      </div>
    </div>
  );
}