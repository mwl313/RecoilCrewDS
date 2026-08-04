# Codex Prompt — Fix Progression 08 Correctness and Integration Issues
## Focused hardening pass; do not modify Charge Shot

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Working base:

```text
latest main
```

Binding design:

```text
docs/progression08/PROGRESSION08_CORRECTNESS_HARDENING_DESIGN.md
```

Prompt path:

```text
docs/progression08/CODEX_PROMPT_FIX_PROGRESSION08_INTEGRATION_ISSUES.md
```

---

# 0. Critical scope instruction

This is a focused Progression 08 correctness and integration pass.

Do not modify Charge Shot.

The user has explicitly confirmed that Charge Shot is already active and requires no work.

Do not:

- remove `cannon.charge`
- change default capabilities
- change cannon input
- change charge timing
- change charge scaling
- change charge HUD
- migrate Charge Shot into or out of relic content
- delete or modify its existing item solely because it exists
- perform unrelated Combat 05 refactors

Only touch Charge Shot-related files if a generic regression test reads them, and make no behavioral changes.

---

# 1. Git and source-of-truth rules

Before editing:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git status --short
git branch --show-current
git log --oneline -20
```

Requirements:

- Use the actual latest repository state.
- Do not assume the earlier audit is perfectly current.
- Reproduce each issue against current code.
- Do not reset or discard user changes.
- Do not merge or rebase unrelated branches.
- Do not regenerate golden files merely to hide regressions.
- Make focused reviewable commits.
- Do not stop after writing documentation.

---

# 2. Read first

Read:

```text
docs/progression08/PROGRESSION08_CORRECTNESS_HARDENING_DESIGN.md
docs/progression08/POWERUP_AND_RELIC_PROGRESSION_SYSTEM_DESIGN.md
docs/progression08/PROGRESSION08_IMPLEMENTATION_REPORT.md
docs/progression08/PROGRESSION08_NETWORK_AND_PAUSE_GUIDE.md
docs/progression08/PROGRESSION08_RELIC_TRIGGER_GUIDE.md
docs/progression08/PROGRESSION08_STAT_STACKING_GUIDE.md
```

Inspect at minimum:

```text
src/shared/progression/progressionSystem.ts
src/shared/progression/progressionTypes.ts
src/shared/progression/treasureChestSystem.ts
src/shared/progression/teamExperienceSystem.ts
src/shared/progression/relicInventory.ts
src/shared/progression/relicStatProjector.ts
src/shared/progression/relicEffectRegistry.ts
src/shared/progression/upgradeSelectionController.ts

src/shared/pickups/xpShardSystem.ts
src/shared/rules/matchRules.ts
src/shared/sim/matchRuntime.ts
src/shared/sim/systems/systemContext.ts
src/shared/combat/tankContactCombat.ts

src/shared/net/
src/server/room.ts
src/client/progression/progressionOverlay.ts
src/client/app/
src/client/main.ts

content/modes/
content/relics/
content/relic-effect-templates/
content/first-treasure-rules/
content/treasure-rarity-tables/

tests/progression08/
e2e/progression-*.spec.ts
package.json
```

---

# 3. Required audit deliverables

Create:

```text
docs/progression08/PROGRESSION08_HARDENING_CODE_AUDIT.md
docs/progression08/PROGRESSION08_HARDENING_BASELINE.md
docs/progression08/PROGRESSION08_HARDENING_REPRODUCTION.md
docs/progression08/PROGRESSION08_HARDENING_IMPLEMENTATION_REPORT.md
```

The reproduction document must show which test or manual probe proves each issue.

Do not claim an issue exists if the latest checkout no longer reproduces it.

When an issue is already fixed, document that and add regression coverage rather than rewriting it.

---

# 4. Baseline commands

Inspect `package.json` and run all applicable commands.

At minimum:

```bash
npx tsc --noEmit
npm run generate:presentation-content
npm run generate:enemy-animation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run validate:progression-content
npm run validate:enemy-animations

