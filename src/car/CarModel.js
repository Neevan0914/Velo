import * as THREE from 'three';
import { carbonTexture, glowTexture, beamTexture, tyreTexture } from '../gfx/textures.js';

// ---------------------------------------------------------------------------
// Procedural sports-car generator.
// Bodies are lofted from superellipse cross-sections whose width / height
// profiles come from keyframed curves, with exact circular wheel arches cut
// into the sill line. Car faces +Z, +X is the car's left.
// ---------------------------------------------------------------------------

function curve(keys) {
  // Catmull-Rom through sorted [t, v] keys, clamped at the ends
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    let i = 0;
    while (t > keys[i + 1][0]) i++;
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(keys.length - 1, i + 2)];
    const u = (t - p1[0]) / (p2[0] - p1[0]);
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * (p2[0] - p1[0]);
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * (p2[0] - p1[0]);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2[1] + (u3 - u2) * m2;
  };
}

const ARCHETYPES = {
  hyper: {
    L: 4.62, wb: 2.72, track: 0.86, wheelR: 0.37, wheelW: 0.32,
    w: [[0, 0.93], [0.07, 1.0], [0.24, 1.04], [0.5, 0.95], [0.77, 1.0], [0.92, 0.95], [1, 0.74]],
    top: [[0, 0.8], [0.09, 0.88], [0.28, 0.92], [0.55, 0.84], [0.78, 0.72], [0.94, 0.56], [1, 0.44]],
    bot: [[0, 0.36], [0.05, 0.25], [0.95, 0.21], [1, 0.3]],
    n: 3.4, tumble: 0.16,
    cabin: { t0: 0.3, t1: 0.8, w: [[0, 0.5], [0.3, 0.73], [0.62, 0.72], [1, 0.42]], roof: 1.18, roofKeys: [[0, 0], [0.28, 1], [0.5, 1], [1, 0]], rearGlass: false },
    intake: true,
  },
  super: {
    L: 4.5, wb: 2.66, track: 0.85, wheelR: 0.36, wheelW: 0.3,
    w: [[0, 0.9], [0.08, 0.97], [0.25, 1.0], [0.5, 0.93], [0.78, 0.97], [0.93, 0.92], [1, 0.72]],
    top: [[0, 0.82], [0.1, 0.9], [0.3, 0.93], [0.6, 0.86], [0.8, 0.76], [0.95, 0.6], [1, 0.48]],
    bot: [[0, 0.37], [0.05, 0.26], [0.95, 0.23], [1, 0.32]],
    n: 2.9, tumble: 0.2,
    cabin: { t0: 0.27, t1: 0.75, w: [[0, 0.5], [0.3, 0.72], [0.62, 0.7], [1, 0.45]], roof: 1.22, roofKeys: [[0, 0], [0.32, 1], [0.52, 1], [1, 0]], rearGlass: true },
    intake: true,
  },
  gt: {
    L: 4.72, wb: 2.82, track: 0.84, wheelR: 0.36, wheelW: 0.29,
    w: [[0, 0.88], [0.08, 0.95], [0.24, 0.98], [0.5, 0.92], [0.76, 0.96], [0.93, 0.9], [1, 0.72]],
    top: [[0, 0.86], [0.1, 0.92], [0.25, 0.94], [0.45, 0.9], [0.7, 0.84], [0.92, 0.72], [1, 0.58]],
    bot: [[0, 0.36], [0.05, 0.27], [0.95, 0.24], [1, 0.34]],
    n: 3.0, tumble: 0.18,
    cabin: { t0: 0.17, t1: 0.62, w: [[0, 0.48], [0.35, 0.72], [0.65, 0.71], [1, 0.48]], roof: 1.3, roofKeys: [[0, 0], [0.38, 1], [0.6, 1], [1, 0]], rearGlass: true },
    intake: false,
  },
  muscle: {
    L: 4.8, wb: 2.86, track: 0.86, wheelR: 0.37, wheelW: 0.32,
    w: [[0, 0.93], [0.06, 0.98], [0.24, 1.0], [0.5, 0.97], [0.78, 0.99], [0.94, 0.96], [1, 0.86]],
    top: [[0, 0.92], [0.08, 0.96], [0.25, 0.96], [0.45, 0.94], [0.7, 0.92], [0.93, 0.86], [1, 0.72]],
    bot: [[0, 0.38], [0.05, 0.28], [0.95, 0.26], [1, 0.36]],
    n: 4.6, tumble: 0.12,
    cabin: { t0: 0.2, t1: 0.63, w: [[0, 0.58], [0.3, 0.74], [0.65, 0.73], [1, 0.56]], roof: 1.36, roofKeys: [[0, 0], [0.4, 1], [0.66, 1], [1, 0]], rearGlass: true },
    intake: false,
  },
};

