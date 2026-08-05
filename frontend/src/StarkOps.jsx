import React, { useState, useEffect, useRef, useCallback } from "react";
import "./MissionControl.css";
import "./StarkOps.css";

const API = "/api";

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

// ── PESTAÑA 2: CONTENIDO ─────────────────────────────────────────────────────
const COLS = ["IDEA","EN PROGRESO","REVISIÓN","COMPLETADO"];
const COL_COLORS = {"IDEA":"#A78BFA","EN PROGRESO":"#2DD4E8","REVISIÓN":"#F2A93B","COMPLETADO":"#4ADE80"};
const TAGS = ["WEB","BACKEND","IA","DB","MOBILE","DEVOPS","DISEÑO","OTRO"];
const TAG_COLORS = {WEB:"#2DD4E8",BACKEND:"#4ADE80",IA:"#A78BFA",DB:"#F2A93B",MOBILE:"#F87171",DEVOPS:"#6E8B9A",DISEÑO:"#F472B6",OTRO:"#9BBACB"};
const PRIORIDADES = {alta:"#F87171", media:"#F2A93B", baja:"#4ADE80"};

function ContenidoTab() {
  const [cards,    setCards]    = useLocalStorage("mc-cards", [
    {id:1,col:"EN PROGRESO",tag:"WEB",  titulo:"Jarvis Desktop",  desc:"Asistente personal con Tauri + React + Flask",fecha:"",prioridad:"media",checklist:[]},
    {id:2,col:"EN PROGRESO",tag:"BACKEND",titulo:"API REST Flask", desc:"Endpoints para comandos de voz e integraciones",fecha:"",prioridad:"alta",checklist:[{texto:"Endpoint de voz",hecho:true},{texto:"Endpoint de memoria",hecho:true},{texto:"Endpoint de historial",hecho:true},{texto:"Documentar API",hecho:false},{texto:"Tests",hecho:false}]},
    {id:3,col:"IDEA",       tag:"IA",   titulo:"Chatbot soporte",  desc:"Integrar LLM local para responder tickets",fecha:"",prioridad:"media",checklist:[]},
    {id:4,col:"IDEA",       tag:"WEB",  titulo:"Portfolio web",    desc:"Mostrar proyectos con animaciones HUD",fecha:"",prioridad:"baja",checklist:[]},
    {id:5,col:"REVISIÓN",   tag:"DB",   titulo:"Memoria semántica",desc:"JSON + extracción automática con Groq",fecha:"",prioridad:"baja",checklist:[]},
    {id:6,col:"COMPLETADO", tag:"WEB",  titulo:"Stark Maps 3D",    desc:"Mapbox GL JS (globo + calles unificado)",fecha:"",prioridad:"media",checklist:[]},
    {id:7,col:"COMPLETADO", tag:"WEB",  titulo:"Stark Intel HUD",  desc:"Panel de noticias y métricas en tiempo real",fecha:"",prioridad:"media",checklist:[]},
  ]);
  const [notas,    setNotas]    = useLocalStorage("mc-notas", [
    {id:1,titulo:"Ideas rápidas",      texto:"— Agregar comando 'toma nota'\n— Integrar Notion API\n— Modelo embeddings offline",fecha:"hoy"},
    {id:2,titulo:"Entrega Duoc UC",    texto:"Subir repo con README actualizado. Incluir capturas del HUD y demostración en video.",fecha:"15 jul"},
    {id:3,titulo:"Stack tecnológico",  texto:"Tauri · React · Flask · JSON · Mapbox GL JS · Edge TTS · Google STT",fecha:"esta semana"},
  ]);
  const [modal,     setModal]     = useState(null); // null | "card" | "nota"
  const [editCard,  setEditCard]  = useState(null);
  const [editNota,  setEditNota]  = useState(null);
  const [drag,      setDrag]      = useState(null);
  const [nuevoItem, setNuevoItem] = useState("");
  const [busqueda,  setBusqueda]  = useState("");
  const [filtroTag, setFiltroTag] = useState("TODOS");

  const nextId = arr => Math.max(0, ...arr.map(x=>x.id)) + 1;
  const hoyISO = () => new Date().toISOString().slice(0,10);

  const addCard = (col) => {
    setEditCard({id:nextId(cards),col,tag:"WEB",titulo:"",desc:"",fecha:"",prioridad:"media",checklist:[]});
    setModal("card");
  };
  const saveCard = () => {
    if (!editCard.titulo.trim()) return;
    const cardAnterior = cards.find(c => c.id === editCard.id);
    if (editCard.col === "COMPLETADO" && (!cardAnterior || cardAnterior.col !== "COMPLETADO")) {
      fetch(`${API}/celebrar-logro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: editCard.titulo }),
      }).catch(() => {});
    }
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
    const cardMovida = cards.find(c => c.id === drag);
    if (cardMovida && col === "COMPLETADO" && cardMovida.col !== "COMPLETADO") {
      fetch(`${API}/celebrar-logro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: cardMovida.titulo }),
      }).catch(() => {});
    }
    setCards(prev => prev.map(c=>c.id===drag?{...c,col}:c));
    setDrag(null);
  };

  const toggleChecklistItem = (idx) => {
    const cl = [...(editCard.checklist||[])];
    cl[idx] = {...cl[idx], hecho: !cl[idx].hecho};
    setEditCard({...editCard, checklist: cl});
  };
  const delChecklistItem = (idx) => {
    setEditCard({...editCard, checklist: editCard.checklist.filter((_,i)=>i!==idx)});
  };
  const addChecklistItem = () => {
    if (!nuevoItem.trim()) return;
    setEditCard({...editCard, checklist: [...(editCard.checklist||[]), {texto:nuevoItem.trim(),hecho:false}]});
    setNuevoItem("");
  };

  // Filtrado por búsqueda + tag
  const cardsFiltradas = cards.filter(c => {
    const matchTexto = !busqueda.trim() || c.titulo.toLowerCase().includes(busqueda.toLowerCase()) || c.desc.toLowerCase().includes(busqueda.toLowerCase());
    const matchTag = filtroTag === "TODOS" || c.tag === filtroTag;
    return matchTexto && matchTag;
  });

  // Métricas
  const totalCards      = cards.length;
  const enProgresoCount = cards.filter(c=>c.col==="EN PROGRESO").length;
  const completadoCount = cards.filter(c=>c.col==="COMPLETADO").length;
  const atrasadoCount   = cards.filter(c=>c.col!=="COMPLETADO" && c.fecha && c.fecha < hoyISO()).length;

  // Próximas fechas (no completadas, con fecha, ordenadas)
  const proximos = cards
    .filter(c => c.col!=="COMPLETADO" && c.fecha)
    .sort((a,b) => a.fecha.localeCompare(b.fecha))
    .slice(0,5);

  const fmtFecha = (iso) => {
    if (!iso) return "";
    const [y,m,d] = iso.split("-");
    return `${d}/${m}`;
  };

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",gap:8,padding:"6px 8px 8px",minHeight:0}}>

      {/* Métricas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,flexShrink:0}}>
        <div style={{background:"rgba(45,212,232,0.06)",border:"1px solid rgba(45,212,232,0.25)",borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:9,color:"rgba(220,239,245,0.5)",letterSpacing:"0.06em"}}>TOTAL</div>
          <div style={{fontSize:18,fontWeight:700,color:"#2DD4E8"}}>{totalCards}</div>
        </div>
        <div style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.3)",borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:9,color:"rgba(220,239,245,0.5)",letterSpacing:"0.06em"}}>EN PROGRESO</div>
          <div style={{fontSize:18,fontWeight:700,color:"#A78BFA"}}>{enProgresoCount}</div>
        </div>
        <div style={{background:"rgba(74,222,128,0.06)",border:"1px solid rgba(74,222,128,0.3)",borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:9,color:"rgba(220,239,245,0.5)",letterSpacing:"0.06em"}}>COMPLETADOS</div>
          <div style={{fontSize:18,fontWeight:700,color:"#4ADE80"}}>{completadoCount}</div>
        </div>
        <div style={{background:"rgba(248,113,113,0.06)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:8,padding:"8px 10px"}}>
          <div style={{fontSize:9,color:"rgba(220,239,245,0.5)",letterSpacing:"0.06em"}}>ATRASADOS</div>
          <div style={{fontSize:18,fontWeight:700,color:"#F87171"}}>{atrasadoCount}</div>
        </div>
      </div>

      {/* Búsqueda + filtros */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <input
          className="mc-input"
          placeholder="Buscar proyecto…"
          value={busqueda}
          onChange={e=>setBusqueda(e.target.value)}
          style={{flex:1,minWidth:140}}
        />
        <span
          onClick={()=>setFiltroTag("TODOS")}
          style={{fontSize:10,padding:"5px 9px",borderRadius:6,cursor:"pointer",
            background: filtroTag==="TODOS" ? "rgba(45,212,232,0.15)" : "transparent",
            color: filtroTag==="TODOS" ? "#2DD4E8" : "rgba(220,239,245,0.5)",
            border: `1px solid ${filtroTag==="TODOS" ? "rgba(45,212,232,0.35)" : "rgba(220,239,245,0.12)"}`}}>
          TODOS
        </span>
        {TAGS.map(t => (
          <span key={t}
            onClick={()=>setFiltroTag(t)}
            style={{fontSize:10,padding:"5px 9px",borderRadius:6,cursor:"pointer",
              background: filtroTag===t ? `${TAG_COLORS[t]}22` : "transparent",
              color: filtroTag===t ? TAG_COLORS[t] : "rgba(220,239,245,0.5)",
              border: `1px solid ${filtroTag===t ? TAG_COLORS[t]+"55" : "rgba(220,239,245,0.12)"}`}}>
            {t}
          </span>
        ))}
      </div>

      <div className="mc-grid-contenido" style={{flex:1,minHeight:0,padding:0}}>
        {/* Kanban */}
        <div className="mc-panel" style={{height:"100%",minHeight:0}}>
          <div className="mc-ph">⬡ PROYECTOS<div style={{display:"flex",gap:6,alignItems:"center"}}><span className="mc-badge-small">{cardsFiltradas.filter(c=>c.col!=="COMPLETADO").length} activos</span><div className="mc-pd"/></div></div>
          <div className="mc-kanban" style={{height:"100%"}}>
            {COLS.map(col => {
              const color = COL_COLORS[col];
              const colCards = cardsFiltradas.filter(c=>c.col===col);
              return (
                <div key={col} className="mc-kol"
                  onDragOver={e=>{e.preventDefault();}}
                  onDrop={()=>onDrop(col)}>
                  <div className="mc-kol-hdr" style={{background:`${color}12`,borderColor:`${color}35`,color}}>
                    {col==="COMPLETADO"?"✓":col==="REVISIÓN"?"◷":col==="EN PROGRESO"?"◎":"◈"} {col}
                    <span className="mc-kol-count">{colCards.length}</span>
                  </div>
                  {colCards.map(card => {
                    const cl = card.checklist || [];
                    const hechas = cl.filter(i=>i.hecho).length;
                    const atrasada = card.col!=="COMPLETADO" && card.fecha && card.fecha < hoyISO();
                    return (
                      <div key={card.id} className="mc-kcard"
                        style={{borderLeft:`3px solid ${PRIORIDADES[card.prioridad]||"#6E8B9A"}`}}
                        draggable onDragStart={()=>setDrag(card.id)}
                        onClick={()=>{setEditCard({...card, checklist: card.checklist||[]});setModal("card");}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span className="mc-ktag" style={{background:`${TAG_COLORS[card.tag]||"#2DD4E8"}18`,color:TAG_COLORS[card.tag]||"#2DD4E8",border:`1px solid ${TAG_COLORS[card.tag]||"#2DD4E8"}35`}}>{card.tag}</span>
                          <span style={{fontSize:9,color:PRIORIDADES[card.prioridad]||"#6E8B9A"}}>● {card.prioridad||"media"}</span>
                        </div>
                        <div className="mc-ktitulo">{card.titulo}</div>
                        <div className="mc-kdesc">{card.desc}</div>
                        {cl.length > 0 && (
                          <>
                            <div style={{background:"rgba(255,255,255,0.06)",borderRadius:3,height:4,overflow:"hidden"}}>
                              <div style={{background:"#2DD4E8",height:"100%",width:`${(hechas/cl.length)*100}%`}}/>
                            </div>
                            <div style={{fontSize:9,color:"rgba(220,239,245,0.4)"}}>{hechas}/{cl.length} tareas</div>
                          </>
                        )}
                        <div className="mc-kfecha-row">
                          {card.fecha && <span className="mc-kfecha" style={atrasada?{color:"#F87171"}:{}}>{fmtFecha(card.fecha)}{atrasada?" · atrasado":""}</span>}
                          <button className="mc-kdel" onClick={e=>{e.stopPropagation();delCard(card.id);}}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="mc-kadd" onClick={()=>addCard(col)}>+ agregar</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Columna lateral: Próximo + Notas */}
        <div className="mc-notas-col">
          <div className="mc-panel-hdr-notas"><span>▸ PRÓXIMO</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
            {proximos.length === 0 ? (
              <div className="mc-empty" style={{padding:"8px 4px",fontSize:10}}>Sin fechas próximas</div>
            ) : proximos.map(c => {
              const atrasada = c.fecha < hoyISO();
              return (
                <div key={c.id} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"7px 9px",cursor:"pointer"}}
                  onClick={()=>{setEditCard({...c, checklist:c.checklist||[]});setModal("card");}}>
                  <div style={{fontSize:9,color: atrasada?"#F87171":"rgba(220,239,245,0.5)",marginBottom:2}}>
                    {fmtFecha(c.fecha)}{atrasada?" · vencido":""}
                  </div>
                  <div style={{fontSize:10,lineHeight:1.3}}>{c.titulo}</div>
                </div>
              );
            })}
          </div>

          <div className="mc-panel-hdr-notas" style={{marginTop:6}}>
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
            <div className="mc-form-2col">
              <div className="mc-form-row"><label>Prioridad</label>
                <select className="mc-input" value={editCard.prioridad||"media"} onChange={e=>setEditCard({...editCard,prioridad:e.target.value})}>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
              <div className="mc-form-row"><label>Fecha límite</label><input type="date" className="mc-input" value={editCard.fecha} onChange={e=>setEditCard({...editCard,fecha:e.target.value})}/></div>
            </div>
            <div className="mc-form-row">
              <label>Checklist</label>
              {(editCard.checklist||[]).map((item,i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <input type="checkbox" checked={item.hecho} onChange={()=>toggleChecklistItem(i)}/>
                  <span style={{flex:1,fontSize:11,textDecoration:item.hecho?"line-through":"none",opacity:item.hecho?0.5:1}}>{item.texto}</span>
                  <button className="mc-kdel" onClick={()=>delChecklistItem(i)}>✕</button>
                </div>
              ))}
              <div style={{display:"flex",gap:6}}>
                <input className="mc-input" placeholder="Nueva subtarea…" value={nuevoItem}
                  onChange={e=>setNuevoItem(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addChecklistItem();}}}/>
                <button className="mc-btn-save" onClick={addChecklistItem}>+</button>
              </div>
            </div>
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


// ── PESTAÑA 4: RECORDATORIOS ───────────────────────────────────────────────
function RecordatoriosTab() {
  const [recordatorios, setRecordatorios] = useState([]);
  const [nuevo, setNuevo] = useState("");
  const [cargando, setCargando] = useState(true);

  const [notas, setNotas] = useState([]);
  const [nuevaNota, setNuevaNota] = useState("");
  const [cargandoNotas, setCargandoNotas] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/recordatorios`);
      const d = await r.json();
      setRecordatorios(d.recordatorios || []);
    } catch {}
    setCargando(false);
  }, []);

  const cargarNotas = useCallback(async () => {
    try {
      const r = await fetch(`${API}/notas-rapidas`);
      const d = await r.json();
      setNotas(d.notas || []);
    } catch {}
    setCargandoNotas(false);
  }, []);

  useEffect(() => { cargar(); cargarNotas(); }, [cargar, cargarNotas]);

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

  const agregarNota = async () => {
    if (!nuevaNota.trim()) return;
    try {
      const r = await fetch(`${API}/notas-rapidas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: nuevaNota }),
      });
      const d = await r.json();
      setNotas(d.notas || []);
      setNuevaNota("");
    } catch {}
  };

  const eliminarNota = async (idx) => {
    try {
      const r = await fetch(`${API}/notas-rapidas/${idx}`, { method: "DELETE" });
      const d = await r.json();
      setNotas(d.notas || []);
    } catch {}
  };

  return (
    <div style={{ padding: 10, height: "100%", display: "flex", gap: 10, minHeight: 0 }}>

      {/* Recordatorios */}
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

      {/* Notas rápidas */}
      <div className="mc-panel" style={{ flex: 1, minHeight: 0 }}>
        <div className="mc-ph">✎ NOTAS RÁPIDAS <div className="mc-pd" /></div>

        <div style={{ display: "flex", gap: 8, padding: 10 }}>
          <input
            className="mc-input"
            placeholder="Escribe una nota…"
            value={nuevaNota}
            onChange={e => setNuevaNota(e.target.value)}
            onKeyDown={e => e.key === "Enter" && agregarNota()}
          />
          <button className="mc-btn-save" onClick={agregarNota}>+ AGREGAR</button>
        </div>

        <div className="mc-scroll" style={{ flex: 1 }}>
          {cargandoNotas ? (
            <div className="mc-loading"><div className="mc-spin" /></div>
          ) : notas.length === 0 ? (
            <div className="mc-empty">No tienes notas guardadas</div>
          ) : notas.slice().reverse().map((n, i) => {
            const idxReal = notas.length - 1 - i;
            return (
              <div key={idxReal} className="mc-mod-row">
                <div className="mc-mdot mc-cyan" />
                <div className="mc-mod-body">
                  <div className="mc-mod-name">{n.texto}</div>
                </div>
                <button
                  className="mc-btn-cancel"
                  style={{ flexShrink: 0 }}
                  onClick={() => eliminarNota(idxReal)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}


// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────
export default function StarkOps({ onVolver }) {
  const [tab, setTab] = useState("tareas");

  return (
    <div className="mc-shell so-shell">
      <div className="mc-gbg"/>
      <div className="mc-cn mc-tl"/><div className="mc-cn mc-tr"/>
      <div className="mc-cn mc-bl"/><div className="mc-cn mc-br"/>

      <header className="mc-hdr">
        <button className="mc-back" onClick={onVolver}>← VOLVER</button>
        <div className="mc-brand">
          <span className="mc-btag">STARK OPS</span>
          <span className="mc-bname">TAREAS Y RECORDATORIOS</span>
        </div>

        <nav className="mc-tabs">
          {[
            {id:"tareas", icon:"⬡", label:"TAREAS"},
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
          <div className="mc-live"><div className="mc-live-dot"/>ACTIVO</div>
        </div>
      </header>

      <div className="mc-body">
        {tab === "tareas" && <ContenidoTab />}
        {tab === "recordatorios" && <RecordatoriosTab />}
      </div>
    </div>
  );
}