npm run build
npm test
npm run test:progression
npm run test:progression:simulation
npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:presentation
npm run test:animation
npm run test:netcode
npm run test:maplab
```

Run focused E2E when supported.

Record actual outputs.

---

# 5. First write failing regression tests

Before implementation, add focused tests for:

1. Real first-chest open path uses Epic/Legendary.
2. Progression-disabled Demo kills produce no XP/chests.
3. Relic presentation is visible without upgrade selection.
4. Upgrade timer text changes over time.
5. Same stackable relic acquisition displays twice.
6. Leader XP crossing threshold starts selection.
7. Relic reveal uses `relicSelection`.
8. Relic handlers use content parameters.

Use the actual production APIs.

Do not test only helper methods when the bug is in orchestration order.

---

# 6. Fix 1 — First-chest order

Audit:

```text
ProgressionSystem.openChest
TreasureChestSystem.open
TreasureChestSystem.rollRarity
```

Correct ordering:

```text
validate
→ determine first/later
→ roll rarity
→ roll relic
→ create pending result
→ consume chest exactly once
```

A failed roll must not consume the chest.

Add integration tests for all chest sources.

Recommended commit:

```text
progression08-hardening: fix first chest rarity ordering
```

---

# 7. Fix 2 — Disabled-mode progression leakage

Progression runtime activation must use:

```ts
rules.progressionEnabled
```

not merely the existence of progression content.

Requirements:

- Do not subscribe to progression reward/trigger events when disabled.
- Add defensive guards to reward entry points.
- No XP shards in disabled modes.
- No progression chests in disabled modes.
- No progression UI state.
- No progression telemetry mutations.
- Demo golden unchanged.

Recommended commit:

```text
progression08-hardening: make disabled progression fully inert
```

---

# 8. Fix 3 — Unified XP grant path

Create one authoritative internal API for every XP source.

Suggested:

```ts
private grantXp(
  value: number,
  source: ProgressionXpSource,
  position?: { x: number; y: number; z: number },
): TeamXpGrantResult
```

Route through it:

```text
XP shard collection
wave leader
elite
boss
unique relic duplicate conversion
future direct rewards
```

It must:

- apply correct multiplier policy
- update TeamExperience
- update telemetry
- emit events
- queue level-ups
- call `tryStartLevelUp()` only when legal

Terminal behavior:

```text
clear/gameOver
→ record XP
→ do not start new selection
```

Do not leave a pending selection deadlock.

Recommended commit:

```text
progression08-hardening: unify authoritative XP grant routing
```

---

# 9. Fix 4 — Authoritative relic reveal flow

Use the existing:

```text
MatchFlowState.relicSelection
ProgressionSelectionState.kind = relic
```

Implement a real shared reveal state.

Required flow:

```text
open chest
→ authority predetermines result
→ activeSelection.kind = relic
→ matchFlow = relicSelection
→ gameplay pauses
→ client presents result
→ skip or server timeout completes
→ result applies exactly once
→ flow resumes
→ queued progression flow continues
```

Add:

```ts
acquisitionSequence
reveal deadline
resolved/applied flags
```

Network:

```text
skipRelicPresentation
```

must be idempotent.

Either player may skip the shared reveal.

The server timeout prevents deadlock.

Reconnect must restore the active reveal.

Recommended commit:

```text
progression08-hardening: add authoritative relic reveal flow
```

---

# 10. Fix 5 — Progression overlay structure

Refactor into independent retained layers:

```text
selectionHost
relicHost
debugHost
```

Requirements:

- Hiding selection does not hide relic presentation.
- Timer element updates every frame.
- Card DOM is not rebuilt every frame.
- Same stackable relic displays again through sequence.
- Content labels/descriptions are used when available.
- Local buttons disable after selection.
- `dispose()` removes everything.
- No overlay in progression-disabled mode.

Recommended commit:

```text
progression08-hardening: fix progression overlay lifecycle
```

---

# 11. Fix 6 — Acquisition sequence

Add a match-scoped monotonic sequence.

Preferred location:

```text
TeamProgressionState.relicAcquisitionSequence
```

Every resolved chest increments it.

Every result carries it.

Presentation keys off sequence.

Requirements:

- repeated normal stack acquisition displays
- unique duplicate conversion displays
- reconnect restores current sequence
- old result does not replay forever
- rematch/new match resets safely

Recommended commit:

```text
progression08-hardening: sequence relic acquisition presentation
```

---

# 12. Fix 7 — Remove hardcoded relic tuning

Audit all handlers in:

```text
relicEffectRegistry
relicStatProjector
ROADKILL hooks
capability hooks
damage integration
weapon integration
```

Replace relic tuning constants with validated content parameters.

Examples:

```text
VAMPIRE ROUNDS amountPerStack
SAFE HAVEN amountPerStack
GROUND POUND radius/damage/knockback
PHOENIX CORE integrity/shockwave
```

Rules:

- Required parameters are schema-validated.
- Handler defaults may only represent explicit generic defaults.
- No relic-specific number is repeated in code.
- Existing shipped behavior remains numerically identical.
- Add parameterized fixture tests with altered values.

Recommended commit:

```text
progression08-hardening: make relic handlers fully data driven
```

---

# 13. Flow serialization

Prevent nested/overwritten progression states.

Priority:

```text
terminal
relicSelection
upgradeSelection
pending relic result
pending level-up
playing
```

Requirements:

- Only one active flow.
- Multiple chest results queue.
- Multiple level-ups queue.
- Relic reveal and level-up cannot overwrite each other.
- Resume calls one central `advanceProgressionFlow()` method.
- Terminal state wins.
- Reward application remains exactly once.

Recommended commit:

```text
progression08-hardening: serialize progression reward flow
```

---

# 14. Regression invariants

Explicitly test that these remain unchanged:

```text
Charge Shot:
- available exactly as before
- same input
- same scale
- same HUD
- same default mode behavior