function spow(v, p) { return Math.sign(v) * Math.pow(Math.abs(v), p); }

/** Generic loft: stations along z, superellipse rings. Returns BufferGeometry with 2 material groups. */
function loft(zs, ringN, section, matFn, colorFn) {
  const S = zs.length;
  const pos = [], col = [], tParam = [];
  for (let i = 0; i < S; i++) {
    const sec = section(zs[i], i / (S - 1));
    const ym = (sec.yb + sec.yt) / 2, hh = (sec.yt - sec.yb) / 2;
    for (let j = 0; j < ringN; j++) {
      const th = (j / ringN) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      let x = sec.w * spow(c, 2 / sec.n);
      const y = ym + hh * spow(s, 2 / sec.n);
      const up = Math.max(0, s);
      x *= 1 - sec.tumble * up * up;
      pos.push(x, y, zs[i]);
      const cc = colorFn ? colorFn(x, y, zs[i], i / (S - 1)) : [1, 1, 1];
      col.push(cc[0], cc[1], cc[2]);
      tParam.push(i / (S - 1), s, c);
    }
  }
  const idx = [[], []];
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < ringN; j++) {
      const a = i * ringN + j, b = i * ringN + ((j + 1) % ringN);
      const c2 = (i + 1) * ringN + j, d = (i + 1) * ringN + ((j + 1) % ringN);
      const u = (i + 0.5) / (S - 1);
      const th = ((j + 0.5) / ringN) * Math.PI * 2;
      const m = matFn ? matFn(u, Math.sin(th), Math.cos(th)) : 0;
      idx[m].push(a, b, d, a, d, c2);
    }
  }
  // end caps with their own vertices so shading stays crisp
  const caps = [0, S - 1];
  for (const ci of caps) {
    const center = pos.length / 3;
    let cx = 0, cy = 0;
    for (let j = 0; j < ringN; j++) { cx += pos[(ci * ringN + j) * 3]; cy += pos[(ci * ringN + j) * 3 + 1]; }
    pos.push(cx / ringN, cy / ringN, zs[ci]);
    const c0 = col.slice((ci * ringN) * 3, (ci * ringN) * 3 + 3);
    col.push(...c0);
    const start = pos.length / 3;
    for (let j = 0; j < ringN; j++) {
      const k = (ci * ringN + j) * 3;
      pos.push(pos[k], pos[k + 1], pos[k + 2]);
      col.push(col[k], col[k + 1], col[k + 2]);
    }
    for (let j = 0; j < ringN; j++) {
      const a = start + j, b = start + ((j + 1) % ringN);
      if (ci === 0) idx[0].push(center, b, a);
      else idx[0].push(center, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([...idx[0], ...idx[1]]);
  g.addGroup(0, idx[0].length, 0);
  g.addGroup(idx[0].length, idx[1].length, 1);
  g.computeVertexNormals();
  return g;
}

// Shared materials (per accent colour) -------------------------------------
const shared = {};
function mats() {
  if (shared.ready) return shared;
  shared.ready = true;
  shared.glass = new THREE.MeshPhysicalMaterial({
    color: 0x05070a, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02,
    envMapIntensity: 1.6, reflectivity: 1,
  });
  shared.black = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.55, metalness: 0.2 });
  shared.carbon = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: carbonTexture(), roughness: 0.35, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08,
  });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 1, roughness: 0.12 });
  shared.tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, map: tyreTexture(), roughness: 0.92, metalness: 0 });
  shared.disc = new THREE.MeshStandardMaterial({ color: 0x6d6e72, metalness: 0.9, roughness: 0.35 });
  shared.wellLiner = new THREE.MeshBasicMaterial({ color: 0x020202, side: THREE.DoubleSide });
  shared.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 6, roughness: 0.2 });
  shared.headHousing = new THREE.MeshPhysicalMaterial({ color: 0x111317, metalness: 0.8, roughness: 0.15, clearcoat: 1 });
  shared.shadow = new THREE.MeshBasicMaterial({
    map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false,
  });
  shared.beam = new THREE.MeshBasicMaterial({
    map: beamTexture(), color: 0xfff1d6, transparent: true, opacity: 0.28, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return shared;
}

function paintMaterial(def) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: def.matte ? 0.15 : 0.55,
    roughness: def.matte ? 0.55 : 0.28,
    clearcoat: def.matte ? 0.15 : 1,
    clearcoatRoughness: def.matte ? 0.5 : 0.03,
    envMapIntensity: 1.25,
  });
  if (def.pearl) { m.sheen = 1; m.sheenColor = new THREE.Color('#ffe9c4'); m.sheenRoughness = 0.3; m.metalness = 0.3; }
  if (def.iridescent) { m.iridescence = 1; m.iridescenceIOR = 1.6; m.iridescenceThicknessRange = [200, 800]; }
  return m;
}

