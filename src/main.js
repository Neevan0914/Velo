import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './style.css';
import { Renderer } from './gfx/Renderer.js';
import { World } from './world/World.js';
import { buildCar } from './car/CarModel.js';
import { Race } from './race/Race.js';
import { UI } from './ui/UI.js';
import { AudioFX } from './audio/Audio.js';
import { CARS, CITIES } from './config.js';
import { glowTexture } from './gfx/textures.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

class Input {
  constructor() {
    this.keys = {};
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.mouseEnabled = false;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed.add(e.code);
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseEnabled) return;
      this.mdx += e.movementX || 0;
      this.mdy += e.movementY || 0;
    });
  }
  consume(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  consumeMouse() { const m = { dx: this.mdx, dy: this.mdy }; this.mdx = this.mdy = 0; return m; }
  clear() { this.pressed.clear(); this.mdx = this.mdy = 0; }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.R = new Renderer(this.canvas);
    this.audio = new AudioFX();
    this.input = new Input();
    this.sel = this.loadSel();
    this.quality = this.loadPref('velo.quality', 'high');
    this.R.setQuality(this.quality);
    this.ui = new UI(this);
    this.state = 'loading';
    this.world = null;
    this.worldKey = null;
    this.race = null;
    this.showcase = null;
    this.time = 0;
    this.last = performance.now();
    this.paused = false;

    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked && this.state === 'race' && this.race && !this.paused && this.race.phase !== 'finished') this.pause();
    });
    this.canvas.addEventListener('click', () => {
      this.audio.ensure();
      if (this.state === 'race' && !this.paused) this.lockPointer();
    });
    this.R.r.setAnimationLoop(() => this.frame());
  }

  loadPref(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
  loadSel() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('velo.sel') || '{}'); } catch { /* ignore */ }
    return {
      car: CARS.some((c) => c.id === s.car) ? s.car : CARS[0].id,
      theme: CITIES[s.theme] ? s.theme : 'vegas',
      boost: ['nitro', 'accel', 'velocity'].includes(s.boost) ? s.boost : 'nitro',
      map: CITIES[s.map] ? s.map : 'vegas',
    };
  }
  saveSel() { try { localStorage.setItem('velo.sel', JSON.stringify(this.sel)); } catch { /* ignore */ } }
  carIndex() { return CARS.findIndex((c) => c.id === this.sel.car); }

  setQuality(q) {
    this.quality = q;
    try { localStorage.setItem('velo.quality', q); } catch { /* ignore */ }
    this.R.setQuality(q);
  }

  // ------------------------------------------------------------------ boot
  async init() {
    this.ui.loading(0.05, 'Painting the cars…');
    await nextFrame();
    const thumbs = await this.makeThumbnails((p) => this.ui.loading(0.05 + p * 0.45));
    this.ui.buildWheel(thumbs);
    this.ui.loading(0.55, `Building ${CITIES[this.sel.theme].name}…`);
    await nextFrame();
    await this.loadWorld(this.sel.theme);
    this.ui.loading(1, 'Ready');
    await nextFrame();
    this.goMenu();
  }

  async makeThumbnails(progress) {
    const W = 352, H = 200;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(W, H);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.add(new THREE.HemisphereLight('#ffffff', '#202030', 0.6));
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(4, 6, 5);
    scene.add(key);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
    cam.position.set(6.4, 2.6, 7.4);
    cam.lookAt(0, 0.45, 0);
    const out = {};
    for (let i = 0; i < CARS.length; i++) {
      const car = buildCar(CARS[i], { beams: false });
      car.group.rotation.y = 0.15;
      if (car.glow) car.glow.visible = false;
      scene.add(car.group);
      r.render(scene, cam);
      out[CARS[i].id] = r.domElement.toDataURL('image/png');
      scene.remove(car.group);
      car.dispose();
      progress((i + 1) / CARS.length);
      await nextFrame();
    }
    pm.dispose();
    r.dispose();
    r.forceContextLoss?.();
    return out;
  }

  async loadWorld(key) {
    if (this.worldKey === key && this.world) return;
    if (this.world) { this.world.detach(this.R.scene); this.world.dispose(); }
    this.world = new World(key);
    this.world.attach(this.R.scene, this.R);
    this.worldKey = key;
    this.ui.setAccent(CITIES[key].accent);
  }

  // ------------------------------------------------------------------ showcase (menu/garage)
  buildShowcase() {
    this.disposeShowcase();
    const t = this.world.track;
    const spot = this.pickShowcaseSpot();
    const p = t.pointAt(spot.idx, 0);
    const h = spot.rot;
    const root = new THREE.Group();
    root.position.copy(p);
    root.rotation.y = h;
    const accent = CITIES[this.worldKey].accent;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.85, 0.14, 72), new THREE.MeshPhysicalMaterial({
      color: '#0c0d12', metalness: 0.6, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05,
    }));
    plate.position.y = 0.07;
    plate.receiveShadow = true;
    root.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.78, 0.045, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(4) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.145;
    root.add(ring);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({
      map: glowTexture(), color: new THREE.Color(accent).multiplyScalar(0.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.03;
    root.add(halo);
    const spin = new THREE.Group();
    spin.position.y = 0.14;
    root.add(spin);
    const keyL = new THREE.SpotLight('#ffffff', 70, 30, 0.6, 0.6, 1.5);
    keyL.position.set(2, 9, 5);
    keyL.castShadow = true;
    keyL.shadow.mapSize.set(1024, 1024);
    keyL.target.position.set(0, 0, 0);
    root.add(keyL, keyL.target);
    const rim = new THREE.PointLight(accent, 18, 14, 1.6);
    rim.position.set(-4, 2.5, -4);
    const rim2 = new THREE.PointLight('#7fd8ff', 12, 14, 1.6);
    rim2.position.set(4, 2, -3);
    root.add(rim, rim2);
    this.world.group.add(root);
    this.showcase = { root, spin, car: null, angle: 0.6 };
    this.setShowcaseCar(this.sel.car);
  }

  /**
   * Pick a road spot + turntable orientation so the city's landmark sits just
   * left of the car, framed down a straight stretch of road.
   */
  pickShowcaseSpot() {
    const t = this.world.track, hero = this.world.hero;
    const fallback = t.wrap(Math.round(24 / t.spacing));
    if (!hero) return { idx: fallback, rot: t.heading(fallback) };
    const straight = (i, dir) => {
      let c = 0;
      for (let k = -20; k <= 170; k += 5) c = Math.max(c, t.absCurv[t.wrap(i - dir * Math.round(k / t.spacing))]);
      return c;
    };
    const cx0 = -5.2, cz0 = 10.4;
    let best = { idx: fallback, rot: t.heading(fallback) }, bestScore = -Infinity;
    for (let i = 0; i < t.n; i += 4) {
      for (const dir of [1, -1]) {
        const curv = straight(i, dir);
        if (curv > 1 / 90) continue;
        for (let phi = -0.6; phi <= 0.61; phi += 0.1) {
          const rot = t.heading(i) + (dir < 0 ? Math.PI : 0) + phi;
          const px = t.px[i], pz = t.pz[i];
          const wx = px + Math.cos(rot) * cx0 + Math.sin(rot) * cz0;
          const wz = pz - Math.sin(rot) * cx0 + Math.cos(rot) * cz0;
          if (Math.abs(t.lateral(i, wx, wz)) > t.halfWidth + 0.5) continue;
          let d = Math.atan2(hero.x - wx, hero.z - wz) - Math.atan2(px - wx, pz - wz);
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const dist = Math.hypot(hero.x - wx, hero.z - wz);
          // how well the camera's line of sight follows the road
          const view = Math.atan2(px - wx, pz - wz) + d;
          const roadDir = t.heading(i) + (dir < 0 ? 0 : Math.PI);
          let off = view - roadDir;
          while (off > Math.PI) off -= Math.PI * 2;
          while (off < -Math.PI) off += Math.PI * 2;
          const score = -Math.abs(d - 0.42) * 4 - Math.abs(off) * 3 - curv * 300
            - Math.max(0, dist - 700) / 250 - Math.max(0, 220 - dist) / 60;
          if (score > bestScore) { bestScore = score; best = { idx: i, rot }; }
        }
      }
    }
    return best;
  }

  setShowcaseCar(id) {
    const s = this.showcase;
    if (!s) return;
    if (s.car) { s.spin.remove(s.car.group); s.car.dispose(); }
    const def = CARS.find((c) => c.id === id);
    s.car = buildCar(def, { beams: false });
    s.car.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    s.car.flareMat.opacity = 0.6;
    s.spin.add(s.car.group);
    s.pop = 0;
  }

  disposeShowcase() {
    if (!this.showcase) return;
    const s = this.showcase;
    if (s.car) s.car.dispose();
    s.root.parent?.remove(s.root);
    s.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.showcase = null;
  }

  updateShowcase(dt) {
    const s = this.showcase;
    if (!s) return;
    s.angle += dt * 0.32;
    s.spin.rotation.y = s.angle;
    s.pop = Math.min(1, (s.pop ?? 1) + dt * 2.5);
    const e = 1 - Math.pow(1 - s.pop, 3);
    s.spin.scale.setScalar(0.85 + 0.15 * e);
    const cam = this.R.camera;
    const sel = this.state === 'select';
    const root = s.root;
    const t = this.time;
    // camera in front-left of the turntable, gentle drift
    const local = sel
      ? new THREE.Vector3(Math.sin(t * 0.12) * 1.2 - 4.5, 3.6, 12.5)
      : new THREE.Vector3(-5.2 + Math.sin(t * 0.15) * 0.6, 1.25 + Math.sin(t * 0.21) * 0.1, 10.4);
    const target = sel ? new THREE.Vector3(0, 0.1, 0) : new THREE.Vector3(0, 1.05, 0);
    root.localToWorld(local);
    root.localToWorld(target);
    if (!this.camInit) { cam.position.copy(local); this.camInit = true; }
    cam.position.lerp(local, 1 - Math.exp(-dt * 3));
    cam.lookAt(target);
    cam.fov = sel ? 38 : 40;
    cam.updateProjectionMatrix();
    if (sel) this.R.setViewShift(0, 0.07);
    else this.R.setViewShift(0.22, 0.17);
  }

  // ------------------------------------------------------------------ state changes
  async goMenu() {
    this.endRace();
    this.paused = false;
    if (this.worldKey !== this.sel.theme) {
      this.ui.show('loading');
      this.ui.loading(0.6, `Building ${CITIES[this.sel.theme].name}…`);
      await nextFrame();
      await this.loadWorld(this.sel.theme);
    }
    if (!this.showcase) this.buildShowcase();
    this.state = 'menu';
    this.camInit = false;
    this.ui.refreshMenu();
    this.ui.show('menu');
  }

  async goSelect() {
    this.endRace();
    this.paused = false;
    if (this.worldKey !== this.sel.theme) {
      this.ui.show('loading');
      await nextFrame();
      await this.loadWorld(this.sel.theme);
    }
    if (!this.showcase) { this.buildShowcase(); this.camInit = false; }
    this.state = 'select';
    this.ui.refreshSelect();
    this.ui.show('select');
  }

  async setTheme(key) {
    if (key === this.sel.theme) return;
    this.sel.theme = key;
    this.saveSel();
    this.ui.show('loading');
    this.ui.loading(0.6, `Building ${CITIES[key].name}…`);
    await nextFrame();
    this.disposeShowcase();
    await this.loadWorld(key);
    this.buildShowcase();
    this.camInit = false;
    this.ui.refreshMenu();
    this.ui.show('menu');
  }

  selectCar(i) {
    const n = CARS.length;
    i = ((i % n) + n) % n;
    this.sel.car = CARS[i].id;
    this.saveSel();
    this.setShowcaseCar(this.sel.car);
    this.ui.refreshSelect();
  }

  async startRace() {
    this.audio.ensure();
    this.endRace();
    this.paused = false;
    this.ui.show('loading');
    this.ui.loading(0.5, `Loading ${CITIES[this.sel.map].name} street circuit…`);
    await nextFrame();
    this.disposeShowcase();
    this.R.setViewShift(0, 0);
    await this.loadWorld(this.sel.map);
    const def = CARS.find((c) => c.id === this.sel.car);
    this.race = new Race({
      world: this.world, carDef: def, boost: this.sel.boost, renderer: this.R,
      audio: this.audio, ui: this.ui, input: this.input,
    });
    this.race.onResults = () => this.showResults();
    this.input.clear();
    this.input.mouseEnabled = true;
    this.state = 'race';
    this.ui.show('hud');
    this.lockPointer();
  }

  endRace() {
    if (!this.race) return;
    this.race.dispose();
    this.race = null;
    this.input.mouseEnabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  showResults() {
    this.ui.message('');
    this.ui.toast('', 1);
    this.ui.results(this.race);
    this.input.mouseEnabled = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.show('hud', 'results');
  }

  lockPointer() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock unavailable: raw mouse movement still works */ }
  }

  pause() {
    if (this.state !== 'race' || this.paused) return;
    this.paused = true;
    this.audio.idle();
    this.ui.show('hud', 'pause');
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
    this.ui.show('hud');
    this.lockPointer();
  }

  onKey(e) {
    if (e.code === 'KeyM') { this.audio.ensure(); this.audio.setMuted(!this.audio.muted); this.ui.refreshMenu(); }
    if (this.state === 'race' && e.code === 'Escape') {
      if (this.race?.resultsShown) return;
      if (this.paused) this.resume(); else this.pause();
    }
    if (this.state === 'select') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.selectCar(this.carIndex() - 1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.selectCar(this.carIndex() + 1);
      if (e.code === 'Enter') this.startRace();
    }
    if (this.state === 'menu' && e.code === 'Enter') this.goSelect();
  }

  // ------------------------------------------------------------------ loop
  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    let focus = null;
    if (this.state === 'race' && this.race) {
      if (!this.paused) this.race.update(dt);
      focus = this.race.player.object.position;
    } else if (this.showcase) {
      this.updateShowcase(dt);
      focus = this.showcase.root.position;
    }
    if (this.world) this.world.update(dt, this.time, this.R.camera, focus);
    this.R.render(dt, this.time);
  }
}

const game = new Game();
window.__velo = game;
game.init().catch((err) => {
  console.error(err);
  document.getElementById('loadText').textContent = 'Failed to start: ' + err.message;
});
