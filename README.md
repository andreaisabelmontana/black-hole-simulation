# Black Hole Simulation

A real-time **3D black-hole accretion** simulation. A dominant central mass holds tens of thousands of particles on genuine Newtonian gravitational orbits; whatever crosses the capture radius is consumed and respawns at the disk's edge, so the disk stays alive and turbulent.

**▶ Live:** https://andreaisabelmontana.github.io/black-hole-simulation/

> **Not an original idea.** This recreates the concept of an existing project — I didn't invent it. I rebuilt it from scratch, my own way, out of curiosity about how it actually works.

## The physics (honestly)

The orbital-mechanics core lives in [`src/orbits.js`](src/orbits.js) — framework-free, no Three.js, no DOM — and the demo is the rendering shell around it.

- **Gravity: Newtonian point-mass, inverse-square.** Each massive body pulls a particle with
  `a = G·M·(body − p) / |body − p|³`, i.e. magnitude `G·M/d²` directed toward the body. Several bodies just sum their accelerations (superposition), which is how the binary mode works.
- **Integrator: symplectic (semi-implicit) Euler.** Each step updates the velocity from the acceleration at the current position, then advances the position with the *new* velocity (`v += a·dt; p += v·dt`). It is not RK4 or velocity-Verlet, but being symplectic it keeps bound orbits stable — energy stays bounded instead of drifting away over long runs.
- **Circular seeding:** each particle is launched tangentially at `v = √(μ/r)` (`μ = G·M`), the exact circular-orbit speed at its radius.
- **No relativistic terms.** This is classical gravity throughout. The "event horizon" is a plain capture radius (a particle inside it is removed and respawned), and the **photon ring**, temperature-graded disk colour, and starfield are purely visual — they do not affect the dynamics.

## Conserved quantities (what the tests prove)

For motion under a central force these are physical invariants, and the tests in [`test/orbits.test.js`](test/orbits.test.js) check them on actually-integrated orbits:

- **Specific angular momentum** `L = r × v` is conserved along an integrated orbit (the defining property of central-force motion) — drift held under 0.1%.
- A **seeded circular orbit** at radius `r` with `v = √(μ/r)` stays at ~constant radius over a full period and returns near its start.
- **Acceleration** points toward the centre and obeys the inverse-square law `|a| = μ/r²` (doubling `r` quarters `|a|`).
- The integrator **conserves specific orbital energy** `E = v²/2 − μ/r` within ~2% for a bound elliptical orbit and produces **no NaN/Inf** over tens of thousands of steps.

## Run it

**Demo** — static files, no build step. Serve the folder and open `index.html`:

```
python -m http.server 8000     # then visit http://localhost:8000
```

(Three.js is loaded from a CDN via an import map.)

**Tests** — Node 24, no dependencies:

```
node --test
```

```
✔ acceleration points toward the centre
✔ acceleration magnitude scales as mu / r^2 (inverse square)
✔ superposition: two equal bodies straddling a point cancel on-axis
✔ specific angular momentum r x v is conserved along an integrated orbit
✔ a seeded circular orbit stays at ~constant radius over a full period
✔ integrator conserves orbital energy for a bound ellipse and stays finite
✔ integrate() matches repeated step() and produces no NaN over a long run
✔ circularSpeed obeys v = sqrt(mu/r) and yields the right centripetal accel
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

## Layout

```
index.html              # import map for three.js + HUD
styles.css
src/orbits.js           # tested core: inverse-square gravity, symplectic-Euler step,
                        #   angular-momentum / energy / circular-speed helpers (no deps)
src/main.js             # Three.js shell: scene, particle disk, capture/respawn, controls
test/orbits.test.js     # node:test suite (8 tests)
package.json            # "type":"module", "test":"node --test"
```

## License

MIT — see [LICENSE](LICENSE).
