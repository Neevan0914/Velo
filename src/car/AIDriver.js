import { angleDiff } from '../track/TrackPath.js';
import { rng } from '../gfx/textures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Bot driver: follows a racing line with look-ahead steering, brakes for
 * corners based on the car's own yaw capability, overtakes, and uses nitro
 * on straights.
 */
export class AIDriver {
  constructor(vehicle, seed, skill = 0.95) {
    this.v = vehicle;
    this.r = rng(seed);
    this.skill = skill;              // cornering aggression (fraction of the car's grip)
    this.laneBias = (this.r() - 0.5) * 6;
    this.laneTarget = this.laneBias;
    this.lane = this.laneBias;
    this.nitroUrge = 0.4 + this.r() * 0.6;
    this.mistakeT = 0;
    this.reverseT = 0;
  }

  update(dt, cars, player, locked) {
    const v = this.v, t = v.track, c = v.controls;
    if (locked) { c.throttle = this.r() < 0.5 ? 1 : 0; c.brake = 0; c.steer = 0; c.nitro = false; return; }
    if (v.finished) {
      c.throttle = 0.4; c.brake = 0; c.nitro = false;
    }
    const speed = Math.max(0, v.speedMs);

    // --- choose a lane: racing line toward inside of upcoming corner -------
    let curvAhead = 0;
    for (let k = 20; k < 80; k += 6) curvAhead += t.curv[t.wrap(v.idx + Math.round(k / t.spacing))];
    curvAhead /= 10;
    let lane = this.laneBias * 0.5 + clamp(curvAhead * 900, -5.5, 5.5);

    // avoid cars directly ahead
    for (const o of cars) {
      if (o === v) continue;
      let ds = (o.idx - v.idx) * t.spacing;
      if (ds < -t.length / 2) ds += t.length;
      if (ds > t.length / 2) ds -= t.length;
      if (ds > 0 && ds < 22 && Math.abs(o.lat - this.lane) < 2.6) {
        lane = o.lat + (o.lat > 0 ? -4.2 : 4.2);
        if (o.speed < v.speed - 10) this.blocked = true;
      }
    }
    this.laneTarget = clamp(lane, -t.halfWidth + 1.8, t.halfWidth - 1.8);
    this.lane += clamp(this.laneTarget - this.lane, -6 * dt, 6 * dt);

    // --- steering: pure pursuit ---------------------------------------------
    const look = clamp(7 + speed * 0.42, 8, 34);
    const ti = t.wrap(v.idx + Math.round(look / t.spacing));
    const tp = t.pointAt(ti, this.lane);
    const desired = Math.atan2(tp.x - v.x, tp.z - v.z);
    const err = angleDiff(desired, v.heading);
    c.steer = clamp(err * 2.8, -1, 1);

    // --- speed control: brake for corners ahead ----------------------------
    const brakeA = 40; // m/s^2 (matches PHYSICS.BRAKE ~ 2.4 km/h per tick)
    let allowed = 999;
    const horizon = clamp(speed * speed / (2 * brakeA) + 25, 30, 160);
    for (let d = 0; d < horizon; d += 4) {
      const k = t.absCurv[t.wrap(v.idx + Math.round(d / t.spacing))];
      if (k < 1e-4) continue;
      // speed where yawCapability(v) / v >= k
      let vs = 60;
      for (let it = 0; it < 5; it++) vs = (v.yawCapability(vs) * this.skill) / k;
      const vNow = Math.sqrt(vs * vs + 2 * brakeA * d * 0.85);
      if (vNow < allowed) allowed = vNow;
    }
    this.mistakeT -= dt;
    if (this.mistakeT < -8 && this.r() < dt * 0.05) this.mistakeT = 0.6; // occasional lift
    if (v.finished) allowed = Math.min(allowed, 25);

    if (speed > allowed * 1.03) { c.throttle = 0; c.brake = clamp((speed - allowed) / 8, 0.3, 1); }
    else if (speed > allowed * 0.98 || this.mistakeT > 0) { c.throttle = 0; c.brake = 0; }
    else { c.throttle = 1; c.brake = 0; }

    // --- nitro on straights ----------------------------------------------------
    let straight = true;
    for (let d = 0; d < 180; d += 10) if (t.absCurv[t.wrap(v.idx + Math.round(d / t.spacing))] > 1 / 260) { straight = false; break; }
    c.nitro = !v.finished && straight && speed > 25 && this.r() < dt * 2 * this.nitroUrge;

    // --- rubber band (mild) ------------------------------------------------------
    if (player && !v.finished) {
      const gap = v.progress - player.progress; // laps
      v.capScale = gap > 0.12 ? 0.94 : gap < -0.12 ? 1.06 : 1;
    }

    // --- unstick -------------------------------------------------------------------
    if (v.stuckT > 2.5) { v.respawn(); v.stuckT = 0; }
    if (v.wrongWayT > 1.5) { v.respawn(); v.wrongWayT = 0; }
  }
}
