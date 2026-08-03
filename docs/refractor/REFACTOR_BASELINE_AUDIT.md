# Recoil Crew DS — Refactor Phase 0 Baseline Audit

**Branch:** `refractor_01`
**Baseline commit:** `2fff386` (pre-Phase-0 HEAD: "Fix TPS controls, turret spaces, prediction, interpolation, collision, and copy")
**Audit date:** 2026-08-02
**Scope:** Phase 0 only — no architecture migration, no JSON migration, no stat
service, no network redesign, no balance changes, no new content.

This audit exists to give later phases a trustworthy map of the current
behavior before extraction begins. It documents module dependencies, the
responsibilities of `Match` and `Game`, the network protocol, state/input
ownership, the asset path, hardcoded gameplay data, configuration usage, and
the current test surface with its gaps.

---

## 1. Repository shape and module dependencies

```text
src/
├── shared/                       # engine-agnostic, importable by server & client
│   ├── config.ts                 # GAME constants, BASE_CONFIG, MatchConfig, modifiers
│   ├── types.ts                  # all shared wire/simulation types
│   ├── math.ts                   # angle/lerp/clamp/dist/collision/hash/random helpers
│   ├── arena.ts                  # hardcoded arena layout + ground/collision queries
│   ├── assetRegistry.ts          # semantic asset IDs + generic registry (no three.js)
│   ├── sim/
│   │   ├── match.ts              # authoritative Match: every gameplay system
│   │   ├── results.ts            # grade/title computation
│   │   └── tankKinematics.ts     # shared deterministic tank step (server + predictor)
│   └── net/
│       └── interpolation.ts      # SnapshotBuffer + interpolateMatchState
├── server/
│   ├── index.ts                  # HTTP static serving + ws transport + 30 Hz tick
│   └── room.ts                   # RoomManager: rooms, roles, input validation, broadcast
└── client/
    ├── main.ts                   # app flow: menus, networking glue, test hooks
    ├── game.ts                   # Game: renderer, entity views, cameras, prediction glue
    ├── assets.ts                 # GameAssets: fallback factories + manifest overrides
    ├── audio.ts                  # procedural AudioManager
    ├── vfx.ts                    # pooled VFX
    ├── arenaView.ts              # visual arena + camera colliders
    ├── cameras.ts                # legacy TpsCamera (PIP) + PipCamera
    ├── tpsCamera.ts              # role-independent TPS rig (Driver/Gunner)
    ├── predictor.ts              # DriverPredictor: local prediction + reconcile
    ├── input.ts                  # InputManager: keyboard/mouse/pointer-lock
    ├── net.ts                    # NetClient: ws send/queue/reconnect
    ├── clipboard.ts              # room-code copy + validation
    ├── hud.ts                    # HUD/menus/results DOM
    └── styles.css
```

### Dependency direction (current)

```text
shared/{math,arena,config,types,assetRegistry}
  ├── shared/sim/tankKinematics.ts     (imports arena, math, config, types)
  ├── shared/sim/match.ts              (imports arena, config, math, results, kinematics, types)
  ├── shared/sim/results.ts            (imports types)
  ├── shared/net/interpolation.ts      (imports math, types)
  ├── server/room.ts                   (imports config, match, results, types)
  ├── server/index.ts                  (imports room)
  └── client/*                         (imports shared + three.js)
```

Notable facts:

- `src/shared/sim/match.ts` is imported by the server (`room.ts`), the client
  Practice mode (`game.ts`), and tests. It is the single authoritative
  simulation.
- `src/shared/sim/tankKinematics.ts` is imported by `match.ts` (authority) and
  `src/client/predictor.ts` (Driver prediction) — one shared implementation,
  two callers.
- `src/shared/assetRegistry.ts` has zero three.js dependency; `assets.ts`
  (three.js fallbacks) builds on it.
- `src/client/cameras.ts` contains a legacy `TpsCamera` used only by
  `PipCamera`; the active Driver/Gunner rigs live in `tpsCamera.ts`.
  (`game.ts` uses `TpsCameraController` from `tpsCamera.ts`.)
- `match.ts` declares a `globalEnemyId` module counter and `nextEnemyId()`
  that are never referenced by the match (enemy ids come from
  `state.nextEnemyId`). Leftover code, safe to note for Phase 1 cleanup.

---

