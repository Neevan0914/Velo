import * as THREE from 'three';
import { PHYSICS as P } from '../config.js';
import { angleDiff } from '../track/TrackPath.js';
import { buildCar } from './CarModel.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Arcade vehicle. Speed is tracked in km/h; position in metres on the XZ
 * plane. Heading 0 faces +Z; increasing heading turns left.
 */
export class Vehicle {
  constructor(def, boost, track, { name = 'YOU', isPlayer = false, night = true } = {}) {
    this.def = def;
    this.boost = boost;
    this.track = track;
    this.name = name;
    this.isPlayer = isPlayer;

    this.accel = boost === 'accel' ? P.BOOSTED_ACCEL : P.BASE_ACCEL;
    this.topSpeed = def.topSpeed + (boost === 'velocity' ? P.VELOCITY_BONUS : 0);
    this.nitroCooldownMax = P.NITRO_COOLDOWN - (boost === 'nitro' ? P.NITRO_BOOSTER_REDUCTION : 0);
    this.handling = def.handling;
    this.capScale = 1; // AI rubber-banding

    this.model = buildCar(def, { beams: night });
    this.object = this.model.group;
    if (!night) this.model.beam.visible = false;

    this.controls = { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false };
    this.reset(0, 0);
  }

  reset(idx, lat) {
    const t = this.track;
    const p = t.pointAt(idx, lat);
    this.x = p.x; this.z = p.z;
    this.heading = t.heading(idx);
    this.velAngle = this.heading;
    this.speed = 0;
    this.steer = 0;
    this.idx = idx;
    this.lastIdx = idx;
    this.lap = idx > t.n / 2 ? -1 : 0; // grid is behind the line
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = 0;
    this.nitroTime = 0;
    this.nitroCooldown = 0;
    this.wallHit = 0;
    this.slip = 0;
    this.wrongWayT = 0;
    this.roll = 0; this.pitch = 0;
    this.prev = { x: this.x, z: this.z, h: this.heading };
    this.spin = 0;
    this.lat = lat;
    this.stuckT = 0;
  }

  get progress() { return this.lap + this.idx / this.track.n; }
  get speedMs() { return this.speed / 3.6; }
  get nitroActive() { return this.nitroTime > 0; }
  get nitroReady() { return this.nitroCooldown <= 0 && this.nitroTime <= 0; }

  /** Max yaw rate (rad/s) achievable at speed v (m/s). */
  yawCapability(v) {
    const a = Math.abs(v);
    return this.handling * 1.65 * clamp(a / 10, 0, 1) * (1 - 0.42 * clamp(a / 68, 0, 1));
  }

