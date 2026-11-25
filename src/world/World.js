import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TrackPath } from '../track/TrackPath.js';
import { LAYOUTS } from '../track/layouts.js';
import { VISUALS } from './cities.js';
import { CITIES } from '../config.js';
import { createSky } from '../gfx/Sky.js';
import * as T from '../gfx/textures.js';
import * as LM from './landmarks.js';

const hdr = (c, k) => new THREE.Color(c).multiplyScalar(k);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A complete city: sky, lighting, circuit, architecture and landmarks.
 * The same World is used as the menu backdrop (theme) and as the race map.
 */
export class World {
  constructor(cityKey) {
    this.key = cityKey;
    this.city = CITIES[cityKey];
    this.vis = VISUALS[cityKey];
    this.track = new TrackPath(LAYOUTS[cityKey]);
    this.group = new THREE.Group();
    this.animators = [];
    this.zones = [];
    this.disposables = [];
    this.rand = T.rng(this.vis.seed);
    this.bounds = this.track.bounds();
    this.build();
  }

  // -------------------------------------------------------------------------
  build() {
    const v = this.vis;
    this.sky = createSky(v.sky);
    this.group.add(this.sky);
    this.fog = new THREE.FogExp2(v.fog[0], v.fog[1]);

    this.hemi = new THREE.HemisphereLight(v.hemi[0], v.hemi[1], v.hemi[2]);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(v.dir[0], v.dir[1]);
    this.sunDir = new THREE.Vector3(...v.dir[2]).normalize();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.group.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildRoad();
    this.buildWalls();
    this.buildStart();
    this.buildLamps();
    this.buildLandmarks();
    this.buildGrandstand();
    this.buildBuildings();
    this.buildTrees();
    if (v.mountains) this.buildMountains(v.mountains);
  }

