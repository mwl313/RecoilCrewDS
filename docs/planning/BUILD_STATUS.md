# Build Status

## Completed

- **Stack chosen and scaffolded** — TypeScript + Vite + Three.js client,
  Node authoritative server (`ws`), vitest, Playwright e2e.
- **Authoritative simulation** — all gameplay systems implemented in
  `src/shared/sim/match.ts` (tank, recoil, weapons, four enemy types,
  barrels, scrap, combo, links, JACKPOT, wipeout, spawn pacing, modifiers,
  results).
- **Server** — room creation/join codes, roles, ready/countdown, per-role
  validated inputs, sequence protection, stale-input clearing (per role),
  snapshot/event streaming, results, rematch, reconnect grace, static
  serving + WebSocket on one port.
- **Client** — two independent TPS cameras with collision, pointer-locked
  aim, local turret prediction, HUD/menus/results, procedural
  audio, pooled VFX, single player mode, quality fallback.
- **Assets** — semantic registry with generated low-poly fallbacks for every
  required ID + optional `/assets/manifest.json` overrides.
- **Tests and docs** — vitest suites, Playwright e2e, headless verification
  script, README, DEPLOYMENT, ASSET_GUIDE, SMOKE_TEST, DECISIONS, env
  example, Dockerfile.

## Verification evidence

- **Refactor Phases 0-6 complete** — data-driven content, immutable rules,
  modular weapons/enemies/items, client coordinator split, and proof
  content (alternate mode, rapid cannon, composed enemy, stat item).
  Verified: `npm run build` PASS; `npm test` **238/238 PASS** (24 files);
  `npm run test:e2e` **14/14 PASS**; `npm run test:loop` PASS (full round +
  rematch); `npm run test:demo` PASS (golden Demo byte-identical).
  Details: `REFACTOR_STATUS.md`, `ARCHITECTURE.md`.

- **Tank Jump & Dash milestone complete** — Space is an edge-triggered jump,
  Left Shift is an edge-triggered chassis-forward dash; both are
  server-authoritative, locally predicted, deterministic through shared
  kinematics, data-driven (`tank.jumpHeight`, `tank.dashImpulse`,
  `tank.dashCooldown`, `tank.dashAirMultiplier`,
  `tank.dashMaxHorizontalSpeed`, `tank.dashPresentationSeconds`), and
  reconciliation-safe. Held boost and active brace are removed from the
  Driver control path (recoil/JACKPOT/scoring/HUD/PIP cleaned up).
  Verified: `npm run build` PASS; `npm test` **270/270 PASS** (25 files);
  `npm run test:demo` PASS (golden intentionally regenerated: score
  14633 → 16264, kills 36 → 39, JACKPOT ×2 → ×4, events 1647 → 1708 with
  new jump/dash event types and tank state fields);
  `npm run test:e2e` and `npm run test:loop` PASS.
  Details: `JUMP_DASH_IMPLEMENTATION_PLAN.md` and
  `JUMP_DASH_IMPLEMENTATION_REPORT.md`.

- **Map Generation Phases 1-3 complete** — deterministic seed pipeline,
  400×400 heightfield + macro terrain, routes/zones/spawns/gates/furniture/
  ramps/recovery with traversal validation, and full online activation:
  server-authoritative arena selection, client regeneration + checksum/
  version/profile gate, rematch reroll, reconnect consistency, Practice on
  the same pipeline, chunked terrain rendering with LOD/culling/fog,
  instanced props, and a dev debug overlay. Verified: `npm run build` PASS;
  `npm test` **328/328 PASS** (28 files); `npm run test:demo` PASS (golden
  byte-identical); `npm run test:e2e` **21/21 PASS**; `npm run test:loop`
  PASS (generated arena, grade S); `npm run test:maps` + `test:maps:sweep`
  PASS (1000/1000, 0 fallbacks). Details: `docs/map-generation/`.

