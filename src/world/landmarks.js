import * as THREE from 'three';
import { clockTexture, neonSignTexture, glowTexture, facadeTextures, rng } from '../gfx/textures.js';

// Every landmark is procedural: a function returning { object, animate?(t) }.

const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

/** Instanced thin beams between point pairs (great for lattices). */
function beams(segments, thickness, material) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, material, segments.length);
  const d = new THREE.Vector3(), mid = new THREE.Vector3();
  segments.forEach(([a, b, th], i) => {
    d.subVectors(b, a);
    const len = d.length();
    mid.addVectors(a, b).multiplyScalar(0.5);
    _q.setFromUnitVectors(_up, d.normalize());
    const t = th ?? thickness;
    _m.compose(mid, _q, _s.set(t, len, t));
    mesh.setMatrixAt(i, _m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const basic = (c, k = 1, extra = {}) => new THREE.MeshBasicMaterial({ color: hdr(c, k), ...extra });

// ===========================================================================
// PARIS
// ===========================================================================
export function eiffelTower(H = 190) {
  const group = new THREE.Group();
  const P1 = 0.18 * H, P2 = 0.36 * H, P3 = 0.88 * H;
  const hs = (y) => 2.2 + 44 * Math.pow(Math.max(0, 1 - y / H), 2.7);
  const lw = (y) => {
    if (y >= P2) return hs(y);
    const k = y / P2;
    return 13 * (1 - k) + hs(P2) * k;
  };
  const segs = [];
  const levels = [];
  for (let y = 0; y <= P3; y += y < P2 ? 3.2 : 4.5) levels.push(y);
  levels.push(P3);
  const corners = (y) => {
    // four legs, each a square truss (below P2); single shaft above
    const s = hs(y), w = lw(y);
    const out = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (y < P2) {
        out.push([V(sx * s, y, sz * s), V(sx * (s - w), y, sz * s), V(sx * (s - w), y, sz * (s - w)), V(sx * s, y, sz * (s - w))]);
      } else {
        out.push([V(sx * s, y, sz * s)]);
      }
    }
    return out;
  };
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = levels[i], y1 = levels[i + 1];
    const c0 = corners(y0), c1 = corners(y1);
    const below = y1 <= P2 + 0.01;
    for (let leg = 0; leg < 4; leg++) {
      const a = c0[leg], b = c1[leg];
      if (below && a.length === 4 && b.length === 4) {
        for (let k = 0; k < 4; k++) {
          segs.push([a[k], b[k], 0.9]);
          // X bracing on each face
          segs.push([a[k], b[(k + 1) % 4], 0.35]);
          segs.push([a[(k + 1) % 4], b[k], 0.35]);
          segs.push([b[k], b[(k + 1) % 4], 0.3]);
        }
      }
    }
    if (!below || y0 >= P2 - 0.01) {
      const ring0 = [V(-hs(y0), y0, -hs(y0)), V(hs(y0), y0, -hs(y0)), V(hs(y0), y0, hs(y0)), V(-hs(y0), y0, hs(y0))];
      const ring1 = [V(-hs(y1), y1, -hs(y1)), V(hs(y1), y1, -hs(y1)), V(hs(y1), y1, hs(y1)), V(-hs(y1), y1, hs(y1))];
      for (let k = 0; k < 4; k++) {
        segs.push([ring0[k], ring1[k], 0.8]);
        segs.push([ring0[k], ring1[(k + 1) % 4], 0.25]);
        segs.push([ring0[(k + 1) % 4], ring1[k], 0.25]);
        segs.push([ring1[k], ring1[(k + 1) % 4], 0.25]);
      }
    }
  }
  // decorative arches between the legs
  for (let side = 0; side < 4; side++) {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const x = -1 + 2 * u;
      const y = P1 * 0.55 + Math.sqrt(1 - x * x) * P1 * 0.42;
      const s = hs(y) - lw(y) * 0.5;
      const p = V(x * s, y - P1 * 0.05, -hs(y) + 0.5);
      p.applyAxisAngle(_up, (side * Math.PI) / 2);
      pts.push(p);
    }
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], 0.9]);
  }
  // antenna
  segs.push([V(0, P3, 0), V(0, H + 18, 0), 0.6]);
  const mat = new THREE.MeshStandardMaterial({
    color: '#4a3220', roughness: 0.6, metalness: 0.4, emissive: '#ffa23a', emissiveIntensity: 1.9,
  });
  group.add(beams(segs, 0.5, mat));
  // platforms
  const plat = new THREE.MeshStandardMaterial({ color: '#2a1c10', emissive: '#ffb24a', emissiveIntensity: 2.4 });
  for (const [y, k] of [[P1, 1.0], [P2, 1.0], [P3, 1.0]]) {
    const s = hs(y) * 2 + 3 * k;
    const p = new THREE.Mesh(new THREE.BoxGeometry(s, 3, s), plat);
    p.position.y = y;
    group.add(p);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 5), plat);
  top.position.y = P3 + 4;
  group.add(top);
  // beacon
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: hdr('#fff1d0', 3), blending: THREE.AdditiveBlending, depthWrite: false }));
  beacon.scale.set(14, 14, 1);
  beacon.position.y = P3 + 10;
  group.add(beacon);

  // sparkles
  const r = rng(99);
  const N = 900;
  const pos = new Float32Array(N * 3), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const y = Math.pow(r(), 1.3) * P3;
    const s = hs(y);
    const side = Math.floor(r() * 4);
    const u = (r() * 2 - 1) * s;
    const p = side === 0 ? [u, y, s] : side === 1 ? [u, y, -s] : side === 2 ? [s, y, u] : [-s, y, u];
    pos.set(p, i * 3);
    phase[i] = r() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: glowTexture() } },
    vertexShader: `attribute float phase; uniform float uTime; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
        float s = sin(uTime*3.0 + phase*7.0); vA = smoothstep(0.85, 1.0, s);
        gl_PointSize = 900.0 * vA / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(4.0,3.8,3.4)*t.a*vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparkles = new THREE.Points(g, sparkMat);
  sparkles.frustumCulled = false;
  group.add(sparkles);
  return { object: group, radius: 50, animate: (t) => { sparkMat.uniforms.uTime.value = t; } };
}

export function triumphArch() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#d8c7a4', roughness: 0.85, emissive: '#ffb066', emissiveIntensity: 0.22 });
  const W = 46, H = 50, D = 22, ow = 15, oh = 29;
  const pillarW = (W - ow) / 2;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pillarW, oh, D), stone);
    p.position.set(s * (ow / 2 + pillarW / 2), oh / 2, 0);
    g.add(p);
    // side passage
    const cut = new THREE.Mesh(new THREE.BoxGeometry(pillarW + 0.2, 14, 8), basic('#120c06'));
    cut.position.set(s * (ow / 2 + pillarW / 2), 7, 0);
    g.add(cut);
  }
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(ow / 2, ow / 2, D, 24, 1, false, 0, Math.PI), stone);
  vault.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  vault.position.y = oh;
  const attic = new THREE.Mesh(new THREE.BoxGeometry(W, H - oh, D), stone);
  attic.position.y = oh + (H - oh) / 2;
  g.add(attic);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 2, D + 2), stone);
  cornice.position.y = H - 7;
  g.add(cornice);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(ow, oh), basic('#0e0905'));
  shade.position.set(0, oh / 2, 0);
  g.add(shade);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 1.2, D + 0.4), basic('#ffd08a', 2.2));
  flag.position.y = H - 9.5;
  g.add(flag);
  return { object: g, radius: 35 };
}

// ===========================================================================
// LONDON
// ===========================================================================
export function clockTower() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#b99d6b', roughness: 0.8, emissive: '#ffbe6a', emissiveIntensity: 0.35 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(13, 62, 13), stone);
  shaft.position.y = 31;
  g.add(shaft);
  // vertical gothic ribs
  for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.6, 60, 0.6), basic('#ffcf7a', 1.6));
    rib.position.set(i * 2.5, 31, s * 6.6);
    g.add(rib);
    const rib2 = rib.clone();
    rib2.position.set(s * 6.6, 31, i * 2.5);
    g.add(rib2);
  }
  const stage = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), stone);
  stage.position.y = 70;
  g.add(stage);
  const face = new THREE.MeshBasicMaterial({ map: clockTexture(), color: hdr('#ffe6a8', 2.4) });
  for (let k = 0; k < 4; k++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(6, 40), face);
    p.position.set(0, 70, 8.05);
    p.position.applyAxisAngle(_up, (k * Math.PI) / 2);
    p.rotation.y = (k * Math.PI) / 2;
    g.add(p);
  }
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(13, 10, 13), stone);
  belfry.position.y = 83;
  g.add(belfry);
  const glowBox = new THREE.Mesh(new THREE.BoxGeometry(13.4, 6, 13.4), basic('#ffd27a', 1.8));
  glowBox.position.y = 83;
  g.add(glowBox);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(10, 28, 4), new THREE.MeshStandardMaterial({ color: '#2a3a3a', roughness: 0.5, metalness: 0.6, emissive: '#ffb050', emissiveIntensity: 0.25 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 102;
  g.add(roof);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.8, 10, 8), basic('#ffd27a', 2));
  tip.position.y = 120;
  g.add(tip);
  for (const [x, z] of [[-6, -6], [6, -6], [6, 6], [-6, 6]]) {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(1, 8, 6), stone);
    pin.position.set(x, 92, z);
    g.add(pin);
  }
  // parliament wing
  const { map, emissive } = facadeTextures('haussmann', ['#ffcf80', '#ffdb9a'], 61, 0.8);
  const wingMat = new THREE.MeshStandardMaterial({ color: '#c9ad7a', map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.8 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(160, 24, 26), wingMat);
  map.repeat.set(1, 1);
  wing.position.set(-90, 12, 0);
  g.add(wing);
  for (let i = 0; i < 16; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(1.4, 12, 4), stone);
    sp.position.set(-165 + i * 10, 30, (i % 2 ? 12 : -12));
    g.add(sp);
  }
  return { object: g, radius: 25 };
}

export function observationWheel({ radius = 55, rimColor = '#9fd8ff', capsuleColor = '#ffffff', rainbow = false } = {}) {
  const g = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.position.y = radius + 10;
  g.add(wheel);
  const rimMat = basic(rimColor, 2.6);
  for (const off of [-3, 3]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.7, 8, 120), rimMat);
    rim.position.z = off;
    wheel.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.93, 0.35, 6, 120), new THREE.MeshStandardMaterial({ color: '#d0d6de', metalness: 0.8, roughness: 0.3 }));
    inner.position.z = off;
    wheel.add(inner);
  }
  const segs = [];
  const N = 32;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    for (const off of [-3, 3]) segs.push([V(0, 0, off * 1.6), V(Math.cos(a) * radius, Math.sin(a) * radius, off), 0.18]);
  }
  wheel.add(beams(segs, 0.2, new THREE.MeshStandardMaterial({ color: '#cfd6df', metalness: 0.9, roughness: 0.25, emissive: '#5a7090', emissiveIntensity: 0.4 })));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 10, 20), new THREE.MeshStandardMaterial({ color: '#d0d6de', metalness: 0.9, roughness: 0.3 }));
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  const capsGeo = new THREE.SphereGeometry(2.2, 16, 10);
  capsGeo.scale(1.6, 1, 1);
  const capsules = new THREE.InstancedMesh(capsGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    _m.makeTranslation(Math.cos(a) * (radius + 2.5), Math.sin(a) * (radius + 2.5), 0);
    capsules.setMatrixAt(i, _m);
    if (rainbow) col.setHSL(i / N, 1, 0.55).multiplyScalar(2.2);
    else col.set(capsuleColor).multiplyScalar(1.8);
    capsules.setColorAt(i, col);
  }
  wheel.add(capsules);
  // A-frame legs
  const legMat = new THREE.MeshStandardMaterial({ color: '#c8ced6', metalness: 0.8, roughness: 0.35 });
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push([V(sx * radius * 0.45, 0, sz * 14), V(0, radius + 10, sz * 5), 1.4]);
  g.add(beams(legs, 1.4, legMat));
  return {
    object: g, radius: radius * 0.6,
    animate: (t) => {
      wheel.rotation.z = t * 0.03;
      if (rainbow) {
        for (let i = 0; i < N; i++) {
          col.setHSL((i / N + t * 0.05) % 1, 1, 0.55).multiplyScalar(2.2);
          capsules.setColorAt(i, col);
        }
        capsules.instanceColor.needsUpdate = true;
      }
    },
  };
}

export function shardTower() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: '#8aa4c0', metalness: 0.9, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.4 });
  for (let k = 0; k < 4; k++) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(30, 250 + k * 12, 3), glass);
    shard.rotation.y = (k * Math.PI) / 2;
    shard.position.set(Math.cos(k * 1.57) * 4, (250 + k * 12) / 2, Math.sin(k * 1.57) * 4);
    g.add(shard);
  }
  const crown = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 4), basic('#dff2ff', 2.4));
  crown.position.y = 245;
  g.add(crown);
  return { object: g, radius: 35 };
}

// ===========================================================================
// NEW YORK
// ===========================================================================
export function setbackTower(tint = '#ffd99a') {
  const g = new THREE.Group();
  const { map, emissive } = facadeTextures('office', ['#ffe2a8', '#fff1cf', '#ffd27a'], 71, 0.6);
  const mk = (w, h, d, y) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4);
      if (face === 2 || face === 3) uv.setXY(i, 0.001, 0.001);
      else uv.setXY(i, uv.getX(i) * (face < 2 ? d : w) / 14, uv.getY(i) * h / 14);
    }
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b8b4aa', map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 1.5, roughness: 0.6 }));
    m.position.y = y + h / 2;
    g.add(m);
  };
  mk(64, 90, 52, 0);
  mk(50, 120, 40, 90);
  mk(36, 60, 30, 210);
  mk(26, 30, 22, 270);
  const crownMat = basic(tint, 2.6);
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(18, 24, 16), crownMat);
  c1.position.y = 312;
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 20, 8), crownMat);
  c2.position.y = 334;
  g.add(c2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.6, 60, 8), basic('#ffffff', 1.4));
  mast.position.y = 374;
  g.add(mast);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: hdr('#ff3030', 4), blending: THREE.AdditiveBlending, depthWrite: false }));
  beacon.scale.set(10, 10, 1);
  beacon.position.y = 405;
  g.add(beacon);
  return { object: g, radius: 40, animate: (t) => { beacon.material.opacity = 0.3 + 0.7 * (Math.sin(t * 3) > 0 ? 1 : 0); } };
}

export function decoCrownTower() {
  const g = new THREE.Group();
  const { map, emissive } = facadeTextures('office', ['#fff1cf', '#cfe6ff'], 73, 0.5);
  const geo = new THREE.BoxGeometry(36, 200, 36);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    if (face === 2 || face === 3) uv.setXY(i, 0.001, 0.001);
    else uv.setXY(i, uv.getX(i) * 36 / 14, uv.getY(i) * 200 / 14);
  }
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#c8ccd2', map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 1.4, roughness: 0.5 }));
  body.position.y = 100;
  g.add(body);
  const steel = new THREE.MeshStandardMaterial({ color: '#d9dde3', metalness: 1, roughness: 0.2 });
  const glow = basic('#f4f8ff', 2.8);
  for (let k = 0; k < 6; k++) {
    const r = 17 - k * 2.6;
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, 9, 4, 1, true), steel);
    tier.rotation.y = Math.PI / 4;
    tier.position.y = 204 + k * 8;
    g.add(tier);
    // triangular "windows" glowing
    for (let s = 0; s < 4; s++) {
      const tri = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 3), glow);
      const a = (s * Math.PI) / 2;
      tri.position.set(Math.sin(a) * r * 0.86, 204 + k * 8, Math.cos(a) * r * 0.86);
      g.add(tri);
    }
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.8, 45, 8), steel);
  spire.position.y = 270;
  g.add(spire);
  return { object: g, radius: 30 };
}

export function twistedSupertall() {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(14, 30, 330, 4, 24, false);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = (y + 165) / 330;
    const a = k * Math.PI / 4;
    const x = p.getX(i), z = p.getZ(i);
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  geo.computeVertexNormals();
  const glass = new THREE.MeshPhysicalMaterial({ color: '#7f98b8', metalness: 0.95, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.6 });
  const m = new THREE.Mesh(geo, glass);
  m.position.y = 165;
  g.add(m);
  const lines = new THREE.Mesh(new THREE.CylinderGeometry(14.3, 30.3, 330, 4, 1, true), new THREE.MeshBasicMaterial({ color: hdr('#bfe3ff', 1.4), wireframe: true }));
  lines.position.y = 165;
  g.add(lines);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2, 110, 8), basic('#ffffff', 2));
  ant.position.y = 385;
  g.add(ant);
  return { object: g, radius: 32 };
}

// ===========================================================================
// LAS VEGAS
// ===========================================================================
export function ledSphere(R = 48) {
  const uniforms = { uTime: { value: 0 }, ...THREE.UniformsLib.fog };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: `varying vec3 vN; varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vN = normal; vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; varying vec3 vN; varying vec2 vUv;
      #include <fog_pars_fragment>
      vec3 pal(float t){ return 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67)+t)); }
      void main(){
        float mode = mod(floor(uTime/12.0), 3.0);
        vec3 col;
        vec2 uv = vUv;
        if (mode < 0.5) {
          // giant eye
          vec2 p = vec2((uv.x-0.25)*4.0, (uv.y-0.5)*2.5);
          float r = length(p);
          vec3 iris = mix(vec3(0.1,0.6,1.0), vec3(0.0,0.1,0.4), smoothstep(0.1,0.6,r));
          col = mix(vec3(1.0), iris, smoothstep(0.75,0.65,r));
          col = mix(col, vec3(0.0), smoothstep(0.22,0.18,r));
          col += vec3(1.0) * smoothstep(0.08,0.0,length(p-vec2(0.15,0.15)));
          float lid = abs(p.y) - (1.0 - p.x*p.x*0.6) * (0.85 + 0.15*sin(uTime*0.7));
          col = mix(col, vec3(0.9,0.45,0.2)*0.6, smoothstep(0.0,0.05,lid));
        } else if (mode < 1.5) {
          col = pal(uv.y*1.5 + uv.x*2.0 - uTime*0.15);
        } else {
          float s = sin(uv.x*60.0 + uTime*2.0) * sin(uv.y*30.0 - uTime*1.5);
          col = mix(vec3(1.0,0.1,0.5), vec3(0.1,0.9,1.0), s*0.5+0.5);
        }
        // LED pixel grid
        vec2 g = fract(vec2(uv.x*400.0, uv.y*200.0));
        float dotm = smoothstep(0.5,0.25,length(g-0.5));
        gl_FragColor = vec4(col * (0.6 + 1.6*dotm) * 1.6, 1.0);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 48), mat);
  m.position.y = R * 0.85;
  m.rotation.y = Math.PI;
  const g = new THREE.Group();
  g.add(m);
  return { object: g, radius: R, animate: (t) => { uniforms.uTime.value = t; }, faceTrack: m };
}

