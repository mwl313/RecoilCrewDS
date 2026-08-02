# Stack Decision

**Chosen stack:** TypeScript + Vite + Three.js client, custom authoritative
Node.js simulation, `ws` WebSocket server.

**Why:**

- No installed game engine is present in this environment; a web-native
  TypeScript stack builds, runs, and tests entirely from the command line.
- A dedicated authoritative Node server makes both browser clients symmetric,
  avoids host-tab throttling, and requires no inbound ports on player machines.
- Three.js provides the TPS camera, low-poly rendering, bloom, and asset
  pipeline we need without a native build step.
- The tank game benefits from a small custom arcade physics sim (ground
  heightfield, circle-vs-box collision, impulse recoil). It is deterministic,
  fast to run at 30 Hz on the server, and easy to test in Node.
- Playwright + installed Chrome are available to verify two real browser
  clients end to end.
