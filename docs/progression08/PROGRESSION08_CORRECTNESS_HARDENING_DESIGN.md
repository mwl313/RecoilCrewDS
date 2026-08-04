# Recoil Crew — Progression 08 Correctness and Integration Hardening
## Focused bug-fix design for the current authoritative progression system

**Repository:** `mwl313/RecoilCrewDS`  
**Current base:** latest `main` / completed Progression 08 state  
**Recommended repository paths:**

```text
docs/progression08/PROGRESSION08_CORRECTNESS_HARDENING_DESIGN.md
docs/progression08/CODEX_PROMPT_FIX_PROGRESSION08_INTEGRATION_ISSUES.md
```

**Scope:** Progression 08 correctness, integration, UI state, and regression coverage  
**Explicit non-goal:** Charge Shot changes

---

# 0. Purpose

Progression 08 is implemented and broadly tested, but direct source review identified several integration defects that can cause incorrect rarity behavior, progression activity in disabled modes, missing or stale presentation, and delayed level-up flow.

This document defines a focused hardening pass.

The objective is not to redesign progression.

The objective is to make the existing design behave correctly and consistently in:

- Single Player
- progression-enabled Multiplayer
- progression-disabled legacy modes
- reconnect
- rematch
- wave-clear rewards
- boss rewards
- repeated relic acquisition
- first-chest behavior

---

# 1. Non-goals

Do not change:

- Charge Shot availability
- Charge Shot capability behavior
- cannon input
- cannon charge scaling
- Combat 05 instant turret behavior
- Dash-only default contact rule
- ROADKILL design
- Coreloop timing
- enemy balance
- XP balance
- level curve tuning
- relic numeric values except removing unintended hardcoded duplicates
- mode activation strategy
- horde enforcement
- model or animation systems

Charge Shot is already active and is outside this task.

No file related only to Charge Shot should be modified unless a regression test requires reading it.

---

# 2. Confirmed issues

## Issue 1 — First treasure chest uses the wrong rarity table

### Intended behavior

```text
First opened chest:
Epic       70%
Legendary  30%

Later chests:
Common     55%
Rare       30%
Epic       13%
Legendary   2%
```

### Current failure mode

The chest is marked opened and `treasureChestsOpened` is incremented before rarity is rolled.

The rarity resolver then sees:

```text
treasureChestsOpened = 1
```

during the first roll and treats it as a later chest.

### Required correction

Determine whether the chest is the first chest before incrementing the counter.

Recommended flow:

```text
validate unopened chest
→ capture isFirstChest
→ roll rarity using captured first/later state
→ choose relic
→ apply authoritative result
→ mark chest opened
→ increment treasureChestsOpened
```

Alternative:

```text
roll rarity
→ then call open()
```

The implementation must remain atomic: a failed relic roll must not leave a chest half-open.

### Required tests

- First map chest is Epic or Legendary only.
- First enemy-drop chest is Epic or Legendary only.
- First wave-clear chest is Epic or Legendary only.
- Second chest uses the normal table.
- Failed open attempt does not consume first-chest status.
- Reopening the same chest is impossible.
- Deterministic seeds still produce deterministic results.

---

## Issue 2 — Progression-disabled modes may still generate progression rewards

### Intended behavior

When a mode does not enable progression:

```text
no XP shards
no progression chests
no relic rolls
no level-up offers
no progression triggers
no progression telemetry mutations
```

### Current failure mode

Progression event subscriptions are created based on progression content being present in the pack rather than the active mode enabling progression.

A legacy mode can therefore receive kill callbacks that create XP shards or chests even when:

```text
rules.progressionEnabled === false
```

### Required correction

Use the active mode flag as the runtime authority.

Recommended rule:

```ts
if (!rules.progressionEnabled) {
  ProgressionSystem remains inert;
  it does not subscribe to reward or trigger events;
}
```

Also add defensive guards at every externally callable reward entry point.

Minimum guards:

```text
onEntityKilled
onDamageApplied
onWaveEvent
spawnChest
openChest
addXp
trigger dispatch
```

