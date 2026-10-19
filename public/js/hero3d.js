// ORVYN hero stage — Orvy (a big floating glass orb with a living nebula and one eye), orbiting agent orbs, dust.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeNebula, makeGlass, radialTex } from "./nebula.js";

const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setClearColor(0x060609, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

// ---------- lights ----------
const key = new THREE.DirectionalLight(0xfff3e6, 2.2); key.position.set(-2.5, 4, 4); scene.add(key);
const rimV = new THREE.DirectionalLight(0x8f7bff, 5); rimV.position.set(-4, 2.5, -3); scene.add(rimV);
const rimA = new THREE.DirectionalLight(0xffb24d, 3.2); rimA.position.set(4, 1.5, -2.5); scene.add(rimA);
scene.add(new THREE.HemisphereLight(0x2a2440, 0x050507, 0.6));

const rig = new THREE.Group(); scene.add(rig);           // everything that sways with the pointer
const H = 2;                                            // character height in world units

// ---------- backdrop glow ----------
const glowMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uTime;
    void main(){ vec2 p=vUv-.5; float d=length(p*vec2(1.,.8));
      float g=smoothstep(.5,.0,d); g*=g;
      vec3 c=mix(vec3(.33,.25,.85), vec3(.9,.55,.2), smoothstep(-.3,.5,p.x+.15*sin(uTime*.3)));
      gl_FragColor=vec4(c*g*.32,1.); }`,
});
const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), glowMat);
glow.position.set(0, 1.25, -2.6); scene.add(glow);

// ---------- floor ----------
const floorMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uTime;
    void main(){ vec2 p=(vUv-.5)*2.; float r=length(p); float a=atan(p.y,p.x);
      float fade=smoothstep(1.,.15,r);
      float rings=smoothstep(.012,.0,abs(fract(r*7.-uTime*.04)-.5)-.47)*.18;
      float ring=smoothstep(.03,.0,abs(r-.30))*(.6+.4*sin(a*3.+uTime));
      vec3 col=mix(vec3(.56,.48,1.),vec3(1.,.7,.3),.5+.5*sin(a+uTime*.5));
      float shadow=smoothstep(.34,.0,r)*.85;
      vec3 c=col*(ring*.9+rings)*fade;
      float glowA=clamp((ring*.9+rings)*fade*2.,0.,1.);
      gl_FragColor=vec4(c*2., max(shadow, glowA)); }`,
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 96), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; rig.add(floor);

// ---------- orbiting agent orbs ----------
const orbits = [];
const orbGeo = new THREE.SphereGeometry(1, 32, 24);
const ORBIT_DEFS = [
  { rx: 1.25, rz: 1.0, y: 0.78, tilt: 0.2, n: 4, speed: 0.16 },
  { rx: 1.45, rz: 1.15, y: 1.2, tilt: -0.16, n: 5, speed: -0.11 },
  { rx: 1.1, rz: 0.9, y: 1.68, tilt: 0.3, n: 3, speed: 0.2 },
];
const tints = [0x8f7bff, 0xffb24d, 0xc48cff, 0xffd9a8, 0x6e8bff];
const orbGlowTex = radialTex("rgba(255,255,255,0.9)");
ORBIT_DEFS.forEach((o, oi) => {
  const g = new THREE.Group(); g.position.y = o.y; g.rotation.z = o.tilt; rig.add(g);
  const pts = []; for (let i = 0; i <= 128; i++) { const t = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * o.rx, 0, Math.sin(t) * o.rz)); }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x8f7bff, transparent: true, opacity: 0.12 }));
  g.add(line);
  for (let i = 0; i < o.n; i++) {
    const tint = tints[(oi * 3 + i) % tints.length];
    const s = 0.035 + ((i * 37 + oi * 11) % 5) * 0.012;
    const core = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(1.6) }));
    core.scale.setScalar(s * 0.55);
    const shell = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbGlowTex, color: tint, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    shell.scale.setScalar(s * 5);
    const m = new THREE.Group(); m.add(core, shell); g.add(m);
    orbits.push({ m, o, phase: (i / o.n) * Math.PI * 2 + oi });
  }
});

// ---------- dust ----------
const DUST = 420;
const dPos = new Float32Array(DUST * 3), dSeed = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) {
  dPos[i * 3] = (Math.random() - 0.5) * 9; dPos[i * 3 + 1] = Math.random() * 4.2; dPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
  dSeed[i] = Math.random();
}
const dGeo = new THREE.BufferGeometry();
dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
dGeo.setAttribute("seed", new THREE.BufferAttribute(dSeed, 1));
const dMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
  vertexShader: `attribute float seed; uniform float uTime; uniform float uPR; varying float vA; varying float vS;
    void main(){ vec3 p=position; p.y=mod(p.y+uTime*(.03+seed*.05),4.2); p.x+=sin(uTime*.2+seed*30.)*.15;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=(1.2+seed*2.2)*uPR*(5./-mv.z); vA=.25+.75*fract(seed*7.3); vS=seed;
      vA*=smoothstep(0.,.6,p.y)*smoothstep(4.2,3.4,p.y); }`,
  fragmentShader: `varying float vA; varying float vS; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
      vec3 c=mix(vec3(.7,.62,1.),vec3(1.,.8,.55),step(.7,vS)); gl_FragColor=vec4(c,(1.-d*2.)*vA*.55); }`,
});
scene.add(new THREE.Points(dGeo, dMat));

