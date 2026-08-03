# Recoil Crew DS — Full Refactor Report (Phases 0–6)

**Branch:** `refractor_01`
**Commits:** 14 (7 phase commits + 7 status follow-ups), from `2fff386` to `edea6ce`
**Scope:** 205 files changed, 25,347 insertions, 2,876 deletions
**Result:** the working score-attack prototype became a validated,
data-driven split-control tank framework with the Demo preserved
byte-for-byte.

---

## Phase 0 — Baseline audit and golden-master protection

- Audited every source/test file; wrote `REFACTOR_BASELINE_AUDIT.md`
  (module map, Match/Game responsibilities, network messages, ownership,
  asset path, hardcoding inventory, config usage, test gaps).
- Added `REFACTOR_STATUS.md` from the template.
- Built a deterministic Demo regression harness (fixed seed, scripted
  Driver/Gunner inputs) with canonical checkpoints (initial, t10, t30,
  Loot Truck window, JACKPOT window, completion, results, rematch reset)
  and a checked-in golden fixture.
- Added 7 characterization areas (duration source, weapon input fields,
  enemy mapping, manifest behavior, practice/online parity, per-room
  config isolation, predictor config source).

## Phase 1 — Core runtime contracts, schemas, registries, content loading

- Created the `content/` tree with validated Demo definitions
  (`demo@1.0.0`) and a Zod schema set for every category.
- Implemented ContentLoader, ContentPack, DefinitionRegistry,
  BehaviorRegistry, ReferenceValidator, stat-id catalog, and a
  deterministic sha256 content hash; definitions are frozen.
- Added core contracts (GameplaySystem, SimulationContext,
  GameplayEventBus, EntityRegistry, SystemScheduler, GameModeRegistry).
- Added LegacyConfigAdapter/LegacyContentAdapter with config-parity tests;
  server rooms carry additive content metadata.

## Phase 2 — Immutable rules, runtime stats, DemoMode, systems

- Replaced the shared `BASE_CONFIG` reference with per-match immutable
  `MatchRules` (`ContentPack → mode → difficulty`) and a StatResolver
  (add/multiply/override, priorities, stacking, duration, dirty cache).
- Added `rulesRevision`/`movementRulesRevision` and a compact movement
  block replicated on snapshots; the Driver predictor applies it.
- Added DemoScoreAttackModeDefinition/Runtime and extracted Round,
  Objective, Score, Combo, Jackpot, and Result systems; `Match` became a
  thin facade over `MatchRuntime`.

## Phase 3 — Modular loadouts, weapons, projectiles, damage, recoil

- Generic gunner actions `primary`/`secondary`/`ability` with an additive
  adapter from `mg`/`cannon`/`charge`.
- Weapon definitions in spec format (behaviorId, fireMode, cooldown,
  statBlock, projectileId, presentation) with hitscan/projectile/
  chargeProjectile behaviors; ProjectileSystem and DamageSystem
  (requests/results/sources/tags) emit semantic bus events; scoring/drops
  react to `entity.killed`; RecoilEffect is reusable.

## Phase 4 — Enemies, items, effects, drops, spawning, objectives

- Enemies became composed behavior lists in JSON (seekTank, circleTarget,
  separation, obstacleAvoid, integrate, telegraphedCharge, projectileBurst,
  contactRam, followRoute, traits) — no per-type switch in EnemySystem.
- Drop tables + DropTableResolver (deterministic scatter), PickupSystem
  (definition-driven life/magnet/collection), SpawnDirectorRuntime
  (schedules, truck timing, final chaos from content).
- ItemSystem/StatusEffectSystem/TriggeredEffectRegistry (instant + timed
  modifiers, stacking, expiration); objectives react to typed events.

## Phase 5 — Client coordinator split and asset architecture

- `Game` (1053 lines) split into GameClient + RenderWorld,
  EntityViewRegistry/Factory, NetworkStatePresenter, CameraManager,
  PredictionController, PresentationEventRouter, HudController,
  PipRenderer, QualityManager.
- `AssetService.load()` awaited before construction; GLB prototypes cached
  and cloned per instance with transform/socket/material metadata;
  presentation (models/VFX/audio/themes/icons/camera impulses) routes
  through the bundled presentation definition; registered procedural
  fallbacks remain.

## Phase 6 — Extensibility proof, legacy removal, documentation

- Proof content with zero MatchRuntime/EnemySystem edits: `mode.truckHunter`
  (different completion rule: truck-escape), `weapon.rapidCannon`,
  `enemy.testHound`, `item.overdriveCannon`.
- Removed LegacyConfigAdapter/LegacyContentAdapter (folded into the rules
  layer) and LegacyWeaponInputAdapter — the gunner wire contract is now
  `primary`/`secondary`/`ability` everywhere.
- Removed dead spawn arrays, the enemy-radius switch, `globalEnemyId`,
  obsolete imports/paths; starter spawns now come from content.
- Documentation: ARCHITECTURE, CONTENT_AUTHORING_GUIDE,
  ADDING_A_GAME_MODE/WEAPON/ENEMY/ITEM_OR_EFFECT, NETWORK_RULES; README,
  ASSET_GUIDE, DECISIONS, BUILD_STATUS, SMOKE_TEST, REFACTOR_STATUS updated.

---

## Final state

- **Server authority + prediction:** authoritative MatchRuntime at 30 Hz;
  Driver prediction uses shared kinematics + replicated movement rules
  revision; Gunner turret prediction and TPS cameras are local.
- **Content:** validated, frozen JSON for modes/objectives/tanks/loadouts/
  weapons/projectiles/enemies/drop-tables/pickups/items/effects/spawn-
  directors/scoring/results/difficulties/presentation; deterministic hash.
- **Client:** thin GameClient over focused modules; awaited semantic asset
  service with prototypes/instances/fallbacks.
- **Extensibility:** new ordinary modes/weapons/enemies/items are JSON-led
  (novel algorithms need a registered TypeScript primitive).

## Verification (final)

| Gate | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm test` | PASS — 24 files, 238/238 |
| `npm run test:e2e` | PASS — 14/14 |
| `npm run test:loop` | PASS — full 90s round + rematch |
| `npm run test:demo` | PASS — golden Demo byte-identical |

## Remaining intentional hardcoding

- `MatchRuntime`: tank movement, barrel props, results wiring, inputs.
- `arena.ts`: obstacle/barrel/ramp/route geometry.
- Client: registered procedural fallbacks + bundled presentation catalog.
- Client-safe Practice rules bundle mirrors the validated Demo pack.

## Token expenditure (estimate)

The model has no metered token counter for this session, so the following
are estimates, not audited numbers:

- Authored diff content (measured): 963,307 characters ≈ **~241k tokens**
  (chars/4 heuristic over `git diff 2fff386..HEAD`).
- Total session spend including repeated source/doc reads, tool outputs,
  and reasoning: **~700k–1.2M tokens** (rough heuristic; inputs and
  outputs were not metered per turn).

The defensible, measurable number is the diff proxy: about 240k tokens of
final authored content. Treat the broader range as an order-of-magnitude
estimate only.