export function glassPyramid() {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.ConeGeometry(70, 95, 4), new THREE.MeshPhysicalMaterial({
    color: '#1a1d26', metalness: 0.9, roughness: 0.12, clearcoat: 1, envMapIntensity: 1.8,
  }));
  p.rotation.y = Math.PI / 4;
  p.position.y = 47.5;
  g.add(p);
  // edge lights
  const segs = [];
  const apex = V(0, 95, 0);
  for (const [x, z] of [[-49.5, -49.5], [49.5, -49.5], [49.5, 49.5], [-49.5, 49.5]]) segs.push([V(x, 0, z), apex, 0.6]);
  g.add(beams(segs, 0.6, basic('#fff0d0', 2.5)));
  // sky beam
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * 0.9; gl_FragColor = vec4(vec3(0.75,0.85,1.0)*a*2.0, 1.0); }',
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 1.2, 2400, 16, 1, true), beamMat);
  beam.position.y = 95 + 1200;
  g.add(beam);
  return { object: g, radius: 72 };
}

export function observationTower() {
  const g = new THREE.Group();
  const conc = new THREE.MeshStandardMaterial({ color: '#c9c2b8', roughness: 0.8, emissive: '#7a6aff', emissiveIntensity: 0.15 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 9, 240, 24), conc);
  shaft.position.y = 120;
  g.add(shaft);
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 200, 10), conc);
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 9, 100, Math.sin(a) * 9);
    leg.rotation.y = -a;
    g.add(leg);
  }
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(20, 16, 22, 32), new THREE.MeshPhysicalMaterial({ color: '#202530', metalness: 0.8, roughness: 0.2, clearcoat: 1 }));
  pod.position.y = 245;
  g.add(pod);
  for (let k = 0; k < 4; k++) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(20.4 - k * 1.1, 20.4 - k * 1.1, 1.0, 32, 1, true), basic(k % 2 ? '#ff3da8' : '#00e5ff', 2.8));
    band.position.y = 238 + k * 4.5;
    g.add(band);
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.5, 60, 8), basic('#ffffff', 1.3));
  spire.position.y = 286;
  g.add(spire);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: hdr('#ff2020', 4), blending: THREE.AdditiveBlending, depthWrite: false }));
  beacon.scale.set(10, 10, 1);
  beacon.position.y = 318;
  g.add(beacon);
  return { object: g, radius: 25, animate: (t) => { beacon.material.opacity = Math.sin(t * 2.5) > 0 ? 1 : 0.2; } };
}

