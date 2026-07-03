import React, { useState, useEffect, useRef, useCallback } from "react";
import "./Mapa.css";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM      = "https://router.project-osrm.org/route/v1/driving";
const COLORES   = ["#2DD4E8","#4ADE80","#F2A93B","#F87171","#A78BFA"];

export default function Mapa({ onVolver }) {
  const globeRef    = useRef(null);
  const leafletRef  = useRef(null);
  const mapRef      = useRef(null);
  const miUbicRef   = useRef(null);
  const rutasRef    = useRef([]);
  const marcRef     = useRef([]);
  const globeInst   = useRef(null);

  const [modo,       setModo]       = useState("globo"); // "globo" | "calles"
  const [query,      setQuery]      = useState("");
  const [buscando,   setBuscando]   = useState(false);
  const [error,      setError]      = useState(null);
  const [resultados, setResultados] = useState([]);
  const [rutas,      setRutas]      = useState([]);
  const [guardados,  setGuardados]  = useState([]);
  const [miPos,      setMiPos]      = useState(null);
  const [cargando,   setCargando]   = useState(true);
  const [destActual, setDestActual] = useState(null);

  // ── Cargar Globe.gl ───────────────────────────────────────────────────
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/globe.gl@2.27.2/dist/globe.gl.min.js";
    s.onload = () => initGlobe();
    document.head.appendChild(s);
    return () => { if (globeInst.current) globeInst.current._destructor?.(); };
  }, []);

  const initGlobe = () => {
    if (!globeRef.current || globeInst.current) return;
    const Globe = window.Globe;
    // Ciudades del mundo para labels
    const CIUDADES = [
      // América del Norte
      {lat:40.7128,lng:-74.006,nombre:"NEW YORK"},{lat:34.0522,lng:-118.2437,nombre:"LOS ANGELES"},
      {lat:41.8781,lng:-87.6298,nombre:"CHICAGO"},{lat:29.7604,lng:-95.3698,nombre:"HOUSTON"},
      {lat:33.749,lng:-84.388,nombre:"ATLANTA"},{lat:47.6062,lng:-122.3321,nombre:"SEATTLE"},
      {lat:37.7749,lng:-122.4194,nombre:"SAN FRANCISCO"},{lat:25.7617,lng:-80.1918,nombre:"MIAMI"},
      {lat:45.5051,lng:-73.5543,nombre:"MONTREAL"},{lat:43.7,lng:-79.42,nombre:"TORONTO"},
      {lat:49.2827,lng:-123.1207,nombre:"VANCOUVER"},{lat:19.4326,lng:-99.1332,nombre:"CIUDAD DE MÉXICO"},
      {lat:20.9674,lng:-89.5926,nombre:"MERIDA"},{lat:25.6866,lng:-100.3161,nombre:"MONTERREY"},
      // América Central y Caribe
      {lat:23.1136,lng:-82.3666,nombre:"LA HABANA"},{lat:18.4655,lng:-66.1057,nombre:"SAN JUAN"},
      {lat:9.9281,lng:-84.0907,nombre:"SAN JOSÉ"},{lat:14.0723,lng:-87.2020,nombre:"TEGUCIGALPA"},
      // América del Sur
      {lat:-33.4489,lng:-70.6693,nombre:"SANTIAGO"},{lat:-23.5505,lng:-46.6333,nombre:"SÃO PAULO"},
      {lat:-34.6037,lng:-58.3816,nombre:"BUENOS AIRES"},{lat:-12.0464,lng:-77.0428,nombre:"LIMA"},
      {lat:-0.1807,lng:-78.4678,nombre:"QUITO"},{lat:4.711,lng:-74.0721,nombre:"BOGOTÁ"},
      {lat:10.4806,lng:-66.9036,nombre:"CARACAS"},{lat:-15.7801,lng:-47.9292,nombre:"BRASILIA"},
      {lat:-3.1190,lng:-60.0217,nombre:"MANAOS"},{lat:-22.9068,lng:-43.1729,nombre:"RIO DE JANEIRO"},
      {lat:-31.4167,lng:-64.1833,nombre:"CÓRDOBA"},{lat:-17.3895,lng:-66.1568,nombre:"COCHABAMBA"},
      {lat:-25.2867,lng:-57.647,nombre:"ASUNCION"},{lat:-34.9011,lng:-56.1645,nombre:"MONTEVIDEO"},
      {lat:-16.5,lng:-68.15,nombre:"LA PAZ"},{lat:-8.0476,lng:-34.877,nombre:"RECIFE"},
      // Europa
      {lat:51.5074,lng:-0.1278,nombre:"LONDON"},{lat:48.8566,lng:2.3522,nombre:"PARIS"},
      {lat:52.52,lng:13.405,nombre:"BERLIN"},{lat:41.9028,lng:12.4964,nombre:"ROME"},
      {lat:40.4168,lng:-3.7038,nombre:"MADRID"},{lat:48.2082,lng:16.3738,nombre:"VIENNA"},
      {lat:52.3676,lng:4.9041,nombre:"AMSTERDAM"},{lat:50.8503,lng:4.3517,nombre:"BRUSSELS"},
      {lat:59.3293,lng:18.0686,nombre:"STOCKHOLM"},{lat:60.1699,lng:24.9384,nombre:"HELSINKI"},
      {lat:55.6761,lng:12.5683,nombre:"COPENHAGEN"},{lat:59.9139,lng:10.7522,nombre:"OSLO"},
      {lat:47.3769,lng:8.5417,nombre:"ZÜRICH"},{lat:45.764,lng:4.8357,nombre:"LYON"},
      {lat:41.3851,lng:2.1734,nombre:"BARCELONA"},{lat:38.7223,lng:-9.1393,nombre:"LISBON"},
      {lat:53.3498,lng:-6.2603,nombre:"DUBLIN"},{lat:55.9533,lng:-3.1883,nombre:"EDINBURGH"},
      {lat:50.0755,lng:14.4378,nombre:"PRAGUE"},{lat:52.2297,lng:21.0122,nombre:"WARSAW"},
      {lat:47.4979,lng:19.0402,nombre:"BUDAPEST"},{lat:44.8176,lng:20.4633,nombre:"BELGRADE"},
      {lat:41.0082,lng:28.9784,nombre:"ISTANBUL"},{lat:37.9838,lng:23.7275,nombre:"ATHENS"},
      {lat:55.7558,lng:37.6173,nombre:"MOSCOW"},{lat:59.9343,lng:30.3351,nombre:"ST. PETERSBURG"},
      {lat:50.4501,lng:30.5234,nombre:"KYIV"},{lat:53.9045,lng:27.5615,nombre:"MINSK"},
      // África
      {lat:30.0444,lng:31.2357,nombre:"CAIRO"},{lat:-26.2041,lng:28.0473,nombre:"JOHANNESBURG"},
      {lat:-33.9249,lng:18.4241,nombre:"CAPE TOWN"},{lat:6.5244,lng:3.3792,nombre:"LAGOS"},
      {lat:5.5600,lng:-0.1969,nombre:"ACCRA"},{lat:14.6937,lng:-17.4441,nombre:"DAKAR"},
      {lat:33.9716,lng:-6.8498,nombre:"RABAT"},{lat:36.8065,lng:10.1815,nombre:"TUNIS"},
      {lat:32.8872,lng:13.1913,nombre:"TRIPOLI"},{lat:15.5007,lng:32.5599,nombre:"KHARTOUM"},
      {lat:-1.9441,lng:30.0619,nombre:"KIGALI"},{lat:-4.3317,lng:15.3278,nombre:"KINSHASA"},
      {lat:-25.9692,lng:32.5732,nombre:"MAPUTO"},{lat:-18.9137,lng:47.5361,nombre:"ANTANANARIVO"},
      // Asia
      {lat:39.9042,lng:116.4074,nombre:"BEIJING"},{lat:31.2304,lng:121.4737,nombre:"SHANGHAI"},
      {lat:35.6762,lng:139.6503,nombre:"TOKYO"},{lat:37.5665,lng:126.978,nombre:"SEOUL"},
      {lat:28.6139,lng:77.209,nombre:"NEW DELHI"},{lat:19.076,lng:72.8777,nombre:"MUMBAI"},
      {lat:22.5726,lng:88.3639,nombre:"KOLKATA"},{lat:13.0827,lng:80.2707,nombre:"CHENNAI"},
      {lat:1.3521,lng:103.8198,nombre:"SINGAPORE"},{lat:3.1390,lng:101.6869,nombre:"KUALA LUMPUR"},
      {lat:13.7563,lng:100.5018,nombre:"BANGKOK"},{lat:10.8231,lng:106.6297,nombre:"HO CHI MINH"},
      {lat:21.0278,lng:105.8342,nombre:"HANOI"},{lat:14.5995,lng:120.9842,nombre:"MANILA"},
      {lat:-6.2088,lng:106.8456,nombre:"JAKARTA"},{lat:23.1291,lng:113.2644,nombre:"GUANGZHOU"},
      {lat:25.2048,lng:55.2708,nombre:"DUBAI"},{lat:24.6877,lng:46.7219,nombre:"RIYADH"},
      {lat:33.3152,lng:44.3661,nombre:"BAGHDAD"},{lat:35.6892,lng:51.389,nombre:"TEHRAN"},
      {lat:33.8869,lng:35.5131,nombre:"BEIRUT"},{lat:31.7683,lng:35.2137,nombre:"JERUSALEM"},
      {lat:41.2995,lng:69.2401,nombre:"TASHKENT"},{lat:43.2220,lng:76.8512,nombre:"ALMATY"},
      {lat:43.9006,lng:125.3222,nombre:"CHANGCHUN"},{lat:22.3193,lng:114.1694,nombre:"HONG KONG"},
      {lat:25.0330,lng:121.5654,nombre:"TAIPEI"},{lat:34.6937,lng:135.5022,nombre:"OSAKA"},
      // Oceanía
      {lat:-33.8688,lng:151.2093,nombre:"SYDNEY"},{lat:-37.8136,lng:144.9631,nombre:"MELBOURNE"},
      {lat:-27.4698,lng:153.0251,nombre:"BRISBANE"},{lat:-31.9505,lng:115.8605,nombre:"PERTH"},
      {lat:-36.8485,lng:174.7633,nombre:"AUCKLAND"},{lat:-41.2865,lng:174.7762,nombre:"WELLINGTON"},
      // Medio Oriente adicional
      {lat:23.5880,lng:58.3829,nombre:"MUSCAT"},{lat:26.2235,lng:50.5876,nombre:"MANAMA"},
      {lat:29.3759,lng:47.9774,nombre:"KUWAIT CITY"},{lat:25.2854,lng:51.5310,nombre:"DOHA"},
    ];

    const globe = Globe({ animateIn: true })(globeRef.current)
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl("https://unpkg.com/three-globe/example/img/night-sky.png")
      .showAtmosphere(true)
      .atmosphereColor("#1a6aff")
      .atmosphereAltitude(0.18)
      .pointsData([])
      .pointColor(p => p.color || "#2DD4E8")
      .pointAltitude(0.02)
      .pointRadius(0.5)
      .pointLabel(p => `<div style="background:rgba(6,11,18,0.92);border:1px solid ${p.color||"#2DD4E8"};border-radius:3px;padding:4px 10px;font-family:JetBrains Mono,monospace;font-size:10px;color:${p.color||"#2DD4E8"}">${p.label}</div>`)
      .arcsData([])
      .arcColor(a => [a.color, a.color])
      .arcAltitude(0.2)
      .arcStroke(1.5)
      .arcDashLength(0.4)
      .arcDashGap(0.15)
      .arcDashAnimateTime(2000)
      .labelsData(CIUDADES)
      .labelText(d => d.nombre)
      .labelSize(0.4)
      .labelDotRadius(0.25)
      .labelColor(() => "rgba(255,255,255,0.95)")
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
    obtenerUbicacion(globe);
  };

  const obtenerUbicacion = (globe) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setMiPos({ lat, lon });
      globe.pointOfView({ lat, lng: lon, altitude: 1.8 }, 1500);
      globe.pointsData([{ lat, lng: lon, color: "#4ADE80", label: "📍 Mi posición", size: 0.7 }]);
      if (globeInst.current) globeInst.current.controls().autoRotate = false;
    }, () => {});
  };

  // ── Cargar Leaflet para vista de calles ───────────────────────────────
  const cargarLeaflet = useCallback((lat, lon, marcadores = []) => {
    const cargar = () => {
      if (!mapRef.current) return;
      const L = window.L;

      if (leafletRef.current) {
        leafletRef.current.setView([lat, lon], 16);
        // Actualizar marcadores
        marcRef.current.forEach(m => leafletRef.current.removeLayer(m));
        marcRef.current = [];
        agregarMarcadores(L, leafletRef.current, marcadores, lat, lon);
        return;
      }

      const map = L.map(mapRef.current, {
        center: [lat, lon], zoom: 16,
        zoomControl: false, attributionControl: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, subdomains: "abcd",
      }).addTo(map);

      leafletRef.current = map;
      agregarMarcadores(L, map, marcadores, lat, lon);
      // Forzar recálculo de tamaño múltiples veces
      setTimeout(() => map.invalidateSize(true), 100);
      setTimeout(() => map.invalidateSize(true), 300);
      setTimeout(() => map.invalidateSize(true), 600);
      // Observer para cuando el contenedor cambia de tamaño
      if (window.ResizeObserver && mapRef.current) {
        new ResizeObserver(() => map.invalidateSize(true)).observe(mapRef.current);
      }
    };

    if (window.L) { cargar(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = cargar;
    document.head.appendChild(s);
    const l = document.createElement("link");
    l.rel  = "stylesheet";
    l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(l);
  }, []);

  const agregarMarcadores = (L, map, marcadores, latDest, lonDest) => {
    // Mi posición
    if (miPos) {
      const iconMi = L.divIcon({
        html: `<div class="sm-mi-wrap"><div class="sm-mi-ring"></div><div class="sm-mi-dot"></div></div>`,
        className: "", iconSize: [20,20], iconAnchor: [10,10],
      });
      const m = L.marker([miPos.lat, miPos.lon], { icon: iconMi }).addTo(map);
      miUbicRef.current = m;
      marcRef.current.push(m);
    }
    // Marcadores de resultados
    marcadores.forEach((r, i) => {
      const icon = L.divIcon({
        html: `<div class="sm-marker"><div class="sm-marker-num" style="background:${r.color};color:#060B12">${i+1}</div><div class="sm-marker-label">${r.nombre.slice(0,20)}</div></div>`,
        className: "", iconSize: [20,20], iconAnchor: [10,30],
      });
      const m = L.marker([r.lat, r.lon], { icon }).addTo(map);
      marcRef.current.push(m);
    });
  };

  // ── Ver calles de un lugar ────────────────────────────────────────────
  const verCalles = useCallback((dest) => {
    // Destruir Leaflet anterior para evitar conflictos de tamaño
    if (leafletRef.current) {
      leafletRef.current.remove();
      leafletRef.current = null;
      marcRef.current = [];
      rutasRef.current = [];
    }
    setRutas([]);
    setModo("calles");
    setDestActual(dest);
    setTimeout(() => cargarLeaflet(dest.lat, dest.lon, resultados), 150);
  }, [resultados, cargarLeaflet]);

  const volverGlobo = () => {
    // Destruir Leaflet para que se recree limpio la próxima vez
    if (leafletRef.current) {
      leafletRef.current.remove();
      leafletRef.current = null;
      marcRef.current = [];
      rutasRef.current = [];
    }
    setModo("globo");
    setRutas([]);
    setDestActual(null);
  };

  // ── Buscar ────────────────────────────────────────────────────────────
  const buscar = useCallback(async () => {
    if (!query.trim()) return;
    setBuscando(true); setError(null); setResultados([]);
    try {
      const r = await fetch(
        `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
        { headers: { "Accept-Language": "es" } }
      );
      const data = await r.json();
      if (!data.length) { setError("Sin resultados."); setBuscando(false); return; }

      const res = data.map((r, i) => ({
        nombre: r.display_name.split(",")[0],
        dir:    r.display_name,
        lat:    parseFloat(r.lat),
        lon:    parseFloat(r.lon),
        color:  COLORES[i],
      }));
      setResultados(res);

      // Marcar en el globo
      const miPunto = miPos
        ? [{ lat: miPos.lat, lng: miPos.lon, color: "#4ADE80", label: "📍 Mi posición" }]
        : [];
      const puntos = res.map((r, i) => ({
        lat: r.lat, lng: r.lon, color: r.color,
        label: `${i+1}. ${r.nombre} — clic para ver calles`,
        dest: r,
      }));
      if (globeInst.current) {
        globeInst.current.pointsData([...miPunto, ...puntos]);
        globeInst.current.pointOfView({ lat: res[0].lat, lng: res[0].lon, altitude: 2.0 }, 1500);
        globeInst.current.controls().autoRotate = false;
      }
    } catch { setError("Error de conexión."); }
    setBuscando(false);
  }, [query, miPos]);

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
      if (!leafletRef.current) await new Promise(r => setTimeout(r, 300));
    }
    if (!leafletRef.current) { setError("El mapa no está listo."); return; }
    // Asegurar que Leaflet recalcula su tamaño
    setTimeout(() => leafletRef.current?.invalidateSize(), 100);
    rutasRef.current.forEach(r => leafletRef.current.removeLayer(r));
    rutasRef.current = [];
    setRutas([]);
    const L = window.L;
    try {
      const r = await fetch(`${OSRM}/${miPos.lon},${miPos.lat};${dest.lon},${dest.lat}?alternatives=true&overview=full&geometries=geojson`);
      const data = await r.json();
      if (!data.routes?.length) { setError("Sin ruta."); return; }

      const nuevas = data.routes.map((rt, i) => ({
        idx: i, km: (rt.distance/1000).toFixed(1),
        min: Math.round(rt.duration/60), color: COLORES[i], activa: i===0,
      }));
      setRutas(nuevas);

      data.routes.forEach((rt, i) => {
        const linea = L.geoJSON(rt.geometry, {
          style: { color: COLORES[i], weight: i===0?5:2.5, opacity: i===0?0.9:0.5, dashArray: i===0?null:"8 5" }
        }).addTo(leafletRef.current);
        rutasRef.current.push(linea);
      });
      leafletRef.current.fitBounds(rutasRef.current[0].getBounds(), { padding:[40,40] });
    } catch { setError("Error calculando ruta."); }
  }, [miPos]);

  const seleccionarRuta = (idx) => {
    rutasRef.current.forEach((l, i) => l.setStyle({
      weight: i===idx?5:2.5, opacity: i===idx?0.9:0.4,
      dashArray: i===idx?null:"8 5",
    }));
    setRutas(prev => prev.map(r => ({ ...r, activa: r.idx===idx })));
  };

  const guardar = (r) => setGuardados(prev => prev.find(g => g.lat===r.lat) ? prev : [...prev, r]);
  const handleKey = (e) => { if (e.key === "Enter") buscar(); };

  return (
    <div className="sm-shell">
      <div className="sm-gbg"/>
      <div className="sm-cn sm-tl"/><div className="sm-cn sm-tr"/>
      <div className="sm-cn sm-bl"/><div className="sm-cn sm-br"/>

      <header className="sm-hdr">
        <button className="sm-back" onClick={onVolver}>← VOLVER</button>
        <div className="sm-brand">
          <span className="sm-btag">STARK MAPS</span>
          <span className="sm-bname">{modo === "globo" ? "GLOBO INTERACTIVO 3D" : "VISTA DE CALLES"}</span>
        </div>
        {miPos && <span className="sm-coords">{miPos.lat.toFixed(4)}° · {miPos.lon.toFixed(4)}°</span>}
        <div className="sm-live"><div className="sm-ld"/>GPS ACTIVO</div>
      </header>

      <div className="sm-body">
        {/* Panel flotante sobre el globo */}
        <div className="sm-float-panel">
          <div className="sm-panel">
            <div className="sm-ph">◎ BÚSQUEDA <div className="sm-pd"/></div>
            <div className="sm-search-box">
              <input className="sm-search-input" placeholder="Buscar lugar…"
                value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}/>
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
                  if (modo === "calles") leafletRef.current?.setView([miPos.lat, miPos.lon], 15);
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
                    <div className="sm-res-num" style={{background:r.color,color:"#060B12"}}>{i+1}</div>
                    <div className="sm-res-body" onClick={() => verCalles(r)} style={{cursor:"pointer"}}>
                      <div className="sm-res-nombre">{r.nombre}</div>
                      <div className="sm-res-dir">{r.dir.slice(0,40)}…</div>
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
              <div className="sm-ph">◈ RUTAS ({rutas.length}) <div className="sm-pd"/></div>
              {rutas.map(r => (
                <div key={r.idx} className={`sm-ruta-row ${r.activa?"sm-ruta-activa":""}`} onClick={() => seleccionarRuta(r.idx)}>
                  <div className="sm-ruta-color" style={{background:r.color}}/>
                  <div className="sm-ruta-body">
                    <span className="sm-ruta-label">RUTA {r.idx+1}{r.activa?" · ACTIVA":""}</span>
                    <span className="sm-ruta-vals">
                      <span style={{color:r.color}}>{r.km} km</span>
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
              <div className="sm-ph">⬡ GUARDADOS ({guardados.length}) <div className="sm-pd"/></div>
              <div className="sm-mlist">
                {guardados.map((g, i) => (
                  <div key={i} className="sm-mrow" onClick={() => { verCalles(g); calcularRuta(g); }}>
                    <div className="sm-micon" style={{background:`${g.color}22`,color:g.color,border:`1px solid ${g.color}55`}}>◈</div>
                    <div className="sm-mbody">
                      <div className="sm-mname">{g.nombre}</div>
                      <div className="sm-maddr">{g.lat.toFixed(4)}° · {g.lon.toFixed(4)}°</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sm-panel" style={{flexShrink:0}}>
            <div className="sm-ph">▸ CONTROLES <div className="sm-pd"/></div>
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
                <div className="sm-spin"/>
                <span>Cargando globo 3D…</span>
              </div>
            )}
            <div ref={globeRef} className="sm-globe"/>
            <div className="sm-hud-tl">
            </div>
            {modo === "calles" && (
              <button className="sm-expand-btn" onClick={volverGlobo}>⛶ EXPANDIR</button>
            )}
          </div>

          {/* Vista de calles */}
          {modo === "calles" && (
            <div className="sm-street-wrap">
              <div ref={mapRef} className="sm-map"/>
              <div className="sm-hud-tl">
                <div className="sm-hbadge sm-hbadge-cyan">VISTA CALLES</div>
                {destActual && <div className="sm-hbadge">{destActual.nombre.slice(0,20)}</div>}
                {rutas.length > 0 && <div className="sm-hbadge sm-hbadge-amber">{rutas.length} RUTAS</div>}
              </div>
              <div className="sm-zoom-ctrl">
                <button className="sm-zbtn" onClick={() => leafletRef.current?.zoomIn()}>+</button>
                <button className="sm-zbtn" onClick={() => leafletRef.current?.zoomOut()}>−</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}