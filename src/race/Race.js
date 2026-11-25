import * as THREE from 'three';
import { CARS, BOOSTS, BOT_NAMES, PHYSICS } from '../config.js';
import { Vehicle } from '../car/Vehicle.js';
import { AIDriver } from '../car/AIDriver.js';
import { Particles } from '../fx/Particles.js';
import { angleDiff } from '../track/TrackPath.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BOOST_KEYS = Object.keys(BOOSTS);

/**
 * One race session: 1 player + 5 bots, 3 laps, countdown, chase camera.
 */
export class Race {
  constructor({ world, carDef, boost, renderer, audio, ui, input }) {
    this.world = world;
    this.track = world.track;
    this.R = renderer;
    this.audio = audio;
    this.ui = ui;
    this.input = input;
    this.scene = renderer.scene;
    this.time = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.acc = 0;
    this.camMode = 0;
    this.camYaw = 0; this.camPitch = 0; this.lookIdle = 0;
    this.shake = 0;

    const night = world.vis.night;
    // grid: player starts at the back
    const pool = CARS.filter((c) => c.id !== carDef.id).sort(() => Math.random() - 0.5);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    this.cars = [];
    this.bots = [];
    for (let k = 0; k < 6; k++) {
      const slot = world.gridSlots[k];
      let car;
      if (k === 5) {
        car = new Vehicle(carDef, boost, this.track, { name: 'YOU', isPlayer: true, night });
        this.player = car;
      } else {
        const b = BOOST_KEYS[Math.floor(Math.random() * BOOST_KEYS.length)];
        car = new Vehicle(pool[k], b, this.track, { name: names[k], night });
        const skill = 0.84 + (4 - k) * 0.025 + Math.random() * 0.03;
        this.bots.push(new AIDriver(car, 1000 + k * 77, skill));
      }
      car.reset(slot.idx, slot.lat);
      this.scene.add(car.object);
      this.cars.push(car);
    }
    const p = this.player;
    p.onNitro = () => { this.audio.whoosh(0.5, 1.4); this.shake = 0.5; };
    p.onLap = (lap, t) => {
      if (lap < PHYSICS.LAPS) {
        this.ui.toast(`LAP ${lap}  ${fmt(t)}`);
        if (lap === PHYSICS.LAPS - 1) this.flash('FINAL LAP');
      }
    };
    p.onFinish = () => this.finish();

    // player headlights
    if (night) {
      this.headlight = new THREE.SpotLight('#fff4e0', 35, 70, 0.55, 0.6, 1.4);
      this.headlight.position.set(0, 0.9, 1.6);
      this.headlight.target.position.set(0, 0, 18);
      p.object.add(this.headlight, this.headlight.target);
    }

    this.particles = new Particles(this.scene);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camHeading = p.heading;
    this.placeCamera(true);
    this.world.setStartLights(0);
    this.ui.hudSetup(this);
  }

