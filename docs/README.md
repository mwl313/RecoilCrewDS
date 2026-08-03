# RECOIL CREW

**One tank. Two brains. Zero brakes.**

Recoil Crew is a two-player online cooperative score-attack browser game. The
**Driver** drives, steers, dashes, jumps, drifts, and collects scrap. The
**Gunner** aims independently, fires a machine gun and a main cannon, and
charges the shared **JACKPOT Shell**. The catch: the cannon's recoil
physically throws the Driver's tank around.

## Docs map

```text
docs/
├── README.md            this file (project readme)
├── guides/              architecture, authoring guides, assets, deploy, smoke test
├── design/              design document + stack decisions
├── map-generation/      seeded map generation plans/reports (Phases 1-3)
├── maplab/              Map Lab plan, user guide, architecture, report
├── bugfix/              bugfix plans/reports
├── planning/            build plan, build status, final reports
└── refractor/           refactor pack: authority docs, phase prompts, status, audit, report
```

Every round is 90 seconds: kill Scrap Bugs, dodge Rammers, destroy Gun Towers,
chase the Loot Truck, chain explosive barrels, and fire at least one JACKPOT
before the final five-second countdown.

## Controls convention

- Mouse right looks right; mouse up looks up (Driver and Gunner).
- A always turns the chassis left; D always turns it right — including while
  reversing (reverse may reduce steering strength, never flips it).
- W is chassis-forward regardless of camera direction.
- R recenters the camera smoothly behind the chassis.
- The Driver's mouse never moves the turret; the Gunner's turret follows the
  centered world aim point while the chassis rotates.
- Space is an edge-triggered jump; Left Shift is an edge-triggered
  chassis-forward dash (an instantaneous burst, never a held boost).

## Map Lab

Recoil Crew Map Lab is a **separate browser tool** that reproduces the
production map generator (same content, seeds, retries, fallback,
validation, and checksums), lets you edit a deep-cloned working profile,
visualize every generation layer, focus validation issues, and export
profile bundles for safe CLI application.

```bash
npm run dev:maplab       # http://localhost:5180
npm run build:maplab     # dist-maplab/
npm run test:maplab      # unit tests
npm run maplab:apply -- ./downloads/profile.json [--overwrite]
```

See [MAP_LAB_USER_GUIDE.md](maplab/MAP_LAB_USER_GUIDE.md).

---

## Quick start

Requirements: Node.js 20+ (developed on Node 24) and npm.

```bash
npm install
npm run build          # production client (dist/) + server (dist-server/)
npm run server         # http://localhost:8080 — serves game + WebSocket
```

Open **http://localhost:8080** in two browser windows (or two machines on your
LAN) to play. Player A clicks **CREATE CREW**, Player B enters the six-letter
code under **JOIN CREW**.

### Development mode

```bash
npm run dev:server     # authoritative server on :8080
npm run dev:client     # Vite dev client on :5173 (proxies /ws to :8080)
```

### Practice

From the main menu, choose **PRACTICE**. WASD drives, mouse aims, left click
fires the machine gun, right click fires the cannon (hold to charge JACKPOT),
Shift dashes, Space jumps. Press **Tab** to swap between Driver and Gunner
camera views. Practice works fully offline with the same shared kinematics.

---

## Controls

| Action | Driver | Gunner |
| --- | --- | --- |
| Move / aim | WASD / arrows, mouse free-look | Mouse TPS aim |
| Fire | — | Left mouse (machine gun) |
| Cannon | — | Right mouse (main cannon) |
| Jump | Space | — |
| Dash | Left Shift | — |
| JACKPOT | — | Hold right mouse to charge |
| Recenter camera | R | R |
| Menu | Esc | Esc |

The Driver's camera is a fully independent free-look TPS camera; the Gunner's
camera is an over-the-shoulder aim camera with a center crosshair. Neither
camera is networked. Each player sees the partner's role in a low-resolution
Picture-in-Picture feed in the bottom-right corner.

---

## What's implemented

- Two-player online rooms with short join codes, ready flow, 3-2-1-GO
  countdown, results, and rematch modifiers in the same room.
- Authoritative Node WebSocket server: shared tank physics (jump/dash
  included), recoil, enemies, damage, pickups, score, Crew Combo, JACKPOT
  meter, timer, wipeout/respawn.
- Edge-triggered Driver actions: one jump per Space press, one chassis-
  forward dash per Shift press, with latched inputs, authoritative edge
  consumption, and local prediction that never double-applies on replay.
- Real-time client: snapshot interpolation, local turret prediction for the
  Gunner, independent TPS cameras with obstacle pull-in, PIP feed, procedural
  audio, pooled particles/explosions/tracers, low-poly industrial arena.
- All six rematch modifiers (Double Barrel, Soap Tracks, Moon Yard, Volatile
  Inventory, Scrap Magnet, Overclocked).
- Data-driven jump height (`tank.jumpHeight`) and dash stats
  (`dashImpulse`, `dashCooldown`, `dashAirMultiplier`,
  `dashMaxHorizontalSpeed`) with runtime stat IDs and movement-rule
  synchronization.
- Scrap Bug, Rammer (telegraph/charge/recovery), Gun Tower (telegraph/bursts),
  and the Loot Truck timed event with guaranteed first-round JACKPOT
  assistance pacing.
- Crew Combo ×1–×5 (beyond ×2 both roles must contribute recently), Crew Link
  bonuses, wipeout penalties, grades D–S and humorous titles.
- Practice mode with camera swap, pause menu, and results.
- Swappable semantic asset registry (see `guides/ASSET_GUIDE.md`).

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev:client` | Vite dev client (port 5173) |
| `npm run dev:server` | Dev server with reload (port 8080) |
| `npm run build` | Production client + server bundles |
| `npm run server` | Run production server (`PORT`, `STATIC_DIR`, `RECOIL_TIME_SCALE` env) |
| `npm test` | Unit/integration tests (vitest) |
| `npm run test:e2e` | Two-browser Playwright end-to-end (90-second round) |
| `npm run test:loop` | Headless two-client full-round + rematch verification |
| `npm run test:demo` | Deterministic golden Demo fixture (byte-exact regression) |

See `guides/DEPLOYMENT.md` for hosting, `guides/SMOKE_TEST.md` for the manual
checklist, and `guides/ASSET_GUIDE.md` for replacing models, UI themes, VFX,
and audio.

## Architecture

The game is data-driven: validated JSON content (`content/`) defines modes,
tanks, loadouts, weapons, projectiles, enemies, drop tables, pickups, items,
effects, spawn pacing, scoring, results, difficulties, and presentation.
The authoritative server resolves rules through an immutable stat service
and replicates revisions + a compact movement block so Driver prediction
stays synchronized. The client is a thin coordinator over focused modules
with an awaited semantic asset service (custom GLBs or registered
procedural fallbacks).

See `guides/ARCHITECTURE.md` and `guides/CONTENT_AUTHORING_GUIDE.md`, plus the
`guides/ADDING_A_*` guides for modes, weapons, enemies, and items.

---

## Project layout

```text
src/shared/   engine-agnostic authoritative simulation + config + arena
src/server/   WebSocket room server + static hosting
src/client/   Three.js renderer, cameras, HUD, audio, VFX, networking
tests/        vitest unit + integration tests
e2e/          Playwright two-browser test
scripts/      headless full-round verification
public/       optional custom assets + manifest
```

The simulation runs identically on the server (online) and in the browser
(practice), so gameplay logic is tested once in Node.
