import * as THREE from 'three';
import { glowTexture } from '../gfx/textures.js';

/** CPU-simulated point sprites (sparks, tyre smoke, nitro embers). */
class Pool {
  constructor(max, blending) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const additive = blending === THREE.AdditiveBlending;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; varying vec3 vC;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.003) discard;
          ${additive ? 'gl_FragColor = vec4(vC * a, 1.0);' : 'gl_FragColor = vec4(vC, a);'} }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.geo = g;
  }

  emit(x, y, z, vx, vy, vz, r, g, b, size, life, grow = 0, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b], i * 3);
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.grav[i] = grav;
    this.alpha[i] = 1;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02 && this.grav[i] > 0) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; }
      this.vel[k] *= 1 - dt * 1.5; this.vel[k + 2] *= 1 - dt * 1.5;
      this.size[i] += this.grow[i] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = f * f;
    }
    for (const n of ['position', 'color', 'size', 'alpha']) this.geo.attributes[n].needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.glow = new Pool(1200, THREE.AdditiveBlending);
    this.smoke = new Pool(700, THREE.NormalBlending);
    this.smoke.points.renderOrder = 3;
    this.glow.points.renderOrder = 4;
    scene.add(this.smoke.points, this.glow.points);
    this.scene = scene;
  }

  sparks(x, y, z, dirX, dirZ, n = 6) {
    for (let i = 0; i < n; i++) {
      const s = 4 + Math.random() * 10;
      this.glow.emit(x, y, z, dirX * s + (Math.random() - 0.5) * 6, 2 + Math.random() * 4, dirZ * s + (Math.random() - 0.5) * 6,
        4, 2.2 + Math.random(), 0.6, 0.06 + Math.random() * 0.06, 0.25 + Math.random() * 0.35, 0, 12);
    }
  }

  smokePuff(x, y, z, vx, vz, tone = 0.55, size = 0.6) {
    this.smoke.emit(x, y, z, vx + (Math.random() - 0.5), 0.6 + Math.random() * 0.8, vz + (Math.random() - 0.5),
      tone, tone, tone * 1.04, size, 0.9 + Math.random() * 0.6, 2.2, -0.2);
  }

  ember(x, y, z, vx, vz) {
    this.glow.emit(x, y, z, vx + (Math.random() - 0.5) * 2, 0.3 + Math.random(), vz + (Math.random() - 0.5) * 2,
      1.0, 1.9, 5, 0.05 + Math.random() * 0.04, 0.12 + Math.random() * 0.12, -0.1, 0);
  }

  update(dt) { this.glow.update(dt); this.smoke.update(dt); }

  dispose() {
    this.scene.remove(this.glow.points, this.smoke.points);
    for (const p of [this.glow, this.smoke]) { p.geo.dispose(); p.points.material.dispose(); }
  }
}
