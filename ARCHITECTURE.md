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
are client-only.

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
through the bundled `presentation` definition.

## Intended engine defaults (documented, not accidental)

- Wire `EnemyState.type` strings map to definitions via a fixed table in
  `EnemySystem` (`scrapBug`, `rammer`, `gunTower`, `lootTruck`).
- The client-safe Practice path resolves rules from legacy constants
  (`createLegacyDemoRulesBundle`) that mirror the validated Demo content;
  the browser bundle intentionally avoids fs/zod.
- Arena obstacle/barrel/ramp/route layout remains hardcoded in `arena.ts`
  (visual/static geometry, not gameplay rules).
- One dodge-credit flag per match (legacy parity), documented in status.
