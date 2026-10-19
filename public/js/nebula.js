// Shared glass-orb nebula shader + soft radial sprite texture.
import * as THREE from "three";

const NOISE = `
vec3 hash3(vec3 p){ p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))); return -1.+2.*fract(sin(p)*43758.5453); }
float noise(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.-2.*f);
  return mix(mix(mix(dot(hash3(i),f),dot(hash3(i+vec3(1,0,0)),f-vec3(1,0,0)),u.x),mix(dot(hash3(i+vec3(0,1,0)),f-vec3(0,1,0)),dot(hash3(i+vec3(1,1,0)),f-vec3(1,1,0)),u.x),u.y),
             mix(mix(dot(hash3(i+vec3(0,0,1)),f-vec3(0,0,1)),dot(hash3(i+vec3(1,0,1)),f-vec3(1,0,1)),u.x),mix(dot(hash3(i+vec3(0,1,1)),f-vec3(0,1,1)),dot(hash3(i+vec3(1,1,1)),f-vec3(1,1,1)),u.x),u.y),u.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }`;

export const makeNebula = (front) => new THREE.ShaderMaterial({
  side: front ? THREE.FrontSide : THREE.BackSide,
  transparent: front, depthWrite: !front, blending: front ? THREE.AdditiveBlending : THREE.NormalBlending,
  uniforms: { uTime: { value: 0 }, uFront: { value: front ? 1 : 0 } },
  vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vV;
    void main(){ vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: NOISE + `
    varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uFront;
    void main(){
      vec3 p=normalize(vP);
      float t=uTime*.08;
      // two layers at different "depths" fake a volume
      float a=fbm(p*1.8+vec3(t,-t*.6,t*.4));
      float b=fbm(p*3.2-vec3(t*.7,t,0.)+a*1.4);
      float n=smoothstep(-.3,.55,a+b*.6);
      vec3 deep=vec3(.03,.01,.08), vio=vec3(.40,.25,.95), lil=vec3(.80,.66,1.), amb=vec3(1.,.6,.2);
      vec3 c=mix(deep, vio, n*n);
      float band=smoothstep(.12,.55,b+.35*a-.1*p.y);
      c=mix(c, amb, band*.8);
      c+=lil*pow(max(0.,b+.1),2.)*1.4;
      c*=.55+.45*smoothstep(-.4,.3,a);
      float stars=step(.985, fract(sin(dot(floor(p*90.),vec3(12.9898,78.233,37.719)))*43758.5453));
      c+=stars*.9*n;
      float fr=pow(1.-abs(dot(vN,vV)),2.5);
      c+=vio*fr*.9;
      if(uFront>.5){ gl_FragColor=vec4(c*(.18+fr*.55),1.); return; }
      gl_FragColor=vec4(c*1.15,1.);
    }`,
});

export function radialTex(inner) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Clean glass: fresnel rim + two soft highlights, no room reflections (they read as a flat disc on a big orb).
export const makeGlass = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV;
    void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV;
    void main(){
      float nv=max(dot(vN,vV),0.);
      float rim=pow(1.-nv,3.2);
      vec3 L1=normalize(vec3(-.55,.7,.6)), L2=normalize(vec3(.6,-.35,.7));
      vec3 H1=normalize(L1+vV), H2=normalize(L2+vV);
      float s1=pow(max(dot(vN,H1),0.),160.), s1b=pow(max(dot(vN,H1),0.),18.)*.12;
      float s2=pow(max(dot(vN,H2),0.),90.)*.35;
      vec3 c=vec3(.78,.72,1.)*rim*.9 + vec3(1.)*(s1*1.4+s1b) + vec3(1.,.8,.55)*s2;
      gl_FragColor=vec4(c,1.);
    }`,
});