Do not rely only on one constructor branch.

### Required tests

In `mode.demoScoreAttack` or another progression-disabled fixture:

- Enemy kill produces no XP shard.
- Enemy kill produces no progression chest.
- Wave event produces no progression trigger.
- `addXp()` is a no-op.
- `spawnChest()` cannot create an active progression chest, or is never called.
- Existing score, kill, and Combat 05 behavior remain unchanged.
- Demo golden remains unchanged.

---

## Issue 3 — Relic acquisition toast is appended to a hidden host

### Intended behavior

After a chest grants a relic:

```text
relic result appears visibly
rarity is shown
stack count is shown
duplicate conversion is shown
```

### Current failure mode

The Progression overlay root is hidden when no upgrade-selection screen is active.

The relic toast is appended inside that hidden root.

The relic result can therefore be invisible.

### Required correction

Separate presentation layers.

Recommended DOM structure:

```text
progressionRoot
├── selectionLayer
├── relicLayer
└── debugLayer
```

Rules:

```text
selectionLayer visible only during upgrade/relic selection
relicLayer visible while a relic presentation is active
debugLayer controlled independently
```

Do not use one root `display:none` to hide all progression presentation.

### Required tests

- Relic toast is visible when there is no level-up selection.
- Upgrade selection can be visible without destroying relic layer state.
- Closing selection does not remove an active relic result prematurely.
- `dispose()` removes all layers.
- Hidden progression mode creates no visible overlay.

---

## Issue 4 — Upgrade selection countdown display freezes

### Intended behavior

The player sees a live countdown:

```text
10
9
8
...
```

### Current failure mode

The overlay only rebuilds when a render key changes.

Time is not part of that render key.

The displayed timeout value can remain frozen even though the authoritative wall-clock timeout continues.

### Required correction

Do not rebuild the whole card UI every frame.

Retain a timer element and update only its text each presentation frame.

Recommended structure:

```ts
private timerElement: HTMLElement | null;
private activeOfferId: string | null;
```

On offer change:

```text
render cards once
cache timer element
```

On each update:

```text
remaining = expiresAtWallMs - nowMs
update timer text
```

### Required tests

- Timer decreases as `nowMs` advances.
- Cards are not recreated every frame.
- Timer reaches zero without negative display.
- Timeout auto-pick still comes from authority.
- Client timer does not resolve an offer by itself.

---

## Issue 5 — Repeated stackable relic acquisition may not retrigger presentation

### Intended behavior

Every relic acquisition should produce feedback.

Example:

```text
MAGNET CORE ×1
MAGNET CORE ×2
MAGNET CORE ×3
```

Each acquisition should be visible.

### Current failure mode

The presentation identity uses only:

```text
relicId + duplicateConverted
```

Two normal acquisitions of the same stackable relic produce the same key.

The second acquisition may not restart the toast.

### Required correction

Add an authoritative acquisition sequence.

Preferred state:

```ts
interface RelicRollResult {
  acquisitionSequence: number;
  relicId: string;
  rarity: UpgradeRarity;
  duplicateConverted: boolean;
  replacementXp: number;
  stackCountAfter: number;
}
```

Increment once per resolved chest acquisition.

Presentation key:

```text
acquisitionSequence
```

Fallback acceptable:

```text
relicId + stackCountAfter + duplicateConverted
```

The sequence is more robust and should be used when possible.

### Required tests

- Same stackable relic acquired twice shows two distinct presentations.
- Unique duplicate conversion also produces a new presentation.
- Reconnect does not replay old relic presentation indefinitely.
- A newly acquired relic after reconnect still presents once.
- Rematch resets sequence correctly or scopes it to the new match.

---

## Issue 6 — Elite and boss XP bypass the normal level-up start path

### Intended behavior

Every XP source uses one authoritative route:

```text
grant XP
→ calculate level crossings
→ increment pending level-ups
→ start level-up selection when legal
```

### Current failure mode

Normal XP collection uses the ProgressionSystem `addXp()` path.

Elite/leader and boss rewards call the lower-level TeamExperience API directly and ignore its returned level-up result.