function rimGeometry(style, r) {
  const parts = [];
  const barrel = new THREE.CylinderGeometry(r, r, 0.24, 32, 1, true);
  barrel.rotateZ(Math.PI / 2);
  parts.push(barrel);
  const face = new THREE.RingGeometry(r * 0.86, r, 32);
  face.rotateY(Math.PI / 2);
  face.translate(0.1, 0, 0);
  parts.push(face);
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.22, 0.08, 16);
  hub.rotateZ(Math.PI / 2);
  hub.translate(0.09, 0, 0);
  parts.push(hub);
  const count = style === 'five' ? 5 : style === 'blade' ? 7 : style === 'multi' ? 10 : 14;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    let sp;
    if (style === 'mesh') {
      sp = new THREE.BoxGeometry(0.03, r * 0.85, 0.025);
      sp.translate(0.085, r * 0.48, 0);
      sp.rotateX(a);
      parts.push(sp);
      const sp2 = sp.clone();
      sp2.rotateX(Math.PI / count);
      parts.push(sp2);
      continue;
    }
    const wdt = style === 'five' ? 0.09 : style === 'blade' ? 0.05 : 0.035;
    sp = new THREE.BoxGeometry(0.035, r * 0.8, wdt);
    sp.translate(0.09, r * 0.5, 0);
    if (style === 'blade') sp.rotateY(0.0), sp.rotateX(0.25);
    sp.rotateX(a);
    parts.push(sp);
  }
  return mergeGeoms(parts);
}

function mergeGeoms(list) {
  // tiny merge (positions + normals + uvs), avoids importing BufferGeometryUtils here
  let total = 0;
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  nonIndexed.forEach((g) => (total += g.attributes.position.count));
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

function tyreGeometry(r, w) {
  const pts = [];
  const ir = r * 0.72;
  const hw = w / 2;
  pts.push(new THREE.Vector2(ir, -hw * 0.9));
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    pts.push(new THREE.Vector2(r - 0.05 + Math.cos(a) * 0.05, Math.sin(a) * hw));
  }
  pts.push(new THREE.Vector2(ir, hw * 0.9));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(Math.PI / 2);
  return g;
}

const rimCache = new Map();
const tyreCache = new Map();

/**
 * Build a car. Returns { group, body, wheels[], parts } where `body` is the
 * sprung mass (it rolls/pitches) and wheels are steerable/spinnable.
 */
