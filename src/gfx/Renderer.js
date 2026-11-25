import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Speed-reactive lens pass: radial blur, anime speed-lines, chromatic
// aberration, vignette and a touch of grain. Runs in linear HDR before tonemap.
const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
    uNitro: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uVignette: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeed, uNitro, uTime, uAspect, uVignette;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 c = vUv - vec2(0.5, 0.52);
      float r = length(c * vec2(uAspect, 1.0));
      float blur = (uSpeed * 0.018 + uNitro * 0.03) * smoothstep(0.12, 0.65, r);
      vec3 col = vec3(0.0);
      const int N = 10;
      for (int i = 0; i < N; i++) {
        float k = float(i) / float(N - 1);
        vec2 uv = vUv - c * blur * k;
        float ca = (0.0015 + uNitro * 0.004) * r;
        col.r += texture2D(tDiffuse, uv + c * ca).r;
        col.g += texture2D(tDiffuse, uv).g;
        col.b += texture2D(tDiffuse, uv - c * ca).b;
      }
      col /= float(N);
      // speed lines
      float ang = atan(c.y, c.x);
      float seg = floor(ang * 150.0);
      float h = hash(seg + floor(uTime * 18.0) * 13.7);
      float line = step(0.965, h) * smoothstep(0.38, 0.85, r) * (uNitro * 0.9 + max(0.0, uSpeed - 0.8) * 0.6);
      col += vec3(0.75, 0.85, 1.0) * line * 0.16;
      // vignette
      float vig = smoothstep(1.05, 0.25, r) ;
      col *= mix(1.0, vig, 0.55 * uVignette);
      // grain
      col += (hash(dot(vUv, vec2(12.9898, 78.233)) + uTime) - 0.5) * 0.012;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Renderer {
  constructor(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 6000);

    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.8, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);
    this.composer.addPass(new OutputPass());

    this.viewShift = 0; // view offset as a fraction of the screen (menu framing)
    this.viewShiftY = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    const pr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 1.75 : q === 'medium' ? 1.25 : 0.9);
    this.r.setPixelRatio(pr);
    this.r.shadowMap.enabled = q !== 'low';
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.composer.setPixelRatio(this.r.getPixelRatio());
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.applyViewShift();
    this.lens.uniforms.uAspect.value = w / h;
  }

  applyViewShift() {
    const w = window.innerWidth, h = window.innerHeight;
    if (this.viewShift || this.viewShiftY) this.camera.setViewOffset(w, h, -w * this.viewShift, h * this.viewShiftY, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setViewShift(f, fy = 0) {
    if (Math.abs(f - this.viewShift) < 1e-4 && Math.abs(fy - this.viewShiftY) < 1e-4) return;
    this.viewShift = f;
    this.viewShiftY = fy;
    this.applyViewShift();
  }

  render(dt, t) {
    this.lens.uniforms.uTime.value = t;
    this.composer.render(dt);
  }
}
