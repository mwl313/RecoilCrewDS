# Recoil Crew DS — Refactor Philosophy and Target Architecture

## 1. Philosophy

### Preserve first, generalize second

The current game already has working multiplayer, prediction, interpolation, TPS cameras, collision, combat, enemies, scoring, results, rematch, Practice, PIP, and tests. Preserve those behaviors while changing ownership.

```text
protect behavior
→ introduce interfaces
→ move existing code unchanged
→ prove parity
→ make it data-driven
→ prove extensibility
```

### The current mode is content

The framework must not assume every mode uses:

- A 90-second timer
- Score as the main objective
- Crew Combo or JACKPOT
- Loot Truck
- Current enemy schedules
- Current grades and titles

Those become `mode.demoScoreAttack` rules.

### Data-driven is a hybrid

```text
JSON:
values, references, combinations, schedules, definitions, modifiers

TypeScript:
algorithms, systems, validation, networking, unique behavior primitives
```

JSON may select `attack.telegraphedCharge`; a TypeScript registry supplies its implementation. Do not invent an executable JSON language.

### Immutable definitions, mutable runtime state

Definitions loaded from content are frozen. Runtime instances hold cooldowns, health, effects, objective progress, and other changing state. Never mutate global base definitions during a match.

### Stable IDs are the boundary

Use semantic IDs such as:

```text
mode.demoScoreAttack
tank.default
weapon.mainCannon
enemy.rammer
item.repairKit
effect.overdrive
objective.highScore
spawn.demo
```

Avoid array positions, class names, file names, and model child names as identity.

### Authority and prediction

The server owns content selection, rules, damage, enemies, items, score, objectives, and match flow. Clients receive content identity, rules hash/revision, resolved movement rules, state, and events.

Driver prediction must use the same movement-critical resolved stats as authority.

### Thin coordinators

Keep coordinators:

```text
MatchRuntime
GameClient
RoomSession
AssetService
```

They orchestrate modules but do not contain each module’s rules.

### Avoid overengineering

Do not add a full ECS, reflection-heavy DI, microservices, arbitrary user scripting, or universal behavior graphs unless a proven later need requires them.

## 2. Existing strengths to preserve

```text
src/shared/sim/tankKinematics.ts
src/shared/net/interpolation.ts
src/client/tpsCamera.ts
src/client/predictor.ts
src/client/clipboard.ts
```

Also preserve the current shared/server/client separation and test suites.

## 3. Current concentration problems

### `src/shared/sim/match.ts`

It currently owns or coordinates tank lifecycle, weapons, projectiles, enemies, spawning, pickups, combo, score, JACKPOT, barrels, assistance, wipeout, phase, and results.

### `src/client/game.ts`

It combines renderer, entity views, interpolation, Driver prediction, turret prediction, cameras, Practice simulation, audio, VFX, PIP, quality, and role switching.

### `config.ts`, `types.ts`, and assets

Gameplay values remain mixed with engine defaults; shared types are concentrated; semantic asset registries exist but the final runtime path must consistently use them.

## 4. Target dependency direction

```text
Validated JSON content
→ definition/behavior registries
→ selected mode and match rules
→ MatchRuntime and gameplay systems
→ authoritative state/events
→ replication
→ client prediction/presentation
→ AssetService, audio, VFX, HUD
```

Forbidden reverse dependencies include shared simulation importing Three.js, gameplay systems importing HUD, and presentation deciding gameplay outcomes.

## 5. Target structure

```text
content/
├── manifest.json
├── modes/
├── objectives/
├── tanks/
├── loadouts/
├── weapons/
├── projectiles/
├── enemies/
├── items/
├── status-effects/
├── spawn-directors/
├── scoring/
├── results/
├── difficulties/
└── presentation/

src/shared/
├── core/
│   ├── matchRuntime.ts
│   ├── simulationContext.ts
│   ├── system.ts
│   ├── systemScheduler.ts
│   ├── entityRegistry.ts
│   └── gameplayEventBus.ts
├── content/
│   ├── contentPack.ts
│   ├── contentLoader.ts
│   ├── definitionRegistry.ts
│   ├── referenceValidation.ts
│   └── schemas/
├── stats/
│   ├── statIds.ts
│   ├── statBlock.ts
│   ├── statModifier.ts
│   ├── statResolver.ts
│   └── rulesRevision.ts
├── gameplay/
│   ├── tank/
│   ├── weapons/
│   ├── projectiles/
│   ├── damage/
│   ├── enemies/
│   ├── pickups/
│   ├── items/
│   ├── status/
│   ├── objectives/
│   ├── scoring/
│   ├── spawning/
│   ├── rounds/
│   └── respawn/
├── modes/demoScoreAttack/
├── net/
└── types/

src/client/
├── app/gameClient.ts
├── rendering/
├── camera/
├── prediction/
├── presentation/
├── assets/
├── ui/
├── pip/
└── net/
```

This is a target reached incrementally; temporary re-exports and adapters are acceptable.

## 6. Core contracts

```ts
interface GameplaySystem {
  readonly id: string;
  initialize?(context: SimulationContext): void;
  update(context: SimulationContext, dt: number): void;
  reset?(context: SimulationContext): void;
  dispose?(): void;
}
```

`MatchRuntime` owns match-scoped context, selected mode, scheduler, clock, state snapshots, and event draining. It does not implement all weapon/enemy/objective logic.

Typed gameplay events include:

```text
weapon.fireRequested
weapon.fired
projectile.spawned
damage.requested
damage.applied
entity.killed
pickup.collected
effect.applied
objective.progressed
score.awarded
tank.wipeout
round.completed
```

## 7. Modes

A mode definition selects systems, objectives, spawn director, scoring, result rules, difficulty, tank, and loadout. Complex mode algorithms use a registered runtime.

The current loop becomes `DemoScoreAttackModeRuntime`.

## 8. Client target

`GameClient` coordinates:

```text
RenderWorld
EntityViewRegistry
CameraManager
NetworkStatePresenter
PredictionController
PresentationEventRouter
HudController
PipRenderer
AudioManager
VfxManager
QualityManager
```

Prediction remains separate from interpolation. Camera math remains outside `GameClient`.

## 9. Success criteria

- Demo selected by mode ID.
- MatchRuntime and GameClient become thin.
- JSON definitions are validated and frozen.
- Runtime stats support safe modifiers and revisions.
- New ordinary weapons do not require editing the match loop.
- New enemies using existing behaviors do not require adding a type switch.
- Items can apply runtime effects.
- New objectives can be selected by modes.
- All presentation assets route through one semantic service.
- Existing Demo behavior remains passing.
