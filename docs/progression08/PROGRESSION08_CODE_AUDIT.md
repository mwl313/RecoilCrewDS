# Progression08 — Code Audit

Branch: `progression` (fork of `combat-rework` @ `14e279d`), clean tree.
Audit performed before progression implementation.

## 1. Match state shape (`src/shared/types.ts`)

- `MatchState` carries tank/turret/combo/build/stats/enemies/pickups/shells/
  barrels/truck + counters. `build.capabilities` is the replicated
  capability list.
- `PickupState` is `{ id, kind: 'normal' | 'heavy', x, y, z, life,
  collected }`. There is no XP shard kind, no velocity, no value field.
- No progression state, match flow state, selection state, chest state, or
  relic inventory exists.

## 2. Pickups and drops

- `PickupSystem` (`src/shared/pickups/pickupSystem.ts`) spawns normal/heavy
  scrap, applies a flat magnet (`def.magnetRadius * matchConfig.pickupMagnet`)
  with a linear pull, collects inside 1.15 m, scores via `ScoreSystem`.
- `DropTableResolver` (`src/shared/drops/`) resolves enemy drop tables into
  pickups; kills call `resolveFor` from `MatchRuntime.onEntityKilled`.
- No XP value, proximity acceleration, or team-XP collection exists.

## 3. Kill / purge / reward paths

- `DamageSystem.applyEnemy` emits `entity.killed` and drains the bus
  synchronously. `MatchRuntime.onEntityKilled` marks the enemy dead, scores,
  resolves drops, and emits the wire `kill` event.
- `WaveController.finishWave` purges the wave cohort through
  `EnemySystem.purge` (no kill hooks, no XP, no drops — correct foundation),
  fires `waveEvent` and calls `stage.notifyLeaderKilled`.
- No leader reward payload, chest guarantee, or purge telemetry event yet.
- `EnemySystem.purge(predicate)` removes enemies directly and deletes their
  runtimes.

## 4. Stats

- `StatResolver` evaluates `base + Σ(add) × Π(multiply) → override →
  clamp`, with per-stat dirty caching and modifier ids/stacking
  (`stack/refresh/replace/highest/lowest`), timed modifiers, source-based
  removal.
- `MatchRules` projects resolved stats into frozen `GameConfig` /
  `MatchConfig`; movement-critical stats bump the movement revision so the
  driver predictor receives updates.
- `StatIds` has match/tank/weapon/enemy scopes; no `progression.*` stats.
- `ItemSystem` / `StatusEffectSystem` apply modifiers + capabilities through
  `MatchRules` and `CapabilitySystem`.

## 5. Capabilities

- `CapabilitySystem` (source reference counting) keeps the authoritative
  list in `MatchState.build.capabilities` (replicated). `grant(id, source)`
  and `revokeSource(source)` are source-safe. New match resets.

## 6. Combat

- `TankContactCombat` implements Dash-only contact (normal contact = 0),
  per-target dash cooldown, spatial-index query, dash kill/score. No
  ROADKILL hook.
- `DamageSource` union has no `roadkill`; `DamageRequest` has no
  attacker/context fields.

## 7. Match flow / pause

- `MatchRuntime.step` advances everything (stage, horde, enemies, contact,
  projectiles, pickups, weapons, tank) whenever `phase` is running/countdown.
- `StageDirector` owns stage phase only. There is no `MatchFlowState`
  gate; no selection pause exists.

## 8. Networking

- `PROTOCOL_VERSION = 5` (Animation07 bump). Client messages:
  create/join/rejoin/ping/ready/input/action/rematch/leave. No progression
  selection message.
- Snapshots carry the full `MatchState`; horde replication carries compact
  enemy deltas. Reconnect reconstructs from snapshots.
- `src/server/room.ts` validates roles/membership and dispatches typed
  messages; `GameClient` sends input via `onSendInput`.

## 9. Content pipeline

- `ContentPack` categories are fixed in `CONTENT_CATEGORIES`; server loads
  validated JSON (Zod per category + `ReferenceValidator`), browser consumes
  the generated `contentPack.generated.ts`. No progression categories exist.
- `generate-presentation-content` additionally generates the enemy-animation
  bundle (Animation07).

## 10. Single Player / Multiplayer

- Single Player uses the same `MatchRuntime`/`MatchRules` locally
  (`GameClient.startSinglePlayer`), networked mode uses server `room.ts`.
- Both will share the same progression content definitions; only the
  selection execution policy differs.

## 11. Animation 07 (must not break)

- `EntityViewFactory`/`EntityViewRegistry` resolve enemy presentation from
  content profiles; animation is presentation-only. Progression must not
  mutate enemy visuals or simulation timing beyond the flow gate.

## 12. Existing tests/scripts

- vitest suites (87 files / 700 tests), demo golden, Playwright E2E
  (33 tests), benchmark scripts, mapgen sweep, maplab suites. New
  progression tests will be added under `tests/progression08/`.