  step(dt, raceTime, locked) {
    this.prev.x = this.x; this.prev.z = this.z; this.prev.h = this.heading;
    const c = this.controls;
    const tick = dt * 60;

    // --- nitro ---------------------------------------------------------
    if (this.nitroTime > 0) {
      this.nitroTime -= dt;
      if (this.nitroTime <= 0) { this.nitroTime = 0; this.nitroCooldown = this.nitroCooldownMax; }
    } else if (this.nitroCooldown > 0) {
      this.nitroCooldown = Math.max(0, this.nitroCooldown - dt);
    }
    if (!locked && c.nitro && this.nitroReady && this.speed > 5) {
      this.nitroTime = P.NITRO_DURATION;
      this.onNitro?.();
    }

    if (locked) {
      this.speed = 0;
      this.revving = c.throttle;
      return;
    }

    // --- longitudinal ---------------------------------------------------
    const cap = (this.topSpeed + (this.nitroActive ? P.NITRO_SPEED_BONUS : 0)) * this.capScale;
    let a = 0;
    if (c.throttle > 0 && !this.finishedCoast) {
      if (this.speed < 0) a = P.BRAKE;
      else if (this.speed < cap) a = (this.accel + (this.nitroActive ? P.NITRO_EXTRA_ACCEL : 0)) * c.throttle;
    }
    if (c.brake > 0) {
      if (this.speed > 1) a -= P.BRAKE * c.brake;
      else if (this.speed > -P.REVERSE_MAX) a -= P.REVERSE_ACCEL * c.brake;
    }
    if (a === 0 && c.throttle === 0 && c.brake === 0) a = -Math.sign(this.speed) * Math.min(Math.abs(this.speed), P.COAST);
    if (c.handbrake) a -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), P.HANDBRAKE);
    this.speed += a * tick;
    if (this.speed > cap) this.speed = Math.max(cap, this.speed - 0.35 * tick); // bleed off after nitro
    // steering scrub at high speed
    this.speed -= Math.abs(this.steer) * clamp((this.speed - 120) / 100, 0, 1) * 0.12 * tick;

    // --- steering -------------------------------------------------------
    const target = clamp(c.steer, -1, 1);
    const rate = Math.abs(target) > Math.abs(this.steer) ? 6 : 9;
    this.steer += (target - this.steer) * Math.min(1, dt * rate);
    const v = this.speedMs;
    let yaw = this.steer * this.yawCapability(v) * (c.handbrake ? 1.45 : 1);
    if (v < 0) yaw = -yaw;
    this.heading += yaw * dt;

    // grip: direction of travel chases the heading
    const grip = c.handbrake ? 1.6 : 7.5;
    const d = angleDiff(this.heading, this.velAngle);
    this.velAngle += d * Math.min(1, grip * dt);
    this.slip = angleDiff(this.heading, this.velAngle);
    this.speed *= 1 - Math.min(0.5, Math.abs(this.slip)) * 0.012 * tick;

    // --- integrate --------------------------------------------------------
    const dirSign = 1;
    this.x += Math.sin(this.velAngle) * v * dt * dirSign;
    this.z += Math.cos(this.velAngle) * v * dt * dirSign;

    this.constrain(dt);
    this.updateLap(raceTime);

    // wrong way detection
    const t = this.track;
    const fwd = Math.sin(this.heading) * t.tx[this.idx] + Math.cos(this.heading) * t.tz[this.idx];
    this.wrongWayT = fwd < -0.3 && this.speed > 10 ? this.wrongWayT + dt : 0;
    this.stuckT = Math.abs(this.speed) < 4 ? this.stuckT + dt : 0;

    // body motion targets
    this.spin += (v * dt) / this.model.wheelR;
    this.rollTarget = clamp(-yaw * v * 0.0045, -0.07, 0.07);
    this.pitchTarget = clamp(-a * 0.025, -0.05, 0.05);
    this.lastAccel = a;
  }

  constrain(dt) {
    const t = this.track;
    this.idx = t.nearest(this.x, this.z, this.idx);
    const lat = t.lateral(this.idx, this.x, this.z);
    this.lat = lat;
    const limit = t.halfWidth + 0.15;
    this.wallHit = 0;
    if (Math.abs(lat) > limit) {
      const s = Math.sign(lat);
      const over = lat - s * limit;
      this.x -= t.nx(this.idx) * over;
      this.z -= t.nz(this.idx) * over;
      // remove the into-wall velocity component and scrub speed
      const th = t.heading(this.idx);
      const forward = Math.cos(angleDiff(this.velAngle, th)) >= 0;
      const along = forward ? th : th + Math.PI;
      const impact = Math.abs(Math.sin(angleDiff(this.velAngle, along)));
      this.speed *= 1 - Math.min(0.6, impact * 0.9) - 0.006;
      this.velAngle = along + angleDiff(this.velAngle, along) * 0.1;
      this.heading += angleDiff(along, this.heading) * Math.min(1, 4 * dt) * impact;
      this.wallHit = Math.max(0.15, impact) * Math.min(1, Math.abs(this.speed) / 80);
      this.wallSide = s;
    }
  }

  updateLap(raceTime) {
    const t = this.track;
    const d = this.idx - this.lastIdx;
    if (d < -t.n / 2) {
      this.lap += 1;
      if (this.lap >= 1) {
        const lt = raceTime - this.lapStart;
        this.lapTimes.push(lt);
        this.bestLap = Math.min(this.bestLap, lt);
        this.onLap?.(this.lap, lt);
      }
      this.lapStart = raceTime;
      if (this.lap >= P.LAPS && !this.finished) {
        this.finished = true;
        this.finishTime = raceTime;
        this.onFinish?.(raceTime);
      }
    } else if (d > t.n / 2) {
      this.lap -= 1;
    }
    this.lastIdx = this.idx;
  }

  /** Respawn on the centre line (R key / stuck recovery). */
  respawn() {
    const t = this.track;
    const i = this.idx;
    const p = t.pointAt(i, 0);
    this.x = p.x; this.z = p.z;
    this.heading = this.velAngle = t.heading(i);
    this.speed = Math.min(this.speed, 30);
    this.prev = { x: this.x, z: this.z, h: this.heading };
  }

  /** Push visuals to the scene graph (alpha = interpolation factor). */
  sync(alpha, dt, camera) {
    const x = this.prev.x + (this.x - this.prev.x) * alpha;
    const z = this.prev.z + (this.z - this.prev.z) * alpha;
    const h = this.prev.h + angleDiff(this.heading, this.prev.h) * alpha;
    const o = this.object;
    o.position.set(x, 0, z);
    o.rotation.y = h;
    this.roll += ((this.rollTarget || 0) - this.roll) * Math.min(1, dt * 6);
    this.pitch += ((this.pitchTarget || 0) - this.pitch) * Math.min(1, dt * 5);
    const body = this.model.body;
    body.rotation.z = this.roll;
    body.rotation.x = this.pitch;
    body.position.y = 0.01 + Math.sin(performance.now() * 0.03) * 0.002 * Math.min(1, Math.abs(this.speed) / 50);
    for (const w of this.model.wheels) {
      w.spin.rotation.x = this.spin;
      if (w.front) w.pivot.rotation.y = this.steer * 0.42;
    }
    // brake lights / nitro flames
    const braking = this.controls.brake > 0 && this.speed > 1;
    this.model.tail.emissiveIntensity = braking ? 9 : 3.2;
    if (camera) {
      const dx = camera.position.x - x, dz = camera.position.z - z;
      const f = (Math.sin(h) * dx + Math.cos(h) * dz) / (Math.hypot(dx, dz) || 1);
      this.model.flareMat.opacity = clamp(f * 1.6, 0, 0.9);
      this.model.tailFlareMat.opacity = clamp(-f * 1.2, 0, 0.55) + (braking ? 0.35 : 0);
    }
    const n = this.nitroActive ? 1 : 0;
    const fm = this.model.flameMat;
    fm.opacity += ((n ? 0.95 : 0) - fm.opacity) * Math.min(1, dt * 12);
    if (n) {
      const f = 0.8 + Math.random() * 0.5;
      fm.color.setRGB(0.4 * f * 3, 0.65 * f * 3, 1.0 * f * 3);
      for (const fl of this.model.flames) fl.scale.set(1, 0.8 + Math.random() * 0.6, 1);
    }
  }

  dispose() { this.model.dispose(); }
}