## 2. `Match` responsibilities (`src/shared/sim/match.ts`, 1331 lines)

`Match` is the authoritative gameplay core. It owns or coordinates:

| Area | What it does |
| --- | --- |
| Tank lifecycle | spawn, movement via `stepTankKinematics`, respawn, shield, wipeout |
| Recoil | cannon/MG/JACKPOT impulses, spin, roll, brace multipliers |
| Weapons | turret rate-limited aim, MG (hitscan), cannon (shells), JACKPOT charge/fire, burst mode, cooldowns |
| Projectiles | cannon/jackpot/tower shells: motion, gravity, ground/obstacle/enemy hit, splash, falloff |
| Enemies | Scrap Bug hunt/circle, Rammer approach/lock/telegraph/charge/recovery, Gun Tower idle/telegraph/fire/pause, Loot Truck route/escape |
| Spawning | bug pacing ramp, rammer/tower schedules, Loot Truck trigger, final-chaos respawns |
| Pickups | spawn, magnet pull, collection, at-speed bonus, scrap loop link |
| Barrels | HP, fuse, explosion, chain reactions |
| Scoring | score, combo ×1–×5 with both-role window, crew links, wipeout penalty |
| JACKPOT | meter, gains, cooldown, assistance floors, ready gating |
| Results | phase transition at `duration` + `computeResults` |
| Events | typed `SimEvent` queue drained via `takeEvents()` |

`Match` also owns the per-match `mcfg: MatchConfig` built by
`buildMatchConfig(modifier)` and keeps a **shared** `cfg: GameConfig =
BASE_CONFIG` reference (see §7 risk).

---

## 3. `Game` responsibilities (`src/client/game.ts`, 1053 lines)

`Game` is the client presentation/coordination shell. It owns:

| Area | What it does |
| --- | --- |
| Renderer | WebGLRenderer, scene/lights/fog/stars, EffectComposer + bloom, resize, PIP render |
| Entity views | tank rig, enemy rigs, pickup rigs, shell rigs, barrel meshes, truck rig, markers |
| Network presentation | `SnapshotBuffer`, render clock, `interpolateMatchState`, event handling → VFX/audio |
| Driver prediction | owns `DriverPredictor`; input sampling, send, reconcile, smoothing, display state |
| Gunner prediction | desired/predicted/authoritative turret spaces, finite-rate turret convergence |
| Cameras | two independent `TpsCameraController` rigs, role switching, recenter, aim computation |
| Practice mode | runs a local `Match` at fixed 1/30 steps, `applyPracticeWeapons` cosmetics, camera swap, practice results |
| Quality | FPS sampling, pixel ratio/shadow/bloom/PIP-rate adaptation |
| Test hooks | `injectOnlineInput`, `getRenderTank`, `getTurretSpaces`, `getCameraState`, `composerPassCount` |

`Game` does **not** decide gameplay outcomes online: it only renders
authoritative state and predicts locally for feel.

---

## 4. Network messages

### Client → server (`src/server/room.ts`)

| `t` | Payload | Effect |
| --- | --- | --- |
| `create` | — | create room, creator = Driver |
| `join` | `code` | join as Gunner |
| `rejoin` | `code`, `sessionId` | restore role within grace |
| `ready` | `ready: boolean` | per-role ready; both ready → countdown |
| `input` | `seq`, `driver?`/`gunner?` | sanitized per role; sequence-guarded |
| `rematch` | `modifier` | results-only; both pick → new countdown |
| `leave` | — | remove client/room |
| `ping` | `ts` | keep-alive / latency |

`driver = { throttle, steer, boost, brace }`
`gunner = { aimYaw, aimPitch, mg, cannon, charge }`

### Server → client

| `t` | Payload |
| --- | --- |
| `created` | `code, role, sessionId, phase` |
| `joined` | `code, role, sessionId, phase` |
| `lobby` | `code, phase, driverReady, gunnerReady` |
| `peer` | `driverConnected, gunnerConnected` |
| `countdown` | `n` (0–3), `modifier?` on rematch |
| `start` | `matchId, modifier` |
| `snapshot` | `seq, serverTime, serverTick, lastProcessedDriverInputSeq, lastProcessedGunnerInputSeq, state` |
| `event` | `event: SimEvent` |
| `results` | `results, rematch {driver, gunner, modifier}` |
| `error` | `code, message` |
| `pong` | `ts` |

