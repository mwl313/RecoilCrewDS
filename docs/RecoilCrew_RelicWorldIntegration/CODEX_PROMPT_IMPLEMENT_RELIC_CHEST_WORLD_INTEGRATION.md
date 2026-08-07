# Codex Prompt — Implement Full Relic Chest World Integration

Repository:
```text
https://github.com/mwl313/RecoilCrewDS
```

Create a dedicated implementation branch from current `origin/main`, e.g.:
```text
relic-world-integration
```

Binding design:
```text
docs/relics/RELIC_CHEST_WORLD_INTEGRATION_DESIGN.md
```

Binding UI:
```text
docs/ui/UI_DESIGN_SYSTEM.md
docs/ui/RECOIL_CREW_UI_VISUAL_REWORK_DESIGN.md
```

Progression references:
```text
docs/progression08/POWERUP_AND_RELIC_PROGRESSION_SYSTEM_DESIGN.md
docs/progression08/reference/05-유물-테이블.md
docs/progression08/PROGRESSION08_IMPLEMENTATION_REPORT.md
```

Existing chest visual reference:
```text
docs/relics/RELIC_CHEST_ASSET_REPORT.md
src/client/relics/relicChestPresentation.ts
```

## Mission

Read the entire binding design first, then audit current `main` and implement the complete player-facing relic chest loop without rebuilding the already-working 28-relic gameplay system.

Settled requirements:
```text
10 map chests at match start
periodic map chest spawning
one starting discovery chest reasonably near tank spawn
class-aware enemy drops
special/elite higher drop rate
wave leader guaranteed
all chest sources tiny→full spawn
spawning chest cannot be claimed
automatic proximity opening
physical 0.65 s chest open before relic reveal
short ~2 s normal relic reveal
one relic now
state/protocol ready for future 3-candidate choose-one
opened chest fades/shrinks/despawns
right-side vertical owned-relic HUD with stack counts
icons not available yet: iconId + intentional fallback
```

## Mandatory audit

Run:
```bash
git fetch --all --prune
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -40
```

Record starting SHA. Work only on the dedicated branch. Do not merge `main`.

Inspect at minimum:
```text
src/shared/progression/progressionSystem.ts
src/shared/progression/treasureChestSystem.ts
src/shared/progression/progressionTypes.ts
src/shared/progression/relicInventory.ts
src/shared/progression/relicStatProjector.ts
src/shared/progression/relicEffectRegistry.ts
src/shared/sim/matchRuntime.ts
src/shared/types.ts
src/shared/content/schemas/progression.ts
src/shared/sim/arenaWorld.ts
src/shared/mapgen/
src/shared/horde/
src/shared/monsters/

src/client/relics/relicChestPresentation.ts
src/client/app/gameClient.ts
src/client/app/networkStatePresenter.ts
src/client/progression/progressionOverlay.ts
src/client/app/hudController.ts
src/client/ui/
content/hud/

content/progression-definitions/mainStage.json
content/relic-pools/main.json
content/relics/
content/modes/mainStage.json
content/modes/singlePlayerScoreAttack.json

src/server/room.ts
src/shared/net/
tests/progression08/
e2e/
package.json
```

Discover other relevant files.

## 1. Confirm and fix production drop routing

Reconfirm this current bug before editing:
```text
modern enemy.monster reward path returns before old enemyChestDropChance logic
```

Reconfirm whether modern leaders also bypass guaranteed leader chest.

Then refactor into one normalized reward path. Do not merely add a renderer.

Use modern:
```text
monster.rewardClass = ambient|wave|elite|boss
```
as class authority; map legacy ownership into same classes.

Add award-once chest resolution.

## 2. Implement class-aware content rates

Initial content:
```text
ambient 1.0%
wave 2.0%
elite/special 8.0%
boss 0% current single-stage
leader guaranteed exactly one
purge 0
```

Leader does not also random-roll.

All numbers must be content-driven.

If actual current special classification needs more detail, add a generic validated multiplier/metadata, not a monster-ID switch.

## 3. Add relic chest spawn policy

Implement the schema/category in the binding document using existing content pipeline.

Initial values:
```text
10 starting
discovery annulus 25–55 m
spacing 28 m provisional
periodic 20 s ±4
periodic min current-tank distance 35 m
max active map chests 14
max map-generated per match 20
spawn 0.50 s
claim radius 2.6 m
open 0.65 s
reveal 2.0 s
min skip 0.35 s
min open lifetime 2.0 s
despawn 0.45 s
```

Do not create a second runtime JSON loader.

## 4. Deterministic map spawning

Create a focused spawn director independent of urban map generation.

At match start produce exactly 10 valid chests.

At least one must satisfy discovery annulus.

Placement must be grounded, reachable/driveable, non-overlapping with buildings/walls/props/chests, finite and deterministic.

Use dedicated progression RNG streams, never `Math.random()`.

## 5. Periodic spawning

Spawn while gameplay active only.

Do not advance/queue during progression pause.

No burst of missed spawns after pause.

Use stealth distance; if no valid candidate, defer.

## 6. Implement lifecycle

Use:
```text
spawning → closed → opening → revealing → open → despawning → removed
```

Replicate authoritative timing/state for reconnect.

