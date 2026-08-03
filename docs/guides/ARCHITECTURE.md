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
    CameraManager, PredictionController, PresentationEventRouter, HUD, PIP,
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
- `AppFlowController` owns flow state, scene selection, safe allowlisted
  actions, and network-driven transitions; `SceneRuntime` builds component
  trees once, caches binding handles, and disposes on unload.
- `HudProjector` projects `MatchState` into a typed `HudViewModel`;
  `HudRuntime` applies content bindings (text/value/visible/class/style/
  attribute + registered transforms) with per-binding change caching.
- `PresentationWorld` renders hybrid 3D menu backgrounds (separate renderer,
  disposed before gameplay) and `tools/presentation-preview/` inspects every
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