Wire format: JSON over one WebSocket at `/ws`; snapshots at 20 Hz, sim at 30 Hz.

---

## 5. State/input ownership

```text
Server (RoomManager + Match)          Client (Game)
─────────────────────────────         ─────────────────────────────
MatchState (tank, turret, enemies,    SnapshotBuffer/interpolation
pickups, shells, barrels, truck,      → render state
combo, stats, phase, results)
                                      DriverPredictor (display only):
DriverInput / GunnerInput sanitized   runs shared tankKinematics with
per role, seq-guarded, stale-clear    BASE_CONFIG + snapshot modifier
after 1.5 s
                                      Gunner turret prediction (local)
                                      TPS cameras (local, never networked)
                                      Practice: local Match instance
                                      running the same sim code
```

- Server authority: movement, weapons, damage, enemies, pickups, score,
  combo, JACKPOT, wipeout, results, rematch.
- Client ownership: both TPS camera rigs, gunner aim point, turret prediction,
  PIP, VFX/audio presentation, quality.
- Practice = same `Match` class running in the browser; `Game` steps it at a
  fixed 1/30 accumulator and renders it directly.

---

## 6. Asset path

```text
src/shared/assetRegistry.ts   REQUIRED_ASSET_IDS (43 semantic ids), AssetRegistry<T>,
                              isValidAssetId / assertValidAssetId, allRequiredAssetsRegistered
        │
        ▼
src/client/assets.ts          GameAssets: models/vfx/ui/audio registries
        ├─ registerFallbacks()   generated low-poly factories for every required id
        └─ loadManifest()        fetch('/assets/manifest.json') → optional overrides
                ├─ model entry → registerFile(id, file) → GLTFLoader w/ fallback
                ├─ vfx entry   → merge {color,size,life,count,speed,gravity}
                ├─ ui entry    → merge {primary,accent,panel,...}
                └─ unknown id / missing manifest → silently ignored (fallbacks stay)
        │
        ▼
public/assets/manifest.json   ships as {"assets":[]} so the client never 404s;
public/assets/manifest.example.json  documents the override format
```

Runtime consumers ask by semantic id only (`playerTank.chassis`,
`enemy.scrapBug`, `vfx.cannonImpact`, `ui.driverTheme`, `audio.cannon`, ...).
The client builds the tank rig from three semantic ids
(chassis/turret/barrel) and maps enemy type → semantic id in
`game.ts:createEnemyRig`. `ASSET_GUIDE.md` documents the manifest format.

---

## 7. Configuration usage

### `src/shared/config.ts`

- `GAME` — room codes/length, maxRooms, `roundDuration: 90`, `snapshotHz: 20`,
  `simHz: 30`, `inputTimeout: 1.5`, `reconnectGrace: 10`.
- `GameConfig` / `BASE_CONFIG` — tank, weapons, enemies, scoring, jackpot,
  arena tuning + rematch modifier list.
- `MatchConfig` / `buildMatchConfig(modifier)` — per-match overrides derived
  from `BASE_CONFIG` + `MODIFIER_OVERRIDES` (timeScale, cannonCooldown,
  cannonBurst, recoilImpulse, grip, boostGrip, gravity, barrelRadius,
  pickupMagnet/life, mgRate, maxBugs/Rammers/Towers, jackpotGainMult).

### Consumers

| Symbol | Consumers |
| --- | --- |
| `BASE_CONFIG` | `Match.cfg` default (shared mutable reference), `initialState`, `DriverPredictor` constructor, `Game` (to build the predictor), tests |
| `buildMatchConfig` | `Match` constructor → `mcfg`; `DriverPredictor` constructor → `mcfg` |
| `GAME` | `room.ts` (codes, maxRooms, inputTimeout, reconnectGrace, snapshotHz), `match.ts` (`roundDuration`) |
| `MODIFIER_OVERRIDES` / `MODIFIER_LABELS` | `buildMatchConfig`, HUD modifier menu |
| env (`PORT`, `STATIC_DIR`, `RECOIL_TIME_SCALE`, `ALLOWED_ORIGINS`) | `src/server/index.ts` |

### Known risk (documented, not fixed in Phase 0)

`Match.cfg` defaults to the **shared `BASE_CONFIG` object**; two matches in
different rooms hold the *same* `cfg` reference. `mcfg` is per-match and
already isolated. Phase 2 must replace the shared `cfg` reference with
frozen per-room rules. The characterization suite pins this behavior.

