# Recoil Crew DS — Refactor Acceptance and Regression Matrix

## 1. Universal gate

```bash
npm run build
npm test
npm run test:e2e
npm run test:loop
```

Require no critical browser errors, full Demo completion, results, rematch, and Practice.

## 2. Demo regression

Preserve:

- Room create/join/copy/ready/countdown
- Driver movement, camera, prediction, reconciliation
- Gunner camera, aim, turret prediction, no duplicate shots
- Recoil, collision, wipeout/respawn
- Scrap Bug, Rammer, Gun Tower, Loot Truck
- Scrap, Crew Combo, JACKPOT, assistance, countdown
- Grades/titles
- HUD, PIP, audio, VFX, asset fallbacks

## 3. Core architecture

- `MatchRuntime` coordinates rather than implements all rules.
- Systems have explicit contracts and tests.
- Events are typed.
- Definitions are frozen.
- Match rules are isolated per room.
- `GameClient` coordinates focused client modules.
- Prediction remains separate from interpolation.

## 4. Content

- Valid Demo pack loads.
- Duplicate/missing/unknown references fail.
- Unknown behavior/stat IDs fail.
- Error includes file and JSON path.
- Hash deterministic.
- Invalid authoritative data never silently falls back.
- Demo loads from JSON.

## 5. Modes and stats

- Demo selected by ID.
- Duration/objective/result rules are not hardcoded in `MatchRuntime`.
- Add/multiply/override and stacking are tested.
- Timed modifiers expire.
- Two rooms can use different rules.
- Movement changes update Driver prediction.

## 6. Weapons

- Current weapons are definitions/loadout entries.
- Generic primary/secondary/ability works.
- Cooldowns and recoil stay authoritative.
- A proof weapon can be added without editing the match loop.

## 7. Enemies/items/objectives

- Current enemies preserve behavior through definitions.
- Ordinary composed enemies require no growing type switch.
- Items apply authoritative effects.
- Spawn schedules are content.
- A proof mode changes the objective without a mode-ID branch in `MatchRuntime`.

## 8. Assets/client

- Asset manifest awaited.
- Custom GLB instantiated.
- Fallback works.
- Transform/socket metadata works.
- VFX/audio/theme definitions are used.
- Rematches/swaps do not leak views, passes, or listeners.

## 9. Phase 6 proof content

Required minimal proof:

- One alternate mode
- One ordinary new weapon
- One enemy composed from existing behaviors
- One item/status effect modifying a runtime stat

These are architecture proofs, not full content expansion.

## 10. Performance

- No JSON parsing per simulation step.
- Content loads once.
- Stat cache invalidates only when needed.
- Event queues bounded.
- Per-room state isolated.
- Asset prototypes cached/cloned.
- Rematch resets/disposes state.

## 11. Final documentation

```text
ARCHITECTURE.md
CONTENT_AUTHORING_GUIDE.md
ASSET_GUIDE.md
ADDING_A_GAME_MODE.md
ADDING_A_WEAPON.md
ADDING_AN_ENEMY.md
ADDING_AN_ITEM_OR_EFFECT.md
NETWORK_RULES.md
REFACTOR_STATUS.md
```
