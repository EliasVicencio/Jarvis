import React, { useState, useEffect, useRef, useCallback } from "react";
import "./Mapa.css";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM = "https://router.project-osrm.org/route/v1/driving";
const MAPBOX_TOKEN = "pk.eyJ1IjoiZWxpYXN2aWNlbmNpbyIsImEiOiJjbXM2cWtsaG4wYWxqMnhwenFvaHV4emY3In0.2lKF_fqI-LulLtJZTyPP0Q";
const COLORES = ["#2DD4E8", "#4ADE80", "#F2A93B", "#F87171", "#A78BFA"];

export default function Mapa({ onVolver, busquedaInicial = null }) {
  const globeRef = useRef(null);
  const mapboxRef = useRef(null);
  const mapRef = useRef(null);
  const miUbicRef = useRef(null);
  const rutasIdsRef = useRef([]);
  const marcRef = useRef([]);
  const globeInst = useRef(null);

  const [modo, setModo] = useState("globo"); // "globo" | "calles"
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

  // ── Cargar Globe.gl ───────────────────────────────────────────────────
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/globe.gl@2.27.2/dist/globe.gl.min.js";
    s.onload = () => initGlobe();
    document.head.appendChild(s);
    return () => { if (globeInst.current) globeInst.current._destructor?.(); };
  }, []);

  // ── Fondo grafito con pocas estrellas tenues (en vez de la galaxia densa por defecto) ──
  const fondoEstrellasSuaves = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 800;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0A0C10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 140; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const r = Math.random() * 0.8 + 0.3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(203,213,225,${Math.random() * 0.35 + 0.08})`;
      ctx.fill();
    }
    return canvas.toDataURL();
  };

  const initGlobe = () => {
    if (!globeRef.current || globeInst.current) return;
    const Globe = window.Globe;

    const globe = Globe({ animateIn: true })(globeRef.current)
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl(fondoEstrellasSuaves())
      .showAtmosphere(true)
      .atmosphereColor("#1a6aff")
      .atmosphereAltitude(0.18)
      .pointsData([])
      .pointColor(p => p.color || "#2DD4E8")
      .pointAltitude(0.02)
      .pointRadius(p => p.r || 0.5)
      .pointLabel(p => `<div style="background:rgba(6,11,18,0.92);border:1px solid ${p.color || "#2DD4E8"};border-radius:3px;padding:4px 10px;font-family:JetBrains Mono,monospace;font-size:10px;color:${p.color || "#2DD4E8"}">${p.label}</div>`)
      .arcsData([])
      .arcColor(a => [a.color, a.color])
      .arcAltitude(0.2)
      .arcStroke(1.5)
      .arcDashLength(0.4)
      .arcDashGap(0.15)
      .arcDashAnimateTime(2000)
      .labelsData([])
      .labelText(d => d.nombre)
      .labelSize(0.4)
      .labelDotRadius(0.25)
      .labelColor(() => "#ffffff")
      .labelDotOrientation(() => "bottom")
      .labelResolution(3)
      .labelAltitude(0.01)
      .labelLabel(d => `<div style="background:rgba(6,11,18,0.85);border:1px solid rgba(255,255,255,0.2);border-radius:2px;padding:2px 6px;font-family:JetBrains Mono,monospace;font-size:9px;color:#ffffff">${d.nombre}</div>`);

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.4;

    // Al hacer clic en un punto, ir a vista de calles
    globe.onPointClick(p => {
      if (p.dest) verCalles(p.dest);
    });

    // Aplicar filtro cian HUD sobre el canvas de WebGL
    const canvas = globeRef.current.querySelector("canvas");
    if (canvas) {
      canvas.style.filter = "saturate(0) brightness(1.3) sepia(1) hue-rotate(175deg) saturate(4) brightness(0.75)";
    }

    globeInst.current = globe;
    setCargando(false);

    // Cargar ciudades del mundo reales (dataset Natural Earth, con población)
    fetch("/data/ciudades_mundo.json")
      .then(r => r.json())
      .then(ciudades => {
        const top = ciudades
          .filter(c => c.poblacion >= 200000 || c.capital)
          .slice(0, 600)
          .map(c => ({
            lat: c.lat,
            lng: c.lon,
            nombre: c.nombre.toUpperCase(),
            poblacion: c.poblacion,
            capital: c.capital,
          }));
        globe.labelsData(top)
          .labelSize(d => Math.min(0.9, 0.28 + Math.log10(d.poblacion) * 0.09))
          .labelDotRadius(d => Math.min(0.45, 0.15 + Math.log10(d.poblacion) * 0.04))
          .labelColor(d => d.capital ? "#F2A93B" : "#ffffff");
      })
      .catch(() => { });

    obtenerUbicacion(globe);
  };

  const obtenerUbicacion = (globe) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setMiPos({ lat, lon });
      globe.pointOfView({ lat, lng: lon, altitude: 1.8 }, 1500);
      // Geolocalización inversa para mostrar ciudad más cercana
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`)
        .then(r => r.json())
        .then(data => {
          const ciudad = data.address?.city || data.address?.town || data.address?.village || "Mi posición";
          const label = `📍 ${ciudad.toUpperCase()}`;
          globe.pointsData([{ lat, lng: lon, color: "#4ADE80", label, r: 0.5 }]);
        })
        .catch(() => {
          globe.pointsData([{ lat, lng: lon, color: "#4ADE80", label: "📍 MI POSICIÓN", r: 0.5 }]);
        });
      if (globeInst.current) globeInst.current.controls().autoRotate = false;
    }, () => { });
  };

  // ── Cargar Mapbox GL JS para vista de calles en 3D ─────────────────────
  const cargarMapboxGL = useCallback((lat, lon, marcadores = []) => {
    const cargar = () => {
      if (!mapRef.current) return;
      const mapboxgl = window.mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      if (mapboxRef.current) {
        mapboxRef.current.flyTo({ center: [lon, lat], zoom: 16.5, essential: true });
        marcRef.current.forEach(m => m.remove());
        marcRef.current = [];
        agregarMarcadores(mapboxgl, mapboxRef.current, marcadores, lat, lon);
        return;
      }

      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: "mapbox://styles/mapbox/navigation-night-v1",
        center: [lon, lat],
        zoom: 16.5,
        pitch: vista3D ? 60 : 0,
        bearing: -20,
        antialias: true,
        attributionControl: false,
      });

      map.on("load", () => {
        // Edificios en 3D (extrusión real), tono cian acorde a la estética HUD
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

        mapboxRef.current = map;
        agregarMarcadores(mapboxgl, map, marcadores, lat, lon);
      });

      setTimeout(() => map.resize(), 300);
      if (window.ResizeObserver && mapRef.current) {
        new ResizeObserver(() => map.resize()).observe(mapRef.current);
      }
    };

    if (window.mapboxgl) { cargar(); return; }
    const s = document.createElement("script");
    s.src = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js";
    s.onload = cargar;
    document.head.appendChild(s);
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css";
    document.head.appendChild(l);
  }, [vista3D]);

  const alternarVista3D = () => {
    const nuevo = !vista3D;
    setVista3D(nuevo);
    mapboxRef.current?.easeTo({ pitch: nuevo ? 60 : 0, duration: 800 });
  };

  const agregarMarcadores = (mapboxgl, map, marcadores, latDest, lonDest) => {
    // Mi posición
    if (miPos) {
      const el = document.createElement("div");
      el.innerHTML = `<div class="sm-mi-wrap"><div class="sm-mi-ring"></div><div class="sm-mi-dot"></div></div>`;
      const m = new mapboxgl.Marker({ element: el.firstElementChild }).setLngLat([miPos.lon, miPos.lat]).addTo(map);
      miUbicRef.current = m;
      marcRef.current.push(m);
    }
    // Marcadores de resultados
    marcadores.forEach((r, i) => {
      const el = document.createElement("div");
      el.innerHTML = `<div class="sm-marker"><div class="sm-marker-num" style="background:${r.color};color:#060B12">${i + 1}</div><div class="sm-marker-label">${r.nombre.slice(0, 20)}</div></div>`;
      const m = new mapboxgl.Marker({ element: el.firstElementChild }).setLngLat([r.lon, r.lat]).addTo(map);
      marcRef.current.push(m);
    });
  };

  // ── Ver calles de un lugar ────────────────────────────────────────────
  const verCalles = useCallback((dest) => {
    // Destruir mapa anterior para evitar conflictos de tamaño
    if (mapboxRef.current) {
      mapboxRef.current.remove();
      mapboxRef.current = null;
      marcRef.current = [];
      rutasIdsRef.current = [];
    }
    setRutas([]);
    setModo("calles");
    setDestActual(dest);
    setTimeout(() => cargarMapboxGL(dest.lat, dest.lon, resultados), 150);
  }, [resultados, cargarMapboxGL]);

  const volverGlobo = () => {
    if (mapboxRef.current) {
      mapboxRef.current.remove();
      mapboxRef.current = null;
      marcRef.current = [];
      rutasIdsRef.current = [];
    }
    setModo("globo");
    setRutas([]);
    setDestActual(null);
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
      const miPunto = miPos ? [{ lat: miPos.lat, lng: miPos.lon, color: "#4ADE80", label: "📍 Mi posición", size: 0.5 }] : [];
      const puntos = res.map((r, i) => ({ lat: r.lat, lng: r.lon, color: r.color, label: `${i + 1}. ${r.nombre}`, dest: r }));
      if (globeInst.current) {
        globeInst.current.pointsData([...miPunto, ...puntos]);
        globeInst.current.pointOfView({ lat: res[0].lat, lng: res[0].lon, altitude: 2.0 }, 1500);
        globeInst.current.controls().autoRotate = false;
      }
    } catch { setError("Error de conexión."); }
    setBuscando(false);
  }, [miPos]);

  const buscar = useCallback(async () => {
    await buscarPorTermino(query);
  }, [query, buscarPorTermino]);

  // ── Calcular ruta en vista calles ─────────────────────────────────────
  const calcularRuta = useCallback(async (dest) => {
    if (!miPos) { setError("Activa el GPS primero."); return; }
    // Si estamos en modo globo, cambiar a calles primero
    if (modo === "globo") {
      setModo("calles");
      setDestActual(dest);
      await new Promise(r => setTimeout(r, 150));
      await new Promise(r => {
        const esperar = setInterval(() => {
          if (mapRef.current) { clearInterval(esperar); r(); }
        }, 50);
      });
      if (!mapboxRef.current) await new Promise(r => setTimeout(r, 400));
    }
    if (!mapboxRef.current) { setError("El mapa no está listo."); return; }
    const map = mapboxRef.current;
    setTimeout(() => map.resize(), 100);

    // Limpiar rutas anteriores
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
  }, [miPos, modo, vista3D]);

  const seleccionarRuta = (idx) => {
    const map = mapboxRef.current;
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
        {/* Panel flotante sobre el globo */}
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
              <button className="sm-mbtn" onClick={() => {
                if (globeInst.current) {
                  globeInst.current.controls().autoRotate = !globeInst.current.controls().autoRotate;
                }
              }}>↺ ROTAR</button>
              <button className="sm-mbtn" onClick={() => {
                if (miPos && globeInst.current) {
                  globeInst.current.pointOfView({ lat: miPos.lat, lng: miPos.lon, altitude: 1.5 }, 1200);
                  if (modo === "calles") mapboxRef.current?.flyTo({ center: [miPos.lon, miPos.lat], zoom: 15 });
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
                    <div className="sm-res-num" style={{ background: r.color, color: "#060B12" }}>{i + 1}</div>
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

          <div className="sm-panel" style={{ flexShrink: 0 }}>
            <div className="sm-ph">▸ CONTROLES <div className="sm-pd" /></div>
            <div className="sm-hint-list">
              {modo === "globo" ? <>
                <div className="sm-hint">🌍 Arrastra para rotar el globo</div>
                <div className="sm-hint">🔍 Scroll para zoom</div>
                <div className="sm-hint">📍 Clic en punto → ver calles</div>
                <div className="sm-hint">🗺 Clic en resultado → ver calles</div>
              </> : <>
                <div className="sm-hint">🗺 Mapa real con calles OSM</div>
                <div className="sm-hint">◈ RUTA para calcular ruta</div>
                <div className="sm-hint">◈ GLOBO para volver al 3D</div>
              </>}
            </div>
          </div>
        </div>

        {/* Globo/mapa ocupa todo el espacio restante */}
        <div className="sm-map-container">
          {/* Globo 3D */}
          <div className={`sm-globe-wrap ${modo === "calles" ? "sm-view-mini" : "sm-view-full"}`}>
            {cargando && (
              <div className="sm-loading">
                <div className="sm-spin" />
                <span>Cargando globo 3D…</span>
              </div>
            )}
            <div ref={globeRef} className="sm-globe" />
            <div className="sm-hud-tl">
            </div>
            {modo === "calles" && (
              <button className="sm-expand-btn" onClick={volverGlobo}>⛶ EXPANDIR</button>
            )}
          </div>

          {/* Vista de calles */}
          {modo === "calles" && (
            <div className="sm-street-wrap">
              <div ref={mapRef} className="sm-map" />
              <div className="sm-hud-tl">
                <div className="sm-hbadge sm-hbadge-cyan">VISTA CALLES</div>
                {destActual && <div className="sm-hbadge">{destActual.nombre.slice(0, 20)}</div>}
                {rutas.length > 0 && <div className="sm-hbadge sm-hbadge-amber">{rutas.length} RUTAS</div>}
              </div>
              <div className="sm-zoom-ctrl">
                <button className="sm-zbtn" onClick={() => mapboxRef.current?.zoomIn()}>+</button>
                <button className="sm-zbtn" onClick={() => mapboxRef.current?.zoomOut()}>−</button>
              </div>
              <button className={`sm-3d-toggle ${vista3D ? "sm-3d-on" : ""}`} onClick={alternarVista3D}>
                {vista3D ? "◪ 3D" : "▭ 2D"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}