---

## 8. Hardcoded gameplay data inventory

### Authoritative gameplay (must be preserved exactly by later phases)

| Location | Hardcoded value(s) |
| --- | --- |
| `match.ts` constructor | two starter Scrap Bugs at `(-7, 6)` and `(8, -4)` |
| `match.ts` fields | `rammerSpawns = [22, 34, 50]`, `towerSpawns = [26, 58]` |
| `match.ts` stepTank | hard-crash damage `4` at speed > `10` |
| `match.ts` muzzleWorld | muzzle offset `2.7` horizontal, `1.55 + dy*1.4` vertical |
| `match.ts` stepWeapons | cannon burst spacing `0.12 s`; turret lerp `dt*8` |
| `match.ts` fireMachineGun | barrel hit radius `1.0`; enemy hit radius `+0.45`; MG spread from config |
| `match.ts` explodeShell | splash falloff `1` inside `0.45*radius`, else `0.65`; tank splash `5` (cannon) / `12` (jackpot) within `radius + 1.5` |
| `match.ts` explodeBarrel | enemy damage `26`, tank damage `10` within `radius + 1.6`; fuse `0.14 s` |
| `match.ts` stepBug | circle radius `<7`; separation `<2.4` strength `0.8`; obstacle avoidance turn `±1.1 rad`; speed wobble `sin(t*1.7+id)*0.6`; ram kill at tank speed `>5` → score `20` `RAM`; bug knockback `0.8`; bug hitCd `1.0 s` |
| `match.ts` stepRammer | lock distance `<16`; dodge window `<3.6`; tank knockback `7`; recovery decel `8/s`; rear bonus `×1.5` when `recovery` |
| `match.ts` stepTower | idle → telegraph after `1.2 s`; aim jitter `0.05 rad`; muzzle offsets `1.3` / `2.4`; tower shell life `6 s`; tank hit radius `1.05` |
| `match.ts` stepTruck | waypoint reach `<2.5`; escape shortcut `escapeTime - 8`; collision push `4` / truck push `0.7` |
| `match.ts` stepSpawns | bug target `min(round(minActiveBugs*maxBugs), maxActiveBugs, max(2, floor(2 + t*0.22)))`; enemy cap `22`; final chaos starts `t > 70`, rammer prob `dt*0.12` max 3, tower prob `dt*0.08` |
| `match.ts` assistance | qualify when `kills + scrapCollected >= 2` and `anyContribution`; floors `55/66/70` (values from config) |
| `match.ts` pickups | life `26 s` normal/heavy, `16 s` jackpot (`× pickupLife`); magnet base `5 / 6.5 / 8`; pull `11 + (magnet-d)*1.4`; collect `<1.15`; at-speed threshold `>12` → `+25`; scrap-loop window `3 s` |
| `match.ts` wipeout | meter `×0.5`, score `×(1 - 0.15)`, combo reset |
| `results.ts` | grades: C `score≥1500 && kills≥5`, B `≥4000 && jackpot≥1`, A `≥8000 && combo.best≥4 && links≥2`, S `≥12000 && jackpot≥2`; 9 title strings |
| `arena.ts` | full layout: 28 obstacles, 15 barrels, 3 ramps, 3 spawns, 2 tower spots, 8 bug gates, 4-point truck route, center bowl `-0.45`, half `40` |
| `game.ts` Practice | fixed step `1/30`, max 6 substeps per frame |

### Presentation-only hardcoding (excluded from canonical fixtures)

| Location | Value |
| --- | --- |
| `game.ts` | camera tunings (driver fov 70/dist 5.2/shoulder 0.65; gunner fov 68/dist 4.4/shoulder 0.55), turret turn rate `4.6`, input send `0.05 s`, render delay `0.1/0.02 s`, slow-mo `0.32`, PIP rate 3/5, quality thresholds `42/55`, shake caps, star field 90 |
| `tpsCamera.ts` | `DEFAULT_TPS_TUNING` sensitivities `0.0024/0.0022`, collision pull/release `0.02/0.1`, recenter `0.16` |
| `main.ts` | ping every `2500 ms`, `?test=1` hooks |
| `server/index.ts` | tick `1000/30 ms`, ws heartbeat `30 s` |

---

## 9. Tests and gaps

