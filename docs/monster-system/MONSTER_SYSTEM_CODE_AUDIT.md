# Monster System Code Audit

Branch: `monster-system` (based at `6c26676`). Date: 2026-08-06.

## Authoritative enemy state and spawn path

- `src/shared/enemies/enemySystem.ts` owns enemy state. `spawnEnemy(type)` maps
  legacy `EnemyType` → definition id; `spawnEnemyDef(def)` creates
  `EnemyState`, pushes it into `matchState.enemies`, and allocates an
  `EnemyRuntimeState` (scratch: `dirX/dirZ`, `distToTank`, `speed`, LOD tier).
- Enemy definitions are discriminated by `type`: `scrapBug`, `rammer`,
  `gunTower`, `lootTruck` (`src/shared/content/schemas/enemy.ts`).
- Behaviors are data-driven primitives registered in
  `src/shared/enemies/enemyBehaviors.ts` (`movement.*`, `attack.*`,
  `defense.*`, `trait.*`) and dispatched through `EnemyBehaviorRegistry`.
- `EnemyState` lives in `src/shared/types.ts`; `EnemyRuntimeState` in
  `src/shared/enemies/enemyRuntimeState.ts`.

## Individual versus aggregate horde behavior

- Horde director/waves/population live under `src/shared/horde/`
  (`hordeDirector.ts`, `waveController.ts`, `populationManager.ts`,
  `spawnPlanner.ts`, `hordeSectors.ts`).
- `hordeSectors.ts` aggregates far enemies into presentation-only sectors.
  `AggregateSectorRenderer` (client) renders them instanced; sectors do not
  apply combat damage.
- LOD simulation tiers (0 combat … 3 aggregate) are governed by
  `EnemyLodPolicyDefinition` and `tierFor()` in `EnemySystem`.

## Projectile and damage authority

- `src/shared/projectiles/` (`projectileSystem.ts`, behavior registry,
  behaviors) owns shells; kinds are `cannon`/`tower`
  (`content/projectiles/`, schema `projectile.ts`).
- Damage is applied through `SystemContext.damage` (`applyTank`,
  `applyEnemy`); kill events flow through `entity.killed` →
  `MatchRuntime.onEntityKilled` → scoring/drops, and
  `ProgressionSystem.onEntityKilled` → XP.

## XP award path and mode multipliers

- `ProgressionSystem.onEntityKilled` grants XP shards by population class
  (`ambient/wave/elite/boss` from `ownership.populationClass`), plus
  leader/boss lump rewards and chest drops.
- `content/progression-definitions/mainStage.json` holds legacy
  `enemyXpRewards` (ambient 1, wave 2, elite 40, boss 150) and the level curve
  reference.
- Mode policies: `content/progression-mode-policies/singlePlayer.json` has
  `xpMultiplier: 2`; multiplayer has `xpMultiplier: 1`. Single Player XP ×2
  already exists globally.

## Timer / result transitions

- `MatchRuntime` runs a fixed round duration (Demo 90 s) then emits results.
  There is no explicit FARMING/BOSS phase machine today.

## Animation, presentation, LOD, preload

- `content/enemy-animation-profiles/` and `content/enemy-presentation-profiles/`
  include the full Quaternius set (hero/common variants); semantic roles
  `idle/walk/attackPrimary/hit/stagger/spawn/death` exist.
- `src/client/animation/` owns mixers and clip resolution; far/aggregate
  rendering is rigid/instanced via `AggregateSectorRenderer`.
- `AssetService.preloadModels()` enables stage-selective preload; Quaternius
  assets are optional project assets.
- `scripts/validate-enemy-animations.ts` and `tests/monsterpack10/*` validate
  profiles, asset registration, near/far resolution, and cleanup.

## Content generation and commands

- Generation: `generate:presentation-content`, `generate:content-pack`,
  `generate:map-profiles`; generated modules live in `src/generated/`.
- Commands audited: `npx tsc --noEmit`, `npm test`, `npm run build`,
  `test:demo`, `test:coreloop`, `test:horde`, `test:horde:benchmark`,
  `test:netcode`, `test:progression`, `validate:enemy-animations`,
  `test:monsterpack-import` (all pass at baseline).

## Migration hazards

- The legacy enemy schema is a strict discriminated union; a new `monster`
  variant must not disturb `scrapBug/rammer/gunTower/lootTruck` parsing.
- `MatchRuntime` kills/XP are type-switch-heavy; the generalized path must be
  additive.
- Projectiles are `cannon|tower`; enemy projectiles require a new kind plus a
  behavior that is slow, telegraphed, and collides with terrain/obstacles/tank.
- The Demo golden and 90-second match flow must remain byte-identical while
  the generalized monster runtime is being introduced (strangler pattern).