export function welcomeSign(text = 'VELO GRAND PRIX', sub = 'LAS VEGAS') {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-9, 0); shape.lineTo(0, 5); shape.lineTo(9, 0); shape.lineTo(0, -5); shape.closePath();
  const diamond = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ map: neonSignTexture(text + ' • ' + sub, '#ffd400', 'rgba(250,250,240,1)', 1024, 256), color: hdr('#ffffff', 1.4), side: THREE.DoubleSide }));
  const uv = diamond.geometry.attributes.uv;
  const p = diamond.geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + 9) / 18, (p.getY(i) + 5) / 10);
  diamond.position.y = 10;
  g.add(diamond);
  const border = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 4, 4), basic('#ff3da8', 3));
  border.scale.set(9.3, 5.3, 1);
  border.rotation.z = 0;
  border.position.y = 10;
  g.add(border);
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 8), new THREE.MeshStandardMaterial({ color: '#d0d0d0', metalness: 0.9, roughness: 0.3 }));
    pole.position.set(s * 4, 5, -0.2);
    g.add(pole);
  }
  // marquee bulbs
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), basic('#fff3c0', 3), 40);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * 4;
    const seg = Math.floor(a), f = a - seg;
    const pts = [[-9, 0], [0, 5], [9, 0], [0, -5], [-9, 0]];
    const x = pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * f;
    const y = pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * f;
    _m.makeTranslation(x * 1.05, y * 1.05 + 10, 0.1);
    bulbs.setMatrixAt(i, _m);
  }
  g.add(bulbs);
  return { object: g, radius: 10 };
}

