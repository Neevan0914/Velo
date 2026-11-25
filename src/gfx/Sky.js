import * as THREE from 'three';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const frag = /* glsl */ `
uniform vec3 uTop, uMid, uHorizon, uGround, uSunDir, uSunColor, uCloudColor;
uniform float uStars, uClouds, uTime, uSunSize, uMoon;
varying vec3 vDir;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, h));
  col = mix(col, uTop, smoothstep(0.18, 0.75, h));
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));

  // sun / moon
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, s);
  col += uSunColor * (disc * (uMoon > 0.5 ? 2.5 : 18.0) + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);

  // clouds (planar projection)
  if (h > 0.0 && uClouds > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(uv);
    c = smoothstep(0.45, 0.85, c) * uClouds * smoothstep(0.0, 0.18, h);
    vec3 cc = uCloudColor * (0.6 + 0.8 * pow(s, 4.0));
    col = mix(col, cc, c * 0.85);
  }

  // stars
  if (uStars > 0.0 && h > 0.05) {
    vec3 p = d * 420.0;
    vec3 ip = floor(p);
    float st = hash(ip);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + st * 60.0);
    float star = step(0.9975, st) * tw * smoothstep(0.05, 0.4, h);
    col += vec3(star) * uStars * 2.2;
  }

  // gentle dithering against banding
  col += (hash2(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky(cfg) {
  const c = (v) => new THREE.Color(v);
  const uniforms = {
    uTop: { value: c(cfg.top) },
    uMid: { value: c(cfg.mid) },
    uHorizon: { value: c(cfg.horizon) },
    uGround: { value: c(cfg.ground ?? cfg.horizon).multiplyScalar(0.4) },
    uSunDir: { value: new THREE.Vector3(...cfg.sunDir).normalize() },
    uSunColor: { value: c(cfg.sunColor) },
    uCloudColor: { value: c(cfg.cloudColor ?? '#666677') },
    uStars: { value: cfg.stars ?? 0 },
    uClouds: { value: cfg.clouds ?? 0 },
    uSunSize: { value: cfg.sunSize ?? 0.0012 },
    uMoon: { value: cfg.moon ? 1 : 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.userData.update = (t, camPos) => {
    uniforms.uTime.value = t;
    mesh.position.copy(camPos);
  };
  return mesh;
}
