// Launch-panel orb: Orvy's glass head on its own, eye follows the pointer, agent orbs circling.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeNebula, makeGlass, radialTex } from "./nebula.js";

const canvas = document.querySelector("[data-orb]");
if (canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.15, 6.2);

  const back = makeNebula(false), front = makeNebula(true);
  const head = new THREE.Group();
  head.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), back));
  const eye = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 16, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 2.6) }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex("rgba(214,200,255,1)"), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  glow.scale.setScalar(1.25); eye.add(glow, ring); head.add(eye);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 48), front));
  head.add(new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 64), makeGlass()));
  scene.add(head);

  // halo
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex("rgba(143,123,255,1)"), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 }));
  halo.scale.setScalar(4.2); halo.position.z = -1; scene.add(halo);

  // orbiting agent orbs
  const ringG = new THREE.Group(); ringG.rotation.set(1.2, 0, 0.25); scene.add(ringG);
  const pts = []; for (let i = 0; i <= 128; i++) { const t = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * 1.75, Math.sin(t) * 1.75, 0)); }
  ringG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8f7bff, transparent: true, opacity: 0.22 })));
  const minis = [0x8f7bff, 0xffb24d, 0xc48cff, 0xffd9a8].map((c, i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.075 + (i % 2) * 0.03, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.5) }));
    ringG.add(m); return { m, p: (i / 4) * Math.PI * 2 };
  });

  const ptr = new THREE.Vector2(), ps = new THREE.Vector2();
  addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.set(THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / 500, -1, 1), THREE.MathUtils.clamp(-(e.clientY - (r.top + r.height / 2)) / 400, -1, 1));
  });

  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(size).observe(canvas); size();

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) loop(); }).observe(canvas);
  const clock = new THREE.Clock();
  function loop() {
    if (!visible || document.hidden) return;
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    ps.lerp(ptr, 0.08);
    back.uniforms.uTime.value = t; front.uniforms.uTime.value = t;
    head.rotation.y = ps.x * 0.35; head.rotation.x = -ps.y * 0.25;
    head.position.y = Math.sin(t * 1.2) * 0.05;
    eye.position.set(ps.x * 0.25, ps.y * 0.2 + 0.03, 0.5);
    eye.lookAt(head.localToWorld(new THREE.Vector3(ps.x, ps.y, 4)));
    ring.scale.y = 1 - Math.pow(Math.abs(Math.sin(t * 0.5)), 400) * 0.9;
    minis.forEach((o) => { const a = o.p + t * 0.45; o.m.position.set(Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0); });
    renderer.render(scene, camera);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loop(); });
  loop();
}