  flash(text, warn = false, ms = 1600) {
    this.ui.message(text, warn);
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => this.ui.message(''), ms);
  }

  standings() {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }

  finalStandings() {
    return this.standings().map((c) => {
      if (c.finished) return { car: c, time: c.finishTime };
      const remain = (PHYSICS.LAPS - c.progress) * this.track.length;
      const avg = Math.max(25, (c.progress * this.track.length) / Math.max(1, this.time));
      return { car: c, time: this.time + remain / avg, estimated: true };
    }).sort((a, b) => a.time - b.time);
  }

  finish() {
    this.phase = 'finished';
    this.phaseT = 0;
    const pos = this.standings().indexOf(this.player) + 1;
    this.ui.message(pos === 1 ? 'WINNER!' : `FINISHED P${pos}`);
    this.audio.whoosh(0.6, 1.8, 200, 4000);
  }

  // ------------------------------------------------------------------ loop
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.phaseT += dt;
    const P = this.phase;

    if (P === 'intro') {
      if (this.phaseT > 1.6) { this.phase = 'countdown'; this.phaseT = 0; this.lastCount = 4; }
    } else if (P === 'countdown') {
      const n = 3 - Math.floor(this.phaseT);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n >= 1) {
          this.ui.countdown(String(n));
          this.world.setStartLights(4 - n);
          this.audio.beep(520, 0.25, 0.3);
        } else {
          this.ui.countdown('GO!', true);
          this.world.setStartLights(4);
          this.audio.beep(1040, 0.6, 0.35);
          this.phase = 'racing';
          this.phaseT = 0;
          setTimeout(() => this.world.setStartLights(0), 3000);
        }
      }
    }

    const locked = this.phase === 'intro' || this.phase === 'countdown';
    this.readInput(locked);

    // fixed-step physics
    const step = PHYSICS.TICK;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= step && steps < 8) {
      this.acc -= step;
      steps++;
      if (!locked) this.time += step;
      for (const b of this.bots) b.update(step, this.cars, this.player, locked);
      for (const c of this.cars) c.step(step, this.time, locked);
      this.collide();
    }
    const alpha = this.acc / step;

    for (const c of this.cars) c.sync(alpha, dt, this.R.camera);
    this.effects(dt);
    this.updateCamera(dt, alpha);
    this.audioUpdate(locked);

    // warnings
    const p = this.player;
    if (!locked && !p.finished) {
      if (p.wrongWayT > 1) this.ui.message('WRONG WAY', true), (this._ww = true);
      else if (this._ww) { this._ww = false; this.ui.message(''); }
    }
    if (this.phase === 'finished' && this.phaseT > 3.5 && !this.resultsShown) {
      this.resultsShown = true;
      this.onResults?.();
    }
    this.ui.hud(this, dt);
  }

  readInput(locked) {
    const k = this.input.keys, p = this.player, c = p.controls;
    if (p.finished) {
      // autopilot after the flag
      c.throttle = p.speed < 60 ? 0.6 : 0; c.brake = p.speed > 80 ? 0.4 : 0; c.nitro = false; c.handbrake = false;
      const ti = this.track.wrap(p.idx + 20);
      const tp = this.track.pointAt(ti, 0);
      c.steer = clamp(angleDiff(Math.atan2(tp.x - p.x, tp.z - p.z), p.heading) * 2.5, -1, 1);
      return;
    }
    c.throttle = k.KeyW || k.ArrowUp ? 1 : 0;
    c.brake = k.KeyS || k.ArrowDown ? 1 : 0;
    c.steer = (k.KeyA || k.ArrowLeft ? 1 : 0) - (k.KeyD || k.ArrowRight ? 1 : 0);
    c.handbrake = !!k.Space;
    c.nitro = !!k.KeyF;
    if (!locked && this.input.consume('KeyR')) { p.respawn(); this.flash('RESET', false, 700); }
    if (this.input.consume('KeyC')) { this.camMode = (this.camMode + 1) % 3; }
    const m = this.input.consumeMouse();
    if (m.dx || m.dy) {
      this.camYaw = clamp(this.camYaw - m.dx * 0.004, -Math.PI, Math.PI);
      this.camPitch = clamp(this.camPitch + m.dy * 0.003, -0.25, 0.7);
      this.lookIdle = 0;
    }
  }

  collide() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx0 = b.x - a.x, dz0 = b.z - a.z;
        if (dx0 * dx0 + dz0 * dz0 > 36) continue;
        // two circles per car
        for (const sa of [-1.1, 1.1]) for (const sb of [-1.1, 1.1]) {
          const ax = a.x + Math.sin(a.heading) * sa, az = a.z + Math.cos(a.heading) * sa;
          const bx = b.x + Math.sin(b.heading) * sb, bz = b.z + Math.cos(b.heading) * sb;
          const dx = bx - ax, dz = bz - az;
          const d2 = dx * dx + dz * dz;
          const R = 2.0;
          if (d2 >= R * R || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = R - d;
          a.x -= nx * pen * 0.5; a.z -= nz * pen * 0.5;
          b.x += nx * pen * 0.5; b.z += nz * pen * 0.5;
          // velocity exchange along the normal
          const va = a.speedMs, vb = b.speedMs;
          let avx = Math.sin(a.velAngle) * va, avz = Math.cos(a.velAngle) * va;
          let bvx = Math.sin(b.velAngle) * vb, bvz = Math.cos(b.velAngle) * vb;
          const rel = (bvx - avx) * nx + (bvz - avz) * nz;
          if (rel < 0) {
            const jimp = -rel * 0.65;
            avx -= nx * jimp; avz -= nz * jimp;
            bvx += nx * jimp; bvz += nz * jimp;
            for (const [c, vx, vz] of [[a, avx, avz], [b, bvx, bvz]]) {
              const sp = Math.hypot(vx, vz);
              const ang = Math.atan2(vx, vz);
              const fwd = Math.cos(angleDiff(ang, c.heading)) >= 0;
              c.speed = (fwd ? sp : -sp) * 3.6;
              c.velAngle = fwd ? ang : ang + Math.PI;
            }
            if (a === this.player || b === this.player) {
              const hit = Math.min(1, Math.abs(rel) / 12);
              if (hit > 0.15) { this.audio.thud(0.25 + hit * 0.4); this.shake = Math.max(this.shake, hit * 0.6); }
              this.particles.sparks((ax + bx) / 2, 0.5, (az + bz) / 2, nz, -nx, 4 + Math.round(hit * 8));
            }
          }
        }
      }
    }
  }

  effects(dt) {
    const pt = this.particles;
    for (const c of this.cars) {
      const o = c.object;
      const sh = Math.sin(c.heading), ch = Math.cos(c.heading);
      // wall sparks
      if (c.wallHit > 0.05 && Math.abs(c.speed) > 20) {
        const side = c.wallSide || 1;
        const nx = c.track.nx(c.idx) * side, nz = c.track.nz(c.idx) * side;
        pt.sparks(o.position.x + nx * 1.0, 0.4, o.position.z + nz * 1.0, -sh, -ch, 3);
        if (c === this.player) {
          this.shake = Math.max(this.shake, c.wallHit * 0.5);
          if (!this._scrapeT || this._scrapeT < 0) { this.audio.thud(0.2 + c.wallHit * 0.4); this._scrapeT = 0.35; }
        }
      }
      // tyre smoke while sliding
      const slip = Math.abs(c.slip);
      if (slip > 0.12 && Math.abs(c.speed) > 30 && Math.random() < slip * 3) {
        for (const s of [-0.85, 0.85]) {
          const x = o.position.x - sh * 1.4 + ch * s, z = o.position.z - ch * 1.4 - sh * s;
          pt.smokePuff(x, 0.3, z, -sh * 2, -ch * 2, 0.5, 0.5);
        }
      }
      // nitro embers
      if (c.nitroActive) {
        for (const e of c.model.exhausts) {
          const wx = o.position.x + ch * e.x + sh * e.z;
          const wz = o.position.z - sh * e.x + ch * e.z;
          pt.ember(wx, e.y + 0.05, wz, -sh * 8, -ch * 8);
        }
      }
    }
    this._scrapeT = (this._scrapeT || 0) - dt;
    pt.update(dt);
  }

  placeCamera(snap) {
    const p = this.player;
    const h = this.camHeading;
    const D = 7.0, H = 2.3;
    this.camPos.set(p.x - Math.sin(h) * D, H, p.z - Math.cos(h) * D);
    this.camLook.set(p.x + Math.sin(h) * 3, 1.0, p.z + Math.cos(h) * 3);
    if (snap) {
      this.R.camera.position.copy(this.camPos);
      this.R.camera.lookAt(this.camLook);
    }
  }

  updateCamera(dt) {
    const cam = this.R.camera, p = this.player, o = p.object.position;
    const sp = Math.abs(p.speed);
    this.lookIdle += dt;
    if (this.lookIdle > 1.2) {
      this.camYaw *= Math.exp(-dt * 3);
      this.camPitch *= Math.exp(-dt * 3);
    }
    if (this.phase === 'intro') {
      // sweeping fly-in from the front of the car
      const k = Math.min(1, this.phaseT / 1.6);
      const e = 1 - Math.pow(1 - k, 3);
      const a = p.heading + Math.PI * (1 - e) * 0.9;
      const D = 7 + (1 - e) * 9, H = 2.3 + (1 - e) * 4;
      cam.position.set(o.x - Math.sin(a) * D, H, o.z - Math.cos(a) * D);
      cam.lookAt(o.x, 0.9, o.z);
      this.camHeading = p.heading;
      cam.fov = 62;
      cam.updateProjectionMatrix();
      return;
    }
    // heading smoothing (lets drifts show)
    this.camHeading += angleDiff(p.heading + (p.speed < -5 ? 0 : 0), this.camHeading) * Math.min(1, dt * 5);
    const yaw = this.camHeading + this.camYaw;
    const nitro = p.nitroActive ? 1 : 0;
    this.nitroFx = (this.nitroFx || 0) + (nitro - (this.nitroFx || 0)) * Math.min(1, dt * 4);
    const sk = clamp(sp / 260, 0, 1.3);

    let pos, look;
    if (this.camMode === 1) {
      // hood cam
      const fx = Math.sin(p.heading + this.camYaw), fz = Math.cos(p.heading + this.camYaw);
      pos = new THREE.Vector3(o.x + Math.sin(p.heading) * 0.2, 1.2, o.z + Math.cos(p.heading) * 0.2);
      look = new THREE.Vector3(o.x + fx * 20, 1.0 - this.camPitch * 10, o.z + fz * 20);
      cam.position.copy(pos);
    } else {
      const far = this.camMode === 2;
      const D = (far ? 9.0 : 5.7) + sk * 1.0 - this.nitroFx * 0.5;
      const H = (far ? 3.2 : 1.85) + this.camPitch * D * 0.8;
      pos = new THREE.Vector3(o.x - Math.sin(yaw) * D * Math.cos(this.camPitch * 0.5), H, o.z - Math.cos(yaw) * D * Math.cos(this.camPitch * 0.5));
      look = new THREE.Vector3(o.x + Math.sin(this.camHeading) * 2.5, 1.05, o.z + Math.cos(this.camHeading) * 2.5);
      const k = 1 - Math.exp(-dt * 14);
      this.camPos.lerp(pos, k);
      this.camLook.lerp(look, 1 - Math.exp(-dt * 20));
      cam.position.copy(this.camPos);
      look = this.camLook;
    }
    // shake
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const s = this.shake * 0.25 + this.nitroFx * 0.03 + Math.max(0, sk - 0.7) * 0.02;
    cam.position.x += (Math.random() - 0.5) * s;
    cam.position.y += (Math.random() - 0.5) * s;
    cam.lookAt(look);
    cam.fov = 56 + sk * 10 + this.nitroFx * 7;
    cam.updateProjectionMatrix();
    this.R.lens.uniforms.uSpeed.value = clamp(sp / 280, 0, 1.2);
    this.R.lens.uniforms.uNitro.value = this.nitroFx;
  }

  audioUpdate(locked) {
    const p = this.player;
    const throttle = locked ? (this.input.keys.KeyW ? 1 : 0) : p.controls.throttle;
    const revSpeed = locked ? throttle * 90 : Math.abs(p.speed);
    this.audio.engine(revSpeed, throttle, p.nitroActive, Math.abs(p.slip) * (Math.abs(p.speed) > 30 ? 1 : 0), true);
  }

  dispose() {
    for (const c of this.cars) { this.scene.remove(c.object); c.dispose(); }
    this.particles.dispose();
    this.R.lens.uniforms.uSpeed.value = 0;
    this.R.lens.uniforms.uNitro.value = 0;
    this.audio.idle();
  }
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
