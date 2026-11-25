import * as THREE from 'three';
import { Renderer } from '../gfx/Renderer.js';
import { World } from '../world/World.js';
import { buildCar } from '../car/CarModel.js';
import { CARS } from '../config.js';
const R = new Renderer(document.getElementById('c'));
const q = new URLSearchParams(location.search);
const t0 = performance.now();
const W = new World(q.get('city') || 'vegas');
W.attach(R.scene, R);
console.log('build ms', (performance.now() - t0).toFixed(0));
const tr = W.track;
const i = tr.wrap(Number(q.get('i') || 0));
const car = buildCar(CARS[Number(q.get('car') || 0)]);
const cp = tr.pointAt(i + 12, 0);
car.group.position.copy(cp); car.group.rotation.y = tr.heading(tr.wrap(i + 12));
R.scene.add(car.group);
const cam = R.camera;
if (q.get('top')) { const b = tr.bounds(); cam.position.set(b.cx, 900, b.cz + 500); cam.lookAt(b.cx, 0, b.cz); cam.far = 8000; cam.updateProjectionMatrix(); }
else {
  const p = tr.pointAt(i, Number(q.get('lat') || 0)); cam.position.set(p.x, Number(q.get('h') || 2.5), p.z);
  const la = tr.pointAt(i + 40, 0); cam.lookAt(la.x, 2, la.z);
}
R.r.setAnimationLoop((t) => { W.update(1/60, t/1000, cam, cp); R.render(1 / 60, t / 1000); });
