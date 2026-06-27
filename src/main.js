import * as THREE from "three";
import { accelFrom, circularSpeed } from "./orbits.js";

// Black Hole Simulation — a 3D accretion-disk simulation.
//
// A dominant central black hole holds thousands of particles on Newtonian
// orbits (a = GM·(h−p) / |h−p|³). Particles that fall inside the capture
// radius are "consumed" and respawned at the disk's outer edge, so the disk
// stays populated and visibly turbulent. The look — temperature-graded colour
// from the hot inner edge outward, plus a glowing photon ring — is inspired by
// real accretion imagery; the dynamics are honest Newtonian gravity, not a
// fixed texture. The force law and orbit helpers live in ./orbits.js, which is
// tested with node:test; this file is the Three.js rendering shell around it.

const canvas = document.getElementById("stage");
const loading = document.getElementById("loading");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0x01010a, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);

const cfg = { count: 12000, mass: 1, ring: true, binary: false, spin: true };
const G = 1.0;
let holes = [];           // [{pos: Vec3, mass, mesh, ringMesh}]
let pos, vel, color, geom, points, alive;
const INNER = 14, OUTER = 70; // disk radii (scene units, mass=1)

// ---------- camera orbit ----------
const orbit = { az: 0.6, el: 0.5, r: 180, tAz: 0.6, tEl: 0.5, tR: 180 };
function updateCamera() {
  orbit.az += (orbit.tAz - orbit.az) * 0.1;
  orbit.el += (orbit.tEl - orbit.el) * 0.1;
  orbit.r += (orbit.tR - orbit.r) * 0.1;
  const e = Math.max(-1.4, Math.min(1.4, orbit.el));
  camera.position.set(
    orbit.r * Math.cos(e) * Math.cos(orbit.az),
    orbit.r * Math.sin(e),
    orbit.r * Math.cos(e) * Math.sin(orbit.az)
  );
  camera.lookAt(0, 0, 0);
}

// ---------- scene build ----------
function buildHoles() {
  for (const h of holes) { scene.remove(h.mesh); if (h.ringMesh) scene.remove(h.ringMesh); }
  holes = [];
  const make = (x, m) => {
    const rs = 6 * Math.cbrt(m); // event-horizon display radius
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(rs, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    mesh.position.x = x;
    scene.add(mesh);
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(rs * 1.5, rs * 0.06, 16, 80),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.x = x;
    scene.add(ringMesh);
    holes.push({ pos: new THREE.Vector3(x, 0, 0), mass: m, rs, mesh, ringMesh });
  };
  if (cfg.binary) { make(-26, cfg.mass * 0.6); make(26, cfg.mass * 0.6); }
  else { make(0, cfg.mass); }
  setRingVisible(cfg.ring);
}
function setRingVisible(v) { for (const h of holes) h.ringMesh.visible = v; }

function temperatureColor(r, out = OUTER) {
  // inner edge = blue-white hot, outer edge = orange-red cool
  const t = Math.min(1, Math.max(0, (r - INNER) / (out - INNER)));
  const hot = new THREE.Color(0.7, 0.85, 1.0);
  const warm = new THREE.Color(1.0, 0.55, 0.2);
  return warm.lerp(hot, 1 - t);
}

function spawnParticle(i, primary) {
  const ang = Math.random() * Math.PI * 2;
  const r = INNER + Math.pow(Math.random(), 0.6) * (OUTER - INNER);
  const thickness = (r / OUTER) * 3.5;
  const px = primary.pos.x + Math.cos(ang) * r;
  const py = (Math.random() - 0.5) * thickness;
  const pz = primary.pos.z + Math.sin(ang) * r;
  // circular orbital speed v = sqrt(mu/r), tangential (mu = G*M of this hole)
  const v = circularSpeed(G * primary.mass * holeMassScale(), r);
  const vx = -Math.sin(ang) * v;
  const vz = Math.cos(ang) * v;
  pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz;
  vel[i * 3] = vx; vel[i * 3 + 1] = (Math.random() - 0.5) * 0.05; vel[i * 3 + 2] = vz;
  const col = temperatureColor(r);
  color[i * 3] = col.r; color[i * 3 + 1] = col.g; color[i * 3 + 2] = col.b;
  alive[i] = 1;
}
function holeMassScale() { return 220; } // tunes speeds so orbits look right at this scale

function buildDisk() {
  const n = cfg.count;
  pos = new Float32Array(n * 3);
  vel = new Float32Array(n * 3);
  color = new Float32Array(n * 3);
  alive = new Uint8Array(n);
  const primary = holes[0];
  for (let i = 0; i < n; i++) spawnParticle(i, primary);

  if (points) { scene.remove(points); geom.dispose(); }
  geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(color, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.5, vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  points = new THREE.Points(geom, mat);
  scene.add(points);
}

// starfield backdrop
function buildStars() {
  const n = 2500;
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 800 + Math.random() * 1500;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    p[i * 3] = r * Math.sin(ph) * Math.cos(th);
    p[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    p[i * 3 + 2] = r * Math.cos(ph);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb0e0, size: 1.1, transparent: true, opacity: 0.6 })));
}