Combat 05:
- normal contact zero
- Dash contact works
- ROADKILL relic gated
- no fall damage
- no Jackpot

Coreloop 06:
- purge no rewards
- wave leader chest guaranteed
- stage timer pauses during progression flow

Animation 07:
- all animation tests and validation pass
```

Do not modify Charge Shot content as part of this task.

---

# 15. Required tests

Add or update:

```text
tests/progression08/progressionDisabledMode.test.ts
tests/progression08/firstChestIntegration.test.ts
tests/progression08/xpGrantRouting.test.ts
tests/progression08/relicSelectionFlow.test.ts
tests/progression08/relicParameterization.test.ts
tests/progression08/progressionOverlay.test.ts
tests/progression08/progressionFlowQueue.test.ts
```

Add E2E:

```text
e2e/progression-first-chest.spec.ts
e2e/progression-relic-reveal.spec.ts
e2e/progression-disabled-demo.spec.ts
```

Add real scripts only after the files exist:

```bash
npm run test:progression:hardening
```

---

# 16. Manual verification

## Default Demo Multiplayer

```text
kill enemies
→ no XP shards
→ no progression chests
→ no progression overlay
```

## Single Player

```text
first chest
→ Epic/Legendary only

relic reveal
→ visible
→ skip works
→ timeout works

same relic twice
→ two presentations

leader XP crosses threshold
→ immediate level-up flow

boss clear
→ no deadlock
```

## Progression-enabled Multiplayer

```text
shared relic reveal
Driver skip
Gunner skip
disconnect during reveal
reconnect restore
timeout without input
relic reveal followed by pending level-up
```

---

# 17. Final command gates

Run all applicable gates.

At minimum:

```bash
npx tsc --noEmit

npm run generate:presentation-content
npm run generate:enemy-animation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run validate:progression-content
npm run validate:enemy-animations

npm run build
npm test

npm run test:progression
npm run test:progression:hardening
npm run test:progression:simulation
npm run test:progression:e2e

npm run test:demo
npm run test:coreloop
npm run test:horde
npm run test:presentation
npm run test:animation
npm run test:netcode
npm run test:maplab

npm run test:e2e
```

Report actual output.

Do not hide flaky or failing tests.

Do not regenerate the Demo golden unless there is an explicitly justified gameplay change. This task should not require one.

---

# 18. Required implementation report

`PROGRESSION08_HARDENING_IMPLEMENTATION_REPORT.md` must include:

1. Branch and commit base
2. Reproduction result for each issue
3. Files changed
4. First-chest fix
5. Disabled-mode guard
6. Unified XP routing
7. Relic reveal state
8. Flow serialization
9. Overlay refactor
10. Acquisition sequence
11. Relic parameter audit
12. Network changes
13. Unit tests
14. E2E tests
15. Manual verification
16. Full regression gates
17. Charge Shot non-change confirmation
18. Known limitations

---

# 19. Completion gate

Complete only when all are true:

1. First real chest open uses E70/L30.
2. Later chest uses normal rarity.
3. Failed open does not consume first status.
4. Disabled modes create no progression reward state.
5. All XP sources use one grant path.
6. Leader XP starts selection when appropriate.
7. Boss XP cannot deadlock terminal state.
8. Relic reveal uses authoritative `relicSelection`.
9. Reveal result is predetermined.
10. Skip is idempotent.
11. Timeout prevents deadlock.
12. Reconnect restores reveal.
13. Relic applies once.
14. Reward flows are serialized.
15. Relic presentation is visible.
16. Countdown updates live.
17. Same stackable relic presents again.
18. Acquisition sequence is authoritative.
19. Every relic tuning value comes from content.
20. Missing parameters fail validation.
21. Existing relic numeric behavior is preserved.
22. Demo golden is unchanged.
23. Progression tests pass.
24. Coreloop/Horde tests pass.
25. Animation tests pass.
26. Netcode tests pass.
27. Charge Shot is unchanged.
28. Combat 05 is unchanged.
29. Implementation report contains real outputs.
30. No unrelated redesign was introduced.

Final invariant:

> Progression is inactive when a mode disables it, rewards are serialized through one authoritative flow, first-chest rarity is correct, relic presentation is visible and reconnect-safe, and tuning remains content-driven without touching Charge Shot.
