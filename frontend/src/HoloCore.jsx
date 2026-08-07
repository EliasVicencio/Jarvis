import React, { useEffect, useRef, useState } from "react";

const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";

// Núcleo holográfico 3D de Saturday: un planeta con anillos estilo Saturno
// (referencia directa al nombre), que reacciona al estado (inactivo / escuchando / hablando).
// Carga Three.js por CDN, mismo patrón que Mapbox GL en Mapa.jsx.
export default function HoloCore({ estado, wakeFlash, onClick }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (window.THREE) { setListo(true); return; }
    const s = document.createElement("script");
    s.src = THREE_CDN;
    s.onload = () => setListo(true);
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    if (!listo || !mountRef.current || sceneRef.current.renderer) return;
    const THREE = window.THREE;
    const W = 260, H = 260;

    const scene = new THREE.Scene();
    // FOV ampliado a 58° (en vez de 45°) para que los anillos, más anchos que el planeta,
    // quepan completos dentro del cuadro de 180px sin cortarse en los bordes.
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // Planeta central: esfera de alambre que gira sobre su propio eje
    const geoPlaneta = new THREE.SphereGeometry(1.05, 16, 12);
    const matPlaneta = new THREE.MeshBasicMaterial({ color: 0x2DD4E8, wireframe: true, transparent: true, opacity: 0.85 });
    const planeta = new THREE.Mesh(geoPlaneta, matPlaneta);
    scene.add(planeta);

    // Anillos inclinados, estilo Saturno (referencia directa al nombre "Saturday")
    const anillos = new THREE.Group();
    anillos.rotation.x = Math.PI / 2 - 0.35;
    const matAnillo1 = new THREE.MeshBasicMaterial({ color: 0x8DA5E8, wireframe: true, transparent: true, opacity: 0.8 });
    const matAnillo2 = new THREE.MeshBasicMaterial({ color: 0x8DA5E8, wireframe: true, transparent: true, opacity: 0.5 });
    const anillo1 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.02, 6, 64), matAnillo1);
    const anillo2 = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.015, 6, 64), matAnillo2);
    anillos.add(anillo1, anillo2);
    scene.add(anillos);

    // Polvo del anillo: partículas casi en el mismo plano inclinado
    const N = 140;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 1.35 + Math.random() * 0.65;
      const ang = Math.random() * Math.PI * 2;
      positions[i * 3]     = r * Math.cos(ang);
      positions[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 2] = r * Math.sin(ang);
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const partMat = new THREE.PointsMaterial({ color: 0x8DA5E8, size: 0.03, transparent: true, opacity: 0.75 });
    const particulas = new THREE.Points(partGeo, partMat);
    particulas.rotation.x = Math.PI / 2 - 0.35;
    scene.add(particulas);

    sceneRef.current = { scene, camera, renderer, planeta, anillos, particulas, raf: null, t: 0, estado: "inactivo" };

    const animar = () => {
      const s = sceneRef.current;
      s.t += 0.016;
      const est = s.estado;

      let vel = 0.003;
      if (est === "escuchando") vel = 0.012;
      if (est === "hablando") vel = 0.02;

      s.planeta.rotation.y += vel;
      s.anillos.rotation.z += vel * 0.7;
      s.particulas.rotation.z += vel * 0.7;

      const freq = est === "hablando" ? 6 : est === "escuchando" ? 4 : 1.5;
      const amp = est === "inactivo" ? 0.012 : 0.055;
      s.planeta.scale.setScalar(1 + Math.sin(s.t * freq) * amp);

      s.renderer.render(s.scene, s.camera);
      s.raf = requestAnimationFrame(animar);
    };
    animar();

    return () => {
      cancelAnimationFrame(sceneRef.current.raf);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = "";
    };
  }, [listo]);

  useEffect(() => {
    sceneRef.current.estado = estado;
    if (!sceneRef.current.planeta) return;
    const colorMap = { inactivo: 0x2DD4E8, escuchando: 0x4ADE80, hablando: 0xF2A93B };
    sceneRef.current.planeta.material.color.setHex(colorMap[estado] || 0x2DD4E8);
  }, [estado]);

  return (
    <div
      className={`holo-core-wrap${wakeFlash ? " holo-wake" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Activar micrófono"
      onKeyDown={e => e.key === "Enter" && onClick()}
    >
      <div ref={mountRef} className="holo-canvas" />
      {!listo && <div className="holo-loading">◌</div>}
    </div>
  );
}