// ---------- physics ----------
function physics() {
  const n = cfg.count;
  const ms = holeMassScale();
  const dt = 0.6;
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const ix = i * 3;
    let ax = 0, ay = 0, az = 0;
    let consumed = false;
    const p = { x: pos[ix], y: pos[ix + 1], z: pos[ix + 2] };
    for (const h of holes) {
      const dx = h.pos.x - p.x, dy = h.pos.y - p.y, dz = h.pos.z - p.z;
      if (dx * dx + dy * dy + dz * dz < h.rs * h.rs) { consumed = true; break; }
      // Newtonian inverse-square pull toward this hole (see orbits.js).
      const a = accelFrom(p, h.pos, G * h.mass * ms);
      ax += a.x; ay += a.y; az += a.z;
    }
    if (consumed) { spawnParticle(i, holes[0]); continue; }
    // symplectic (semi-implicit) Euler: new velocity first, then position.
    vel[ix] += ax * dt; vel[ix + 1] += ay * dt; vel[ix + 2] += az * dt;
    pos[ix] += vel[ix] * dt; pos[ix + 1] += vel[ix + 1] * dt; pos[ix + 2] += vel[ix + 2] * dt;
    // strayed too far → respawn
    const rr = pos[ix] * pos[ix] + pos[ix + 1] * pos[ix + 1] + pos[ix + 2] * pos[ix + 2];
    if (rr > (OUTER * 3) * (OUTER * 3)) spawnParticle(i, holes[0]);
  }
  geom.attributes.position.needsUpdate = true;
  geom.attributes.color.needsUpdate = true;
}

// ---------- loop ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);

let running = true;
function frame() {
  if (running) physics();
  if (cfg.spin) orbit.tAz += 0.0016;
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function init() {
  buildHoles();
  buildStars();
  buildDisk();
  resize();
  loading.style.display = "none";
  frame();
}

// ---------- controls ----------
const out = (k) => document.querySelector(`[data-out="${k}"]`);
document.getElementById("count").addEventListener("change", (e) => {
  cfg.count = +e.target.value; out("count").textContent = cfg.count.toLocaleString(); buildDisk();
});
document.getElementById("count").addEventListener("input", (e) => out("count").textContent = (+e.target.value).toLocaleString());
document.getElementById("mass").addEventListener("input", (e) => {
  cfg.mass = +e.target.value; out("mass").textContent = cfg.mass.toFixed(1); buildHoles(); buildDisk();
});
document.getElementById("ring").addEventListener("input", (e) => { cfg.ring = e.target.checked; setRingVisible(cfg.ring); });
document.getElementById("binary").addEventListener("input", (e) => { cfg.binary = e.target.checked; buildHoles(); buildDisk(); });
document.getElementById("spin").addEventListener("input", (e) => (cfg.spin = e.target.checked));
document.getElementById("collapse").addEventListener("click", () =>
  document.getElementById("panel").classList.toggle("hidden"));

// drag orbit + wheel zoom
let drag = null;
canvas.addEventListener("mousedown", (e) => (drag = { x: e.clientX, y: e.clientY }));
window.addEventListener("mouseup", () => (drag = null));
window.addEventListener("mousemove", (e) => {
  if (!drag) return;
  orbit.tAz -= (e.clientX - drag.x) * 0.006;
  orbit.tEl += (e.clientY - drag.y) * 0.006;
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("wheel", (e) => { e.preventDefault(); orbit.tR = Math.max(50, Math.min(600, orbit.tR * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
canvas.addEventListener("touchstart", (e) => { if (e.touches[0]) drag = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  if (drag && e.touches[0]) { orbit.tAz -= (e.touches[0].clientX - drag.x) * 0.006; orbit.tEl += (e.touches[0].clientY - drag.y) * 0.006; drag = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
  e.preventDefault();
}, { passive: false });

init();

window.__eh = {
  scene, cfg, physics, renderer,
  renderOnce() { resize(); updateCamera(); renderer.render(scene, camera); },
  get particleCount() { return cfg.count; },
  get holeCount() { return holes.length; },
  get aliveCount() { let c = 0; for (let i = 0; i < alive.length; i++) c += alive[i]; return c; },
};
