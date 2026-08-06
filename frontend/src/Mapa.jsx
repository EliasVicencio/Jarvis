import React, { useState, useEffect, useRef, useCallback } from "react";
import "./Mapa.css";

const MAPBOX_TOKEN = "pk.eyJ1IjoiZWxpYXN2aWNlbmNpbyIsImEiOiJjbXM2cWtsaG4wYWxqMnhwenFvaHV4emY3In0.2lKF_fqI-LulLtJZTyPP0Q";
const COLORES = ["#3f399c", "#4ADE80", "#F2A93B", "#F87171", "#fdfdff"];
const MAPBOXGL_SRC = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js";
const MAPBOXGL_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css";

export default function Mapa({ onVolver, busquedaInicial = null, capaInicial = null }) {
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
  const [mostrarEdificios, setMostrarEdificios] = useState(true);
  const [mostrarTrafico, setMostrarTrafico] = useState(false);
  const [navTab, setNavTab] = useState("overview");
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
          color: "rgb(20, 80, 90)",
          "high-color": "rgb(8, 35, 45)",
          "horizon-blend": 0.04,
          "space-color": "rgb(3, 6, 12)",
          "star-intensity": 0.5,
        });

        // Recolorear el globo: continentes oscuros con borde cian, océano casi negro
        const layers = map.getStyle().layers;
        layers.forEach(layer => {
          const sl = layer["source-layer"];
          try {
            if (sl === "water") {
              map.setPaintProperty(layer.id, "fill-color", "#050B14");
            } else if (sl === "landuse" || sl === "landcover" || sl === "land") {
              map.setPaintProperty(layer.id, "fill-color", "#0A1520");
            } else if (sl === "admin") {
              map.setPaintProperty(layer.id, "line-color", "#2DD4E8");
              map.setPaintProperty(layer.id, "line-opacity", 0.6);
            } else if (layer.type === "background") {
              map.setPaintProperty(layer.id, "background-color", "#050B14");
            }
          } catch { /* algunas capas no tienen esas propiedades, se ignoran */ }
        });

        const labelLayerId = layers.find(l => l.type === "symbol" && l.layout?.["text-field"])?.id;
        map.addLayer({
          id: "sm-3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": "#1B2B57",
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
          paint: { "text-color": "#E94BB8", "text-halo-color": "#050B14", "text-halo-width": 1 },
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

  const toggleEdificios = (valor) => {
    const map = mapInst.current;
    const nuevo = valor !== undefined ? valor : !mostrarEdificios;
    setMostrarEdificios(nuevo);
    if (map?.getLayer("sm-3d-buildings")) {
      map.setLayoutProperty("sm-3d-buildings", "visibility", nuevo ? "visible" : "none");
    }
  };

  const toggleTrafico = (valor) => {
    const map = mapInst.current;
    const nuevo = valor !== undefined ? valor : !mostrarTrafico;
    setMostrarTrafico(nuevo);
    if (!map) return;
    if (!map.getSource("sm-traffic")) {
      map.addSource("sm-traffic", { type: "vector", url: "mapbox://mapbox.mapbox-traffic-v1" });
      map.addLayer({
        id: "sm-traffic-layer", type: "line", source: "sm-traffic", "source-layer": "traffic",
        paint: {
          "line-width": 2,
          "line-color": [
            "match", ["get", "congestion"],
            "low", "#4ADE80", "moderate", "#F2A93B",
            "heavy", "#F87171", "severe", "#991B1B",
            "#8394BE",
          ],
        },
      });
    }
    map.setLayoutProperty("sm-traffic-layer", "visibility", nuevo ? "visible" : "none");
  };

  // ── Buscar ────────────────────────────────────────────────────────────
  // ── Búsqueda por categoría ("cafés cerca", "farmacias cerca"...) vía Search Box API ──
  const CATEGORIAS = {
    coffee_shop: ["café", "cafe", "cafetería", "cafeteria", "starbucks"],
    restaurant: ["restaurante", "restaurantes", "donde comer"],
    pharmacy: ["farmacia", "farmacias", "botica"],
    hospital: ["hospital", "hospitales", "urgencia", "urgencias"],
    bank: ["banco", "bancos"],
    gas_station: ["bencinera", "bencineras", "gasolinera", "gasolineras", "combustible"],
    supermarket: ["supermercado", "supermercados", "almacén", "almacen"],
    hotel: ["hotel", "hoteles", "alojamiento"],
    atm: ["cajero", "cajeros", "atm"],
    bar: ["bar", "bares", "pub"],
    bakery: ["panadería", "panaderia", "panaderías", "panaderias"],
  };

  const detectarCategoria = (termino) => {
    const t = termino.toLowerCase();
    for (const [id, palabras] of Object.entries(CATEGORIAS)) {
      if (palabras.some(p => t.includes(p))) return id;
    }
    return null;
  };

  // Muestra varios resultados como pines a la vez (en vez de navegar directo a uno)
  const mostrarComoMarcadores = useCallback((res) => {
    const map = mapInst.current;
    if (!map) return;
    rotarRef.current = false;
    marcRef.current.forEach(m => m.remove());
    marcRef.current = [];
    const mapboxgl = window.mapboxgl;
    const bounds = new mapboxgl.LngLatBounds();
    res.forEach((r, i) => {
      const el = document.createElement("div");
      el.innerHTML = `<div class="sm-marker"><div class="sm-marker-num" style="background:${r.color};color:#070B18">${i + 1}</div><div class="sm-marker-label">${r.nombre.slice(0, 20)}</div></div>`;
      el.firstElementChild.style.cursor = "pointer";
      el.firstElementChild.onclick = () => verCalles(r);
      const m = new mapboxgl.Marker({ element: el.firstElementChild }).setLngLat([r.lon, r.lat]).addTo(map);
      marcRef.current.push(m);
      bounds.extend([r.lon, r.lat]);
    });
    if (miPos) bounds.extend([miPos.lon, miPos.lat]);
    map.fitBounds(bounds, { padding: 80, pitch: 0, bearing: 0, duration: 1500, maxZoom: 15 });
  }, [miPos, verCalles]);

  const buscarCategoria = useCallback(async (categoriaId) => {
    setBuscando(true); setError(null); setResultados([]);
    try {
      const centro = miPos ? `${miPos.lon},${miPos.lat}` : "-70.65,-33.45";
      const r = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/category/${categoriaId}?access_token=${MAPBOX_TOKEN}&proximity=${centro}&limit=10&language=es`
      );
      const data = await r.json();
      if (!data.features?.length) { setError("Sin resultados cerca de ti."); setBuscando(false); return; }
      const res = data.features.map((f, i) => ({
        nombre: f.properties.name,
        dir: f.properties.full_address || f.properties.place_formatted || f.properties.name,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        color: COLORES[i % COLORES.length],
      }));
      setResultados(res);
      setModo("globo");
      mostrarComoMarcadores(res);
    } catch { setError("Error de conexión."); }
    setBuscando(false);
  }, [miPos, mostrarComoMarcadores]);

  const buscarPorTermino = useCallback(async (termino) => {
    if (!termino?.trim()) return;
    setQuery(termino);

    const categoria = detectarCategoria(termino);
    if (categoria) { await buscarCategoria(categoria); return; }

    setBuscando(true); setError(null); setResultados([]);
    try {
      const proximidad = miPos ? `&proximity=${miPos.lon},${miPos.lat}` : "";
      const r = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(termino)}&access_token=${MAPBOX_TOKEN}&limit=5&language=es${proximidad}`
      );
      const data = await r.json();
      if (!data.features?.length) { setError("Sin resultados."); setBuscando(false); return; }
      const res = data.features.map((f, i) => ({
        nombre: f.properties.name,
        dir: f.properties.full_address || f.properties.place_formatted || f.properties.name,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        color: COLORES[i],
      }));
      setResultados(res);
      verCalles(res[0]);
    } catch { setError("Error de conexión."); }
    setBuscando(false);
  }, [miPos, verCalles, buscarCategoria]);

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

  // Aplica la capa que vino por comando de voz ("activa el tráfico", "sin edificios 3d"...),
  // una sola vez, apenas el mapa termina de cargar.
  const capaAplicadaRef = useRef(false);
  useEffect(() => {
    if (!capaInicial || capaAplicadaRef.current || cargando) return;
    capaAplicadaRef.current = true;
    if (capaInicial === "trafico_on") toggleTrafico(true);
    if (capaInicial === "trafico_off") toggleTrafico(false);
    if (capaInicial === "edificios_on") toggleEdificios(true);
    if (capaInicial === "edificios_off") toggleEdificios(false);
  }, [capaInicial, cargando]);

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
          {navTab === "overview" && <>
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

            <div className="sm-panel" style={{ flexShrink: 0 }}>
              <div className="sm-ph">▸ CONTROLES <div className="sm-pd" /></div>
              <div className="sm-hint-list">
                {modo === "globo" ? <>
                  <div className="sm-hint">🌍 "localiza [lugar]" por voz</div>
                  <div className="sm-hint">☕ "café cerca" muestra varios</div>
                  <div className="sm-hint">🚦 "activa el tráfico" por voz</div>
                  <div className="sm-hint">🏢 "muestra edificios" por voz</div>
                </> : <>
                  <div className="sm-hint">🗺 Mapa real con calles OSM</div>
                  <div className="sm-hint">◈ RUTA para calcular ruta</div>
                  <div className="sm-hint">◈ GLOBO para volver al 3D</div>
                </>}
              </div>
            </div>
          </>}

          {navTab === "layers" && (
            <div className="sm-panel" style={{ flexShrink: 0 }}>
              <div className="sm-ph">▤ CAPAS <div className="sm-pd" /></div>
              <div className="sm-toggle-row" onClick={() => toggleEdificios()}>
                <span className="sm-toggle-label">Edificios 3D</span>
                <div className={`sm-switch ${mostrarEdificios ? "sm-switch-on" : ""}`}><div className="sm-switch-dot" /></div>
              </div>
              <div className="sm-toggle-row" onClick={alternarVista3D}>
                <span className="sm-toggle-label">Cámara inclinada</span>
                <div className={`sm-switch ${vista3D ? "sm-switch-on" : ""}`}><div className="sm-switch-dot" /></div>
              </div>
              <div className="sm-hint" style={{ padding: "8px 12px" }}>
                También por voz: "con edificios 3d" / "sin edificios 3d". Solo se ven al acercarte a nivel de calle.
              </div>
            </div>
          )}

          {navTab === "traffic" && (
            <div className="sm-panel" style={{ flexShrink: 0 }}>
              <div className="sm-ph">⛗ TRÁFICO <div className="sm-pd" /></div>
              <div className="sm-toggle-row" onClick={() => toggleTrafico()}>
                <span className="sm-toggle-label">Tráfico en vivo</span>
                <div className={`sm-switch ${mostrarTrafico ? "sm-switch-on" : ""}`}><div className="sm-switch-dot" /></div>
              </div>
              <div className="sm-hint" style={{ padding: "8px 12px" }}>
                También por voz: "activa el tráfico" / "oculta el tráfico". Verde = fluido, ámbar = moderado, rojo = congestionado.
              </div>
            </div>
          )}

          {navTab === "assets" && (
            <div className="sm-panel sm-panel-flex">
              <div className="sm-ph">⬡ GUARDADOS ({guardados.length}) <div className="sm-pd" /></div>
              {guardados.length === 0 ? (
                <div className="sm-hint" style={{ padding: "10px 12px" }}>Toca el ✎ junto a un resultado para guardarlo acá.</div>
              ) : (
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
              )}
            </div>
          )}

          {navTab === "system" && (
            <div className="sm-panel" style={{ flexShrink: 0 }}>
              <div className="sm-ph">◉ SISTEMA <div className="sm-pd" /></div>
              <div className="sm-sys-row"><span>Motor</span><span>Mapbox GL JS</span></div>
              <div className="sm-sys-row"><span>Búsqueda</span><span>Search Box API</span></div>
              <div className="sm-sys-row"><span>Estado</span><span style={{ color: cargando ? "#F2A93B" : "#4ADE80" }}>{cargando ? "Cargando…" : "Listo"}</span></div>
              <div className="sm-sys-row"><span>GPS</span><span style={{ color: miPos ? "#4ADE80" : "#F87171" }}>{miPos ? "Activo" : "Sin señal"}</span></div>
              {miPos && <div className="sm-sys-row"><span>Coordenadas</span><span>{miPos.lat.toFixed(4)}° · {miPos.lon.toFixed(4)}°</span></div>}
              <div className="sm-sys-row"><span>Vista actual</span><span>{modo === "globo" ? "Globo 3D" : "Calles 3D"}</span></div>
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

            <div className="sm-navbar">
              {[
                { id: "overview", icon: "◎", label: "OVERVIEW" },
                { id: "layers", icon: "▤", label: "LAYERS" },
                { id: "traffic", icon: "⛗", label: "TRAFFIC" },
                { id: "assets", icon: "⬡", label: "ASSETS" },
                { id: "system", icon: "◉", label: "SYSTEM" },
              ].map(t => (
                <button key={t.id}
                  className={`sm-nav-tab ${navTab === t.id ? "sm-nav-tab-on" : ""}`}
                  onClick={() => setNavTab(t.id)}>
                  <span className="sm-nav-icon">{t.icon}</span>
                  <span className="sm-nav-label">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}