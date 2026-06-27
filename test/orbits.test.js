// Tests for the orbital-mechanics core (src/orbits.js).
//
// These check the real physical properties of the demo's integrator, not just
// that the functions return numbers:
//   1. specific angular momentum L = r x v is conserved along a central-force orbit
//   2. a seeded circular orbit stays at ~constant radius over a full period
//   3. acceleration points to the centre and obeys the inverse-square law
//   4. the symplectic integrator conserves orbital energy for a bound ellipse
//      and never produces NaN/Inf over many steps
//
// Run with:  node --test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accelFrom,
  accelTotal,
  circularSpeed,
  cross,
  dot,
  length,
  sub,
  integrate,
  specificAngularMomentum,
  specificEnergy,
  step,
} from "../src/orbits.js";

const ORIGIN = { x: 0, y: 0, z: 0 };

// A single central body at the origin, gravitational parameter mu.
function centralBody(mu) {
  return [{ pos: { ...ORIGIN }, mu }];
}

test("acceleration points toward the centre", () => {
  const mu = 100;
  const p = { x: 5, y: 0, z: 0 };
  const a = accelFrom(p, ORIGIN, mu);
  // body is at origin, particle at +x, so pull must be along -x
  assert.ok(a.x < 0, "x-acceleration should be negative (toward centre)");
  assert.equal(a.y, 0);
  assert.equal(a.z, 0);

  // off-axis: acceleration must be anti-parallel to the position vector
  const q = { x: 3, y: 4, z: 0 };
  const aq = accelFrom(q, ORIGIN, mu);
  const rhat = { x: q.x / 5, y: q.y / 5, z: q.z / 5 };
  const ahat = { x: aq.x / length(aq), y: aq.y / length(aq), z: aq.z / length(aq) };
  // dot(rhat, ahat) should be -1 (exactly opposite)
  assert.ok(Math.abs(dot(rhat, ahat) + 1) < 1e-12);
});

test("acceleration magnitude scales as mu / r^2 (inverse square)", () => {
  const mu = 250;
  const mag = (r) => length(accelFrom({ x: r, y: 0, z: 0 }, ORIGIN, mu));

  // |a| = mu / r^2 exactly
  for (const r of [2, 5, 10, 37.5]) {
    assert.ok(Math.abs(mag(r) - mu / (r * r)) < 1e-9, `magnitude wrong at r=${r}`);
  }

  // doubling r should quarter the acceleration
  const a1 = mag(4);
  const a2 = mag(8);
  assert.ok(Math.abs(a1 / a2 - 4) < 1e-9, "inverse-square ratio should be 4");
});

test("superposition: two equal bodies straddling a point cancel on-axis", () => {
  const bodies = [
    { pos: { x: -10, y: 0, z: 0 }, mu: 100 },
    { pos: { x: 10, y: 0, z: 0 }, mu: 100 },
  ];
  const a = accelTotal({ x: 0, y: 0, z: 0 }, bodies);
  assert.ok(Math.abs(a.x) < 1e-12 && Math.abs(a.y) < 1e-12 && Math.abs(a.z) < 1e-12);
});

test("specific angular momentum r x v is conserved along an integrated orbit", () => {
  const mu = 300;
  const bodies = centralBody(mu);

  // start an eccentric-ish orbit: 60% of circular speed, tangential
  const r0 = 20;
  const pos0 = { x: r0, y: 0, z: 0 };
  const vCirc = circularSpeed(mu, r0);
  const vel0 = { x: 0, y: 0.6 * vCirc, z: 0 };

  const L0 = specificAngularMomentum(pos0, vel0, ORIGIN);
  const L0mag = length(L0);

  // integrate many small steps and check L stays put
  let pos = { ...pos0 }, vel = { ...vel0 };
  const dt = 0.01;
  let maxDrift = 0;
  for (let i = 0; i < 20000; i++) {
    ({ pos, vel } = step(pos, vel, bodies, dt));
    const L = specificAngularMomentum(pos, vel, ORIGIN);
    const drift = length(sub(L, L0)) / L0mag;
    if (drift > maxDrift) maxDrift = drift;
  }
  // central force => L exactly conserved in theory; symplectic Euler keeps it
  // extremely tight (well under 0.1%).
  assert.ok(maxDrift < 1e-3, `angular-momentum drift too large: ${maxDrift}`);

  // it should also still be (nearly) planar in the xy-plane it started in
  const L = specificAngularMomentum(pos, vel, ORIGIN);
  assert.ok(Math.abs(L.x) < 1e-6 && Math.abs(L.y) < 1e-6);
});