export function buildCar(def, opts = {}) {
  const M = mats();
  const A = ARCHETYPES[def.style];
  const L = A.L, half = L / 2;
  const wF = curve(A.w), tF = curve(A.top), bF = curve(A.bot), cab = A.cabin;
  const cabW = curve(cab.w), cabR = curve(cab.roofKeys);
  const zFront = A.wb / 2, zRear = -A.wb / 2;
  const archR = A.wheelR + 0.06;

  const paint = paintMaterial(def);
  const pc = new THREE.Color(def.paint), ac = new THREE.Color(def.accent);
  const dark = pc.clone().multiplyScalar(0.18);

  const section = (z, t) => {
    let yb = bF(t);
    for (const wz of [zFront, zRear]) {
      const d = Math.abs(z - wz);
      if (d < archR) yb = Math.max(yb, A.wheelR + Math.sqrt(archR * archR - d * d) * 0.92);
    }
    return { w: wF(t), yt: tF(t), yb, n: A.n, tumble: A.tumble };
  };
  const zs = [];
  const S = 110;
  for (let i = 0; i <= S; i++) zs.push(-half + (i / S) * L);

  const colorFn = (x, y, z, t) => {
    if (def.stripes && Math.abs(Math.abs(x) - 0.2) < 0.09 && y > 0.6) return [ac.r, ac.g, ac.b];
    if (def.carbon && y < 0.42) return [dark.r, dark.g, dark.b];
    return [pc.r, pc.g, pc.b];
  };

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const bodyGeo = loft(zs, 56, section, null, colorFn);
  const bodyMesh = new THREE.Mesh(bodyGeo, [paint, paint]);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);

  // Greenhouse --------------------------------------------------------------
  const cz0 = -half + cab.t0 * L, cz1 = -half + cab.t1 * L;
  const czs = [];
  for (let i = 0; i <= 48; i++) czs.push(cz0 + (i / 48) * (cz1 - cz0));
  const cabSection = (z, u) => {
    const t = (z + half) / L;
    const base = tF(t) - 0.12;
    const roof = base + (cab.roof - base) * cabR(u);
    return { w: cabW(u) * (wF(t) / 1.0), yt: Math.max(base + 0.02, roof), yb: base - 0.25, n: 2.4, tumble: 0.42 };
  };
  const roofMat = (u, s, c) => {
    if (s < -0.1) return 0;
    if (s > 0.82 && u > 0.22 && u < 0.62) return 0; // roof panel
    if (u >= 0.62 && s > 0.5 && s < 0.8 && Math.abs(c) > 0.35) return 0; // A pillars
    if (!cab.rearGlass && u < 0.3 && s > 0.6) return 0; // engine cover
    if (u < 0.22 && s > 0.5 && s < 0.82 && Math.abs(c) > 0.35) return 0; // C pillars
    return 1;
  };
  const cabGeo = loft(czs, 40, cabSection, roofMat, () => (def.carbon ? [0.05, 0.05, 0.06] : [pc.r, pc.g, pc.b]));
  const cabMesh = new THREE.Mesh(cabGeo, [def.carbon ? M.carbon : paint, M.glass]);
  cabMesh.castShadow = true;
  body.add(cabMesh);

  // Helpers to sit things on the surface
  const sec = (t) => section(-half + t * L, t);

  // Engine-cover louvres for mid-engined cars
  if (!cab.rearGlass) {
    for (let i = 0; i < 5; i++) {
      const t = 0.12 + i * 0.035;
      const s = sec(t);
      const lv = new THREE.Mesh(new THREE.BoxGeometry(s.w * 1.1, 0.02, 0.05), M.black);
      lv.position.set(0, s.yt + 0.005, -half + t * L);
      body.add(lv);
    }
  }

  // Headlights: slim LED blades on the front corners
  const headT = def.style === 'muscle' ? 0.97 : 0.925;
  const hs = sec(headT);
  for (const side of [-1, 1]) {
    const hx = (hs.w - 0.28) * side;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.24), M.headHousing);
    const slope = Math.atan2(tF(headT + 0.02) - tF(headT - 0.02), 0.04 * L);
    housing.position.set(hx, hs.yt - 0.035, -half + headT * L);
    housing.rotation.x = -slope;
    body.add(housing);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.05), M.head);
    led.position.set(hx, hs.yt - 0.005, -half + headT * L + 0.07);
    led.rotation.x = -slope;
    body.add(led);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.2), M.head);
    drl.position.set(hx + side * 0.2, hs.yt - 0.01, -half + headT * L - 0.02);
    drl.rotation.x = -slope;
    body.add(drl);
  }

  // Tail lights: full-width bar + corner hooks
  const tail = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1020, emissiveIntensity: 3.2 });
  const rs = sec(0.004);
  const barY = rs.yt - 0.1;
  const bar = new THREE.Mesh(new THREE.BoxGeometry((rs.w - 0.12) * 2, 0.045, 0.04), tail);
  bar.position.set(0, barY, -half - 0.005);
  body.add(bar);
  for (const side of [-1, 1]) {
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.04), tail);
    hook.position.set(side * (rs.w - 0.14), barY - 0.06, -half - 0.005);
    body.add(hook);
  }
  // rear fascia + diffuser
  const diff = new THREE.Mesh(new THREE.BoxGeometry(rs.w * 1.7, 0.18, 0.3), def.carbon ? M.carbon : M.black);
  diff.position.set(0, rs.yb + 0.02, -half + 0.08);
  body.add(diff);
  for (let i = -3; i <= 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.34), M.black);
    fin.position.set(i * 0.2, rs.yb + 0.0, -half + 0.08);
    body.add(fin);
  }

  // Exhausts (nitro flames anchor here)
  const exhausts = [];
  const exX = def.style === 'muscle' || def.style === 'gt' ? [-0.62, -0.48, 0.48, 0.62] : [-0.14, 0.14];
  for (const x of exX) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.18, 16, 1, true), M.chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, rs.yb + 0.08, -half - 0.02);
    body.add(pipe);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), M.wellLiner);
    inner.rotation.y = Math.PI;
    inner.position.set(x, rs.yb + 0.08, -half + 0.03);
    body.add(inner);
    exhausts.push(new THREE.Vector3(x, rs.yb + 0.08, -half - 0.1));
  }

  // Front splitter and intakes
  const fs = sec(0.985);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(fs.w * 2.1, 0.03, 0.32), M.carbon);
  splitter.position.set(0, 0.17, half - 0.12);
  body.add(splitter);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(fs.w * 1.3, 0.14, 0.12), M.black);
  grille.position.set(0, fs.yb + 0.08, half - 0.06);
  body.add(grille);
  for (const side of [-1, 1]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.12), M.black);
    vent.position.set(side * (fs.w - 0.2), fs.yb + 0.09, half - 0.12);
    body.add(vent);
  }

  // Side skirts
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, A.wb - archR * 2 - 0.08), def.carbon ? M.carbon : M.black);
    const ms = sec(0.5);
    skirt.position.set(side * (ms.w + 0.0), 0.27, 0);
    body.add(skirt);
    if (A.intake) {
      const it = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12), M.black);
      const s2 = sec(0.33);
      it.scale.set(0.3, 0.55, 1.4);
      it.position.set(side * (s2.w * 0.93), 0.56, -half + 0.33 * L);
      body.add(it);
    }
  }

  // Mirrors
  {
    const u = 0.78;
    const z = cz0 + u * (cz1 - cz0);
    const t = (z + half) / L;
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.14), paint);
      m.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(m.geometry.attributes.position.count * 3).fill(0).map((_, i) => [pc.r, pc.g, pc.b][i % 3]), 3));
      m.position.set(side * (wF(t) * 0.82 + 0.1), tF(t) + 0.04, z);
      body.add(m);
      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.04), M.black);
      stalk.position.set(side * (wF(t) * 0.8), tF(t) + 0.02, z);
      body.add(stalk);
    }
  }

  // Rear wing
  const ws = sec(0.06);
  if (def.wing === 'big') {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.08, 0.06, 0.3, 0.05, 0.42, 0.0);
    shape.bezierCurveTo(0.3, 0.015, 0.08, 0.01, 0, 0);
    const wingGeo = new THREE.ExtrudeGeometry(shape, { depth: ws.w * 2.0, bevelEnabled: false });
    wingGeo.translate(-0.21, 0, -ws.w);
    wingGeo.rotateY(Math.PI / 2);
    const wing = new THREE.Mesh(wingGeo, def.carbon ? M.carbon : M.carbon);
    wing.position.set(0, ws.yt + 0.36, -half + 0.22);
    wing.rotation.x = -0.12;
    wing.castShadow = true;
    body.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.38, 0.14), M.black);
      strut.position.set(side * 0.5, ws.yt + 0.17, -half + 0.26);
      body.add(strut);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.5), M.carbon);
      plate.position.set(side * ws.w, ws.yt + 0.36, -half + 0.22);
      body.add(plate);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(ws.w * 1.9, 0.012, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: def.accent, emissiveIntensity: 2.5 }));
    strip.position.set(0, ws.yt + 0.365, -half + 0.01);
    body.add(strip);
  } else if (def.wing === 'duck') {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(rs.w * 1.8, 0.05, 0.22), def.carbon ? M.carbon : M.carbon);
    lip.position.set(0, rs.yt + 0.03, -half + 0.12);
    lip.rotation.x = 0.28;
    body.add(lip);
  } else {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(rs.w * 1.75, 0.025, 0.12), M.black);
    lip.position.set(0, rs.yt + 0.01, -half + 0.06);
    lip.rotation.x = 0.18;
    body.add(lip);
  }

  // Wheels ------------------------------------------------------------------
  const rimMat = new THREE.MeshStandardMaterial({ color: def.rim, metalness: 1, roughness: 0.22 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: def.caliper, roughness: 0.4, metalness: 0.3 });
  const rkey = def.rimStyle + A.wheelR;
  if (!rimCache.has(rkey)) rimCache.set(rkey, rimGeometry(def.rimStyle, A.wheelR * 0.72));
  const tkey = A.wheelR + '_' + A.wheelW;
  if (!tyreCache.has(tkey)) tyreCache.set(tkey, tyreGeometry(A.wheelR, A.wheelW));
  const wheels = [];
  for (const [wz, front] of [[zFront, true], [zRear, false]]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      const t = (wz + half) / L;
      const wx = side * (wF(t) - A.wheelW / 2 - 0.02);
      pivot.position.set(wx, A.wheelR, wz);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tyre = new THREE.Mesh(tyreCache.get(tkey), M.tyre);
      tyre.castShadow = true;
      spin.add(tyre);
      const rim = new THREE.Mesh(rimCache.get(rkey), rimMat);
      rim.scale.x = side; // mirror so the face points outward
      spin.add(rim);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(A.wheelR * 0.6, A.wheelR * 0.6, 0.03, 24), M.disc);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = -side * 0.02;
      pivot.add(disc);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.2), caliperMat);
      cal.position.set(side * 0.03, A.wheelR * 0.42, front ? -0.1 : 0.1);
      pivot.add(cal);
      group.add(pivot);
      wheels.push({ pivot, spin, front, side });

      // wheel-well liner (half cylinder hides the see-through arch)
      const liner = new THREE.Mesh(new THREE.CylinderGeometry(archR, archR, 0.9, 20, 1, true, 0, Math.PI), M.wellLiner);
      liner.rotation.set(0, 0, Math.PI / 2);
      liner.position.set(side * (wF(t) - 0.5), A.wheelR, wz);
      body.add(liner);
    }
  }

  // Ground effects -----------------------------------------------------------
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.6), M.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  group.add(shadow);

  let glow = null;
  if (def.underglow) {
    glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.0), new THREE.MeshBasicMaterial({
      map: glowTexture(), color: def.underglow, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    glow.renderOrder = 2;
    group.add(glow);
  }

  const beam = new THREE.Mesh(new THREE.PlaneGeometry(9, 26), M.beam.clone());
  beam.rotation.x = -Math.PI / 2;
  beam.position.set(0, 0.05, half + 13);
  beam.renderOrder = 2;
  beam.visible = opts.beams !== false;
  group.add(beam);

  // Head-light flare sprites
  const flareMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdfefff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  for (const side of [-1, 1]) {
    const f = new THREE.Sprite(flareMat);
    f.scale.set(0.9, 0.9, 1);
    f.position.set((hs.w - 0.28) * side, hs.yt, -half + headT * L + 0.2);
    body.add(f);
  }
  const tailFlareMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff2030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 });
  for (const side of [-1, 1]) {
    const f = new THREE.Sprite(tailFlareMat);
    f.scale.set(0.7, 0.5, 1);
    f.position.set(side * (rs.w - 0.3), barY, -half - 0.08);
    body.add(f);
  }

  // Nitro flames
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x6fb8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flames = [];
  for (const e of exhausts) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 12, 1, true), flameMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.copy(e).add(new THREE.Vector3(0, 0, -0.38));
    body.add(cone);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.5, 10, 1, true), flameMat);
    core.rotation.x = -Math.PI / 2;
    core.position.copy(e).add(new THREE.Vector3(0, 0, -0.2));
    body.add(core);
    flames.push(cone, core);
  }

  group.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });

  return {
    group, body, wheels, exhausts, flames, flameMat, tail, beam, glow, flareMat, tailFlareMat,
    wheelR: A.wheelR, length: L, halfWidth: wF(0.5),
    dispose() {
      group.traverse((o) => {
        if (o.isMesh && o.geometry && !o.geometry.userData.shared) {
          // shared rim/tyre geometries stay cached
          if (![...rimCache.values(), ...tyreCache.values()].includes(o.geometry)) o.geometry.dispose();
        }
      });
      paint.dispose();
      tail.dispose();
      flameMat.dispose();
    },
  };
}
