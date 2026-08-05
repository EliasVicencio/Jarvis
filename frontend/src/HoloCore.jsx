import React, { useEffect, useRef, useState } from "react";

const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";

// Núcleo holográfico 3D que reacciona al estado de Saturday (inactivo / escuchando / hablando).
// Reemplaza el anillo plano central. Carga Three.js por CDN, mismo patrón que Globe.gl en Mapa.jsx.
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
    const W = 180, H = 180;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // Núcleo exterior: icosaedro de baja resolución, estilo wireframe holográfico
    const geo = new THREE.IcosahedronGeometry(1.35, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2DD4E8, wireframe: true, transparent: true, opacity: 0.85 });
    const core = new THREE.Mesh(geo, mat);
    scene.add(core);

    // Núcleo interior, más chico, gira al revés (efecto de maquinaria)
    const geo2 = new THREE.IcosahedronGeometry(0.8, 0);
    const mat2 = new THREE.MeshBasicMaterial({ color: 0xF2A93B, wireframe: true, transparent: true, opacity: 0.45 });
    const core2 = new THREE.Mesh(geo2, mat2);
    scene.add(core2);

    // Partículas orbitando el núcleo
    const N = 120;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 1.7 + Math.random() * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const partMat = new THREE.PointsMaterial({ color: 0x2DD4E8, size: 0.035, transparent: true, opacity: 0.7 });
    const particulas = new THREE.Points(partGeo, partMat);
    scene.add(particulas);

    sceneRef.current = { scene, camera, renderer, core, core2, particulas, raf: null, t: 0, estado: "inactivo" };

    const animar = () => {
      const s = sceneRef.current;
      s.t += 0.016;
      const est = s.estado;

      let vel = 0.003;
      if (est === "escuchando") vel = 0.012;
      if (est === "hablando") vel = 0.02;

      s.core.rotation.y += vel;
      s.core.rotation.x += vel * 0.4;
      s.core2.rotation.y -= vel * 1.6;
      s.core2.rotation.x -= vel * 0.6;
      s.particulas.rotation.y += vel * 0.5;

      const freq = est === "hablando" ? 6 : est === "escuchando" ? 4 : 1.5;
      const amp = est === "inactivo" ? 0.012 : 0.055;
      s.core.scale.setScalar(1 + Math.sin(s.t * freq) * amp);

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
    if (!sceneRef.current.core) return;
    const colorMap = { inactivo: 0x2DD4E8, escuchando: 0x4ADE80, hablando: 0xF2A93B };
    sceneRef.current.core.material.color.setHex(colorMap[estado] || 0x2DD4E8);
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