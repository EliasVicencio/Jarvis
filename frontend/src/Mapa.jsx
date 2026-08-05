import React, { useState, useEffect, useRef, useCallback } from "react";
import "./Mapa.css";

const MAPBOX_TOKEN = "pk.eyJ1IjoiZWxpYXN2aWNlbmNpbyIsImEiOiJjbXM2cWtsaG4wYWxqMnhwenFvaHV4emY3In0.2lKF_fqI-LulLtJZTyPP0Q";
const COLORES = ["#2DD4E8", "#4ADE80", "#F2A93B", "#F87171", "#A78BFA"];
const MAPBOXGL_SRC = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js";
const MAPBOXGL_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css";

export default function Mapa({ onVolver, busquedaInicial = null }) {
  const mapRef = useRef(null);
  const mapInst = useRef(null);
  const miUbicRef = useRef(null);
  const rutasIdsRef = useRef([]);
  const marcRef = useRef([]);
  const rotarRef = useRef(true);

  const [modo, setModo] = useState("globo"); // "globo" | "calles" — mismo mapa, distinta cámara
  const [vista3D, setVista3D] = useState(true);
  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [rutas, setRutas] = useState([]);
  const [guardados, setGuardados] = useState([]);
  const [miPos, setMiPos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [destActual, setDestActual] = useState(null);
  const busquedaEjecutadaRef = useRef(false);
  const modoRef = useRef("globo");
  useEffect(() => { modoRef.current = modo; }, [modo]);

  // ── Cargar Mapbox GL JS (un solo motor para globo y calles) ────────────
  useEffect(() => {
    const iniciar = () => {
      if (!mapRef.current || mapInst.current) return;
      const mapboxgl = window.mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/navigation-night-v1",
        projection: "globe",
        center: [-70.65, -33.45],
        zoom: 1.6,
        pitch: 0,
        bearing: 0,
        antialias: true,
        attributionControl: false,
      });
      mapInst.current = map;

      map.on("load", () => {
        map.setFog({
          color: "rgb(20, 30, 60)",
          "high-color": "rgb(10, 15, 35)",
          "horizon-blend": 0.03,
          "space-color": "rgb(4, 7, 18)",
          "star-intensity": 0.35,
        });

        const layers = map.getStyle().layers;
        const labelLayerId = layers.find(l => l.type === "symbol" && l.layout?.["text-field"])?.id;
        map.addLayer({
          id: "sm-3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": "#0F3A45",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 0.75,
          },
        }, labelLayerId);

        cargarCiudades(map);
        setCargando(false);
        obtenerUbicacion(map);
        iniciarRotacion(map);
      });
    };

    if (window.mapboxgl) { iniciar(); return; }
    const s = document.createElement("script");
    s.src = MAPBOXGL_SRC;
    s.onload = iniciar;
    document.head.appendChild(s);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = MAPBOXGL_CSS;
    document.head.appendChild(l);

    return () => { mapInst.current?.remove(); mapInst.current = null; };
  }, []);

  // ── Rotación automática del globo (Mapbox no la trae integrada) ────────
  const iniciarRotacion = (map) => {
    const paso = () => {
      if (rotarRef.current && modoRef.current === "globo" && !map._removed) {
        const c = map.getCenter();
        map.easeTo({ center: [c.lng - 0.12, c.lat], duration: 0 });
      }
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  };

  // ── Ciudades del mundo (dataset Natural Earth) como capa de Mapbox ─────
  const cargarCiudades = (map) => {
    fetch("/data/ciudades_mundo.json")
      .then(r => r.json())
      .then(ciudades => {
        const top = ciudades
          .filter(c => c.poblacion >= 200000 || c.capital)
          .slice(0, 600);
        const geojson = {
          type: "FeatureCollection",
          features: top.map(c => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [c.lon, c.lat] },
            properties: { nombre: c.nombre.toUpperCase(), poblacion: c.poblacion, capital: !!c.capital },
          })),
        };
        map.addSource("sm-ciudades", { type: "geojson", data: geojson });
        map.addLayer({
          id: "sm-ciudades-pt", type: "circle", source: "sm-ciudades",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "poblacion"], 200000, 1.5, 20000000, 4],
            "circle-color": ["case", ["get", "capital"], "#F2A93B", "#2DD4E8"],
            "circle-opacity": 0.85,
          },
        });
        map.addLayer({
          id: "sm-ciudades-txt", type: "symbol", source: "sm-ciudades",
          layout: {
            "text-field": ["get", "nombre"], "text-size": 10, "text-offset": [0, 1],
            "text-anchor": "top", "text-font": ["Open Sans Regular"],
          },
          paint: { "text-color": "#ffffff", "text-halo-color": "#070B18", "text-halo-width": 1 },
          minzoom: 2,
        });
        map.on("click", "sm-ciudades-pt", (e) => {
          const p = e.features[0].properties;
          const [lon, lat] = e.features[0].geometry.coordinates;
          verCalles({ nombre: p.nombre, lat, lon, dir: p.nombre, color: "#2DD4E8" });
        });
        map.on("mouseenter", "sm-ciudades-pt", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "sm-ciudades-pt", () => { map.getCanvas().style.cursor = ""; });
      })
      .catch(() => { });
  };

  const obtenerUbicacion = (map) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setMiPos({ lat, lon });
      rotarRef.current = false;
      map.flyTo({ center: [lon, lat], zoom: 2.2, duration: 1500 });
      const el = document.createElement("div");
      el.innerHTML = `<div class="sm-mi-wrap"><div class="sm-mi-ring"></div><div class="sm-mi-dot"></div></div>`;
      new window.mapboxgl.Marker({ element: el.firstElementChild }).setLngLat([lon, lat]).addTo(map);
    }, () => { });
  };

  // ── Ver calles de un lugar (misma cámara, solo cambia zoom/pitch) ──────
  const verCalles = useCallback((dest) => {
    const map = mapInst.current;
    if (!map) return;
    rotarRef.current = false;
    setModo("calles");
    setDestActual(dest);
    setRutas([]);
    rutasIdsRef.current.forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
    rutasIdsRef.current = [];
    marcRef.current.forEach(m => m.remove());
    marcRef.current = [];

    map.flyTo({ center: [dest.lon, dest.lat], zoom: 16.5, pitch: vista3D ? 60 : 0, bearing: -20, duration: 2000 });

    const mapboxgl = window.mapboxgl;
    if (miPos) {
      const el = document.createElement("div");
      el.innerHTML = `<div class="sm-mi-wrap"><div class="sm-mi-ring"></div><div class="sm-mi-dot"></div></div>`;
      const m = new mapboxgl.Marker({ element: el.firstElementChild }).setLngLat([miPos.lon, miPos.lat]).addTo(map);
      miUbicRef.current = m;
      marcRef.current.push(m);
    }
    resultados.forEach((r, i) => {
      const el = document.createElement("div");
      el.innerHTML = `<div class="sm-marker"><div class="sm-marker-num" style="background:${r.color};color:#070B18">${i + 1}</div><div class="sm-marker-label">${r.nombre.slice(0, 20)}</div></div>`;
      const m = new mapboxgl.Marker({ element: el.firstElementChild }).setLngLat([r.lon, r.lat]).addTo(map);
      marcRef.current.push(m);
    });
  }, [resultados, miPos, vista3D]);

  const volverGlobo = () => {
    const map = mapInst.current;
    marcRef.current.forEach(m => m.remove());
    marcRef.current = [];
    rutasIdsRef.current.forEach(id => {
      if (map?.getLayer(id)) map.removeLayer(id);
      if (map?.getSource(id)) map.removeSource(id);
    });
    rutasIdsRef.current = [];
    setModo("globo");
    setRutas([]);
    setDestActual(null);
    rotarRef.current = true;
    map?.flyTo({ center: miPos ? [miPos.lon, miPos.lat] : [-70.65, -33.45], zoom: 2.2, pitch: 0, bearing: 0, duration: 1800 });
  };

  const alternarVista3D = () => {
    const nuevo = !vista3D;
    setVista3D(nuevo);
    mapInst.current?.easeTo({ pitch: nuevo ? 60 : 0, duration: 800 });
  };

  // ── Buscar ────────────────────────────────────────────────────────────
  const buscarPorTermino = useCallback(async (termino) => {
    if (!termino?.trim()) return;
    setQuery(termino);
    setBuscando(true); setError(null); setResultados([]);
    try {
      const r = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(termino)}.json?access_token=${MAPBOX_TOKEN}&limit=5&language=es`
      );
      const data = await r.json();
      if (!data.features?.length) { setError("Sin resultados."); setBuscando(false); return; }
      const res = data.features.map((r, i) => ({
        nombre: r.place_name.split(",")[0],
        dir: r.place_name,
        lat: r.center[1],
        lon: r.center[0],
        color: COLORES[i],
      }));
      setResultados(res);
      if (mapInst.current && modoRef.current === "globo") {
        rotarRef.current = false;
        mapInst.current.flyTo({ center: [res[0].lon, res[0].lat], zoom: 3.5, duration: 1500 });
      }
    } catch { setError("Error de conexión."); }
    setBuscando(false);
  }, []);

  const buscar = useCallback(async () => {
    await buscarPorTermino(query);
  }, [query, buscarPorTermino]);

  // Ejecuta la búsqueda que vino por comando de voz/texto ("localiza X"), una sola vez,
  // apenas el mapa termina de cargar.
  useEffect(() => {
    if (!busquedaInicial || busquedaEjecutadaRef.current || cargando) return;
    busquedaEjecutadaRef.current = true;
    buscarPorTermino(busquedaInicial);
  }, [busquedaInicial, cargando, buscarPorTermino]);

  // ── Calcular ruta en vista calles ─────────────────────────────────────
  const calcularRuta = useCallback(async (dest) => {
    if (!miPos) { setError("Activa el GPS primero."); return; }
    if (modo === "globo") { verCalles(dest); await new Promise(r => setTimeout(r, 2100)); }
    const map = mapInst.current;
    if (!map) { setError("El mapa no está listo."); return; }

    rutasIdsRef.current.forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
    rutasIdsRef.current = [];
    setRutas([]);

    try {
      const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${miPos.lon},${miPos.lat};${dest.lon},${dest.lat}?alternatives=true&overview=full&geometries=geojson&access_token=${MAPBOX_TOKEN}`);
      const data = await r.json();
      if (!data.routes?.length) { setError("Sin ruta."); return; }

      const nuevas = data.routes.map((rt, i) => ({
        idx: i, km: (rt.distance / 1000).toFixed(1),
        min: Math.round(rt.duration / 60), color: COLORES[i], activa: i === 0,
      }));
      setRutas(nuevas);

      const mapboxgl = window.mapboxgl;
      const bounds = new mapboxgl.LngLatBounds();

      data.routes.forEach((rt, i) => {
        const id = `sm-ruta-${i}`;
        map.addSource(id, { type: "geojson", data: { type: "Feature", geometry: rt.geometry } });
        map.addLayer({
          id, type: "line", source: id,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": COLORES[i],
            "line-width": i === 0 ? 5 : 2.5,
            "line-opacity": i === 0 ? 0.9 : 0.4,
            "line-dasharray": i === 0 ? [1, 0] : [2, 1.5],
          },
        });
        rutasIdsRef.current.push(id);
        rt.geometry.coordinates.forEach(c => bounds.extend(c));
      });

      map.fitBounds(bounds, { padding: 60, pitch: vista3D ? 60 : 0 });
    } catch { setError("Error calculando ruta."); }
  }, [miPos, modo, vista3D, verCalles]);

  const seleccionarRuta = (idx) => {
    const map = mapInst.current;
    rutasIdsRef.current.forEach((id, i) => {
      if (!map?.getLayer(id)) return;
      map.setPaintProperty(id, "line-width", i === idx ? 5 : 2.5);
      map.setPaintProperty(id, "line-opacity", i === idx ? 0.9 : 0.4);
      map.setPaintProperty(id, "line-dasharray", i === idx ? [1, 0] : [2, 1.5]);
    });
    setRutas(prev => prev.map(r => ({ ...r, activa: r.idx === idx })));
  };

  const guardar = (r) => setGuardados(prev => prev.find(g => g.lat === r.lat) ? prev : [...prev, r]);
  const handleKey = (e) => { if (e.key === "Enter") buscar(); };

  return (
    <div className="sm-shell">
      <div className="sm-gbg" />
      <div className="sm-cn sm-tl" /><div className="sm-cn sm-tr" />
      <div className="sm-cn sm-bl" /><div className="sm-cn sm-br" />

      <header className="sm-hdr">
        <button className="sm-back" onClick={onVolver}>← VOLVER</button>
        <div className="sm-brand">
          <span className="sm-btag">STARK MAPS</span>
          <span className="sm-bname">{modo === "globo" ? "GLOBO INTERACTIVO 3D" : "VISTA DE CALLES"}</span>
        </div>
        {miPos && <span className="sm-coords">{miPos.lat.toFixed(4)}° · {miPos.lon.toFixed(4)}°</span>}
        <div className="sm-live"><div className="sm-ld" />GPS ACTIVO</div>
      </header>

      <div className="sm-body">
        <div className="sm-float-panel">
          <div className="sm-panel">
            <div className="sm-ph">◎ BÚSQUEDA <div className="sm-pd" /></div>
            <div className="sm-search-box">
              <input className="sm-search-input" placeholder="Buscar lugar…"
                value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey} />
              <button className="sm-search-btn" onClick={buscar} disabled={buscando || cargando}>
                {buscando ? "…" : "▶"}
              </button>
            </div>
            <div className="sm-btns-row">
              {modo === "calles" && (
                <button className="sm-mbtn sm-mbtn-cyan" onClick={volverGlobo}>◈ GLOBO</button>
              )}
              <button className="sm-mbtn" onClick={() => { rotarRef.current = !rotarRef.current; }}>↺ ROTAR</button>
              <button className="sm-mbtn" onClick={() => {
                if (miPos && mapInst.current) {
                  rotarRef.current = false;
                  mapInst.current.flyTo({ center: [miPos.lon, miPos.lat], zoom: modo === "calles" ? 15 : 2.2, duration: 1200 });
                }
              }}>⌖ MI POS</button>
            </div>
            {error && <div className="sm-error">⚠ {error}</div>}

            {resultados.length > 0 && (
              <div className="sm-resultados">
                <div className="sm-res-header">
                  {modo === "globo" ? "↓ Clic en punto o en resultado para ver calles" : `RESULTADOS (${resultados.length})`}
                </div>
                {resultados.map((r, i) => (
                  <div key={i} className="sm-res-row">
                    <div className="sm-res-num" style={{ background: r.color, color: "#070B18" }}>{i + 1}</div>
                    <div className="sm-res-body" onClick={() => verCalles(r)} style={{ cursor: "pointer" }}>
                      <div className="sm-res-nombre">{r.nombre}</div>
                      <div className="sm-res-dir">{r.dir.slice(0, 40)}…</div>
                    </div>
                    <div className="sm-res-btns">
                      <button className="sm-rbtn-mini sm-rbtn-map" onClick={() => verCalles(r)}>🗺</button>
                      {modo === "calles" && (
                        <button className="sm-rbtn-mini sm-rbtn-cyan" onClick={() => calcularRuta(r)}>RUTA</button>
                      )}
                      <button className="sm-rbtn-mini sm-rbtn-dim" onClick={() => guardar(r)}>✎</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rutas.length > 0 && (
            <div className="sm-panel">
              <div className="sm-ph">◈ RUTAS ({rutas.length}) <div className="sm-pd" /></div>
              {rutas.map(r => (
                <div key={r.idx} className={`sm-ruta-row ${r.activa ? "sm-ruta-activa" : ""}`} onClick={() => seleccionarRuta(r.idx)}>
                  <div className="sm-ruta-color" style={{ background: r.color }} />
                  <div className="sm-ruta-body">
                    <span className="sm-ruta-label">RUTA {r.idx + 1}{r.activa ? " · ACTIVA" : ""}</span>
                    <span className="sm-ruta-vals">
                      <span style={{ color: r.color }}>{r.km} km</span>
                      <span className="sm-ruta-sep">·</span>
                      <span>{r.min} min</span>
                    </span>
                  </div>
                  {r.activa && <span className="sm-ruta-check">✓</span>}
                </div>
              ))}
            </div>
          )}

          {guardados.length > 0 && (
            <div className="sm-panel sm-panel-flex">
              <div className="sm-ph">⬡ GUARDADOS ({guardados.length}) <div className="sm-pd" /></div>
              <div className="sm-mlist">
                {guardados.map((g, i) => (
                  <div key={i} className="sm-mrow" onClick={() => { verCalles(g); calcularRuta(g); }}>
                    <div className="sm-micon" style={{ background: `${g.color}22`, color: g.color, border: `1px solid ${g.color}55` }}>◈</div>
                    <div className="sm-mbody">
                      <div className="sm-mname">{g.nombre}</div>
                      <div className="sm-maddr">{g.lat.toFixed(4)}° · {g.lon.toFixed(4)}°</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sm-map-container">
          <div className="sm-globe-wrap sm-view-full">
            {cargando && (
              <div className="sm-loading">
                <div className="sm-spin" />
                <span>Cargando mapa 3D…</span>
              </div>
            )}
            <div ref={mapRef} className="sm-globe" />
            {modo === "calles" && (
              <div className="sm-hud-tl">
                <div className="sm-hbadge sm-hbadge-cyan">VISTA CALLES</div>
                {destActual && <div className="sm-hbadge">{destActual.nombre.slice(0, 20)}</div>}
                {rutas.length > 0 && <div className="sm-hbadge sm-hbadge-amber">{rutas.length} RUTAS</div>}
              </div>
            )}
            {modo === "calles" && (
              <div className="sm-zoom-ctrl">
                <button className="sm-zbtn" onClick={() => mapInst.current?.zoomIn()}>+</button>
                <button className="sm-zbtn" onClick={() => mapInst.current?.zoomOut()}>−</button>
              </div>
            )}
            {modo === "calles" && (
              <button className={`sm-3d-toggle ${vista3D ? "sm-3d-on" : ""}`} onClick={alternarVista3D}>
                {vista3D ? "◪ 3D" : "▭ 2D"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}