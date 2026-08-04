# Arcade Upright Aerial Movement — Implementation Plan

Contract: `docs/game-feel/ARCADE_UPRIGHT_AERIAL_MOVEMENT_DESIGN.md` (binding).
Audit date: 2026-08-04. Branch: `arcade-aerial-movement` (local, not pushed).

## 0. Current-state audit

### Movement data flow

```text
content/tanks/default.json + content/weapons/*.json + content/loadouts/default.json
→ Zod schemas (tank.ts, weapon.ts, loadout)
→ ContentPack
→ contentConfig.legacyGameConfigFromContent() → GameConfig/MatchConfig
→ MatchRules (StatResolver over baseStatBlocksFromConfig + statIds)
→ MovementRulesBlock (matchRules.movementBlock(), replicated on snapshot)
→ stepTankKinematics() on server + SharedTankPredictor + Practice
```

Legacy path: `MatchRules.fromLegacyConfig()` builds the same flat stat blocks
from `BASE_CONFIG` via `legacyDemoRules.ts`; parity is asserted in
`tests/matchRules.test.ts`.

### Recoil call graph

```text
GunnerInput → WeaponSystem.update() → WeaponBehaviorRegistry
→ weaponBehaviors.hitscan / projectile / chargeProjectile
→ RecoilEffect.apply(dirX, dirZ, impulse, spin, weaponId)
→ TankImpulseSystem (network03) → TankState deltas + typed tankImpulse wire
```

Current recoil is horizontal-only (`dirX/dirZ`), with a fixed airborne lift
(`vy += 1.8 * clamp(impulse/7,0,1.4)`). Downward aim cannot launch the tank.

### Input/prediction path

Driver input → `stepTankKinematics` (server, SharedTankPredictor, Practice).
Gunner recoil impulses bypass Driver input prediction but are applied to both
predictors immediately via `tankImpulse` events (network03) and replayed on
reconcile from snapshot `lastImpulseSeq` + opLog.

### Tank state reconciliation

`TankState` ↔ `TankKinematicState` conversions live in
`src/client/prediction/sharedTankPredictor.ts` (`fromTank`, `copyToDisplay`)
and `matchRuntime.initialTank`/`respawn`. New movement-affecting state
(`landingGripT`) must flow through all of them.

### Enemy movement

Enemies compose behavior primitives (`movement.seekTank`, `circleTarget`,
`separation`, `obstacleAvoid`, `movement.integrate`). `movement.integrate`
snaps `e.y` to ground height and applies the cliff upward-step guard.
Projectiles damage enemies in `ProjectileSystem.explode()`; there is no
knockback.

### Projectile splash

`ProjectileSystem.explode()` applies radial damage to enemies/barrels and
self-splash damage to the tank. No impulse/knockback exists.

### Cliff transitions

`queryTerrainTransition()` + `canTraverseGroundStep()` guard grounded upward
climbs for tank and enemies; downward movement is allowed. Preserved.

## 1. Files to change

- `content/tanks/default.json`, `src/shared/content/schemas/tank.ts`,
  `src/shared/config.ts`, `src/shared/rules/contentConfig.ts`,
  `src/shared/stats/statIds.ts`, `src/shared/rules/legacyDemoRules.ts`
- `content/weapons/{mainCannon,machineGun,jackpotShell}.json`,
  `src/shared/stats/statIds.ts` (weapon recoil/knockback stats)
- `content/loadouts/default.json` (turret minPitch)
- `src/shared/stats/rulesRevision.ts`,
  `src/shared/rules/matchRules.ts` (turret pitch in movement block)
- `src/shared/sim/tankKinematics.ts` (damping, air grip, landing grace,
  airborne visual pitch/roll, hard cap)
- `src/shared/types.ts` (`TankState.landingGripT`, enemy impulse fields)
- `src/shared/sim/matchRuntime.ts` (initial/respawn state)
- `src/shared/effects/tankImpulseSystem.ts` (spec-based apply, ground
  launch, horizontal hard cap, sourceId/kind)
- `src/shared/effects/recoilEffect.ts` (3D spec, no fixed lift)
- `src/shared/weapons/weaponBehaviors.ts` (full inverse muzzle vector)
- `src/shared/effects/radialImpulseEffect.ts` (new),
  `src/shared/enemies/enemyImpulseController.ts` (new)
- `src/shared/content/schemas/enemy.ts` + `content/enemies/*.json`
- `src/shared/projectiles/projectileSystem.ts` (knockback delegation)
- `src/shared/enemies/enemySystem.ts`, `enemyBehaviors.ts`
  (airborne suppression)
- `src/shared/sim/systems/systemContext.ts` (wire new systems)
- `src/client/prediction/sharedTankPredictor.ts` (landingGripT conversion)
- `src/client/app/predictionController.ts` (turret pitch from movement block)
- `content/scenes/howTo.json` (controls copy)
- Tests: `tests/tankKinematics.test.ts`, `tests/jumpDash.test.ts`,
  `tests/weaponSystem.test.ts`, `tests/enemySystem.test.ts`,
  `tests/netcode/*`, new `tests/movement/` focused suite

## 2. Milestone order and test strategy

1. **M0** — baseline fixtures + this plan.
2. **M1** — data contracts + parity tests (content vs legacy equality).
3. **M2** — kinematics + landing grace + visual clamp tests.
4. **M3** — impulse system + 3D recoil + launch + cap tests.
5. **M4** — prediction reconciliation tests (impulse dedupe/replay).
6. **M5** — enemy knockback + cliff fall tests.
7. **M6** — How To copy, docs, demo golden regeneration (intentional value
   change), full gates.

## 3. Authoritative per-tick ordering (preserved)

```text
1. Driver movement (stepTankKinematics; recoil/impulses applied inside
   weapon update as exact deltas)
2. WeaponSystem (turret, MG, cannon, JACKPOT → TankImpulseSystem + shells)
3. EnemySystem (behaviors + impulse controller)
4. ProjectileSystem (impact → radial knockback)
5. Pickups/spawn/score/combo/round
6. Event + impulse + snapshot emission
```

The Demo golden fixture will be regenerated once with `npm run demo:write`
because gravity/jump/dash/recoil values intentionally change; the reason is
documented in the implementation report.