A threshold crossed by leader or boss XP may not start the selection immediately.

### Required correction

Create one internal XP grant API.

Recommended:

```ts
private grantXp(
  value: number,
  source: ProgressionXpSource,
  position?: { x: number; y: number; z: number },
): TeamXpGrantResult
```

All sources call it:

```text
XP shard collection
elite reward
wave leader reward
boss reward
unique relic duplicate conversion
future quest or stage rewards
```

It must:

```text
apply mode XP multiplier where appropriate
update telemetry
emit progression event
queue level-ups
start selection when MatchFlow allows
```

Explicitly decide whether direct elite/boss XP is multiplied by the mode XP multiplier. Preserve the intended existing design consistently.

### Boss terminal-state rule

When boss XP crosses a threshold at stage clear, do not open a meaningless upgrade selection after the game has entered results.

Recommended:

```text
grant XP and record it
queue pending levels
terminal clear takes priority
do not start a new upgrade selection after clear/gameOver
```

Document whether pending levels are discarded at terminal state or remain only in results telemetry.

### Required tests

- Leader XP crossing a threshold starts an upgrade selection during active play.
- Elite reward uses the shared XP path.
- Unique duplicate XP uses the shared XP path.
- Boss XP updates level/XP but does not deadlock stage clear.
- Multiple thresholds from a leader reward queue correctly.
- Terminal clear prevents a new selection.
- No XP source bypasses telemetry.

---

## Issue 7 — Relic selection state exists but chest acquisition bypasses it

### Intended design

The progression design defines a relic roulette and includes:

```text
MatchFlowState = relicSelection
ProgressionSelectionState.kind = relic
```

The relic result is authority-decided before presentation.

### Current behavior

Opening a chest immediately:

```text
rolls rarity
selects relic
applies relic
stores result
shows a toast
```

The match never enters `relicSelection`.

This creates two problems:

1. The designed relic roulette/pause flow is absent.
2. Existing relic-selection state and types are dead or misleading.

### Required decision

Implement the intended authoritative relic presentation flow.

This is not a player choice unless later content changes it.

Recommended sequence:

```text
open chest
→ authority rolls relic
→ store pending RelicRollResult
→ mark chest consumed
→ MatchFlowState = relicSelection
→ show roulette/reveal presentation
→ client may skip visual animation
→ authority completes after fixed maximum reveal duration or acknowledgement
→ apply relic exactly once
→ return MatchFlowState to playing
→ start pending level-up selection if one exists
```

### Authority rules

- The client never chooses or rerolls the relic.
- The client may request `skipRelicPresentation`.
- A fixed server-side maximum duration prevents deadlock.
- A disconnected client cannot block progression forever.
- The relic is applied exactly once.
- The result survives reconnect.
- Gameplay remains paused during relic presentation.
- `relicSelection` cannot begin after clear/gameOver.
- Opening multiple chests simultaneously is serialized.

### Simplified acceptable implementation

A fixed short authoritative reveal state is acceptable:

```text
relicSelection starts
→ result already fixed
→ apply result immediately or at reveal completion
→ resume after acknowledgement/short timeout
```

The exact application moment must be documented and tested.

### Required tests

- Opening chest enters `relicSelection`.
- Result is predetermined and stable.
- Gameplay is paused.
- Skip request cannot alter result.
- Timeout completes reveal.
- Apply occurs once.
- Reconnect reconstructs pending relic result.
- Duplicate skip messages are idempotent.
- Pending level-up begins after relic reveal if queued.
- Terminal state prevents reveal deadlock.

---

## Issue 8 — Some relic handlers ignore content parameters

### Intended behavior

Relic tuning is data-driven.

Examples:

```text
VAMPIRE ROUNDS amountPerStack
SAFE HAVEN amountPerStack
```

should come from content.

### Current failure mode

Some trigger handlers use hardcoded constants even though the content supplies parameters.

This makes future tuning require code changes and creates risk that JSON and runtime behavior diverge.

### Required correction

Audit every relic effect handler.

For each handler:

```text
read all tunable values from effect parameters
fall back only to schema-approved defaults
never recreate the intended value in code
```

Examples:

```ts
const amount = num(params, "amountPerStack") * stacks;
```

instead of constructing a local object with a hardcoded amount.

Add strict validation so required parameters cannot be omitted silently.

### Required audit scope

At minimum inspect:

```text
cannonKillHeal
waveClearHeal
cannonKillExplosion
cannonHitCooldownReduction
dashHitCooldownReduction
airCooldownRecovery
groundPound
revive
roadkill
phaseDash
twinShell
all passive stat templates
all conditional damage templates
```

### Required tests

- Each handler responds to changed fixture parameters.
- Content value and runtime result match.
- Missing required parameter fails content validation.
- No relic ID-specific numeric constant remains in the registry.
- Existing shipped values remain numerically unchanged after refactor.

---

# 3. Ordering and concurrency rules

Progression events can overlap.

Use this priority:

```text
1. terminal clear/gameOver
2. existing relicSelection
3. existing upgradeSelection
4. newly opened relic reveal
5. pending level-up
6. playing
```

Recommended serialized reward queue:

```ts
interface PendingProgressionFlow {
  pendingRelicResults: RelicRollResult[];
  pendingLevelUps: number;
}
```

Rules:

- Only one active selection/reveal at a time.
- Multiple chest results queue.
- Multiple level-ups queue.
- Terminal state cancels or summarizes unshown presentation according to documented policy.
- Reward application remains exactly once.
- No nested selection overwrites another selection.

---

# 4. Data and network changes

## Relic acquisition sequence

Add:

```ts
relicAcquisitionSequence: number;
```

to team progression state or use a monotonic match-scoped counter.

Include sequence in `RelicRollResult`.

## Relic reveal completion

Add one idempotent command if required:

```ts
{
  type: "skipRelicPresentation";
  acquisitionSequence: number;
}
```

Server validates:

```text
progression enabled
active selection kind = relic
sequence matches
player belongs to room
not already completed
```

For Multiplayer, either player may skip the shared reveal.

A short server timeout always completes it.

## Snapshot state

Snapshots must carry:

- `matchFlow`
- active relic selection/result
- reveal deadline
- acquisition sequence
- current relic stacks

Do not send static relic definitions repeatedly.

---

# 5. UI hardening design

Refactor `ProgressionOverlay` into retained subviews.

Recommended:

```text
ProgressionOverlay
├── UpgradeSelectionView
├── RelicRevealView
└── ProgressionDebugView
```

Minimum internal elements:

```ts
selectionHost
relicHost
debugHost
timerElement
activeOfferId
activeRelicSequence
```

## Upgrade cards

Keep the existing functional card selection.

Fix:

- live timer
- retained DOM
- correct READY state
- disabled buttons after local selection
- safe role offer resolution
- no stale offer after resume

## Relic reveal

Display:

- user-facing label
- rarity
- description
- stack count
- duplicate-to-XP result
- skip prompt
- reveal countdown if used

Do not expose only raw internal IDs in final UI when content labels are available.

---

# 6. Regression invariants

The hardening pass must preserve:

```text
Combat 05
- normal contact damage remains zero
- Dash contact remains default contact attack
- ROADKILL remains relic-gated
- instant turret unchanged
- no fall damage
- no Jackpot

Charge Shot
- remains active exactly as it is now
- no change to its availability
- no item/relic migration
- no control change
- no damage/scaling change
- no HUD change

Coreloop 06
- purge gives no XP/chests/triggers
- wave leader chest remains guaranteed
- ambient enemies survive wave purge
- stage timers pause during selections

Animation 07
- no model, rig, mixer, or LOD changes
```

---

# 7. Implementation milestones

## Milestone 1 — Baseline and reproduction

Create:

```text
docs/progression08/PROGRESSION08_HARDENING_BASELINE.md
docs/progression08/PROGRESSION08_HARDENING_REPRODUCTION.md
```

Add failing tests reproducing all eight issues before fixes where practical.

## Milestone 2 — Reward and enablement correctness

Fix:

- progression-disabled reward leakage
- shared XP grant path
- leader/boss threshold behavior

## Milestone 3 — Chest correctness

Fix:

- first-chest ordering
- atomic open
- integration tests

## Milestone 4 — Relic flow

Implement:

- authoritative `relicSelection`
- acquisition sequence
- queueing
- skip/timeout
- reconnect

## Milestone 5 — UI hardening

Fix:

- hidden toast
- live timer
- repeated relic feedback
- retained subviews

## Milestone 6 — Data-driven relic parameters

Audit and remove hardcoded tuning constants.

## Milestone 7 — Full regression

Run all progression, combat, coreloop, network, presentation, and Animation 07 gates.

---

# 8. Required tests

Create or extend:

```text
tests/progression08/progressionDisabledMode.test.ts
tests/progression08/firstChestIntegration.test.ts
tests/progression08/xpGrantRouting.test.ts
tests/progression08/relicSelectionFlow.test.ts
tests/progression08/relicParameterization.test.ts
tests/progression08/progressionOverlay.test.ts
tests/progression08/progressionFlowQueue.test.ts

e2e/progression-first-chest.spec.ts
e2e/progression-relic-reveal.spec.ts
e2e/progression-disabled-demo.spec.ts
```

Required focused command:

```bash
npm run test:progression
```

Recommended new command:

```bash
npm run test:progression:hardening
```

Do not add a script unless the referenced files exist.

---

# 9. Manual verification

## Progression-disabled Multiplayer

- Start default Demo Multiplayer.
- Kill enemies.
- Confirm no XP shards.
- Confirm no progression chests.
- Confirm no progression overlay.
- Confirm score and Combat 05 behavior remain normal.

## Single Player

- Kill enemies and collect XP.
- Confirm live timer.
- Trigger first chest.
- Confirm Epic/Legendary only.
- Confirm visible relic reveal.
- Acquire the same stackable relic twice.
- Confirm both acquisitions display.
- Cross level threshold with leader XP.
- Confirm level-up starts immediately.
- Clear boss while near a threshold.
- Confirm no post-results deadlock.

## Progression-enabled Multiplayer

- Open chest.
- Confirm shared relic reveal.
- Skip from Driver.
- Repeat and skip from Gunner.
- Disconnect during reveal.
- Reconnect and restore result.
- Timeout reveal without input.
- Queue relic reveal and level-up together.
- Confirm deterministic serialized order.

---

# 10. Completion criteria

Complete only when:

1. First opened chest always uses E70/L30.
2. Later chests use C55/R30/E13/L2.
3. Failed chest open does not consume first-chest status.
4. Progression-disabled modes generate no progression rewards.
5. Progression-disabled modes subscribe to no unnecessary progression triggers.
6. All XP sources use one authoritative grant path.
7. Leader XP can immediately trigger level-up flow.
8. Boss XP cannot deadlock terminal state.
9. Relic presentation is visible outside upgrade selection.
10. Upgrade countdown updates live.
11. Repeated stackable relic acquisitions each present once.
12. Relic results have a stable acquisition sequence.
13. Chest open enters authoritative relic-selection/reveal flow.
14. Relic result is predetermined.
15. Skip cannot alter the result.
16. Timeout prevents deadlock.
17. Reconnect restores active relic reveal.
18. Relic application occurs exactly once.
19. Multiple rewards are serialized.
20. Content parameters control every relic tuning value.
21. Missing required parameters fail validation.
22. Existing relic values remain numerically unchanged.
23. Demo golden remains unchanged.
24. Combat 05 remains unchanged.
25. Charge Shot remains completely unchanged.
26. Coreloop purge reward rules remain unchanged.
27. Animation 07 remains unchanged.
28. All focused and regression tests pass.
29. Implementation report records actual command output.
30. Known remaining limitations are documented honestly.

Final invariant:

> Progression runs only in modes that enable it, every reward uses one authoritative flow, first-chest rarity is correct, progression presentations remain visible and synchronized, and all relic behavior remains data-driven without changing Charge Shot or unrelated combat systems.