- **Map Lab complete** — separate browser tool (`tools/maplab/`,
  `dist-maplab/`) reproducing the production generator (Production +
  Exact Candidate), parameter editing through a descriptor registry,
  shared game/Map Lab debug layers, validation-issue focus, object
  master/category/entry toggles with per-kind metrics, profile/arena/
  validation exports, and a safe apply CLI
  (`npm run maplab:apply -- <file> [--overwrite]`). Single-source pipeline:
  `npm run generate:map-profiles` → `src/generated/mapProfiles.generated.ts`
  (legacy manual mirrors removed). Verified: `npm run build` PASS;
  `npm test` **353/353 PASS** (34 files); `npm run test:maplab` **24/24
  PASS**; `npm run test:demo` PASS (golden byte-identical); `npm run
  test:e2e` **23/23 PASS** (incl. Map Lab flow + 20-regen stability);
  `npm run test:loop` PASS (generated arena: score 1020 / 525 across runs,
  JACKPOT ×2 / ×1, rematch ok); `npm run test:maps` + `test:maps:sweep`
  PASS (64 + 1000 runs, 0 fallbacks). Details: `docs/maplab/`.

- **Dramatic terrain & cliffs complete** — per-cell terrain classes
  (driveable/risky/blocked/cliff + protected masks), purpose-split
  `slopeRules`, route-cost graph that avoids walls, localized protected
  correction with cliff exclusion, `cliffPlateau`/`escarpment` features
  with deterministic wall masks + edge segments, vertical wall rendering
  and camera colliders, and a shared traversal guard so the tank/enemies
  cannot snap upward through cliffs while downhill falls stay airborne.
  New profiles `map.dramaticHighlands` and `map.cliffArena`; generator
  version bumped to 2 and `arenaChecksum` now covers flags + cliff edges.
  Verified: `npm run build` PASS; `npm test` **384/384 PASS** (37 files);
  `npm run test:demo` PASS (golden byte-identical); `npm run test:e2e`
  **23/23 PASS**; `npm run test:loop` PASS; `npm run test:maps` +
  `test:maps:sweep` + `test:maps:sweep:full` PASS (1000/profile; fallback
  0% primary, ~1-2% dramatic/cliff); `npm run build:maplab` +
  `test:maplab` PASS (32/32). Details:
  `docs/map-generation/DRAMATIC_TERRAIN_CLIFF_IMPLEMENTATION_REPORT.md`.

- **Refractor 02 complete (data-driven scene/HUD/asset authoring)** — all
  ten non-gameplay screens and the gameplay HUD are content documents
  (`content/scenes|hud|scene-flows|themes|assets`), validated by Zod and
  compiled by `npm run generate:presentation-content`; `SceneFlowPresenter`
  owns the presentation side of flow, `SceneRuntime` renders + disposes
  component trees through the component registry (scoped repeater
  lifecycle), `HudProjector` projects a typed `HudViewModel`,
  `PresentationWorld` renders hybrid 3D menus (started by the flow; asset
  resources stay owned by `AssetService`), and `tools/presentation-preview/`
  inspects every scene/HUD state. Built-in asset fallbacks preserved;
  project assets use namespaces with catalog-driven `fallbackAssetId`.
  Hardening pass (2026-08-04, audit `REFRACTOR02_VERIFICATION_AUDIT.md`)
  fixed hybrid-world startup, shared-resource disposal, project-model
  preload, registry wiring, HUD binding paths, the pause button action,
  repeater retention, nested entity transforms, enter/leave transitions,
  and HUD denominators (replicated weapon rules). Verified: `npx tsc
  --noEmit` PASS; `npm run build` PASS; `npm test` **437/437 PASS**
  (43 files); `npm run test:presentation` **37/37 PASS**; `npm run
  test:demo` PASS (golden unchanged); `npm run test:e2e` **24/24 PASS**
  (includes HUD pause-button flow); `npm run test:loop` PASS (score 1242,
  JACKPOT ×2); `npm run test:maps` PASS (64/64, 0 fallback);
  `npm run test:maplab` **32/32 PASS**; `build:maplab` +
  `build:presentation-preview` PASS. Details: `docs/refractor02/`.

- **Network03 — shared vehicle prediction + gunner responsiveness
  complete** — both roles predict the shared tank (Driver local input,
  Gunner via server-relayed sanitized Driver input); exact tank impulses
  (`tankImpulse` with opSeq) update both predictors once; Gunner discrete
  actions are immediate with `actionSeq`/`actionResult` and same-frame
  presentation; turret reconcile keys to the Gunner input ack; snapshot
  cadence fixed to true 20 Hz (1804/90 s vs 1353 before); server loop is a
  bounded fixed-step accumulator with drift metrics; camera/aim queries are
  spatialized with merged cliff proxies (77–79% fewer); remote interpolation
  no longer allocates a MatchState per frame; PIP is adaptive
  (12/6 Hz, 0.6 scale). Diagnostics: F4 netcode overlay + `?latency/?
  jitter` dev simulation. Verified: `npm run test:netcode` **27/27**;
  `npm run test:netcode:e2e` **4/4** at 0/50/100/150 ms and 100 ms+40 ms
  jitter; `npm run test:e2e` **28/28**; `npm test` **464/464** (49 files);
  Demo golden unchanged; `test:loop` PASS (1804 snapshots); maps/maplab/
  presentation PASS; soak **8/8 rounds in 778 s**. Details:
  `docs/network03/`.

