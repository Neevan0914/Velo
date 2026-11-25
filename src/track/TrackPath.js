import { CatmullRomCurve3, Vector3 } from 'three';

/**
 * Densely sampled closed racing line. Everything that needs to know "where on
 * the circuit am I" (physics walls, lap counting, AI, minimap) uses this.
 */
export class TrackPath {
  constructor(layout, spacing = 1.0) {
    const sc = layout.scale ?? 1.3;
    const pts = layout.points.map(([x, z]) => new Vector3(x * sc, 0, z * sc));
    this.curve = new CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.width = layout.width;
    this.halfWidth = layout.width / 2;
    this.length = this.curve.getLength();
    const n = Math.max(200, Math.round(this.length / spacing));
    this.n = n;
    this.spacing = this.length / n;

    const spaced = this.curve.getSpacedPoints(n);
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.curv = new Float32Array(n); // signed curvature (1/m), + = left turn
    for (let i = 0; i < n; i++) {
      this.px[i] = spaced[i].x;
      this.pz[i] = spaced[i].z;
    }
    for (let i = 0; i < n; i++) {
      const a = this.wrap(i - 1), b = this.wrap(i + 1);
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
    }
    for (let i = 0; i < n; i++) {
      const a = this.wrap(i - 2), b = this.wrap(i + 2);
      const ha = Math.atan2(this.tx[a], this.tz[a]);
      const hb = Math.atan2(this.tx[b], this.tz[b]);
      this.curv[i] = angleDiff(hb, ha) / (4 * this.spacing);
    }
    // smoothed absolute curvature, used by the AI for braking decisions
    this.absCurv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += Math.abs(this.curv[this.wrap(i + k)]);
      this.absCurv[i] = s / 9;
    }
  }

  wrap(i) {
    const n = this.n;
    return ((i % n) + n) % n;
  }

  /** Left-hand normal at sample i. */
  nx(i) { return this.tz[i]; }
  nz(i) { return -this.tx[i]; }

  heading(i) { return Math.atan2(this.tx[i], this.tz[i]); }

  /** Nearest sample index to (x,z). With a hint, only a local window is searched. */
  nearest(x, z, hint = -1, window = 40) {
    let best = -1, bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < this.n; i += 4) {
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      hint = best;
      window = 8;
    }
    for (let k = -window; k <= window; k++) {
      const i = this.wrap(hint + k);
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Signed lateral offset of (x,z) from the centre line at sample i (+ = left). */
  lateral(i, x, z) {
    return (x - this.px[i]) * this.nx(i) + (z - this.pz[i]) * this.nz(i);
  }

  /** World position at sample i offset laterally by `lat` metres. */
  pointAt(i, lat = 0, out = new Vector3()) {
    i = this.wrap(Math.round(i));
    return out.set(this.px[i] + this.nx(i) * lat, 0, this.pz[i] + this.nz(i) * lat);
  }

  /** Minimum distance from (x,z) to the centre line (coarse, global). */
  distanceTo(x, z, step = 3) {
    let best = Infinity;
    for (let i = 0; i < this.n; i += step) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  bounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
    }
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