Client animation never determines claimability.

## 7. Tiny→full spawn

Every source:
```text
mapStart
mapPeriodic
enemyDrop
waveClear
```
starts visual scale 0.001 and reaches 1 over configured duration.

A chest cannot claim until authority says `closed`.

Preserve source chest materials exactly.

## 8. Proximity claim

No interact button.

Use configured radius.

If tank stays inside while chest finishes spawning, claim on first eligible step.

Multiple candidates: nearest then lowest ID.

One authoritative reward only.

## 9. Future-proof reward offer

Add/adapt candidate-array wrapper:
```text
candidates[]
selectionMode
selectedIndex
offerId
chestId
resolved
```

Production:
```text
1 candidate
automaticSingle
```

Add test-only state/network roundtrip with 3 candidates.

Do not enable triple selection UI/gameplay.

Preserve current acquired `RelicRollResult` compatibility where needed.

## 10. Opening/reveal sequencing

On claim:
```text
fix offer
opening state
pause gameplay
```

Wait for configured physical 0.65 s opening before reveal.

At reveal start acquire/apply one relic exactly once.

Use dedicated ~2 s reveal, not the level-up 10 s selection timeout.

Either player may skip only after minimum delay.

No reroll/reapply.

## 11. Integrate production chest renderer

Create focused world renderer using:
```text
custom.item.relicChest
RelicChestPresentation
```

Own a chest-ID map.

Implement spawn/open/open-state/despawn/reconnect/resource cleanup.

Reuse cached GLB.

No gameplay logic in renderer.

## 12. Protect materials

Do not tint, darken, desaturate, replace, or blanket-emissive the chest.

If despawn opacity is needed, clone per-instance materials and preserve exact PBR/color values.

Gold rays remain separate VFX.

## 13. Despawn

After reveal/minimum open life:
```text
gold fades
chest fades/shrinks over 0.45 s
remove visual/state
```

No instant full-size delete.

## 14. Add right-side relic HUD rail

Follow both binding UI documents.

Place below top-right score cluster and above bottom-right role/action HUD.

Use actual computed geometry to avoid overlap.

Initial:
```text
~42×42 cells
~6 px gap
right safe margin
```

Responsive ~36×36 when needed.

One cell per acquired relic.

Stable acquisition order. Add replicated `relicAcquisitionOrder` if needed.

Stack 2+ shows ×N on same cell.

Use `iconId`; missing icon uses intentional neutral fallback, never broken image/raw ID/emoji.

New relic short entrance; stack short pulse; reduced-motion compliant; no per-frame full DOM rebuild.

## 15. Relic reveal UI

The physical world chest is the chest; do not create a second fake chest overlay.

Refine current relic overlay toward the RewardRevealDirector/UI design contract.

Show rarity, icon/fallback, name, description, stack result/duplicate XP, skip timer.

No raw IDs.

## 16. Networking/reconnect

Server authority.

Test/reconstruct:
```text
spawning
closed
opening
revealing
open
despawning
```

Repeated snapshots cannot restart animations/rewards.

Both clients get same relic stacks and HUD rail.

## 17. Telemetry

Implement all telemetry from binding document, especially spawn/drop counts by source/class, first-claim time, rarity distribution, duplicate conversion, placement failures and peak active chests.

## 18. Tests and browser qualification

Implement every test in the binding design.

Critical regression:
```text
modern production monster chest drop
modern leader guarantee
purge none
```

Probability tests must use deterministic injected outcomes.

Run real SP and two-client MP and visually inspect temporal spawn/open/despawn behavior.

## 19. Regression gates

Inspect actual package scripts, then run current equivalents:
```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm test
npm run build
npm run test:demo
npm run test:progression
npm run test:netcode
npm run test:horde
```

Run Playwright in bounded groups if needed.

Do not modify Demo golden to hide regression.

## 20. Reports

Create:
```text
docs/relics/RELIC_CHEST_WORLD_INTEGRATION_REPORT.md
docs/relics/RELIC_CHEST_WORLD_INTEGRATION_HANDOFF.md
```

Include starting/ending SHA, confirmed old bug, reward routing, drop table, spawn policy/placement, lifecycle/timing, candidate-array future support, renderer, HUD rail, reconnect, tests, browser evidence, telemetry, performance/resource cleanup, known limitations, material-fidelity confirmation, and confirmation main was not merged.

## Suggested commits

```text
relics: unify chest reward routing and drop classes
relics: add deterministic world chest spawning
relics: add authoritative chest lifecycle and proximity claim
relics: integrate chest world presentation and reveal
ui: add persistent relic inventory rail
relics: qualify world integration and reconnect
```

Do not bundle unrelated camera/map/monster changes.

## Definition of done

Do not declare completion until a normal match visibly demonstrates:
```text
10 glowing chests already distributed in city
→ one reasonably discoverable near start
→ periodic chests appear later
→ ordinary/special monsters can drop growing chests
→ leader guarantees one
→ every spawned chest finishes growth before claim
→ proximity freezes gameplay
→ physical lid opens with synchronized gold rays
→ one relic reveals/applies
→ right-side relic rail updates/stack count works
→ chest fades/shrinks away
→ gameplay continues
```

while all existing 28 relic effects remain authoritative and intact.
