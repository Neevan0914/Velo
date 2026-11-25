import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Renderer } from '../gfx/Renderer.js';
import { buildCar } from '../car/CarModel.js';
import { CARS } from '../config.js';
const R = new Renderer(document.getElementById('c'));
const pm = new THREE.PMREMGenerator(R.r);
R.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
R.scene.background = new THREE.Color('#202630'); R.r.toneMappingExposure = 0.6;
const q = new URLSearchParams(location.search);
const only = q.get('car');
const list = only ? CARS.filter(c => c.id === only) : CARS;
list.forEach((d, i) => {
  const c = buildCar(d);
  if (!only) c.group.position.set((i % 5) * 6 - 12, 0, Math.floor(i / 5) * -8);
  c.group.rotation.y = Number(q.get('rot') ?? 0.7);
  R.scene.add(c.group);
});
const g = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.6 }));
g.rotation.x = -Math.PI / 2; g.receiveShadow = true; R.scene.add(g);
const dl = new THREE.DirectionalLight('#ffffff', 2); dl.position.set(10, 20, 10); dl.castShadow = true; R.scene.add(dl);
R.scene.add(new THREE.HemisphereLight('#bcd', '#223', 0.6));
const cam = R.camera;
if (only) { cam.position.set(...(q.get('cam') || '5,2.2,6').split(',').map(Number)); cam.lookAt(0, 0.6, 0); }
else { cam.position.set(0, 9, 16); cam.lookAt(0, 0, -4); }
R.r.setAnimationLoop((t) => R.render(1 / 60, t / 1000));
window.__ready = true;
