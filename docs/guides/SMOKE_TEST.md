# Manual Smoke Test

Run the production server, then follow this checklist. Each item should
complete without console errors.

```bash
npm install && npm run build && npm run server
```

## 1. Two local browser tabs

1. Open `http://localhost:8080` in Chrome and Edge (or two Chrome windows).
2. Player A: **CREATE CREW** → a six-character code appears and role shows
   **DRIVER**.
3. Player B: **JOIN CREW** → type the code (uppercase auto-applied) → role
   shows **GUNNER**.
4. Both press **READY** → countdown 3-2-1-GO → both enter the same tank.

## 2. Two separate networks

Deploy per `DEPLOYMENT.md`, or expose port 8080 temporarily. Player A creates
the crew on their machine; Player B joins from another network with the code.
The flow must be identical — no IP knowledge or router configuration.

## 3. Single Player

Main menu → **SINGLE PLAYER** (there is no Practice button anymore). One
player controls everything: WASD drives, Shift dashes, Space jumps, mouse
aims, LMB fires MG, RMB fires cannon (hold when JACKPOT is ready to charge).
There is no DRIVER/GUNNER chip, no connection dot, and no ping. Tab/Q do
nothing. Esc opens the pause menu; results offer **PLAY AGAIN** (fresh local
match) and **MAIN MENU**. Killing the server mid-round must not interrupt the
local match.

### Trajectory reticle

The crosshair shows the actual predicted shot line:

- With the turret converged, the reticle sits at the camera aim point.
- Flick the mouse hard: the reticle honestly trails off-center while the
  turret catches up, then settles back.
- Back against a wall/escarpment so the muzzle is near cover: the reticle
  turns red and rests on the obstacle instead of showing a line through it.
- Turn the camera 180° away: the reticle hides (off-screen policy), never
  shows NaN, and returns when the shot line is visible again.

### Tank rig alignment

Fire MG and cannon in Single Player: flash must appear at the barrel tip, and
the reticle must match the flash direction at rest. Repeating the check after
a `rig` edit in `content/tanks/default.json` verifies the data-driven mount
end to end.

## Combat 05 feel checks

- Drive fast through a Scrap Bug: it takes no damage. Dash through it: it
  dies (one dash for Scrap Bugs).
- Fall from a cliff: no damage to tank or enemies; landing grip still
  applies.
- Move the mouse fast in Gunner/Single Player: the turret is on the mouse
  instantly (no chase). Fire the cannon immediately after a flick: the shot
  follows the release aim.
- Without the relic, RMB fires instantly. With `cannon.charge` granted, hold
  RMB: the reticle meter fills; tap fires a normal shell; hold to full and
  keep holding — it never auto-fires; release for the big shot.

## 4. Pointer lock

## 5. Refactor validation (automated)

Run `npm test` and `npm run test:demo`; the deterministic golden Demo must
be byte-identical. `tests/proofContent.test.ts` validates the alternate
mode (truck-escape completion), the Rapid Cannon proof weapon, the
composed Test Hound enemy, and the Overdrive Cannon item; room rules
isolation, invalid-content failure, and custom-asset replacement
(manifest GLB via injected loader) are covered by the unit suites.

After GO, click the canvas → cursor locks. Mouse look is immediate for both
roles. Esc unlocks and opens the pause menu; Resume re-locks.

Direction check: mouse right looks right, mouse up looks up (both roles).
The pause overlay neutralizes gameplay input; blur/refocus never leaves a
stuck key.

## 5. Driver controls

- W accelerates, S reverses, A/D steer (chassis-relative).
- A turns left and D turns right even while reversing (strength may reduce,
  direction never flips).
- Shift dashes — one instantaneous chassis-forward burst per press; holding
  Shift never sprints or repeats.
- Space jumps — one jump per press; holding Space never repeats; land,
  release, and press again to jump again.
- R recenters the camera behind the chassis.
- Driving feels immediate (local prediction) and settles smoothly to the
  server state; the tank no longer visibly steps at snapshot rate.
- Dash and recoil do not push the tank through walls; the nose never sinks
  into obstacles; the camera never clips the tank, floor, walls, or corners.

## 5a. Generated maps (Phases 1-3)

- Online rounds run on a deterministic generated 400×400 arena: the server
  selects a seed per room/match and the client regenerates it, verifying
  the published checksum before GO. A mismatch shows **Connection lost /
  map checksum** style error and never starts the round.