// ===========================================================================
// SINGAPORE
// ===========================================================================
export function bayTowers() {
  const g = new THREE.Group();
  const { map, emissive } = facadeTextures('glass', ['#fff0c8', '#ffe2a0', '#d8ecff'], 81, 0.65);
  const mat = new THREE.MeshStandardMaterial({ color: '#c9d4e0', map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.6 });
  const H = 225;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 60;
    for (const s of [-1, 1]) {
      const geo = new THREE.BoxGeometry(22, H, 16);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) {
        const face = Math.floor(k / 4);
        if (face === 2 || face === 3) uv.setXY(k, 0.001, 0.001);
        else uv.setXY(k, uv.getX(k) * (face < 2 ? 16 : 22) / 20, uv.getY(k) * H / 20);
      }
      const leg = new THREE.Mesh(geo, mat);
      leg.position.set(x, H / 2, s * 9);
      leg.rotation.x = s * -0.06;
      if (s > 0) leg.position.z += 5;
      g.add(leg);
    }
  }
  // skypark
  const deckMat = new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 0.6, roughness: 0.3 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(250, 7, 36), deckMat);
  deck.position.set(25, H + 6, 4);
  g.add(deck);
  const under = new THREE.Mesh(new THREE.BoxGeometry(250, 0.6, 36), basic('#7fe8ff', 2.4));
  under.position.set(25, H + 2.4, 4);
  g.add(under);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(250, 0.5, 0.5), basic('#ffffff', 3));
  edge.position.set(25, H + 9.5, 22);
  g.add(edge);
  const trees = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 8, 6), basic('#3dffb0', 1.6), 30);
  for (let i = 0; i < 30; i++) { _m.makeTranslation(-90 + i * 8, H + 11, 4 + ((i % 3) - 1) * 9); trees.setMatrixAt(i, _m); }
  g.add(trees);
  // laser show
  const laserMat = new THREE.MeshBasicMaterial({ color: hdr('#3dffcf', 3), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const lasers = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 900, 6, 1, true), laserMat);
    l.geometry.translate(0, 450, 0);
    l.position.set(-60 + i * 30, H + 10, 4);
    g.add(l);
    lasers.push(l);
  }
  return {
    object: g, radius: 140,
    animate: (t) => {
      lasers.forEach((l, i) => {
        l.rotation.z = Math.sin(t * 0.6 + i) * 0.7;
        l.rotation.x = Math.cos(t * 0.4 + i * 1.7) * 0.5;
      });
      laserMat.color.setHSL((t * 0.05) % 1, 1, 0.5).multiplyScalar(3);
    },
  };
}