- **Arcade upright aerial movement complete** — content-driven arcade
  values (steerHigh 0.9, normalGrip 2.1, gravity 13.5, jump 3.0, dash 13,
  hard cap 35, cannon recoil 10.5, MG recoil 0.15); yaw-only physics with
  clamped visual air pitch/roll; separate ground/air grip and yaw damping;
  landing momentum grace; pitch-aware 3D recoil with ground launch and
  jump+cannon traversal; shared impulse cap; enemy radial splash knockback
  with cliff falls, landings, fall damage, and immovable towers; data-driven
  How To copy. Demo golden regenerated intentionally (events 1708 → 1723).
  Verified: `npm test` **481/481** (51 files, incl. 17 movement tests);
  `npm run test:e2e` **31/31**; demo/maps/sweep/loop/maplab/presentation
  all PASS. Details: `docs/game-feel/`.

- **Gameplay04 — Single Player, PIP removal, and model-driven aim complete**
  — the partner-camera PIP is fully removed (one world render per frame,
  no PIP HUD/tuning/metrics); Practice is replaced by first-class Single
  Player (`mode.singlePlayerScoreAttack`, combined controls, no role/peer
  UI, no Tab/Q swap, offline start, local-restart results); a generated
  browser-safe ContentPack feeds the same ContentPack → MatchRules →
  MatchRuntime pipeline used by the server; `TankDefinition.rig` is the one
  shared weapon-mount geometry (Three-free resolver, `TankRigRulesBlock`
  delivery, server muzzle = client muzzle, local VFX from the same muzzle);
  and the trajectory crosshair projects the actual predicted shot ray with
  honest turret-lag and near-cover blocking. Verified: `npx tsc --noEmit`
  PASS; `npm run build` PASS; `npm test` **515/515 PASS** (57 files);
  `npm run test:demo` PASS (golden intentionally regenerated for the
  authoritative-muzzle change: t30 checkpoint 1550 → 1450, final 7956/B/×2/30
  unchanged); `npm run test:e2e` **32/32 PASS** (incl. Single Player full
  round + local restart + PIP render spy); `npm run test:loop` PASS (1804
  snapshots); `npm run test:maps` + `test:maps:sweep` + `test:maps:sweep:full`
  PASS; `npm run build:maplab` + `test:maplab` **32/32 PASS**;
  `build:presentation-preview` + `test:presentation` **37/37 PASS**;
  `test:netcode` **27/27** + `test:netcode:e2e` **4/4** PASS. Details:
  `docs/gameplay04/`, `docs/guides/SINGLE_PLAYER_MODE_GUIDE.md`,
  `docs/guides/TANK_RIG_AND_WEAPON_SOCKET_GUIDE.md`.

- `npm test` → **5 files, 47 tests passed** (config, math, asset fallback,
  match systems, room lifecycle, full-round integration).
- `npm run build` → client `dist/` + server `dist-server/` build cleanly.
- `npm run test:e2e` → **PASS** — two real Chrome clients created a crew,
  played a full 90-second round (movement, kills, cannon recoil, Loot Truck,
  first-round JACKPOT, results), then rematched in the same room with a
  modifier; practice mode also plays a full local round to results.
- `npm run test:loop` → **PASS** — headless two-client real-time round in
  ~92 s (score 11175, grade A, JACKPOT ×3, combo ×5), rematch with Moon Yard
  modifier, fresh zeroed match in the same room, 1353 snapshots received.

## Remaining limitations

- Audio is procedural synthesis (no licensed sample files); the named-event
  registry is the extension point for custom files.
- Jump is grounded-only by default (no coyote time, no buffering) and dash
  is a single instantaneous burst per accepted press edge; both are tuned
  through tank JSON/runtime stats, not hardcoded.
- Mobile/controller input and spectator modes are intentionally out of scope
  per the design document.
- No dedicated public matchmaking lobby; rooms are created and shared via
  six-character codes as designed.
