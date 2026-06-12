# Event Horizon

A real-time **3D black-hole accretion** simulation. A dominant central mass holds tens of thousands of particles on genuine gravitational orbits; whatever crosses the event horizon is consumed and respawns at the disk's edge, so the disk stays alive and turbulent.

**▶ Live:** https://andreaisabelmontana.github.io/event-horizon/

> **Not an original idea.** This recreates the concept of an existing project — I didn't invent it. I rebuilt it from scratch, my own way, out of curiosity about how it actually works (and tried to make it a little better along the way).

## Features

- **Honest gravity** — every particle is integrated under `a = −GM·r / |r|³`, not animated along a fixed texture
- **Event horizon** — particles inside the Schwarzschild radius are swallowed and re-emitted at the outer disk
- **Temperature-graded disk** — blue-white at the hot inner edge fading to orange-red outward
- Glowing **photon ring**, starfield backdrop, additive-blended glow
- **Binary mode** — two black holes sharing one disk
- Adjustable particle count (2k–40k) and black-hole mass; drag to orbit, scroll to zoom

## Tech

[Three.js](https://threejs.org) (loaded via CDN import map) with a custom particle integrator and a hand-written orbit camera — no extra dependencies, no build step.

```
index.html      # import map for three
styles.css
src/main.js      # scene, particle disk, gravity, event-horizon respawn, controls
```

## License

MIT — see [LICENSE](LICENSE).