export function supertreeGrove(count = 11, seed = 5) {
  const g = new THREE.Group();
  const r = rng(seed);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#3b2f4a', roughness: 0.7, emissive: '#5a1f7a', emissiveIntensity: 0.6 });
  const canopyMats = [];
  for (let i = 0; i < count; i++) {
    const h = 25 + r() * 25;
    const tg = new THREE.Group();
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 60;
    tg.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 4, h, 12, 1), trunkMat);
    trunk.position.y = h / 2;
    tg.add(trunk);
    const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.95 });
    canopyMats.push({ m: cm, ph: r() });
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.42, 1.6, h * 0.25, 16, 3, true), cm);
    canopy.position.y = h + h * 0.12;
    tg.add(canopy);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(h * 0.42, 0.4, 6, 32), cm);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = h + h * 0.25;
    tg.add(ring);
    // vertical lit ribs on trunk
    const ribs = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 4.2, h, 10, 6, true), cm);
    ribs.position.y = h / 2;
    tg.add(ribs);
    g.add(tg);
  }
  // elevated skyway
  const skyway = new THREE.Mesh(new THREE.TorusGeometry(40, 0.6, 6, 64, Math.PI * 1.2), basic('#ffffff', 1.6));
  skyway.rotation.x = Math.PI / 2;
  skyway.position.y = 22;
  g.add(skyway);
  const c = new THREE.Color();
  return {
    object: g, radius: 70,
    animate: (t) => {
      for (const { m, ph } of canopyMats) {
        c.setHSL((0.75 + 0.25 * Math.sin(t * 0.3 + ph * 6.28)) % 1, 0.9, 0.55).multiplyScalar(2.4);
        m.color.copy(c);
      }
    },
  };
}

export function lotusMuseum() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.4, emissive: '#ffd6f0', emissiveIntensity: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 10; i++) {
    const petal = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12, 0, Math.PI * 0.35, 0, Math.PI * 0.5), mat);
    petal.scale.set(1, 2.2 - (i % 2) * 0.5, 1);
    petal.rotation.y = (i / 10) * Math.PI * 2;
    petal.position.y = 10;
    g.add(petal);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(10, 6, 10, 24), mat);
  base.position.y = 5;
  g.add(base);
  return { object: g, radius: 25 };
}
