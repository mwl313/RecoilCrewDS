# Core Loop 06 — Code Audit

**Branch audited:** `combat-rework` @ `09ae211`  
**Design:** `docs/coreloop06/CORE_LOOP_AND_HORDE_SPAWN_SYSTEM_DESIGN.md`

This audit records the current Combat 05 architecture that Core Loop 06 must
integrate with. It is the migration checklist for the stage/horde work.

---

## 1. Phase and timer ownership

- `MatchState.phase` is `'lobby' | 'countdown' | 'running' | 'results'`
  (`src/shared/types.ts`).
- `MatchState.time` is total elapsed simulation time (used for pacing,
  results, and golden determinism).
- Round completion is owned by `RoundSystem.checkCompletion()` through
  `DemoScoreAttackModeRuntime.checkCompletion()`; the Demo round ends at
  `GAME.roundDuration` (90 s) → `results`. There is **no stage/farming
  countdown** and no wave/boss concept.

## 2. Round-end behavior

- `MatchRuntime.step()` sets `this.results = this.mode.checkCompletion() ??
  this.results` at the end of every tick.
- Tank death currently respawns (`deadT` → `respawn()`) — there is no
  immediate game-over terminal state.
- Rematch creates a fresh `Match` in the same room.

## 3. Single Player match construction

- `GameClient.startSinglePlayer(pack, world)` builds
  `new Match('single-…', 'none', CLIENT_CONTENT_PACK, world,
  mode.singlePlayerScoreAttack)`.
- The same `MatchRuntime`/`MatchRules`/ContentPack pipeline is used as the
  server; only authority location and controls differ.

## 4. Multiplayer match construction

- `src/server/room.ts` creates `Match` per room when both players ready;
  snapshots at true 20 Hz (`SNAPSHOT_INTERVAL`, interval subtraction),
  full `state` JSON broadcast (single serialized payload for both sockets).
- Protocol version is 3 (`src/shared/net/protocol.ts`); Gunner actions carry
  click-time aim.

## 5. Spawn-director schema and runtime

- `src/shared/content/schemas/spawnDirector.ts` + `SpawnDirectorRuntime`
  (`src/shared/spawning/spawnDirectorRuntime.ts`):
  - Bug pacing: `minActiveBugs/maxActiveBugs/rampPerSecond/cap`,
    target from `2 + time * rampPerSecond`, clamped, spawns `scrapBug`
    until target.
  - Scheduled `rammerSpawns` (22/34/50), `towerSpawns` (26/58) at
    `towerSpots`, truck at 42 s, `finalChaos` after 70 s.
  - All timing is driven by **total elapsed match time** — the direct
    opposite of the stage-remaining design.
  - Uses global `s.enemies.filter(...)` scans per step and
    `Math.random()` (non-deterministic, non-seeded).

## 6. Enemy spawn ownership

- `EnemyState` has **no** population class, wave ID, leader ID, pack ID,
  anchor ID, or purge flag. All enemies are implicitly ambient/Demo.
- Spawn position falls back to `world.bugSpawns` (perimeter gates) with
  random jitter; towers use `towerSpots`.

## 7. Enemy removal behavior

- `EnemySystem.update()` filters `s.enemies` to alive or
  `stateT <= 2.5` (death presentation), then prunes runtime state maps.
- Removal is death-driven; there is no cohort purge path.

## 8. Full-population scans (hot paths)

- `EnemySystem.update()` iterates every enemy every tick (30 Hz fixed).
- `movement.separation` (`enemyBehaviors.ts`) is O(n²) pairwise over all
  same-type enemies per enemy — the biggest scaling hazard.
- `TankContactCombat.update()` scans all enemies every tick (contact).
- `ProjectileSystem.explode()` scans all enemies + barrels per explosion.
- `SpawnDirectorRuntime.step()` filters all enemies by type several times.
- `PickupSystem.update()` scans all pickups per tick.

## 9. Separation complexity

- `movement.separation`: for each enemy, loops all enemies of the same
  type → O(n²) per update.

## 10. Explosion/splash query complexity

- `ProjectileSystem.explode()`: global enemy loop + barrel loop per shell
  impact; knockback via `RadialImpulseEffect.apply()` also loops all
  enemies. No spatial index exists.

## 11. Dash-contact query path