- Rematch rerolls a new seed/map in the same room; reconnect during a round
  resumes the identical map (same checksum).
- Practice uses the same generator/queries with a local seed and rerolls
  per practice round.
- Terrain renders as chunked heightfield with LOD + fog; `?debug=1` + F3
  shows the mapgen overlay (seed, checksum, features, routes, zones,
  spawns/gates, ramps, recovery, colliders).
- Dramatic/cliff maps (e.g. `map.cliffArena`): steep optional terrain is
  allowed; the tank cannot climb cliff walls upward (stops at the base),
  can fall off a top into normal airborne physics, and the required roads
  stay driveable. Cliff walls render as vertical faces matching the
  heightfield, and the camera pulls in instead of clipping through them.
  Rematch rerolls; reconnect reproduces the same walls/checksum.

## 5b. Map Lab

```bash
npm run build:maplab
npx vite preview --config tools/maplab/vite.config.ts --port 8098
```

Open `http://localhost:8098`:

- Primary profile loads and generates a Production map with **PASS** and a
  checksum equal to the in-game metadata pipeline.
- Change a terrain parameter (e.g. Terrain Drama) → auto-regeneration
  updates metrics; Undo/Redo/Reset behave.
- Toggle layers (terrain, routes, zones, spawns/gates, ramps, furniture,
  validation) without regeneration; switch 3D ↔ Top Down and Fit Map.
- Turn **Objects** off → routes/spawns/gates remain, object counts drop to
  0; turn back on → counts return.
- Click a validation issue → related layer activates and camera focuses.
- Export Profile / Arena / Validation; reload restores the draft with the
  same working state.
- Apply an exported profile via `npm run maplab:apply -- <file>`
  (requires `--overwrite` for existing ids) and rerun
  `npm run test:maps` before committing.
- Map Lab now includes `map.dramaticHighlands` and `map.cliffArena` in the
  profile dropdown; **TERRAIN** shows Terrain Classes + Cliff Plateau/
  Escarpment controls, and the layer drawer shows driveable/risky/blocked
  masks, cliff top/bottom/walls, protected traversal, safety buffer,
  access routes, and terrain cost. If every attempt fails, a red
  **FALLBACK MAP** banner lists each attempt's seed and errors.

## 5c. Refractor 02 presentation

- All screens (boot/main/create/join/ready/countdown/pause/error/results/
  howto) are content-driven; ids and actions are unchanged.
- `npm run dev:presentation-preview` (port 5190) previews every scene and
  HUD state with role/theme selectors, hierarchy, and binding/asset
  diagnostics; `?stable=1` disables animations.
- The gameplay HUD reads a typed view model; Driver/Gunner themes come from
  `content/themes/*.json`. Custom project assets are registered in
  `content/assets/project.json`; built-in fallbacks remain intact.

## 6. Gunner controls

- Mouse aims; crosshair is center-screen; the turret follows instantly.
- While the Driver turns the chassis, the turret keeps the aimed world point.
- LMB fires the machine gun with tracers; RMB fires the cannon.
- Cannon recoil visibly shoves/spins the shared tank within 10 seconds.

## 7. PIP

Bottom-right shows the partner role feed (`DRIVER FEED` / `GUNNER FEED`) with
an action label (JUMPING, DASHING, CHARGING, DRIVING…). The connection dot
stays green; close one tab and it turns red (reconnect within 10 s by
refreshing with the same session — the retry path offers Practice).

## 8. First pickup

Kill a Scrap Bug (Gunner), drive through its scrap (Driver) → pickup chime,
green burst, score and JACKPOT meter rise.

## 9. Loot Truck

At ~42 s the Loot Truck appears with a gold marker and siren. Destroy it for a
shower of JACKPOT scrap. If it escapes, the meter still reaches JACKPOT via
assistance pacing.

## 10. JACKPOT

At ~55–70 s the meter reaches full. Gunner sees **HOLD RIGHT MOUSE TO
CHARGE**; the Driver sees the gunner-charge prompt. A charged shot produces
a huge flash, massive recoil, chain detonations, and a scrap shower — recoil
is always full strength (no brace reduction).

## 11. Wipeout