### Current suite (98 tests, 11 files — verified 2026-08-02)

| File | Focus |
| --- | --- |
| `tests/math.test.ts` (7) | clamp/wrap/angle lerp, exact circle-box separation |
| `tests/interpolation.test.ts` (7) | snapshot buffer bracketing, interpolation, shortest yaw, discrete-state rule |
| `tests/assetRegistry.test.ts` (2) | valid ids, fallback registration |
| `tests/input.test.ts` (6) | key/mouse mapping, pointer lock, clearing |
| `tests/config.test.ts` (4) | finite tuning values, modifier overrides |
| `tests/clipboard.test.ts` (5) | copy API + fallback |
| `tests/predictor.test.ts` (4) | predict/reconcile/replay/smooth/snap |
| `tests/tankKinematics.test.ts` (14) | steering semantics, collision, tunneling, boundary |
| `tests/tpsCamera.test.ts` (13) | direction conventions, rig placement, aim |
| `tests/room.test.ts` (12) | lifecycle, ready/countdown, input validation, full round + rematch, reconnect |
| `tests/match.test.ts` (24) | movement, recoil, weapons, enemies, pickups/combo, JACKPOT, wipeout, round end, rematch reset |

E2E (`e2e/`, 14 Playwright tests): controls, TPS feel, full two-browser round +
results + rematch, practice full round. Headless loop (`scripts/verify-full-round.mjs`)
plays a real 90 s round over WebSocket.

### Gaps addressed by Phase 0 additions

| Gap | New coverage |
| --- | --- |
| No deterministic golden-master run | `tests/helpers/demoFixture.ts` + `tests/demoRegression.test.ts` + `tests/fixtures/demo-golden.json` |
| Wall-clock/random sources untested | seeded `Math.random` replacement; canonicalization strips `matchId`, visual/debug fields, unstable ordering |
| Demo duration source implicit | duration-source characterization |
| Weapon wire contract implicit | weapon input-field characterization (exact fields, unknown-field rejection) |
| Enemy type→stats mapping implicit | enemy mapping characterization (radius/hp/score/jackpot/scrap per type) |
| Manifest behavior untested | manifest file + `GameAssets` override characterization |
| Practice/online parity assumed | parity characterization via identical seeded matches |
| Per-room config isolation assumed | two-room modifier isolation characterization (pins shared-`cfg` risk) |
| Predictor config source assumed | predictor config-source characterization |

### Remaining known limitations (outside Phase 0)

- `Match` still uses global `Math.random` (seeded in fixtures only).
- `Match.cfg` is a shared mutable reference to `BASE_CONFIG`.
- `Game` remains a 1000+ line coordinator; `game.ts` imports `Match` directly
  for Practice.
- E2E remains wall-clock bound (real 90 s round) — intentionally not
  canonicalized; browser behavior is out of scope for the deterministic
  fixtures per the migration plan.
- `REFACTOR_02_DATA_DRIVEN_CONTENT_AND_STATS_SPEC.md` is referenced by the
  execution guide but **not present** in `docs/refractor/` (Phase 0 cannot
  read it; flagged for the user).

---

## 10. Determinism analysis (fixture strategy)

The only nondeterministic inputs to `Match` are:

1. `Math.random()` — 12 call sites in `match.ts` (recoil spin/roll, MG spread,
   bug gate selection, tower aim jitter, final-chaos spawn rolls, jackpot
   scrap scatter). Fixture replaces `Math.random` with a fixed-seed
   mulberry32 for the whole run.
2. `matchId` — contains `Date.now()` (online only). Canonicalization strips it.
3. Module counter `globalEnemyId` — unused by the sim (verified by grep).
4. Event timestamps — event `t` fields and wall-clock fields are stripped;
   entity arrays are sorted by id before serialization.

Canonical checkpoints captured: `initial`, `t10`, `t30`,
`lootTruckWindow` (t=44, truck spawns at 42), `jackpotWindow` (t=60, inside
the 55–70 assistance window), `completion` (phase = results at t=90),
`results` (computed `MatchResults`), and `rematchReset` (fresh match state,
asserted equal to `initial`).

---

## 11. Recommended tag

Record for later phases: **`refactor-baseline`** should be applied to the
Phase 0 completion commit (per `REFACTOR_03_NON_BREAKING_MIGRATION_PLAN.md`
§2). The tag itself is intentionally not created by Phase 0.