  /** Track-relative helpers */
  isInside(x, z) {
    // point in polygon (track centre line)
    const t = this.track;
    let inside = false;
    for (let i = 0, j = t.n - 1; i < t.n; j = i, i += 1) {
      const xi = t.px[i], zi = t.pz[i], xj = t.px[j], zj = t.pz[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  zoneHit(x, z, r) {
    for (const zn of this.zones) if ((zn.x - x) ** 2 + (zn.z - z) ** 2 < (zn.r + r) ** 2) return true;
    return false;
  }

  /** Spiral search for a clear spot near (x,z) at least `r` from the track and zones. */
  findSpot(x, z, r, pad = 14) {
    const hw = this.track.halfWidth;
    for (let k = 0; k < 400; k++) {
      const a = k * 2.4, d = k * 6;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.track.distanceTo(px, pz, 4) > r + hw + pad && !this.zoneHit(px, pz, r)) {
        this.zones.push({ x: px, z: pz, r });
        return new THREE.Vector3(px, 0, pz);
      }
    }
    return new THREE.Vector3(x, 0, z);
  }

  // -------------------------------------------------------------------------
  buildGround() {
    const gt = T.groundTexture(this.vis.ground);
    gt.repeat.set(220, 220);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ map: gt, roughness: 0.92, metalness: 0.05, color: '#ffffff' }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  ribbon(latA, latB, y, opts = {}) {
    const t = this.track;
    const n = t.n;
    const tile = opts.tile ?? 18;
    const reps = Math.max(1, Math.round(t.length / tile));
    const vScale = reps / t.length;
    const pos = [], uv = [], nor = [], idx = [];
    const range = opts.range; // optional [i0, i1]
    const i0 = range ? range[0] : 0, i1 = range ? range[1] : n;
    for (let k = i0; k <= i1; k++) {
      const i = t.wrap(k);
      const nx = t.nx(i), nz = t.nz(i);
      const s = k * t.spacing;
      const yA = typeof y === 'function' ? y(latA) : y, yB = typeof y === 'function' ? y(latB) : y;
      pos.push(t.px[i] + nx * latA, yA, t.pz[i] + nz * latA, t.px[i] + nx * latB, yB, t.pz[i] + nz * latB);
      uv.push(opts.uA ?? 0, s * vScale, opts.uB ?? 1, s * vScale);
      nor.push(0, 1, 0, 0, 1, 0);
      if (k > i0) {
        const a = (k - i0 - 1) * 2, b = a + 1, c = a + 2, d = a + 3;
        if (latA > latB) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  /** Vertical strip following the track at lateral `lat`, facing `face` (+1 = toward left normal). */
  verticalStrip(lat, y0, y1, face, tile = 24) {
    const t = this.track;
    const n = t.n;
    const reps = Math.max(1, Math.round(t.length / tile));
    const vScale = reps / t.length;
    const pos = [], uv = [], nor = [], idx = [];
    for (let k = 0; k <= n; k++) {
      const i = t.wrap(k);
      const nx = t.nx(i), nz = t.nz(i);
      const x = t.px[i] + nx * lat, z = t.pz[i] + nz * lat;
      pos.push(x, y0, z, x, y1, z);
      const u = k * t.spacing * vScale * (face > 0 ? -1 : 1);
      uv.push(u, 0, u, 1);
      nor.push(nx * face, 0, nz * face, nx * face, 0, nz * face);
      if (k > 0) {
        const a = (k - 1) * 2, b = a + 1, c = a + 2, d = a + 3;
        if (face > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  buildRoad() {
    const t = this.track, hw = t.halfWidth;
    this.edge = hw + 1.2; // wall position
    const roadMat = new THREE.MeshStandardMaterial({
      map: T.roadTexture(),
      roughnessMap: T.roadRoughness(),
      normalMap: T.noiseNormal(3, 256, 3.0, 4),
      normalScale: new THREE.Vector2(0.16, 0.16),
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: this.vis.night ? 0.9 : 0.4,
    });
    const road = new THREE.Mesh(this.ribbon(this.edge, -this.edge, 0.0, { tile: 18 }), roadMat);
    road.receiveShadow = true;
    this.group.add(road);

    // rumble curbs on corners
    const curbMat = new THREE.MeshStandardMaterial({ map: T.curbTexture(), roughness: 0.6 });
    let start = -1;
    for (let k = 0; k <= t.n; k++) {
      const i = t.wrap(k);
      const corner = k < t.n && t.absCurv[i] > 1 / 160;
      if (corner && start < 0) start = k;
      if ((!corner || k === t.n) && start >= 0) {
        if (k - start > 12) {
          for (const s of [-1, 1]) {
            const a = s * (hw - 0.2), b = s * (hw + 1.1);
            const geo = this.ribbon(s > 0 ? b : a, s > 0 ? a : b, (lat) => (Math.abs(lat) > hw + 0.5 ? 0.05 : 0.03), { tile: 4, range: [start, k] });
            const m = new THREE.Mesh(geo, curbMat);
            m.receiveShadow = true;
            this.group.add(m);
          }
        }
        start = -1;
      }
    }

    // sidewalks
    const swTex = T.sidewalkTexture();
    const swMat = new THREE.MeshStandardMaterial({ map: swTex, roughness: 0.85, color: '#9a9aa0' });
    for (const s of [-1, 1]) {
      const a = s * (this.edge + 0.25), b = s * (this.edge + 8.5);
      const m = new THREE.Mesh(this.ribbon(s > 0 ? b : a, s > 0 ? a : b, 0.14, { tile: 4, uA: 0, uB: 2 }), swMat);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  buildWalls() {
    const accent = this.vis.accent;
    const wallMat = new THREE.MeshStandardMaterial({ map: T.wallTexture(accent), roughness: 0.75 });
    const capMat = new THREE.MeshStandardMaterial({ color: '#9a9ca2', roughness: 0.6 });
    const neonMat = new THREE.MeshBasicMaterial({ color: hdr(accent, 2.6) });
    const fenceMat = new THREE.MeshStandardMaterial({
      map: T.fenceTexture(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.4, color: '#b8c0cc',
    });
    fenceMat.map.repeat.set(1, 1);
    const H = 1.15, e = this.edge;
    for (const s of [-1, 1]) {
      const inner = s * e, outer = s * (e + 0.45);
      const face = new THREE.Mesh(this.verticalStrip(inner, 0, H, -s, 24), wallMat);
      face.receiveShadow = true;
      this.group.add(face);
      const back = new THREE.Mesh(this.verticalStrip(outer, 0, H, s, 24), capMat);
      this.group.add(back);
      const top = new THREE.Mesh(this.ribbon(s > 0 ? outer : inner, s > 0 ? inner : outer, H), capMat);
      this.group.add(top);
      const neon = new THREE.Mesh(this.verticalStrip(inner - s * 0.01, H - 0.12, H - 0.04, -s, 24), neonMat);
      this.group.add(neon);
      const fence = new THREE.Mesh(this.verticalStrip(s * (e + 0.25), H, H + 2.6, -s, 3), fenceMat);
      fence.material.map.repeat.set(1, 1);
      this.group.add(fence);
    }
  }

  buildStart() {
    const t = this.track, hw = t.halfWidth, e = this.edge;
    // checkered line
    const ck = T.checkerTexture();
    const lineGeo = this.ribbon(e, -e, 0.025, { range: [0, 3], tile: 3 });
    const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ map: ck, roughness: 0.6 }));
    this.group.add(line);
    // grid boxes
    const gridMat = new THREE.MeshBasicMaterial({ color: '#d8d8d8' });
    this.gridSlots = [];
    for (let k = 0; k < 6; k++) {
      const s = -(14 + k * 9);
      const lat = k % 2 === 0 ? 3.6 : -3.6;
      const i = t.wrap(Math.round(s / t.spacing));
      this.gridSlots.push({ idx: i, lat });
      const p = t.pointAt(i, lat);
      const h = t.heading(i);
      for (const [w, d, ox, oz] of [[2.6, 0.25, 0, 2.6], [0.25, 1.4, -1.2, 1.9], [0.25, 1.4, 1.2, 1.9]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), gridMat);
        m.rotation.x = -Math.PI / 2;
        const g = new THREE.Group();
        g.position.copy(p).setY(0.03);
        g.rotation.y = h;
        m.position.set(ox, 0, oz);
        g.add(m);
        this.group.add(g);
      }
    }
    // gantry
    const g = new THREE.Group();
    const i0 = t.wrap(Math.round(2 / t.spacing));
    g.position.copy(t.pointAt(i0, 0));
    g.rotation.y = t.heading(i0);
    const steel = new THREE.MeshStandardMaterial({ color: '#2a2c33', metalness: 0.8, roughness: 0.35 });
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), steel);
      pillar.position.set(s * (e + 1.2), 4.5, 0);
      pillar.castShadow = true;
      g.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((e + 1.8) * 2, 2.6, 1.4), steel);
    beam.position.y = 8.2;
    g.add(beam);
    const banner = T.bannerTexture('VELO GRAND PRIX', this.city.name + ' STREET CIRCUIT', this.vis.accent);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry((e + 1.6) * 2, 2.3), new THREE.MeshBasicMaterial({ map: banner, color: hdr('#ffffff', 1.3) }));
      p.position.set(0, 8.2, side * 0.72);
      if (side < 0) p.rotation.y = Math.PI;
      g.add(p);
    }
    // countdown lights hanging below
    this.startLights = [];
    for (let k = 0; k < 4; k++) {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 0.6), steel);
      housing.position.set((k - 1.5) * 1.8, 6.1, -0.2);
      g.add(housing);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: '#220404' }));
      bulb.position.set((k - 1.5) * 1.8, 6.1, -0.52);
      bulb.rotation.y = Math.PI;
      g.add(bulb);
      this.startLights.push(bulb);
    }
    this.group.add(g);
    this.setStartLights(0);
  }

  /** 0 = off, 1..3 = that many red, 4 = all green */
  setStartLights(state) {
    this.startLights.forEach((b, k) => {
      if (state === 4) b.material.color.copy(hdr('#30ff60', 5));
      else if (k < state) b.material.color.copy(hdr('#ff2020', 6));
      else b.material.color.set('#220404');
    });
  }

  buildLamps() {
    const t = this.track, e = this.edge;
    const spacing = 42;
    const count = Math.floor(t.length / spacing);
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 8.6, 8);
    poleGeo.translate(0, 4.3, 0);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 3.4);
    const headGeo = new THREE.BoxGeometry(0.5, 0.16, 1.1);
    const steel = new THREE.MeshStandardMaterial({ color: '#30333a', metalness: 0.7, roughness: 0.4 });
    const head = new THREE.MeshBasicMaterial({ color: hdr(this.vis.lamp, 4) });
    const poles = new THREE.InstancedMesh(poleGeo, steel, count);
    const arms = new THREE.InstancedMesh(armGeo, steel, count);
    const heads = new THREE.InstancedMesh(headGeo, head, count);
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: T.glowTexture(), color: hdr(this.vis.lamp, this.vis.lampPool), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }), count);
    pools.renderOrder = 1;
    poles.castShadow = true;
    this.lampSpots = [];
    for (let k = 0; k < count; k++) {
      const i = t.wrap(Math.round((k * spacing + 20) / t.spacing));
      const side = k % 2 ? 1 : -1;
      const h = t.heading(i);
      const base = t.pointAt(i, side * (e + 1.6));
      _q.setFromAxisAngle(UP, h);
      _m.compose(base, _q, _s.set(1, 1, 1));
      poles.setMatrixAt(k, _m);
      const armC = t.pointAt(i, side * (e + 0.1));
      armC.y = 8.5;
      const qa = new THREE.Quaternion().setFromAxisAngle(UP, h + Math.PI / 2);
      _m.compose(armC, qa, _s.set(1, 1, 1));
      arms.setMatrixAt(k, _m);
      const hp = t.pointAt(i, side * (e - 1.4));
      hp.y = 8.4;
      _m.compose(hp, qa, _s.set(1, 1, 1));
      heads.setMatrixAt(k, _m);
      const pp = t.pointAt(i, side * (e - 3.5));
      pp.y = 0.04;
      const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      _m.compose(pp, qp, _s.set(17, 17, 1));
      pools.setMatrixAt(k, _m);
      this.lampSpots.push(hp);
    }
    this.group.add(poles, arms, heads, pools);
  }

  buildLandmarks() {
    const b = this.bounds, k = this.key, t = this.track;
    const add = (lm, pos, rotY = 0) => {
      lm.object.position.copy(pos);
      lm.object.rotation.y = rotY;
      this.group.add(lm.object);
      if (lm.animate) this.animators.push(lm.animate);
      return lm;
    };
    const faceCenter = (p) => Math.atan2(b.cx - p.x, b.cz - p.z);
    const W = b.maxX - b.minX;
    // "ahead": a point down the start straight, so the hero landmark is framed
    // at the end of the main straight (seen from the grid and the menu)
    const ahead = (d, lat = 0, r = 40, pad = 14) => this.findSpot(
      t.px[0] + t.tx[0] * d + t.nx(0) * lat, t.pz[0] + t.tz[0] * d + t.nz(0) * lat, r, pad);
    const faceStart = (p) => Math.atan2(t.px[0] - p.x, t.pz[0] - p.z);
    if (k === 'vegas') {
      const p = ahead(600, -20, 50, 8);
      add(LM.ledSphere(46), p, faceStart(p) + Math.PI);
      this.hero = p.clone().setY(40);
      add(LM.glassPyramid(), this.findSpot(b.cx, b.cz, 75));
      add(LM.observationTower(), this.findSpot(b.minX - 90, b.minZ - 40, 26));
      const i = t.wrap(60);
      const sp = this.findSpot(t.px[i] + t.nx(i) * -34, t.pz[i] + t.nz(i) * -34, 10, 4);
      add(LM.welcomeSign('VELO GRAND PRIX', 'LAS VEGAS'), sp, t.heading(i) + Math.PI);
    } else if (k === 'newyork') {
      const st = ahead(560, 0, 42, 8);
      add(LM.setbackTower('#ffd99a'), st);
      this.hero = st.clone().setY(120);
      add(LM.decoCrownTower(), this.findSpot(b.cx, b.cz, 30));
      add(LM.twistedSupertall(), this.findSpot(b.minX - 160, b.maxZ + 80, 34));
    } else if (k === 'paris') {
      const p = ahead(680, 0, 52, 6);
      add(LM.eiffelTower(190), p, 0.3);
      this.hero = p.clone().setY(60);
      const a = this.findSpot(b.cx - W * 0.1, b.cz, 36);
      add(LM.triumphArch(), a, faceCenter(a));
    } else if (k === 'london') {
      const w = ahead(820, 0, 170, 10);
      this.addWater(w, 170);
      const eye = ahead(560, 0, 40, 6);
      add(LM.observationWheel({ radius: 55 }), eye, faceStart(eye) + Math.PI / 2);
      this.hero = eye.clone().setY(55);
      const ct = this.findSpot(w.x + 60, w.z + 200, 30, 6);
      add(LM.clockTower(), ct, faceCenter(ct));
      add(LM.shardTower(), this.findSpot(b.cx, b.cz, 38));
    } else if (k === 'singapore') {
      const w = ahead(600, 0, 170, 8);
      this.addWater(w, 170);
      const dir = new THREE.Vector3(t.tx[0], 0, t.tz[0]);
      const mbs = this.findSpot(w.x + dir.x * 240, w.z + dir.z * 240, 140, 8);
      add(LM.bayTowers(), mbs, Math.atan2(-dir.x, -dir.z) + Math.PI / 2);
      this.hero = mbs.clone().setY(100);
      add(LM.supertreeGrove(12), this.findSpot(b.cx, b.cz, 70));
      const fl = this.findSpot(w.x - dir.z * 250, w.z + dir.x * 250, 45, 6);
      add(LM.observationWheel({ radius: 62, rimColor: '#ffffff', rainbow: true }), fl, faceStart(fl) + Math.PI / 2);
      add(LM.lotusMuseum(), this.findSpot(w.x + dir.z * 230, w.z - dir.x * 230, 26, 6));
    }
  }

  addWater(center, r) {
    const nm = T.noiseNormal(17, 256, 4.0, 2);
    nm.repeat.set(30, 30);
    const mat = new THREE.MeshStandardMaterial({
      color: '#071423', roughness: 0.06, metalness: 0.9, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 2.2,
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 96), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(center.x, 0.02, center.z);
    this.group.add(water);
    const quay = new THREE.Mesh(new THREE.RingGeometry(r, r + 4, 96), new THREE.MeshStandardMaterial({ color: '#7a7a80', roughness: 0.8 }));
    quay.rotation.x = -Math.PI / 2;
    quay.position.set(center.x, 0.2, center.z);
    this.group.add(quay);
    const lights = new THREE.Mesh(new THREE.RingGeometry(r + 3.4, r + 3.8, 96), new THREE.MeshBasicMaterial({ color: hdr(this.vis.accent, 2) }));
    lights.rotation.x = -Math.PI / 2;
    lights.position.set(center.x, 0.25, center.z);
    this.group.add(lights);
    this.animators.push((t) => { nm.offset.set(t * 0.004, t * 0.0025); });
  }

  buildGrandstand() {
    const t = this.track;
    // put the grandstand outside the main straight
    const i = t.wrap(Math.round(-60 / t.spacing));
    let side = 1;
    const tp = t.pointAt(i, 40);
    if (this.isInside(tp.x, tp.z)) side = -1;
    const g = new THREE.Group();
    const base = t.pointAt(i, side * (this.edge + 10));
    g.position.copy(base);
    g.rotation.y = t.heading(i) + (side > 0 ? 0 : Math.PI);
    const L = 90;
    const conc = new THREE.MeshStandardMaterial({ color: '#5a5c64', roughness: 0.8 });
    const seatMat = new THREE.MeshStandardMaterial({ color: '#2a3550', roughness: 0.7 });
    const rows = 12;
    for (let r = 0; r < rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6 + r * 0.6, L), r % 2 ? conc : seatMat);
      step.position.set(r * 1.0 + 0.5, (0.6 + r * 0.6) / 2, 0);
      g.add(step);
    }
    // roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, L + 4), new THREE.MeshStandardMaterial({ color: '#d8dce4', metalness: 0.6, roughness: 0.3 }));
    roof.position.set(8, 12, 0);
    roof.rotation.z = -0.08;
    g.add(roof);
    const roofLight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, L + 4), new THREE.MeshBasicMaterial({ color: hdr(this.vis.accent, 3) }));
    roofLight.position.set(0.2, 12.5, 0);
    g.add(roofLight);
    for (let k = -2; k <= 2; k++) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 0.5), conc);
      col.position.set(14.5, 6, k * (L / 4.5));
      g.add(col);
    }
    // crowd
    const N = rows * 60;
    const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.9, 0.4), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const r = T.rng(77);
    const c = new THREE.Color();
    const flashPos = [];
    for (let k = 0; k < N; k++) {
      const row = k % rows, slot = Math.floor(k / rows);
      const z = -L / 2 + 1 + (slot / 60) * (L - 2) + (r() - 0.5) * 0.4;
      _p.set(row * 1.0 + 0.5, 0.6 + row * 0.6 + 0.45, z);
      _m.makeTranslation(_p.x, _p.y, _p.z);
      crowd.setMatrixAt(k, _m);
      c.setHSL(r(), 0.6, 0.35 + r() * 0.3);
      crowd.setColorAt(k, c);
      if (r() < 0.25) flashPos.push(_p.x - 0.3, _p.y + 0.4, _p.z);
    }
    g.add(crowd);
    // camera flashes
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(flashPos, 3));
    const ph = new Float32Array(flashPos.length / 3).map(() => r() * 100);
    fg.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
    const fm = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMap: { value: T.glowTexture() } },
      vertexShader: `attribute float phase; uniform float uTime; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
          float s = fract(uTime*0.37 + phase); vA = step(0.985, s);
          gl_PointSize = 260.0 * vA / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vec3(6.0)*a*vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const flashes = new THREE.Points(fg, fm);
    g.add(flashes);
    this.animators.push((time) => { fm.uniforms.uTime.value = time; });
    this.group.add(g);
    this.zones.push({ x: g.position.x + Math.sin(g.rotation.y + Math.PI / 2) * 8, z: g.position.z + Math.cos(g.rotation.y + Math.PI / 2) * 8, r: 50 });
  }

  // -------------------------------------------------------------------------
  buildBuildings() {
    const v = this.vis, t = this.track, r = this.rand, hw = t.halfWidth, b = this.bounds;
    const list = [];
    const occupied = [];
    const free = (x, z, rad) => {
      for (const o of occupied) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + rad) ** 2) return false;
      return !this.zoneHit(x, z, rad);
    };
    const pickStyle = () => {
      let u = r(), acc = 0;
      for (const [s, w] of v.styles) { acc += w; if (u <= acc) return s; }
      return v.styles[0][0];
    };
    const lerp = (a, c, k) => a + (c - a) * k;

    // 1) frontage along the circuit
    const minClear = this.edge + 9.5;
    for (let s = 0; s < t.length; s += 19 + r() * 8) {
      const i = t.wrap(Math.round(s / t.spacing));
      for (const side of [-1, 1]) {
        if (r() < 0.08) continue;
        const w = 14 + r() * 12, d = 14 + r() * 12;
        const h = lerp(v.frontHeight[0], v.frontHeight[1], Math.pow(r(), 1.6));
        const off = minClear + d / 2 + r() * 3;
        const x = t.px[i] + t.nx(i) * off * side, z = t.pz[i] + t.nz(i) * off * side;
        const rad = Math.hypot(w, d) / 2;
        if (t.distanceTo(x, z, 3) < rad + this.edge + 6) continue;
        if (!free(x, z, rad * 0.8)) continue;
        occupied.push({ x, z, r: rad * 0.8 });
        list.push({ x, z, w, d, h, rot: t.heading(i), style: pickStyle(), side, front: true });
      }
    }
    // 2) city blocks filling the surroundings
    const cell = v.grid ? 32 : 36;
    const ext = 520;
    for (let gx = b.minX - ext; gx < b.maxX + ext; gx += cell) {
      for (let gz = b.minZ - ext; gz < b.maxZ + ext; gz += cell) {
        if (r() < 0.12) continue;
        const x = gx + (v.grid ? 0 : (r() - 0.5) * 10), z = gz + (v.grid ? 0 : (r() - 0.5) * 10);
        const w = cell * (0.55 + r() * 0.3), d = cell * (0.55 + r() * 0.3);
        const rad = Math.hypot(w, d) / 2;
        const dist = t.distanceTo(x, z, 6);
        if (dist < rad + this.edge + 14) continue;
        if (!free(x, z, rad * 0.75)) continue;
        occupied.push({ x, z, r: rad * 0.75 });
        const far = Math.min(1, dist / 400);
        const hk = Math.pow(r(), 1.8) * (0.5 + far * 0.8);
        const h = lerp(v.bgHeight[0], v.bgHeight[1], Math.min(1, hk));
        list.push({ x, z, w, d, h, rot: v.grid ? 0 : Math.round(r() * 3) * (Math.PI / 2) + (r() - 0.5) * 0.3, style: pickStyle() });
      }
    }
    // 3) distant skyline ring
    for (let k = 0; k < 260; k++) {
      const a = r() * Math.PI * 2, d = 1050 + r() * 700;
      const x = b.cx + Math.cos(a) * d, z = b.cz + Math.sin(a) * d;
      const w = 30 + r() * 40, dd = 30 + r() * 40;
      const h = lerp(v.farHeight[0], v.farHeight[1], Math.pow(r(), 1.5));
      list.push({ x, z, w, d: dd, h, rot: r() * Math.PI, style: pickStyle(), far: true });
    }

    // Build merged geometry per facade style
    const byStyle = {};
    const roofParts = [], neonParts = [], warnPos = [];
    const neonCol = v.neon.map((c) => hdr(c, 2.8));
    const billboards = [];
    for (const bd of list) {
      const style = bd.style;
      const tile = style === 'glass' ? 26 : style === 'office' ? 28 : style === 'haussmann' ? 13 : 24;
      const geo = new THREE.BoxGeometry(bd.d, bd.h, bd.w);
      const uv = geo.attributes.uv;
      const ou = Math.floor(r() * 4) / 4, ov = Math.floor(r() * 4) / 4;
      for (let k = 0; k < uv.count; k++) {
        const face = Math.floor(k / 4);
        if (face === 2 || face === 3) { uv.setXY(k, 0.004, 0.004); continue; }
        const span = face < 2 ? bd.w : bd.d;
        uv.setXY(k, ou + (uv.getX(k) * span) / tile, ov + (uv.getY(k) * bd.h) / tile);
      }
      const tint = new THREE.Color(v.tints[Math.floor(r() * v.tints.length)]);
      const col = new Float32Array(uv.count * 3);
      for (let k = 0; k < uv.count; k++) col.set([tint.r, tint.g, tint.b], k * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      _q.setFromAxisAngle(UP, bd.rot);
      _m.compose(_p.set(bd.x, bd.h / 2, bd.z), _q, _s.set(1, 1, 1));
      geo.applyMatrix4(_m);
      (byStyle[style] ||= []).push(geo);

      // roof dressing
      const roofM = new THREE.Matrix4().compose(new THREE.Vector3(bd.x, bd.h, bd.z), _q.clone(), new THREE.Vector3(1, 1, 1));
      if (v.mansard && !bd.far) {
        const mg = new THREE.CylinderGeometry(0.62, 0.72, 1, 4, 1);
        mg.rotateY(Math.PI / 4);
        mg.scale(bd.d * 1.0, 6, bd.w * 1.0);
        mg.translate(0, 3, 0);
        mg.applyMatrix4(roofM);
        roofParts.push(mg);
        for (let c = 0; c < 2; c++) {
          const ch = new THREE.BoxGeometry(1.2, 3, 2.5);
          ch.translate((r() - 0.5) * bd.d * 0.5, 6.5, (r() - 0.5) * bd.w * 0.5);
          ch.applyMatrix4(roofM);
          roofParts.push(ch);
        }
      } else if (!bd.far && r() < 0.6) {
        const ac = new THREE.BoxGeometry(bd.d * 0.3, 2.5, bd.w * 0.25);
        ac.translate((r() - 0.5) * bd.d * 0.4, 1.25, (r() - 0.5) * bd.w * 0.4);
        ac.applyMatrix4(roofM);
        roofParts.push(ac);
      }
      if (bd.h > 70) warnPos.push(new THREE.Vector3(bd.x, bd.h + 1.5, bd.z));
      if ((style === 'glass' || style === 'office') && r() < v.neonChance && bd.h > 25) {
        const c = neonCol[Math.floor(r() * neonCol.length)];
        const th = 0.5;
        const edges = [
          [bd.d, th, th, 0, 0, bd.w / 2], [bd.d, th, th, 0, 0, -bd.w / 2],
          [th, th, bd.w, bd.d / 2, 0, 0], [th, th, bd.w, -bd.d / 2, 0, 0],
        ];
        if (v.neonVertical && r() < 0.6) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) edges.push([th, bd.h, th, (sx * bd.d) / 2, -bd.h / 2, (sz * bd.w) / 2]);
        }
        for (const [ex, ey, ez, ox, oy, oz] of edges) {
          const eg = new THREE.BoxGeometry(ex + 0.1, ey, ez + 0.1).toNonIndexed();
          eg.deleteAttribute('uv');
          eg.translate(ox, oy, oz);
          eg.applyMatrix4(roofM);
          const cc = new Float32Array(eg.attributes.position.count * 3);
          for (let k = 0; k < cc.length; k += 3) cc.set([c.r, c.g, c.b], k);
          eg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
          neonParts.push(eg);
        }
      }
      if (bd.front && bd.h > 16 && r() < v.billboardChance) billboards.push(bd);
    }
    for (const [style, geos] of Object.entries(byStyle)) {
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      const { map, emissive } = T.facadeTextures(style, v.windowColors, this.vis.seed + style.length, v.litChance);
      const mat = new THREE.MeshStandardMaterial({
        map, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: v.windowGlow, vertexColors: true,
        roughness: style === 'glass' ? 0.18 : 0.7, metalness: style === 'glass' ? 0.7 : 0.15,
        envMapIntensity: style === 'glass' ? 1.4 : 0.6,
      });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (roofParts.length) {
      const nonIdx = roofParts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
      const merged = mergeGeometries(nonIdx);
      const mat = new THREE.MeshStandardMaterial({ color: v.mansard ? '#4a5868' : '#2a2b30', roughness: v.mansard ? 0.45 : 0.8, metalness: v.mansard ? 0.6 : 0.2 });
      this.group.add(new THREE.Mesh(merged, mat));
    }
    if (neonParts.length) {
      const merged = mergeGeometries(neonParts);
      this.group.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true })));
    }
    if (warnPos.length) {
      const warnMat = new THREE.MeshBasicMaterial({ color: hdr('#ff2020', 5) });
      const warn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), warnMat, warnPos.length);
      warnPos.forEach((p, k) => { _m.makeTranslation(p.x, p.y, p.z); warn.setMatrixAt(k, _m); });
      this.group.add(warn);
      this.animators.push((time) => { warnMat.color.copy(hdr('#ff2020', (Math.sin(time * 2.2) > 0.3 ? 5 : 0.3))); });
    }
    // neon billboards facing the track
    for (const bd of billboards) {
      const word = v.billboards[Math.floor(r() * v.billboards.length)];
      const color = v.neon[Math.floor(r() * v.neon.length)];
      const tex = T.neonSignTexture(word, color);
      const bw = Math.min(bd.w * 0.8, 18), bh = bw / 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, color: hdr('#ffffff', 1.6) }));
      const g = new THREE.Group();
      g.position.set(bd.x, 0, bd.z);
      g.rotation.y = bd.rot;
      m.position.set(-bd.side * (bd.d / 2 + 0.3), Math.min(bd.h - bh, 9 + r() * 10), 0);
      m.rotation.y = -bd.side * Math.PI / 2;
      g.add(m);
      this.group.add(g);
    }
  }

  buildTrees() {
    const v = this.vis, t = this.track, r = this.rand;
    if (!v.trees) return;
    const pos = [];
    for (let s = 8; s < t.length; s += 15) {
      if (r() > v.treeChance) continue;
      const i = t.wrap(Math.round(s / t.spacing));
      if (i < 120 / t.spacing || i > t.n - 130 / t.spacing) continue; // keep the start clear
      for (const side of [-1, 1]) {
        if (r() < 0.25) continue;
        const p = t.pointAt(i, side * (this.edge + 6.2));
        if (t.distanceTo(p.x, p.z, 3) < this.edge + 5) continue;
        if (this.zoneHit(p.x, p.z, 3)) continue;
        pos.push([p, 0.8 + r() * 0.45, r() * Math.PI * 2]);
      }
    }
    if (!pos.length) return;
    let trunkGeo, crownGeo, crownMat;
    const trunkMat = new THREE.MeshStandardMaterial({ color: v.trees === 'palm' ? '#6a5640' : '#3e3228', roughness: 0.9 });
    if (v.trees === 'palm') {
      trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 9, 8, 6);
      const p = trunkGeo.attributes.position;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 4.5; p.setX(k, p.getX(k) + (y * y) * 0.012); }
      trunkGeo.translate(0, 4.5, 0);
      const fronds = [];
      for (let k = 0; k < 8; k++) {
        const f = new THREE.ConeGeometry(0.6, 4.6, 4, 1);
        f.scale(1, 1, 0.18);
        f.translate(0, 2.3, 0);
        f.rotateX(1.15 + (k % 2) * 0.25);
        f.rotateY((k / 8) * Math.PI * 2);
        f.translate(0.97, 9, 0);
        fronds.push(f.toNonIndexed());
      }
      crownGeo = mergeGeometries(fronds);
      crownMat = new THREE.MeshStandardMaterial({ color: '#2f6a3a', roughness: 0.8, side: THREE.DoubleSide, emissive: '#0a2010', emissiveIntensity: 0.4 });
    } else {
      trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 4.5, 6);
      trunkGeo.translate(0, 2.25, 0);
      crownGeo = new THREE.IcosahedronGeometry(3.2, 1);
      const p = crownGeo.attributes.position;
      const rr = T.rng(3);
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.85 + rr() * 0.3), p.getY(k) * 0.9, p.getZ(k) * (0.85 + rr() * 0.3));
      crownGeo.computeVertexNormals();
      crownGeo.translate(0, 6.2, 0);
      crownMat = new THREE.MeshStandardMaterial({ color: this.key === 'paris' ? '#58703a' : '#2e4a2c', roughness: 0.85, flatShading: true });
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pos.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, pos.length);
    trunks.castShadow = crowns.castShadow = true;
    pos.forEach(([p, sc, rot], k) => {
      _q.setFromAxisAngle(UP, rot);
      _m.compose(p, _q, _s.set(sc, sc, sc));
      trunks.setMatrixAt(k, _m);
      crowns.setMatrixAt(k, _m);
    });
    this.group.add(trunks, crowns);

    if (v.booths) {
      // red telephone boxes dotted along the pavement
      const boothGeo = new THREE.BoxGeometry(1.0, 2.6, 1.0);
      boothGeo.translate(0, 1.3, 0);
      const booths = new THREE.InstancedMesh(boothGeo, new THREE.MeshStandardMaterial({ color: '#c0141c', roughness: 0.45, emissive: '#ff4020', emissiveIntensity: 0.25 }), 24);
      let c = 0;
      for (let s = 50; s < t.length && c < 24; s += 90) {
        const i = t.wrap(Math.round(s / t.spacing));
        const p = t.pointAt(i, (c % 2 ? 1 : -1) * (this.edge + 3.5));
        _q.setFromAxisAngle(UP, t.heading(i));
        _m.compose(p.setY(0.14), _q, _s.set(1, 1, 1));
        booths.setMatrixAt(c++, _m);
      }
      booths.count = c;
      this.group.add(booths);
    }
  }

  buildMountains(color) {
    const b = this.bounds;
    const N = 160;
    const pos = [];
    const r = T.rng(9);
    const R = 2600;
    const heights = [];
    for (let i = 0; i <= N; i++) heights.push(120 + r() * 260 + Math.sin(i * 0.3) * 80);
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const x0 = b.cx + Math.cos(a0) * R, z0 = b.cz + Math.sin(a0) * R;
      const x1 = b.cx + Math.cos(a1) * R, z1 = b.cz + Math.sin(a1) * R;
      pos.push(x0, -10, z0, x1, -10, z1, x1, heights[i + 1], z1);
      pos.push(x0, -10, z0, x1, heights[i + 1], z1, x0, heights[i], z0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
    this.group.add(m);
  }

  // -------------------------------------------------------------------------
  attach(scene, renderer) {
    scene.add(this.group);
    scene.fog = this.fog;
    renderer.r.toneMappingExposure = this.vis.exposure;
    this.captureEnvironment(scene, renderer.r);
  }

  detach(scene) {
    scene.remove(this.group);
    scene.fog = null;
    if (scene.environment === this.envMap) scene.environment = null;
  }

  captureEnvironment(scene, r) {
    const b = this.bounds;
    const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(1, 5000, rt);
    cam.position.set(b.cx, 30, b.cz);
    const prevEnv = scene.environment;
    scene.environment = null;
    scene.add(cam);
    this.sky.userData.update(0, cam.position);
    cam.update(r, scene);
    scene.remove(cam);
    const pm = new THREE.PMREMGenerator(r);
    this.envMap = pm.fromCubemap(rt.texture).texture;
    pm.dispose();
    rt.dispose();
    scene.environment = this.envMap;
    scene.environmentIntensity = this.vis.night ? 1.0 : 0.9;
    void prevEnv;
  }

  update(dt, time, camera, focus) {
    this.sky.userData.update(time, camera.position);
    for (const a of this.animators) a(time, dt);
    if (focus) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
      this.sun.target.position.copy(focus);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    if (this.envMap) this.envMap.dispose();
  }
}
