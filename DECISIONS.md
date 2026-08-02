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

---

## Coordinate and Input Convention

One project-wide convention (also documented in `src/client/tpsCamera.ts`,
`src/shared/sim/tankKinematics.ts`, and `BUGFIX_REPORT_FINAL.md`):

```text
+Y: world up
+Z: chassis forward at yaw 0
+X: chassis right at yaw 0
forward = (sin yaw, 0, cos yaw)
positive yaw: +Z rotates toward +X (clockwise viewed from above)

Mouse right → yaw -= dx * sensitivityX   (invertMouseX = false; standard look-right)
Mouse up    → pitch += -dy * sensitivityY (invertMouseY = false)
A → steer -1 → yaw increases → chassis left (screen-left from behind)
D → steer +1 → yaw decreases → chassis right (screen-right from behind)
Reverse reduces steering strength by a non-sign factor only (never flips A/D)

Turret state is chassis-local.
World muzzle yaw = chassisYaw + turretYawLocal (chassis yaw added exactly once).
Cameras are local-only and never network-corrected.
```

Direction fixes are expressed through the explicit `invertMouseX` /
`invertMouseY` flags, never hidden inside arbitrary negative signs.