Stand still near Rammers/towers to reach 0 integrity: dramatic explosion,
3-second respawn, 2-second shield, score penalty, combo reset — the round
continues and never ends early.

## 12. Results and rematch

At 90 s both clients show results (score, best combo, JACKPOT count, grade,
humorous title). Pick a modifier on both sides → countdown → fresh round in
the same room with the modifier applied.

## 13. Disconnect

Kill the server during a round → both clients show the connection screen with
**RETRY**, **PRACTICE**, and **MAIN MENU**. Restart the server, click RETRY,
and the crew rejoins (session-based reconnect during the grace window).

## 14. Room-code copy

The Copy button is disabled until a real code exists. Clicking it copies via
the Clipboard API and shows success/error feedback; if the API is blocked the
code is selected in a textarea fallback so it can still be copied manually.

## Automated equivalents

- **Arcade movement:** jump launches higher and floatier; steer while
  airborne to face the landing; aim the cannon down and fire to launch the
  tank; MG recoil is a smooth continuous push; cannon splash pushes enemies
  (never the tank); Gun Towers never move.

- **Netcode (network03):** F4 opens the netcode overlay — snapshot rate
  ~20 Hz, RTT, pending queues, corrections, camera/aim query times. Gunner:
  a very short right-click fires immediately with same-frame flash/audio,
  recoil reaches both screens together, and the Gunner camera follows the
  shared predicted tank (not the old delayed interpolation timeline).
- `npm test` — 270 unit/integration tests (25 files), including the full
  jump/dash edge, parity, replay, rules, and Demo regression matrix.
- `npm run test:netcode` — protocol, cadence, fixed-step, gunner actions,
  impulses, shared predictor, spatial index (27 tests).
- `npm run test:netcode:e2e` — two-browser gunner responsiveness + shared
  vehicle prediction (also runnable under `NETCODE_LATENCY_MS` /
  `NETCODE_JITTER_MS`).
- `npm run test:e2e` — includes `e2e/arcade-movement.spec.ts` (downward
  cannon launch synced on both clients, sustained MG stability) and
  `e2e/screen-flicker.spec.ts`.
- `npm run test:e2e` — two real Chrome clients play a complete round and
  rematch, plus dedicated TPS/controls/collision/copy/jump/dash browser
  tests.
- `npm run test:loop` — two headless WebSocket clients play a complete
  90-second round and rematch.
- `npm run test:maps`, `npm run test:maps:sweep` — deterministic mapgen
  suites + 1000-seed sweep report.

## Core Loop 06 horde smoke

- `npm run test:coreloop` — stage director/farming clock suite.
- `npm run test:horde` — waves, purge suppression, spawn planner, spatial
  index, flow field, LOD, replication codecs, sectors, instanced renderer.
- `npm run test:horde:benchmark` — controlled population ladder (25–500).
- Manual: full loop to boss clear on primary + dramatic maps, Wave 1 fast and
  slow clears, tank death in farming and in waves, leader death surrounded by
  ambient enemies, purge with 100+ wave monsters, dense Charge Shot splash,
  Dash through a dense pack, Single Player, two-client Multiplayer at
  100/150 ms RTT.
## Progression smoke checks

- `npm run test:progression` — unit/integration suites.
- `npm run test:progression:simulation` — 60-second headless telemetry.
- `npm run test:progression:e2e` — level-up, relic, multiplayer protocol,
  and reset/reconnect E2E specs.

## Monster Pack 10 smoke checks

- `npm run validate:monsterpack-import` — ZIP/hash/staging/destination
  validation.
- `npm run test:monsterpack-import` — importer + native content tests.
- `npm run validate:enemy-animations` — all 90 GLBs vs 60 Quaternius
  profiles.
- `npm run test:monsterpack-rendering` — headless Chrome benchmark
  (7 scenarios; results in
  `build/monsterpack10-import/BENCHMARK_RESULTS.json`).
- Preview gallery: `npm run dev:animation-preview` then open
  `/?monster=1` (on-demand model loading; `?bench=1` for scripted runs).

## Lobby V2 smoke checks

- `npm run test:lobby` — nickname/settings, seats, ready/countdown, chat,
  reconnect, host migration, start adapter, protocol, presentation.
- `npm run test:lobby:e2e` — settings persistence, seat/ready match start,
  chat safety/rate-limit/reconnect, disconnect+rejoin restoration.
