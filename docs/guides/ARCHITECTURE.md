# Recoil Crew DS — Architecture

## Layers

```text
content/ (validated, frozen JSON)
  → ContentLoader/ContentPack (Zod schemas, ReferenceValidator, hash)
  → MatchRules (immutable per-match rules + StatResolver)
  → MatchRuntime + systems (Round, Objective, Score, Combo, Jackpot,
    Results, Weapon, Projectile, Damage, Enemy, Pickup, SpawnDirector,
    Item/StatusEffect)
  → authoritative state/events
  → room snapshots (rules revisions + movement block)
  → GameClient (RenderWorld, EntityViewRegistry, NetworkStatePresenter,
    CameraManager, PredictionController, PresentationEventRouter, HUD,
    Quality)
```

## Server authority

The server owns content selection, movement, weapons, damage, enemies,
items, score, objectives, and match flow. Clients receive snapshots at
20 Hz (sim 30 Hz), interpolate them, and locally predict the Driver tank
(shared kinematics + movement rules block) and the Gunner turret. Cameras
are client-only. Driver input frames carry one-shot `dashPressed` /
`jumpPressed` edges; the authoritative runtime consumes each sequenced edge
exactly once, so holding a key never repeats the action.

The Driver renders the Gunner's turret from the interpolated snapshot world
aim re-derived against the predicted chassis (smooth 60 fps, still sticky
to the Gunner's aim, zero extra network traffic); the Gunner uses local
turret prediction reconciled with snapshots.

## Shared vehicle prediction and gunner responsiveness (network03)

- Both online roles run the same shared tank predictor
  (`src/client/prediction/sharedTankPredictor.ts`) through
  `stepTankKinematics` on the authoritative arena ground. The Driver feeds
  it sampled local input; the Gunner feeds it server-relayed sanitized
  accepted Driver input (`driverInputRelay`, edges normalized per frame).
- Exact recoil/weapon impulses flow as typed `tankImpulse` events
  (`src/shared/effects/tankImpulseSystem.ts`) with `impulseSeq`/`opSeq`;
  both predictors apply them immediately and replay unacknowledged inputs +
  impulses on reconcile in server order. Recoil is never applied twice and
  never re-derived from snapshots.
- Gunner discrete actions (`cannonPressed`, MG/ability edges) bypass the
  periodic timer with `actionSeq`; the server returns `actionResult`
  immediately and latches edges so short clicks survive between sim steps.
  Local presentation (flash/audio/kick) is same-frame with authoritative
  duplicate suppression.
- The Gunner camera anchors to the predicted shared tank, not the delayed
  interpolation timeline; turret reconcile is keyed to
  `lastProcessedGunnerInputSeq` with bounded aim-frame replay.
- Snapshot cadence is a true 20 Hz (interval subtraction); the server loop
  is a bounded fixed-step accumulator with dropped-time/drift metrics;
  broadcast payloads are serialized once for both sockets.
- Camera/aim collision is spatialized (`src/client/cameraCollision.ts`)
  with pre-expanded AABBs and merged cliff proxies (77–79% fewer camera
  boxes on dramatic maps); remote entities interpolate through pooled
  records (`remoteInterpolator.ts`) with no whole-MatchState allocation per
  frame.
- Diagnostics: F4 netcode overlay + `tests/netcode` unit suite +
  `e2e/gunner-responsiveness.spec.ts` +
  `e2e/shared-vehicle-prediction.spec.ts`; tuning in
  `src/shared/net/tuning.ts` and
  `docs/network03/NETCODE_TEST_AND_TUNING_GUIDE.md`.

## Arcade upright aerial movement (game-feel)

- Movement values are fully content-driven (`content/tanks/default.json`,
  `content/weapons/*.json`, `content/enemies/*.json`) through the existing
  MatchRules/stat pipeline and replicate via `MovementRulesBlock` (tank
  aerials + turret pitch limits).
- The tank has yaw-only authoritative physics; visual pitch/roll are
  clamped presentation values (airborne pitch from vertical velocity, roll
  from steering/yaw velocity) and never affect collision.
- `TankImpulseSystem` is the single impulse entry (3D direction ×
  magnitude × vertical scale, ground launch threshold, shared
  `hardHorizontalSpeedCap`); `RecoilEffect` and weapon behaviors delegate
  to it, so downward cannon aim launches the tank and MG micro-thrust
  accumulates smoothly with exact per-impulse prediction/reconcile.
- Landing momentum grace (`landingGripT`) is part of shared state.
- Enemy splash knockback: `RadialImpulseEffect` + `EnemyImpulseController`
  with data-driven per-enemy resistance, cliff-fall/landing/fall-damage,
  and immovable Gun Towers; tank splash knockback stays zero.
- Details: `docs/game-feel/ARCADE_UPRIGHT_AERIAL_MOVEMENT_IMPLEMENTATION_REPORT.md`
  and `docs/game-feel/ARCADE_MOVEMENT_TUNING_GUIDE.md`.

## Single Player, PIP removal, and model-driven aim (gameplay04)

- The partner-camera PIP is fully removed: one world render per gameplay
  frame, no `PipRenderer`, no PIP HUD/tuning/metrics. `RenderWorld.renderCount`
  and `e2e/pip-removal.spec.ts` guard the one-render invariant.
- Practice is replaced by a first-class Single Player mode
  (`mode.singlePlayerScoreAttack`): combined Driver+Gunner controls, no role
  or peer UI, no Tab/Q swap, offline start, and local-restart results
  (`app.restartSinglePlayer`). `GameClient` uses a typed `GameSessionContext`
  instead of `mode: 'online' | 'practice'`.
- The browser consumes a generated, validated `ContentPack`
  (`npm run generate:content-pack` → `src/generated/contentPack.generated.ts`),
  so Single Player runs the same `ContentPack → MatchRules → MatchRuntime`
  pipeline as the server without shipping fs/node crypto.
- `TankDefinition.rig` is the single weapon-mount geometry source:
  `src/shared/vehicle/tankRigGeometry.ts` (Three-free) computes pivots, muzzle,
  direction, aim pivot, and turret solve. `MatchRules.tankRigBlock()` rides
  the movement rules block so online clients build the exact selected rig;
  Single Player reads it locally.
- The server's MG/cannon/JACKPOT behaviors resolve `muzzleWorld()` through the
  shared rig; the client builds `TankRig` from the same data and spawns local
  VFX from `getMuzzleWorld()`. No hardcoded `[0, 0.75, 2.9]` or pivot offsets
  remain in gameplay paths.
- The trajectory crosshair (`src/client/aim/trajectoryReticleProjector.ts`)
  projects the current predicted muzzle ray through the spatial camera query,
  honestly trails the barrel during turret traverse, turns blocked near
  cover, and hides when off-screen/NaN. The HUD node moves via cached style
  updates (no DOM rebuild).
- Details: `docs/gameplay04/`, `docs/guides/SINGLE_PLAYER_MODE_GUIDE.md`,
  `docs/guides/TANK_RIG_AND_WEAPON_SOCKET_GUIDE.md`.

## Combat 05 — dash contact, instant turret, no fall damage, cannon charge

- Tank contact offense is Dash-only: `TankContactCombat` applies
  `dashContactDamage` inside the accepted `dashDamageT` window with
  per-target cooldown; normal driving deals 0 enemy damage; enemy contact
  attacks remain separate.
- Fall damage is deleted (tank + enemy + source); landing grip and cliff
  falls remain.
- Turret `responseMode: instant` (default) makes the local turret match the
  mouse in the same frame; the server applies validated accepted aim
  directly; reconcile never blends the local turret backward; cannon
  actions carry click/release-time aim (protocol v3).
- The Jackpot subsystem is removed. `CapabilitySystem` + item
  `grantsCapabilities` unlock `cannon.charge`; `WeaponSystem` hold/release
  state machine fires normal cannon without the capability, charge shots
  with it, and `cannonShotProfile` scales resolved cannon stats linearly
  (per-shell combat payload, burst inheritance).
- HUD: bottom meter removed; compact reticle charge meter with local
  predicted fill.
- Details: `docs/combat05/`, `docs/guides/CANNON_CHARGE_AUTHORING_GUIDE.md`,
  `docs/guides/COMBAT_CONTACT_RULES.md`.

Driver tank prediction is bound to the authoritative arena for any map size:
the prediction ground is set on create/start/rematch/reconnect and survives
controller resets (it is never reverted to the legacy static arena). Reconcile
replays at most a bounded number of in-flight inputs, display corrections are
speed-capped above the vehicle's top speed (smooth convergence, no teleports),
and if the authoritative tank ever appears outside the prediction ground's
bounds the client disables local tank prediction and renders the interpolated
authority instead (no jitter fallback). Arena boundary clamping is axis-aware
(world-space `bounds` on the ground query), so rectangular or offset arenas
clamp each axis to its real edge instead of assuming a square centered on the
origin.

## Generated arenas (Phases 1-3)

- Every match carries its own `ArenaWorld` (match-scoped; no global arena).
  The static world delegates to the legacy analytic arena (byte-identical
  Demo path); generated worlds route ground/collision queries through their
  own heightfield + props (`src/shared/sim/arenaWorld.ts`).
- The server selects an arena per room/match (`Room.matchIndex` → base seed
  → `selectArenaSession`), publishes metadata (`mapProfileId`,
  `arenaBaseSeed`, `arenaCandidateSeed`, `arenaAttempt`,
  `arenaGeneratorVersion`, `arenaChecksum`, `arenaFallbackUsed`) on start,
  snapshots, and rejoin, and builds the `Match` on that world.
- The client regenerates the exact candidate and compares checksums before
  gameplay; mismatch blocks the round with a sticky error state.
- Rendering (`ArenaView`) builds chunked terrain from the authoritative
  heightfield (LOD + frustum culling), semantic prop meshes, instanced
  decorations, fog 100-150 m, and disposes cleanly on rematch. A dev-only
  overlay (`?debug=1`, F3) shows seeds/checksum/features/routes/zones.

## Dramatic terrain and cliffs (generator v2)

- Terrain is classified per cell into a `TerrainFlag` bitmask
  (driveable/risky/blocked/cliff top/bottom/wall + route/spawn/gate/
  recovery/landing/access protection). `slopeRules` in the terrain profile
  drive the categories; old profiles derive safe defaults from `maxSlope`.
- The generator guarantees a **safe required network, not a driveable
  landscape**: route corridors, spawns, gates, recovery, landings, and
  cliff access roads are corrected to `driveableMax`; cliff-wall cells are
  excluded from correction and smoothing; optional terrain may stay steep,
  blocked, or cliff-like.
- `cliffPlateau` and `escarpment` features produce authoritative wall/top/
  bottom masks and deterministic `CliffEdgeSegment[]`. `ArenaView` and Map
  Lab build vertical wall quads from those segments; the TPS camera treats
  walls as camera colliders.
- `queryTerrainTransition` / `canTraverseGroundStep` (shared) block upward
  ground steps above `maxStepUp` and cliff-wall climbing for the tank
  (including dash/recoil), enemies, and the truck; downhill movement is
  always allowed and drops leave the tank airborne.
- `arenaChecksum` covers heightfield + flags + cliff edges; generator
  version bumped to 2. Map Lab shows per-attempt fallback diagnostics and
  renders invalid Exact Candidates.

## Data-driven presentation (Refractor 02)

- Screens and the gameplay HUD are content documents
  (`content/scenes/*.json`, `content/hud/gameplay.json`,
  `content/themes/*.json`, `content/assets/*.json`) validated by Zod and
  compiled to `src/generated/presentationContent.generated.ts`
  (`npm run generate:presentation-content`, wired into `build:client`).
- `SceneFlowPresenter` owns the presentation side of flow (scene runtimes,
  enter/leave transitions, hybrid presentation worlds, safe allowlisted
  actions); `src/client/main.ts` remains the authoritative application
  state machine. `SceneRuntime` builds component trees once through the
  component registry, caches binding handles, scopes/disposes repeater
  items, and disposes on unload.
- `HudProjector` projects `MatchState` into a typed `HudViewModel`;
  `HudRuntime` applies content bindings (text/value/visible/class/style/
  attribute + registered transforms) with per-binding change caching.
- `PresentationWorld` renders hybrid 3D menu backgrounds (separate renderer,
  started by the flow and disposed before gameplay; model geometry/materials
  remain owned by `AssetService`, so leaving a menu never disposes shared
  gameplay resources) and `tools/presentation-preview/` inspects every
  scene/HUD state outside the player bundle.
- `src/shared/assetCatalog.ts` splits built-in required assets (fallbacks
  preserved) from namespaced project assets (`custom.*`, `scene.*`,
  `environment.*`, `ui.*`) with `replacesBuiltIn` for explicit overrides.

## Map Lab (separate tool)

`tools/maplab/` is a separate Vite application (own entry, own build output
`dist-maplab/`; never part of the player bundle). It reuses the production
pipeline:

- **Single source**: `scripts/generate-map-profile-bundle.ts` →
  `src/generated/mapProfiles.generated.ts`; server resolves from validated
  JSON, clients/Map Lab from the generated module. No manual mirrors.
- **Generator adapter**: Production mode runs `selectArenaSession` (same
  retry/fallback); Exact Candidate mode runs `buildArenaCandidate` +
  `attachProps`. Checksums match the game session.
- **Worker**: generation/validation run in a Web Worker (shared modules,
  no Three.js) with request ids; stale results are dropped. A documented
  debounced main-thread fallback uses the same shared code.
- **Shared layers**: `src/client/map-debug/` is used by both the game F3
  overlay and Map Lab (height/slope, features, routes/corridors, zones,
  spawns/gates/recovery, ramps/landings/flight, furniture/colliders/
  decorations, barrel chains, validation issues).
- **Validation issues**: `src/shared/mapgen/validationIssues.ts` converts
  validator reports into stable `MapValidationIssue` objects (severity,
  category, position, layer, entity) for UI focus; validators are
  unchanged.
- **Edits**: Tweakpane binds a descriptor registry to a deep-cloned working
  bundle; source definitions are frozen. History (undo/redo), raw JSON
  editing, and localStorage drafts with a source fingerprint are included.
- **Export/apply**: Profile Bundle / Generated Arena / Validation Report
  exports; `scripts/apply-maplab-profile.ts` validates, writes content,
  updates the manifest, regenerates the bundle, and never commits.

## Content and rules

`ContentPack → mode → difficulty → MatchRules`. Definitions are frozen;
runtime state lives in the match. Stats resolve through
`StatResolver` (base + add × multiply → highest-priority override →
clamp) with per-(id, stat) stacking, optional duration, dirty caching,
and `rulesRevision`/`movementRulesRevision` exposed on snapshots.

## Modes, weapons, enemies, items

- Modes are JSON (objectives, loadout, spawn director, scoring, results).
  `MatchRuntime` has no mode-id branches.
- Weapons are definitions with a `behaviorId` (`weapon.hitscan`,
  `weapon.projectile`, `weapon.chargeProjectile`) resolved through
  `WeaponBehaviorRegistry`.
- Enemies are ordered behavior compositions (`movement.*`, `attack.*`,
  `defense.*`, `trait.*`) with drop tables; `EnemySystem` has no type
  switch.
- Items/status effects apply stat modifiers through the match resolver.

## Client

`GameClient` is a thin coordinator. `AssetService.load()` is awaited before
construction; models are cached prototypes (custom GLBs or registered
procedural fallbacks) cloned per instance and transformed by manifest
metadata. Presentation (VFX/audio/themes/icons/camera impulses) routes
through the bundled `presentation` definition. The input layer latches
Space/Shift press edges until the next Driver input frame is created, and
clears latches on blur, visibility loss, pause, disconnect, and teardown.

Jump and dash use the same shared `tankKinematics` on the server, the Driver
predictor, and Practice. `jumpHeight` is designer-facing: launch velocity is
`sqrt(2 * gravity * jumpHeight)`, and Moon Yard lowers gravity for longer
airtime without changing the target height. Dash applies an instantaneous
chassis-forward burst gated by `dashCooldown`; `dashPresentationSeconds`
drives the short DASHING presentation window only.

## Intended engine defaults (documented, not accidental)

- Wire `EnemyState.type` strings map to definitions via a fixed table in
  `EnemySystem` (`scrapBug`, `rammer`, `gunTower`, `lootTruck`).
- The client-safe Practice path resolves rules from legacy constants
  (`createLegacyDemoRulesBundle`) that mirror the validated Demo content;
  the browser bundle intentionally avoids fs/zod.
- Arena obstacle/barrel/ramp/route layout remains hardcoded in `arena.ts`
  (visual/static geometry, not gameplay rules).
- One dodge-credit flag per match (legacy parity), documented in status.

## Core Loop 06 horde architecture

- `src/shared/stage/` — `StageDirector`/`FarmingClock` own phase progression (180/120/60/0 farming countdown, waves pause it, boss clear and tank game-over end the match). They never spawn.
- `src/shared/horde/` — `HordeDirector` (budgets/packs), `WaveController` (tagged cohorts, finite reinforcement, leader-death purge), `PopulationManager` (caps incl. sectors), `SpawnPlanner`/`spawnAnchors` (terrain-aware deterministic plans), `hordeSectors` (far aggregation).
- `src/shared/navigation/hordeFlowField.ts` — one low-resolution reverse field from the tank; ordinary horde movement reads it instead of individual A*.
- `src/shared/spatial/enemySpatialIndex.ts` — all area combat queries (Dash contact, splash, barrels, density steering).
- `src/shared/net/horde/` — protocol v4 tiered replication (materialize/despawn/death/near/mid/far/sectors/wave) with quantized records and client reconstruction.
- `src/client/enemies/` — bounded instanced fodder pools; specials keep unique rigs.
- Legacy demo loop remains the shipped-mode runtime while `horde.mainStage.enforceStage` is `false`; enforcement is tested and ready to flip with a focused golden update.

## Animation07 — presentation-only enemy animation

```text
content/enemy-presentation-profiles|enemy-animation-profiles|animation-lod-policies|animation-shadow-policies
  → generate-enemy-animation-content (Zod + reference validation)
  → src/generated/enemyAnimationContent.generated.ts
  → resolveEnemyPresentation (profile → model assets + animation profile)
  → EntityViewFactory (near skinned / far rigid instances)
  → EnemyAnimationController (semantic roles, cross-fades, death lock)
  → AnimationLodManager (hero/near/mid/far/aggregate + mixer budgets)
```

Authority decides position/yaw/attack/damage/death; the client only chooses
presentation. No bone data is networked; optional compact action cues map to
roles through content. Horde materialize records carry a presentation
profile index (protocol v5). See
`docs/animation07/ANIMATION07_IMPLEMENTATION_REPORT.md`.

## Progression08 — authoritative power-up / relic progression

```text
content/progression-* (validated ContentPack categories)
  → MatchRules progression content
  → ProgressionSystem (team XP, level-ups, chests, relics, triggers)
  → MatchFlowState gate (pause during selection, wall-clock timeout)
  → protocol v6 selectUpgrade + snapshot-replicated progression state
```

XP shards replicate as `MatchState.xpShards`; kills route through reward
events; purge never rewards. Stat layers (level multipliers × relic
aggregates × conditionals) project through the existing StatResolver.
See `docs/progression08/PROGRESSION08_IMPLEMENTATION_REPORT.md`.