// ---------- glass orb head ----------
const nebulaBack = makeNebula(false), nebulaFront = makeNebula(true);
const head = new THREE.Group();
const nebula = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), nebulaBack);
const haze = new THREE.Mesh(new THREE.SphereGeometry(0.985, 64, 48), nebulaFront);
const shell = new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 64), makeGlass());
const eye = new THREE.Group();
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 2.6) });
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.032, 24, 96), ringMat);
const eyeGlowMat = new THREE.SpriteMaterial({ map: radialTex("rgba(190,170,255,0.9)"), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 });
const eyeGlow = new THREE.Sprite(eyeGlowMat); eyeGlow.scale.setScalar(0.95);
eye.add(eyeGlow, ring); eye.position.z = 0.5;
head.add(nebula, eye, haze, shell);
head.visible = false;


// ---------- Orvy: just the head — a big floating glass orb ----------
const charRoot = new THREE.Group(); rig.add(charRoot);
const ORB_R = 0.78, ORB_Y = 1.22;
let fadeT = 0, pulseT = -10;
head.position.set(0, ORB_Y, 0); head.scale.setScalar(0.001); head.visible = true;
charRoot.add(head);
// a soft halo behind the orb
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTex("rgba(143,123,255,1)"), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
halo.position.set(0, ORB_Y, -1.6); halo.scale.setScalar(5.2); charRoot.add(halo);
const pulse = () => { if (clock.elapsedTime - pulseT > 1.2) pulseT = clock.elapsedTime; };
canvas.addEventListener("click", pulse);

// ---------- layout ----------
let mobile = false;
function resize() {
  const w = innerWidth, h = innerHeight;
  mobile = w < 900;
  const pr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
  dMat.uniforms.uPR.value = pr;
  camera.aspect = w / h;
  if (mobile) { camera.fov = 34; camera.position.set(0, 1.0, 8.6); camera.lookAt(0, 0.12, 0); }
  else { camera.fov = 26; camera.position.set(0, 1.2, 7.1); camera.lookAt(0, 1.02, 0); }
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

// ---------- pointer ----------
const ptr = new THREE.Vector2(), ptrS = new THREE.Vector2();
addEventListener("pointermove", (e) => { ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
addEventListener("pointerleave", () => ptr.set(0, 0));

// ---------- loop ----------
const clock = new THREE.Clock();
let running = true;
document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) { clock.getDelta(); loop(); } });
const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();

function loop() {
  if (!running) return;
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  ptrS.lerp(ptr, 1 - Math.pow(0.002, dt));

  floorMat.uniforms.uTime.value = t; glowMat.uniforms.uTime.value = t;
  dMat.uniforms.uTime.value = t; nebulaBack.uniforms.uTime.value = t; nebulaFront.uniforms.uTime.value = t;

  rig.rotation.y = ptrS.x * 0.18;
  charRoot.rotation.y = ptrS.x * 0.12;

  orbits.forEach((it) => {
    const a = it.phase + t * it.o.speed * 2;
    it.m.position.set(Math.cos(a) * it.o.rx, Math.sin(a * 2 + it.phase) * 0.04, Math.sin(a) * it.o.rz);
  });

  // Orvy floats, breathes, glances at the pointer; a click makes it pulse
  const bob = Math.sin(t * 1.3) * 0.05;
  head.position.y = ORB_Y + bob;
  halo.position.y = ORB_Y + bob;
  const pw = t - pulseT, pk = pw >= 0 && pw < 0.9 ? Math.sin((pw / 0.9) * Math.PI) * Math.exp(-pw * 2.5) : 0;
  if (fadeT >= 1) head.scale.setScalar(ORB_R * (1 + Math.sin(t * 1.6) * 0.008 + pk * 0.08));
  tmpE.set(-ptrS.y * 0.22, ptrS.x * 0.38, Math.sin(t * 0.9) * 0.03);
  head.quaternion.slerp(tmpQ.setFromEuler(tmpE), 1 - Math.exp(-dt * 6));

  // eye drifts toward the pointer inside the orb
  eye.position.x = ptrS.x * 0.26; eye.position.y = ptrS.y * 0.2 + 0.03;
  eye.position.z = Math.sqrt(Math.max(0.1, 0.52 * 0.52 - eye.position.x ** 2 * 0.5 - eye.position.y ** 2 * 0.5));
  eye.lookAt(head.localToWorld(new THREE.Vector3(eye.position.x * 4, eye.position.y * 4, 4)));
  const blink = Math.pow(Math.abs(Math.sin(t * 0.55)), 400);
  ring.scale.set(1, 1 - blink * 0.9, 1);
  eyeGlowMat.opacity = 0.3 + Math.sin(t * 2) * 0.06;

  if (fadeT < 1) {                                  // grows in on load, no loader screen
    fadeT = Math.min(1, fadeT + dt * 0.8);
    const k = fadeT, back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    head.scale.setScalar(ORB_R * Math.max(0.001, back));
    halo.material.opacity = k * 0.42;
  }

  renderer.render(scene, camera);
}
loop();