test("a seeded circular orbit stays at ~constant radius over a full period", () => {
  const mu = 400;
  const bodies = centralBody(mu);
  const r0 = 25;
  const v = circularSpeed(mu, r0);

  const pos0 = { x: r0, y: 0, z: 0 };
  const vel0 = { x: 0, y: v, z: 0 };

  // period of a circular orbit: T = 2*pi*r / v
  const T = (2 * Math.PI * r0) / v;
  const dt = 0.005;
  const steps = Math.round(T / dt);

  let pos = { ...pos0 }, vel = { ...vel0 };
  let rMin = r0, rMax = r0;
  for (let i = 0; i < steps; i++) {
    ({ pos, vel } = step(pos, vel, bodies, dt));
    const r = length(pos);
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
  }
  // radius should barely wobble around r0
  assert.ok(Math.abs(rMin - r0) / r0 < 0.02, `rMin drifted: ${rMin}`);
  assert.ok(Math.abs(rMax - r0) / r0 < 0.02, `rMax drifted: ${rMax}`);

  // and it should have come back near where it started after one period
  const back = length(sub(pos, pos0)) / r0;
  assert.ok(back < 0.05, `did not return near start after one period: ${back}`);
});

test("integrator conserves orbital energy for a bound ellipse and stays finite", () => {
  const mu = 500;
  const bodies = centralBody(mu);

  const r0 = 30;
  const vCirc = circularSpeed(mu, r0);
  // 0.8 * circular => bound elliptical orbit (E < 0), perihelion inside r0
  const pos0 = { x: r0, y: 0, z: 0 };
  const vel0 = { x: 0, y: 0.8 * vCirc, z: 0 };

  const E0 = specificEnergy(pos0, vel0, mu, ORIGIN);
  assert.ok(E0 < 0, "orbit should be bound (negative specific energy)");

  let pos = { ...pos0 }, vel = { ...vel0 };
  const dt = 0.005;
  let maxRelErr = 0;
  for (let i = 0; i < 60000; i++) {
    ({ pos, vel } = step(pos, vel, bodies, dt));
    assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z),
      `non-finite position at step ${i}`);
    assert.ok(Number.isFinite(vel.x) && Number.isFinite(vel.y) && Number.isFinite(vel.z),
      `non-finite velocity at step ${i}`);
    const E = specificEnergy(pos, vel, mu, ORIGIN);
    const relErr = Math.abs((E - E0) / E0);
    if (relErr > maxRelErr) maxRelErr = relErr;
  }
  // symplectic Euler does not conserve energy exactly, but it BOUNDS the error
  // (no secular drift). 2% is comfortable for this dt/orbit.
  assert.ok(maxRelErr < 0.02, `energy error grew too large: ${maxRelErr}`);
});

test("integrate() matches repeated step() and produces no NaN over a long run", () => {
  const mu = 200;
  const bodies = centralBody(mu);
  const pos0 = { x: 15, y: 0, z: 0 };
  const vel0 = { x: 0, y: 0.9 * circularSpeed(mu, 15), z: 0 };

  const viaIntegrate = integrate(pos0, vel0, bodies, 0.01, 5000);
  assert.ok(Number.isFinite(viaIntegrate.pos.x));
  assert.ok(Number.isFinite(viaIntegrate.vel.y));

  // it should still be on a sane, bound radius (not flung to infinity, not NaN)
  const r = length(viaIntegrate.pos);
  assert.ok(r > 1 && r < 200, `radius left a sane range: ${r}`);

  // cross-check that integrate == manual stepping
  let pos = { ...pos0 }, vel = { ...vel0 };
  for (let i = 0; i < 5000; i++) ({ pos, vel } = step(pos, vel, bodies, 0.01));
  assert.ok(length(sub(pos, viaIntegrate.pos)) < 1e-9);
});

test("circularSpeed obeys v = sqrt(mu/r) and yields the right centripetal accel", () => {
  const mu = 123;
  const r = 7;
  const v = circularSpeed(mu, r);
  assert.ok(Math.abs(v - Math.sqrt(mu / r)) < 1e-12);
  // for a circle, required centripetal accel v^2/r must equal gravity mu/r^2
  const centripetal = (v * v) / r;
  const gravity = length(accelFrom({ x: r, y: 0, z: 0 }, ORIGIN, mu));
  assert.ok(Math.abs(centripetal - gravity) < 1e-9);
});