- `TankContactCombat.update()` loops all alive enemies each tick, checks
  `dashDamageT > 0` + per-target cooldown, applies `dash` damage. This is
  the path the new spatial index must serve.

## 12. Enemy update frequency

- Every enemy runs all its behavior primitives every 30 Hz simulation tick,
  plus `EnemyImpulseController.update` per enemy. No LOD, no time slicing.

## 13. Terrain traversal behavior

- `canTraverseGroundStep` (shared `terrainTraversal.ts`) blocks upward
  cliff/step crossing for grounded movement (tank, enemies via
  `movement.integrate`, truck). Enemies use direct line movement with
  obstacle avoidance look-ahead; no flow field or route planning.

## 14. Rendering object allocation

- `EntityViewFactory.createEnemyRig` + `EntityViewRegistry` create a
  **per-enemy cloned model hierarchy** (group + model + optional head +
  telegraph) with individual materials. No instancing, no pooling; draw
  calls and objects scale linearly with enemy count.

## 15. Client entity reconciliation

- `NetworkStatePresenter.syncWorld()` reconciles `frame.enemies` against
  `registry.enemyRigs` (create/update/remove per snapshot) using per-enemy
  `Set`s each frame. Every snapshot carries the full enemy array.

## 16. Full snapshot structure

- `broadcastSnapshot` sends `{ t:'snapshot', seq, serverTime, serverTick,
  lastProcessed*InputSeq, lastImpulseSeq, opLog, state, rulesRevision,
  movementRulesRevision, tickDurationMs, …, arena }` at 20 Hz.
- `state.enemies` includes every enemy's full object (x,y,z,yaw,hp,maxHp,
  state,stateT,aimYaw,speed,alive,telegraph,flash,spawnT,hitCd,impulse*,
  lastImpulse*) — no delta encoding, no tiering.

## 17. Serialized enemy fields

- See `EnemyState` in `src/shared/types.ts`: ~20 fields per enemy per
  snapshot, all sent every 50 ms.

## 18. Network rate

- Simulation 30 Hz; snapshots 20 Hz (measured 1803–1804 per 90 s in
  `test:loop`). No per-enemy delta channels.

## 19. Combat 05 contracts (must remain)

- Dash-only contact damage (`dashDamageT`, `TankContactCombat`, source
  `dash`; no speed-based 999 ram).
- Instant turret + click-time aim; protocol v3.
- No fall damage (fields/source/callbacks removed).
- Charge Shot = `weapon.mainCannon` + `cannon.charge` capability (on by
  default via `mode.defaultCapabilities`); tap/hold-release; full clamp;
  no auto-fire; cannon damage source; per-shell combat payload.
- Jackpot subsystem fully removed (no meter/system/weapon/projectile/
  pickup/source/results/HUD; deprecated optional `ability` fixture field
  only).

## 20. Generated-content process

- `content/` JSON → `ContentLoader` (server) and generated client-safe
  bundle (`npm run generate:content-pack` → `contentPack.generated.ts`).
- Presentation content: `npm run generate:presentation-content`.
- Map profiles: `npm run generate:map-profiles` → `mapProfiles.generated.ts`.
- Stale-file tests guard each generated bundle.

## 21. Test/E2E commands

See `package.json`: `test`, `test:demo`, `test:e2e`, `test:loop`,
`test:maps`, `test:maps:sweep`, `build:maplab`, `test:maplab`,
`build:presentation-preview`, `test:presentation`, `test:netcode`,
`test:netcode:e2e`. Core Loop 06 adds `test:coreloop`, `test:horde`,
`test:horde:benchmark`, `test:horde:e2e`.

## 22. Integration seams for Core Loop 06

```text
StageDirector/FarmingClock → new src/shared/stage (typed, event-bus driven)
HordeDirector/WaveController → new src/shared/horde
SpawnPlanner/anchors → arena metadata + match RNG
EnemySpatialIndex → src/shared/spatial; feeds contact/splash/separation
Flow field → src/shared/navigation (tank-reverse field)
Enemy LOD → EnemySystem update groups + promotion overrides
Tiered replication → new horde protocol channels (protocol v4+)
Instanced fodder rendering → client/enemies batches
HUD stage info → content-driven HUD bindings
```

The Demo spawn director and 90-second round remain the legacy adapter until
the HordeDirector becomes authoritative.
