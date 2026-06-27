// orbits.js — the orbital-mechanics core of the black-hole accretion sim.
//
// Framework-free: no Three.js, no DOM. Pure Newtonian point-mass gravity with
// a symplectic (semi-implicit) Euler integrator — exactly the scheme the demo
// runs, just lifted out of the render loop so it can be tested in isolation.
//
// Physics model (be honest about it):
//   * Gravity is Newtonian and inverse-square. Each massive body ("hole") pulls
//     a test particle with acceleration  a = G * M * (h - p) / |h - p|^3 ,
//     i.e. magnitude G*M/d^2 directed from the particle toward the body. With
//     several bodies the accelerations simply sum (used for the binary mode).
//   * The integrator is symplectic Euler: update velocity from the acceleration
//     at the current position, then advance the position with the NEW velocity.
//     This is what the demo does (v += a*dt; p += v*dt). It is not RK4 and not
//     velocity-Verlet, but being symplectic it keeps bound orbits stable and
//     does not let energy drift away over long runs.
//   * There are NO relativistic terms anywhere. The "event horizon" is a plain
//     capture radius; "photon ring" and disk colouring are purely cosmetic in
//     the demo and live nowhere in this core.
//
// Vectors are plain { x, y, z } objects. Everything is allocation-light but
// favours clarity over raw speed; the demo's hot loop uses flat typed arrays.

/** Vector subtraction a - b. */
export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** Vector addition a + b. */
export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Scale vector v by scalar s. */
export function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/** Dot product. */
export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Cross product a x b. */
export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Euclidean length |v|. */
export function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Gravitational acceleration on a particle at position `p` due to one body.
 *
 *   a = G * M * (body - p) / |body - p|^3
 *
 * The vector (body - p) points from the particle toward the body, so the
 * acceleration is attractive (toward the centre) and its magnitude is the
 * inverse-square law G*M/d^2.
 *
 * @param {{x,y,z}} p     particle position
 * @param {{x,y,z}} body  position of the massive body (the "hole")
 * @param {number}  mu    gravitational parameter G*M of the body
 * @returns {{x,y,z}} acceleration vector
 */
export function accelFrom(p, body, mu) {
  const dx = body.x - p.x;
  const dy = body.y - p.y;
  const dz = body.z - p.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const d = Math.sqrt(d2);
  const inv = mu / (d2 * d); // = mu / d^3, so a = mu/d^2 along the unit vector
  return { x: dx * inv, y: dy * inv, z: dz * inv };
}

/**
 * Total gravitational acceleration on a particle from a list of bodies.
 * Accelerations from each body are summed (superposition), which is what the
 * demo's binary-black-hole mode relies on.
 *
 * @param {{x,y,z}} p
 * @param {Array<{pos:{x,y,z}, mu:number}>} bodies
 * @returns {{x,y,z}}
 */
export function accelTotal(p, bodies) {
  let ax = 0, ay = 0, az = 0;
  for (const b of bodies) {
    const a = accelFrom(p, b.pos, b.mu);
    ax += a.x; ay += a.y; az += a.z;
  }
  return { x: ax, y: ay, z: az };
}

/**
 * One symplectic (semi-implicit) Euler step for a particle in the field of the
 * given bodies. Mutates and returns a fresh {pos, vel}:
 *
 *   a      = accelTotal(pos, bodies)
 *   velNew = vel + a * dt
 *   posNew = pos + velNew * dt        // NEW velocity — this is what makes it
 *                                     // symplectic rather than plain Euler
 *
 * @param {{x,y,z}} pos
 * @param {{x,y,z}} vel
 * @param {Array<{pos:{x,y,z}, mu:number}>} bodies
 * @param {number} dt
 * @returns {{pos:{x,y,z}, vel:{x,y,z}}}
 */
export function step(pos, vel, bodies, dt) {
  const a = accelTotal(pos, bodies);
  const velNew = {
    x: vel.x + a.x * dt,
    y: vel.y + a.y * dt,
    z: vel.z + a.z * dt,
  };
  const posNew = {
    x: pos.x + velNew.x * dt,
    y: pos.y + velNew.y * dt,
    z: pos.z + velNew.z * dt,
  };
  return { pos: posNew, vel: velNew };
}

/**
 * Specific angular momentum L = r x v (per unit mass), measured about a centre.
 * For motion under a single central force this vector is conserved — that is
 * the defining property of central-force motion and the main thing the tests
 * check.
 *
 * @param {{x,y,z}} pos
 * @param {{x,y,z}} vel
 * @param {{x,y,z}} [center={x:0,y:0,z:0}]
 * @returns {{x,y,z}}
 */
export function specificAngularMomentum(pos, vel, center = { x: 0, y: 0, z: 0 }) {
  return cross(sub(pos, center), vel);
}

/**
 * Specific orbital energy (per unit mass) for a single central body:
 *
 *   E = v^2 / 2  -  mu / r
 *
 * Negative E means a bound (elliptical) orbit. The symplectic integrator keeps
 * this very close to constant over long bound orbits, which the tests verify.
 *
 * @param {{x,y,z}} pos
 * @param {{x,y,z}} vel
 * @param {number}  mu      gravitational parameter G*M of the central body
 * @param {{x,y,z}} [center={x:0,y:0,z:0}]
 * @returns {number}
 */
export function specificEnergy(pos, vel, mu, center = { x: 0, y: 0, z: 0 }) {
  const r = length(sub(pos, center));
  const v2 = dot(vel, vel);
  return v2 / 2 - mu / r;
}

/**
 * Speed of a circular orbit at radius r about a body of gravitational
 * parameter mu:  v = sqrt(mu / r).  This is exactly how the demo seeds each
 * particle's tangential velocity.
 *
 * @param {number} mu
 * @param {number} r
 * @returns {number}
 */
export function circularSpeed(mu, r) {
  return Math.sqrt(mu / r);
}

/**
 * Integrate a particle forward by `steps` symplectic-Euler steps of size `dt`,
 * returning the final {pos, vel}. Convenience wrapper used by both the demo
 * (conceptually) and the tests.
 *
 * @param {{x,y,z}} pos0
 * @param {{x,y,z}} vel0
 * @param {Array<{pos:{x,y,z}, mu:number}>} bodies
 * @param {number} dt
 * @param {number} steps
 * @returns {{pos:{x,y,z}, vel:{x,y,z}}}
 */
export function integrate(pos0, vel0, bodies, dt, steps) {
  let pos = { ...pos0 };
  let vel = { ...vel0 };
  for (let i = 0; i < steps; i++) {
    ({ pos, vel } = step(pos, vel, bodies, dt));
  }
  return { pos, vel };
}
