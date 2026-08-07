# Recoil Crew — Relic System Bugfix Specification
## Companion audit for Codex findings

**Repository:** `mwl313/RecoilCrewDS`  
**Target baseline:** current `origin/relic-addition` at implementation time  
**Purpose:** bug-fix/hardening pass for relic rolling, acquisition limits, effects, trigger wiring, chest/reward flow, networking, and regression coverage  
**Relationship to Codex audit:** this document is additive. Codex must merge these findings with its own independently reproduced bugs rather than replacing one list with the other.

---

# 0. Implementation rule

Before changing code:

```bash
git fetch --all --prune
git switch relic-addition
git pull --ff-only origin relic-addition

git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20
```

Record the starting SHA in the implementation report.

Do **not** assume every historical bug below is still present. The `relic-addition` branch already appears to contain fixes for some earlier Progression08 defects. For each item:

1. reproduce or disprove it against the current checkout;
2. if still broken, add a failing test before the fix where practical;
3. if already fixed, retain/add a regression test proving it stays fixed;
4. do not rewrite a working subsystem just to match this document's suggested structure.

The desired end state is not merely "tests pass." Every one of the 28 relics must have a testable gameplay contract, and every special-case relic must be exercised in real authoritative simulation.

---

# 1. Source-of-truth hierarchy

Use this precedence when deciding intended behavior:

1. explicit current user decisions;
2. this bugfix document for defects/invariants;
3. current binding progression/relic design;
4. `docs/progression08/reference/05-유물-테이블.md`;
5. existing content JSON;
6. current implementation, only where it does not conflict with the above.

Important historical design invariants:

- 28 relics total.
- Team-shared relic inventory.
- Relic percentage stacks add internally.
- Relic flat values add internally.
- Capability-granting relics grant the capability on first acquisition only; numeric portions may continue stacking when the relic is stackable.
- The three unique relics are:
  - `relic.phase_dash`
  - `relic.phoenix_core`
  - `relic.twin_shell`
- The current documented duplicate contract for those unique relics is:
  - inventory stack never exceeds 1;
  - capability/effect is never granted twice;
  - a later duplicate result converts to **+250 XP** rather than adding a second stack.
- If Codex has evidence that a newer explicit user decision changed this from "duplicate converts to XP" to "owned unique relic is removed from the roll pool entirely," flag that as a design conflict in the report rather than silently changing both systems.
- First opened chest: Epic 70% / Legendary 30%.
- Later chests: Common 55% / Rare 30% / Epic 13% / Legendary 2%.
- Purged enemies generate no progression rewards and no relic triggers.
- Single Player and Multiplayer use the same gameplay relic implementation.
- Server/local authority decides relic result. Presentation never chooses or rerolls it.
- Charge Shot remains cannon behavior and must continue inheriting cannon modifiers.
- Default high-speed tank contact remains non-damaging unless ROADKILL or an accepted Dash damage window applies.
- Dash and ROADKILL must never damage the same contact twice.

---

# 2. Executive summary of bugs

## Current defects confirmed or strongly evidenced on `relic-addition`

### RELIC-CUR-01 — DOUBLE JUMP stat is projected but tank movement does not consume it
**Affected relic:** `relic.double_jump`  
**Severity:** High / player-visible / effect effectively non-functional

The relic projects `tank.extraJumps`, but shared tank kinematics currently accepts a jump only when:

```text
jumpPressed && grounded
```

There is no authoritative airborne-jump counter in the kinematic state and no use of `tank.extraJumps` in the jump acceptance path.

**Result:** the UI/inventory can show DOUBLE JUMP while the player still has only the normal grounded jump.

### RELIC-CUR-02 — AIR MASTER's air-dash reuse is not wired into dash acceptance
**Affected relic:** `relic.air_master`  
**Severity:** High / partially non-functional

AIR MASTER grants `tank.airDashRefresh` and currently also projects `tank.airDashCharges`, but the shared dash acceptance path only checks the ordinary dash cooldown. The kinematic state shown by the current implementation has no authoritative air-dash-use/reset state.

The +40% air-control portion can project correctly, but the advertised air-dash reuse capability is not proven to alter the movement state machine.

Additionally, the current content contains a stackable `airDashCharges` effect even though the design table says the **ability is granted once** and only the +40% air-control number stacks.

### RELIC-CUR-03 — AERIAL MASTER uses the enemy's airborne state instead of the tank's airborne state
**Affected relic:** `relic.aerial_master`  
**Severity:** Critical gameplay correctness

Content contract:

```text
All gunner damage +30% while the tank/player is airborne.
```

Current damage integration passes:

```text
airborne = enemy.impulseGrounded === false
```

into relic damage resolution.

That makes AERIAL MASTER activate based on the **target enemy** being airborne. It can therefore fail while the tank is flying and activate when an enemy is knocked into the air.

The same path also currently does not use `DamageSource` to restrict this modifier to gunner weapons.

### RELIC-CUR-04 — AERIAL MASTER can affect non-gunner damage
**Affected relic:** `relic.aerial_master`  
**Severity:** High

The relic says "all gunner damage." The current conditional outgoing-damage path applies the airborne modifier without source filtering.

Required eligible sources should be explicitly defined. At minimum this should include the current gunner weapon families (MG and cannon, including Charge Shot because Charge Shot is cannon-derived). It should not unintentionally buff Dash, ROADKILL, barrel/environment damage, or relic secondary damage unless the design explicitly says those count as gunner weapon damage.

### RELIC-CUR-05 — APEX PREDATOR uses a different enemy-classification rule than the modern reward system
**Affected relic:** `relic.apex_predator`  
**Severity:** Critical gameplay correctness

The modern production reward path correctly normalizes from:

```text
enemy.monster.rewardClass = ambient | wave | elite | boss
```

with legacy ownership as fallback.

APEX PREDATOR does not use that same classification. Its current damage path infers elite/boss mostly from legacy `ownership.populationClass` and leader identity. This can miss:

- modern `rewardClass === elite`;
- production special enemies represented as `special`;
- modern bosses where ownership is not the same shape as legacy data.

**Result:** the Legendary "+40% vs elites/bosses" relic can do nothing against exactly the enemies it is meant to counter.

### RELIC-CUR-06 — SAFE HAVEN is triggered from `wavePurged`
**Affected relic:** `relic.safe_haven`  
**Severity:** High / event semantics / duplicate-risk

Current progression event handling maps:

```text
wavePurged -> dispatch relic event waveCleared
```

but the progression contract explicitly says purge must not fire relic triggers.

There is also a separate `notifyWaveCleared(waveId)` entry point that dispatches a real `waveCleared` relic event.

**Risks:**
- SAFE HAVEN heals at purge rather than the semantic wave-clear event;
- SAFE HAVEN can fire twice if both paths are used;
- future `onWaveClear` relics inherit the same bug.

### RELIC-CUR-07 — PHASE DASH invulnerability is tied to a cosmetic presentation timer
**Affected relic:** `relic.phase_dash`  
**Severity:** Critical combat correctness

The current implementation sets a separate `phaseDashUntil` using:

```text
rules.config.tank.dashPresentationSeconds
```

The tank kinematics explicitly documents `dashPresentationT` as cosmetic and independent from the authoritative dash state.

PHASE DASH promises:

```text
Invulnerable during Dash.
```

Invulnerability must therefore derive from the accepted authoritative dash state/window, not from presentation duration.

Possible current failure modes:
- invulnerability ends before the actual dash state ends;
- invulnerability lasts after the gameplay dash has ended;
- future tuning of cosmetic presentation accidentally changes combat balance.

### RELIC-CUR-08 — RelicStatProjector reset uses a source that never matches projected relic modifiers
**Affected:** passive/stat relic layer; reset/removal/reuse  
**Severity:** Medium-High correctness / cleanup

Projected modifiers use sources such as:

```text
progression:relic:<relicId>
```

but `RelicStatProjector` attempts to clear them with:

```text
removeModifiersBySource("progression:relic")
```

`StatResolver.removeModifiersBySource()` performs exact source matching.

Therefore the reset/clear call does not actually remove per-relic modifiers.

This is partially masked because normal stack changes reuse stable modifier IDs with `replace`, and relics are normally permanent for a match. It is still a broken cleanup invariant and can cause stale modifiers when state is reset, manipulated in tests/debug tools, or future relic removal is introduced.

### RELIC-CUR-09 — Passive projector and triggered registry resolve effect parameters differently
**Affected:** all data-driven relics, especially future partial overrides  
**Severity:** Medium-High architecture correctness

Triggered effects merge:

```text
template.parameters
then
effect.parameters override
```

The passive projector currently chooses:

```text
effect.parameters ?? template.parameters
```

instead of merging.

A partial relic-specific override can therefore erase required template defaults in one code path but not the other.

This creates "JSON says one thing, runtime does another" bugs and makes the same effect template behave differently depending on whether it is passive or triggered.

### RELIC-CUR-10 — ROADKILL and TWIN SHELL bypass the common parameter resolver
**Affected relics:** `relic.roadkill`, `relic.twin_shell`  
**Severity:** Medium current / High future-maintenance

Their special accessors read effect-instance parameters directly rather than resolving:

```text
template defaults + relic effect overrides
```

The current shipped JSON supplies the important values, so this may be numerically correct today, but it violates the data-driven contract and can break as soon as template defaults or partial overrides are used.

All special-case runtime accessors must use the same parameter-resolution helper as the generic registry/projector.

### RELIC-CUR-11 — Unique duplicate replacement ignores the relic's own `duplicateReplacement`
**Affected unique relics**  
**Severity:** Medium content-authority bug

Unique relic JSON defines:

```json
"duplicateReplacement": {
  "type": "xp",
  "amount": 250
}
```

but `RelicInventory` currently returns the global progression definition's `duplicateUniqueRelicXp`.

Current values happen to agree at 250 XP, so this is numerically masked.

The implementation must choose one authoritative source and validate consistency. Prefer the relic's explicit `duplicateReplacement` if the schema intends per-relic authoring, or remove the redundant field if the global rule is intentionally canonical. Do not keep two independently editable sources.

### RELIC-CUR-12 — COVERING FIRE enemy speed multiplier is not clamped
**Affected relic:** `relic.covering_fire`  
**Severity:** Medium-High at high stack counts

The canonical relic rules require decreasing percentages to clamp at zero/minimum.

The current enemy speed result is effectively:

```text
1 - speedDebuffPercent / 100
```

without a lower clamp.

Enough COVERING FIRE stacks can make the multiplier negative.

Required:

```text
speedMultiplier = max(configuredMinimum, 1 - percent / 100)
```

At minimum it must never become negative.

### RELIC-CUR-13 — Debuff registry has pruning code but the progression step does not clearly invoke it
**Affected relics:** `relic.covering_fire`, `relic.armor_shred`  
**Severity:** Medium performance / long-run correctness

`RelicEffectRegistry` stores per-enemy timed debuff records and has a `prune(now)` method. The currently inspected `ProgressionSystem.step()` path does not visibly call it.

In a horde game with many unique enemy IDs, expired debuff entries can accumulate for the duration of the match.

Required:
- prune expired records on a bounded cadence or progression step;
- optionally delete the killed enemy's record immediately;
- ensure the map remains bounded by live/recently affected enemies.

### RELIC-CUR-14 — Damage trigger event discards the authoritative applied amount
**Affected:** trigger framework / future relic effects  
**Severity:** Low current / Medium framework correctness

`damage.applied` contains the real applied damage, but the progression adapter currently dispatches the relic event with:

```text
amount: 0
```

Current MG debuff relics do not use the amount, so this is mostly latent today. It makes the typed relic event contract false and will break any effect that later depends on damage dealt.

Pass the actual authoritative amount through.

---

# 3. Historical defects that must remain regression-locked

These were found in the earlier progression/relic hardening audit. Several appear to have been repaired on `relic-addition`; they still require tests because the chest-world integration touched many of the same files.

## RELIC-HIST-01 — First chest could use the normal rarity table

### Original root cause
`treasureChestsOpened` was incremented before deciding whether the chest was the first chest.

### Required invariant
The first **successfully consumed/opened** chest in a match uses:

```text
Epic       70%
Legendary  30%
```

Every later chest uses:

```text
Common     55%
Rare       30%
Epic       13%
Legendary   2%
```

The first-chest rule is source-independent:
- map-start chest;
- periodic map chest;
- enemy drop;
- leader/wave-clear chest.

### Atomicity requirements
- failed open does not consume first-chest status;
- unclaimable/spawning chest does not consume it;
- invalid empty-pool resolution does not consume it;
- duplicate client request does not consume it twice;
- reconnect does not reroll it.

---

## RELIC-HIST-02 — Progression-disabled modes could still create relic/progression rewards

A mode with `progressionEnabled === false` must produce:

```text
no XP shards
no relic chests
no relic rolls
no relic triggers
no level-up offers
no progression telemetry mutation
```

Do not subscribe progression reward callbacks in disabled modes, and retain defensive guards at public entry points.

Regression-check Demo/legacy modes so this fix never changes their golden behavior.

---

## RELIC-HIST-03 — Relic acquisition presentation could be invisible

The earlier overlay appended relic feedback beneath a root that was hidden whenever an upgrade selection was not active.

Required:
- relic reveal has its own retained visible layer;
- it does not depend on an upgrade-card screen being visible;
- rarity, label, description, resulting stack count, and unique-duplicate XP conversion are visible;
- no raw IDs are shown;
- closing another progression subview cannot destroy an active relic reveal.

---

## RELIC-HIST-04 — Progression countdown UI could freeze

The UI render key previously changed only when the offer changed, not as wall-clock time advanced.

Required:
- update timer text independently from card DOM;
- never let the client resolve the offer;
- authority remains the timeout source;
- display clamps to zero;
- no per-frame full card rebuild.

This is not a relic-effect bug, but it shares the progression overlay and must be regression-locked while relic reveal UI is modified.

---

## RELIC-HIST-05 — Reacquiring a stackable relic could fail to retrigger presentation

Old presentation identity used only:

```text
relicId + duplicateConverted
```

Two ordinary acquisitions of the same relic could therefore look identical and suppress the second presentation.

Required authoritative identity:

```text
relicAcquisitionSequence
```

Every resolved chest acquisition gets exactly one monotonically increasing match-scoped sequence.

Verify:

```text
MAGNET CORE ×1 -> reveal
MAGNET CORE ×2 -> new reveal
MAGNET CORE ×3 -> new reveal
```

A unique duplicate-to-XP result also receives a new sequence.

Reconnect must restore an in-progress reveal without replaying already completed acquisitions forever.

---

## RELIC-HIST-06 — XP from leader/boss/unique duplicate could bypass level-up flow

All XP sources must use one authoritative grant path.

At minimum:

```text
XP shard collection
direct XP rewards
leader XP
elite XP
boss XP
unique-relic duplicate XP
future quest/stage rewards
```

The common route must:
- apply the correct XP multiplier policy;
- update telemetry;
- update team XP;
- queue every crossed level;
- start a level-up when gameplay flow allows;
- not open a selection after terminal clear/gameOver.

Unique duplicate XP must not recursively corrupt an active relic reveal or overwrite a pending level-up.

---

## RELIC-HIST-07 — Chest acquisition bypassed authoritative `relicSelection`

Original broken flow:

```text
open chest
-> roll
-> immediately apply
-> toast
```

Required authoritative flow:

```text
claim chest
-> authority fixes offer/result
-> physical opening state
-> gameplay pauses
-> physical open animation completes
-> relic reveal state
-> apply exactly once at the documented point
-> skip/timeout only skips presentation
-> reveal resolves
-> queued progression flow continues
```

Required:
- result is predetermined;
- skip cannot reroll;
- reconnect cannot reroll/reapply;
- duplicate skip is idempotent;
- terminal state wins;
- multiple simultaneous reward flows serialize.

---

## RELIC-HIST-08 — Trigger handlers could ignore content parameters

No relic-specific tuning number should be silently recreated in runtime code when content already owns that number.

Audit at minimum:

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

Tests must mutate fixture parameters and prove runtime output changes accordingly.

---

## RELIC-HIST-09 — Modern production monsters bypassed chest drops

The old production monster path returned before legacy chest-drop handling.

Required normalized reward route:

```text
entity killed
-> resolve one normalized reward class
-> award XP exactly once
-> determine leader/boss
-> resolve chest reward exactly once
-> emit telemetry
-> dispatch relic kill trigger
```

Modern class authority:

```text
enemy.monster.rewardClass
```

Legacy ownership is only fallback/compatibility.

Regression tests:
- ambient can drop;
- wave enemy uses wave rate;
- elite/special uses elite rate;
- leader gets exactly one guaranteed chest;
- leader does not also perform a random roll;
- purge gets none;
- one kill cannot resolve rewards twice.

---

## RELIC-HIST-10 — Chest lifecycle/reconnect could allow double reward or premature claim

Required lifecycle:

```text
spawning
-> closed
-> opening
-> revealing
-> open
-> despawning
-> removed
```

Rules:
- tiny-to-full spawn must finish before claim;
- client animation never decides claimability;
- claim is authoritative and atomic;
- one chest produces one reward;
- snapshots/reconnect reconstruct state instead of restarting it;
- simultaneous multiplayer proximity cannot duplicate a reward.

---

# 4. Required fixes by subsystem

## 4.1 Add one canonical relic parameter resolver

Create one helper used by:
- `RelicStatProjector`;
- `RelicEffectRegistry` dispatch;
- ROADKILL special accessor;
- TWIN SHELL special accessor;
- any future capability-specific runtime hook.

Example contract:

```ts
function resolveRelicEffectParameters(
  template: RelicEffectTemplateDefinition,
  effect: RelicEffectDefinition,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...(template.parameters ?? {}),
    ...(effect.parameters ?? {}),
  });
}
```

Do not duplicate this merge logic in multiple systems.

Schema validation must reject missing required parameters for every effect type that requires them.

---

## 4.2 Add one canonical enemy reward/combat classification helper

The reward path and relic combat path must not invent separate meanings of "elite."

Recommended normalized result:

```ts
type NormalizedEnemyClass = 'ambient' | 'wave' | 'elite' | 'boss';

function normalizedEnemyClass(enemy: EnemyState): NormalizedEnemyClass {
  // modern monster.rewardClass first
  // legacy ownership fallback second
}
```

Reuse it for:
- chest drop rate;
- leader/boss reward logic;
- APEX PREDATOR;
- future elite/boss conditional relics;
- telemetry.

Leader identity can remain a separate boolean because leader is a role inside wave reward handling, not necessarily a fifth generic monster class.

---

## 4.3 Fix DOUBLE JUMP in shared authoritative/predicted movement

Do not implement double jump only in server glue or only in the client.

The shared `tankKinematics` state needs deterministic airborne jump bookkeeping.

Recommended shape:

```ts
airJumpsRemaining: number;
```

On transition to grounded:
```text
airJumpsRemaining = resolved tank.extraJumps
```

On jump input:
```text
if grounded:
    perform normal jump
else if airJumpsRemaining > 0:
    perform airborne jump
    airJumpsRemaining--
else:
    reject
```

Requirements:
- base game without relic still has exactly one grounded jump;
- DOUBLE JUMP ×1 gives one additional airborne jump;
- ×2 gives two additional airborne jumps;
- acquiring the relic while already airborne has a documented deterministic policy;
- respawn/reset initializes state correctly;
- server and Driver predictor use the same fields/rules;
- no repeated jump from a held input; use the existing edge semantics.

---

## 4.4 Fix AIR MASTER without accidentally making its capability stack

Canonical intended behavior:

```text
Air control +40% per stack
Air-dash reuse ability unlocked once
```

The ability must not become "one extra air dash per stack" unless a newer explicit design says so.

Implement the capability in the shared dash state machine.

A robust interpretation is:

```text
while airborne:
  if AIR MASTER capability is owned:
    permit the defined air-dash refresh/reuse once according to capability contract
on landing:
    reset its airborne-cycle usage state
```

Codex must inspect the original design/test intent for exactly when the reuse becomes available (for example, one extra accepted dash during an airborne cycle versus resetting cooldown on takeoff). Document the chosen semantics.

Remove or correct `tank.airDashCharges` content if it contradicts the one-time capability contract.

Tests must prove:
- no capability before relic;
- first acquisition unlocks;
- second AIR MASTER stack does not grant another copy of the capability;
- second stack still adds another +40% air control;
- landing resets the intended airborne-use state;
- predictor and authority agree.

---

## 4.5 Fix AERIAL MASTER using tank state and weapon-source gating

Do not pass target-airborne state as the condition.

The relic condition should derive from:

```text
ctx.state.tank.grounded === false
```

or the authoritative equivalent.

Add explicit source eligibility:

```ts
function isGunnerWeaponDamage(source: DamageSource, weaponId?: string): boolean
```

Expected coverage:
- MG: yes
- normal cannon: yes
- Charge Shot/cannon-derived shot: yes
- Dash contact: no
- ROADKILL: no
- barrel/environment: no
- relic secondary explosion: no unless explicitly authored as gunner damage

Do not infer eligibility from display labels.

---

## 4.6 Fix APEX PREDATOR with normalized production enemy class

Condition:

```text
normalized class is elite OR boss
```

It must work for:
- modern `monster.rewardClass = elite`;
- modern `monster.rewardClass = boss`;
- legacy special enemy mapped to elite;
- legacy boss;
- wave leader only if the design classifies that leader as elite for combat purposes.

Do not accidentally make every ordinary `wave` enemy eligible.

---

## 4.7 Fix SAFE HAVEN / wave-clear trigger semantics

Introduce exactly one authoritative semantic event for successful wave clear.

Required:

```text
wave cohort purge
!=
wave clear relic trigger
```

The order may be:

```text
wave reaches success condition
-> emit semantic waveCleared once
-> resolve wave-clear relic effects once
-> purge remaining cohort as cleanup
```

or equivalent, but purge itself must never be treated as the relic trigger.

Regression:
- SAFE HAVEN ×1 heals +15 exactly once per successful wave clear;
- ×2 heals +30 exactly once;
- purge-only test invokes no heal;
- duplicate/stale wave event cannot double-heal;
- boss terminal clear does not create a meaningless post-results progression flow.

---

## 4.8 Fix PHASE DASH using authoritative dash state

Remove gameplay dependence on `dashPresentationSeconds`.

Use an authoritative gameplay signal such as:
- accepted `dashState` active window; or
- a dedicated dash-invulnerability gameplay window derived from the dash state machine.

Requirements:
- no relic: Dash does not grant blanket invulnerability;
- PHASE DASH: damage received during the intended dash gameplay window is zero;
- immediately before/after the window: normal damage applies;
- changing cosmetic dash presentation duration does not change invulnerability duration;
- wall collision or early dash termination also terminates invulnerability if the gameplay dash has ended;
- duplicate PHASE DASH never extends/adds a second independent invulnerability layer.

---

## 4.9 Fix relic modifier cleanup

Choose one of these clean designs:

### Option A — exact tracked IDs
The projector owns the IDs it creates and removes them explicitly before rebuilding.

### Option B — source-prefix removal
Add a safe resolver API such as:

```ts
removeModifiersBySourcePrefix('progression:relic:')
```

Do not silently change existing exact-match semantics if other systems rely on them.

Tests:
- acquire passive relic -> modifier appears;
- reset projector -> modifier is gone;
- reproject same state -> exactly one effective modifier;
- stack change -> previous aggregate is replaced, not multiplied with stale aggregate;
- test/debug removal of a relic leaves no ghost modifier.

---

## 4.10 Clamp reduction-derived runtime multipliers

At minimum:
- enemy speed multiplier from COVERING FIRE cannot go below 0;
- incoming damage after reductions cannot go below 0;
- cooldown remaining cannot go below 0.

Use content/schema minima where such minima exist.

Do not cap positive bonuses unless the design defines a cap.

---

## 4.11 Prune per-target relic state

Call `RelicEffectRegistry.prune(now)` on a bounded authoritative cadence.

Also consider:

```text
enemy killed -> remove its debuff record
```

if there is a clean lifecycle hook.

Test with thousands of unique enemy IDs and expired debuffs. Map size must return to a bounded level.

---

# 5. Unique relic / rolling-limit contract

## 5.1 Exactly these relics are unique

```text
relic.phase_dash
relic.phoenix_core
relic.twin_shell
```

No other current relic should accidentally be treated as unique.

## 5.2 Inventory invariant

For every unique relic:

```text
stack ∈ {0, 1}
```

Never 2+.

## 5.3 Duplicate result behavior

Current binding contract:

```text
already own unique relic
-> later roll may select it
-> do not add inventory stack
-> do not re-grant capability
-> do not reapply one-time state
-> grant +250 XP through authoritative XP path
-> still emit one acquisition/result presentation describing conversion
```

Codex must explicitly test this rather than merely checking the stack count.

## 5.4 PHOENIX CORE use limit is separate from acquisition uniqueness

PHOENIX CORE has two limits:

1. inventory unique: one owned copy;
2. activation limit: revive once per match.

The activation-used flag must:
- begin false each new match/rematch;
- become true only after a real successful revive;
- survive ordinary snapshot/reconnect within that match;
- not reset just because a client reconnects;
- reset for a genuinely new match.

If the registry has a general `clear/reset`, it must also clear PHOENIX CORE's internal used-state, or the lifecycle must guarantee a fresh registry per match and test that guarantee.

## 5.5 TWIN SHELL

Required:
- one player cannon action produces exactly two cannon shells total;
- second shell is not a second player input;
- cooldown multiplier is exactly the content-defined value (currently ×1.2);
- second shell inherits the original immutable charge ratio;
- Charge Shot remains supported;
- unique duplicate does not turn it into triple shell;
- reconnect/repeated snapshot does not create extra bursts.

## 5.6 PHASE DASH

Required:
- one copy only;
- duplicate converts to XP;
- invulnerability bound to gameplay dash, not animation;
- no persistent invulnerability after dash or reconnect.

---

# 6. Full 28-relic verification matrix

Codex must create deterministic tests for every row.

| # | Relic | Required behavior | Key bug/regression focus |
|---|---|---|---|
| 1 | MAGNET CORE | XP magnet radius +50% per stack | additive aggregate; actual shard attraction uses resolved stat |
| 2 | HEAT SINK | after cannon fire, MG damage +20% per stack for 3s | timer refresh; content duration; cannon event exactly once |
| 3 | COVERING FIRE | MG hit slows target 5% per stack for 0.5s | correct target; refresh; clamp >=0; debuff cleanup |
| 4 | DOUBLE JUMP | +1 additional airborne jump per stack | **currently missing movement consumption** |
| 5 | VAMPIRE ROUNDS | cannon kill heals +5 per stack | source must be cannon; max-integrity clamp; parameterized |
| 6 | FRIENDLY SHIELD | cannon self-damage -50% per stack, floor 0 | self cannon only; ×2 = zero; never negative/heal |
| 7 | HEARTY TANK | max integrity +20 per stack | flat add; max-health resolver; no duplicate multiplication |
| 8 | DASH REFUND | Dash hit reduces remaining Dash cooldown 30% per stack | Dash-hit only; clamp; one hit event semantics |
| 9 | AIR MASTER | air control +40%/stack + one-time air-dash reuse capability | **capability wiring; ability must not stack accidentally** |
| 10 | HE PAYLOAD | cannon radius +30%/stack, knockback +30%/stack | all cannon variants; additive aggregate |
| 11 | ROADKILL | high-speed contact unlocked; damage coefficient stacks +25% | capability gate; threshold; source attribution; no Dash double-hit |
| 12 | AERIAL MASTER | gunner weapon damage +30%/stack while tank airborne | **tank state, not enemy state; gunner-source filter** |
| 13 | GROUND POUND | landing AoE 3m, base 10, +10 damage/stack + knockback | one landing event; spatial query; no repeated grounded ticks |
| 14 | MOMENTUM SHIELD | at/above top speed, incoming damage -20%/stack | current tank speed condition; clamp |
| 15 | ARMOR SHRED | MG hit gives +10% damage taken/stack for 2s | refresh; correct target; cleanup/prune |
| 16 | BULLET TIME | airborne Dash cooldown recovery speed increases per stack | normal recovery + relic bonus; grounded off |
| 17 | TWIN SHELL | two cannon shells; cooldown ×1.2; unique | unique cap; exactly two; charge ratio; parameter resolver |
| 18 | DEATH MARK | cannon-killed enemy explodes; extra stacks +25% explosion damage | kill source; no unintended recursive cannon chain |
| 19 | GLASS CANNON | all outgoing +20%/stack; incoming +15%/stack | both sides; additive within relic; correct sign |
| 20 | SAFE HAVEN | wave clear heals +15/stack exactly once | **never trigger from purge; no double heal** |
| 21 | RAPID RELOAD | cannon hit reduces remaining cannon cooldown 20%/stack | actual cannon hit only; clamp; no miss proc |
| 22 | IRON WILL | <=50% integrity: incoming damage -20%/stack | threshold boundary; pre-hit condition documented |
| 23 | LAST RESORT | <=30% integrity: all outgoing +25%/stack | threshold boundary; correct attack scope |
| 24 | PHASE DASH | invulnerable during authoritative Dash; unique | **not presentation timer; exact gameplay window** |
| 25 | XP SURGE | XP gain +100%/stack | all authoritative XP paths; no double multiplier |
| 26 | PHOENIX CORE | once/match revive at 50% + shockwave; unique | activation once; new-match reset; no wipeout penalty on successful revive |
| 27 | UNSTOPPABLE | Dash cooldown 0; Dash damage +50%/stack | capability once; numeric stacks; no stale cooldown |
| 28 | APEX PREDATOR | elite/boss damage +40%/stack | **modern rewardClass classification** |

---

# 7. Effect math invariants

## 7.1 Relic percentage stacks are additive inside the relic

Correct:

```text
+50% relic, stack 1 -> 1.50
+50% relic, stack 2 -> 2.00
+50% relic, stack 3 -> 2.50
```

Incorrect:

```text
1.50 × 1.50 = 2.25
```

Use one aggregate modifier per relic/stat.

## 7.2 Flat stacks add before multiplicative layers

Example:

```text
HEARTY TANK ×2
-> max-integrity flat +40
```

Do not convert flat additions into a multiplier.

## 7.3 Level-up layer vs relic layer

Preserve the existing cross-layer rule:

```text
(base + relic flat)
× level-up multipliers
× relic aggregate multiplier
× applicable conditional multipliers
```

Do not "simplify" this by merging level-up duplicate-card math with relic stack math.

## 7.4 Reductions clamp

Examples:
- FRIENDLY SHIELD ×2: cannon self-damage becomes 0.
- COVERING FIRE must never produce negative movement speed.
- cooldown reduction never makes remaining cooldown negative.

---

# 8. Trigger-source correctness

Create a typed source/condition matrix.

## Cannon events
`onCannonFire`:
- emitted once for a player cannon firing action;
- TWIN SHELL's internal second burst must not accidentally count as a second player trigger unless explicitly intended.

`onHit(cannon)`:
- only on actual enemy hit;
- RAPID RELOAD does not proc on environment/miss.

`onKill(cannon)`:
- VAMPIRE ROUNDS and DEATH MARK only on cannon-attributed kill;
- relic explosion kills do not masquerade as cannon kills.

## MG events
- COVERING FIRE and ARMOR SHRED only on MG enemy hits.
- Do not trigger on tank/self/props.

## Dash events
- `onDash` only after authority accepts a dash.
- rejected cooldown input cannot activate PHASE DASH.
- `onDashHit` only on accepted Dash contact damage, not ROADKILL contact.

## Landing
- transition `airborne -> grounded` once.
- not every grounded simulation frame.

## Wave clear
- semantic clear once.
- never generated by cohort purge.

## Wipeout
- PHOENIX CORE gets first chance to revive before final wipeout penalty/game-over handling.
- successful revive suppresses wipeout penalty/event consequences as intended.

---

# 9. Chest spawning and rolling regressions

The world-chest integration must remain correct while relic fixes are made.

## Required world behavior

```text
10 starting map chests
periodic additional map chests
one discoverable starting chest
class-aware enemy drops
special/elite much higher than ordinary
leader exactly one guaranteed chest
purge zero
tiny -> full spawn for every source
unclaimable until spawn completes
automatic proximity claim
physical opening before reveal
reveal
fade/shrink/despawn
persistent relic HUD rail
```

Current provisional content-driven drop rates from the integration design:

```text
ambient/common  1%
wave            2%
elite/special   8%
boss            0% in current single-stage mode
leader          100% guaranteed, no second random roll
purge           0%
```

Do not hardcode these in runtime.

## Rolling tests

Inject deterministic RNG. Never use statistical/flaky tests for correctness.

Test:
- first-chest table boundaries;
- normal table boundaries;
- rarity pool contains valid relics;
- empty rarity sub-pool fallback policy;
- unique duplicate behavior;
- stackable duplicate behavior;
- deterministic same seed = same sequence;
- reconnect does not consume RNG again;
- skip does not consume RNG again;
- simultaneous claim does not consume RNG twice.

---

# 10. Networking and exact-once requirements

Multiplayer authority must own:
- chest lifecycle;
- relic offer/result;
- acquisition sequence;
- inventory stacks;
- capability grants;
- unique duplicate conversion;
- one-time PHOENIX activation state if it must replicate;
- progression flow state.

Clients may only:
- present state;
- request skip after allowed delay;
- render HUD/inventory.

Required idempotence keys:
- chest ID;
- reward offer ID;
- acquisition sequence.

Reconnect tests:
- during spawning;
- closed;
- opening;
- revealing;
- open;
- despawning;
- after unique duplicate conversion;
- while PHOENIX already consumed.

Repeated snapshots must never:
- add another stack;
- grant another capability;
- grant another +250 XP;
- restart a completed reveal;
- fire TWIN SHELL again;
- reset PHOENIX usage.

---

# 11. Required automated tests

Create or extend focused suites rather than one giant test.

Recommended files:

```text
tests/progression08/relicEffectMatrix.test.ts
tests/progression08/relicUniqueLimits.test.ts
tests/progression08/relicConditionalDamage.test.ts
tests/progression08/relicMovementEffects.test.ts
tests/progression08/relicTriggerSemantics.test.ts
tests/progression08/relicParameterResolution.test.ts
tests/progression08/relicCleanup.test.ts
tests/progression08/relicChestRolling.test.ts
tests/progression08/relicSelectionFlow.test.ts
tests/progression08/relicChestWorldIntegration.test.ts
tests/progression08/xpGrantRouting.test.ts
tests/progression08/progressionDisabledMode.test.ts
```

Names may be adapted to existing repository conventions.

## Mandatory targeted tests

### DOUBLE JUMP
```text
base -> grounded jump only
×1 -> one mid-air jump
×2 -> two mid-air jumps
landing -> refills
held input -> does not multi-consume
```

### AIR MASTER
```text
no relic -> normal airborne dash rules
×1 -> air-dash reuse capability works
×2 -> capability count unchanged, air control = +80%
landing -> intended reuse state resets
```

### AERIAL MASTER
```text
tank grounded + enemy airborne -> no bonus
tank airborne + enemy grounded -> +30%
tank airborne + MG -> bonus
tank airborne + cannon -> bonus
tank airborne + Charge Shot -> bonus
tank airborne + Dash/ROADKILL/environment -> no AERIAL MASTER bonus
×2 -> +60% relic contribution
```

### APEX PREDATOR
```text
modern ambient -> no bonus
modern wave normal -> no bonus
modern elite -> +40%
modern boss -> +40%
legacy special mapped elite -> +40%
×2 -> +80%
```

### SAFE HAVEN
```text
wavePurged only -> no heal
semantic wave clear -> +15
two clear notifications with same authoritative wave id -> once
×2 -> +30
```

### PHASE DASH
```text
outside dash -> takes damage
accepted dash gameplay window -> 0
rejected dash input -> normal damage
cosmetic duration changed -> gameplay window unchanged
early wall termination -> invulnerability ends with dash
unique duplicate -> no second stack
```

### COVERING FIRE
```text
21+ stacks cannot produce negative speed multiplier
expired records prune
```

### Parameter resolver
For each parameterized handler, mutate the fixture away from shipped values and assert runtime follows the fixture.

### Unique relics
For each of the three:
```text
first result -> stack 1
second result -> still stack 1
capability/effect not duplicated
+250 XP exactly once
new acquisitionSequence/result emitted
XP can queue level-up safely
```

---

# 12. Browser/manual qualification

Automated tests are necessary but not sufficient.

## Single Player
Force-grant each relic one at a time in a controlled debug run and verify its effect visibly/telemetrically.

Minimum manual focus:
- DOUBLE JUMP;
- AIR MASTER;
- AERIAL MASTER;
- ROADKILL;
- SAFE HAVEN;
- TWIN SHELL;
- PHASE DASH;
- PHOENIX CORE;
- APEX PREDATOR.

Then run stack tests:
- a normal percentage relic ×2;
- a flat relic ×2;
- capability+numeric relic ×2;
- unique duplicate.

## Multiplayer
Two clients:
- both see identical relic inventory/stack counts;
- one chest creates one shared result;
- either player can skip presentation but cannot alter result;
- reconnect during reveal;
- reconnect after unique duplicate conversion;
- TWIN SHELL and movement relic behavior remains authority-consistent;
- Driver and Gunner views do not disagree about tank health/capabilities.

Use deterministic debug grant hooks only if they are development-only and cannot leak into production.

---

# 13. Telemetry/debug additions

The debug view should make relic failures diagnosable without reading memory.

Expose:
- owned relic IDs + stack counts;
- unique-used flags where relevant;
- capabilities and their source IDs;
- normalized current enemy class for focused target;
- current active conditional relics;
- tank airborne/grounded;
- extra jumps remaining;
- air-dash reuse state;
- authoritative dash state;
- PHASE DASH invulnerability active;
- SAFE HAVEN last wave ID fired;
- AERIAL MASTER eligibility;
- APEX PREDATOR eligibility;
- active enemy debuff count;
- last relic acquisition sequence/result;
- duplicate conversion XP;
- relic modifier breakdown per stat.

Do not ship noisy debug UI in the production player-facing HUD.

---

# 14. Forbidden "fixes"

Do not solve bugs by:

- disabling the affected relic;
- changing the relic description to match broken behavior;
- making all relics unique;
- silently excluding unique relics from the roll pool without resolving the duplicate-XP design contract;
- hardcoding relic IDs throughout combat code when a generic condition/capability can express it;
- moving authority to the client;
- using `Math.random()` for authoritative rolls;
- changing rarity rates to make tests easier;
- removing the progression pause/reveal flow;
- removing class-aware drops;
- allowing purge rewards/triggers;
- turning AERIAL MASTER into "damage vs airborne enemies";
- tying PHASE DASH to VFX/presentation time;
- implementing DOUBLE JUMP only client-side;
- granting AIR MASTER capability once per stack;
- letting TWIN SHELL become triple/quad shell through unique duplication;
- altering Charge Shot controls/damage as collateral work;
- restoring generic high-speed ram damage;
- updating golden files merely to hide unexplained regressions.

---

# 15. Suggested implementation sequence

## Phase 1 — Reproduce and classify
- record baseline SHA;
- merge Codex's independent findings with this list;
- mark each item `CONFIRMED`, `ALREADY FIXED`, `NOT REPRODUCED`, or `DESIGN CONFLICT`;
- add failing tests for confirmed defects.

## Phase 2 — Shared helpers
- canonical effect-parameter resolver;
- normalized enemy classification helper;
- typed source predicates for gunner/cannon/MG damage.

## Phase 3 — Movement relics
- DOUBLE JUMP;
- AIR MASTER;
- PHASE DASH.

Because movement is shared with prediction, run netcode/prediction gates immediately after this phase.

## Phase 4 — Combat condition relics
- AERIAL MASTER;
- APEX PREDATOR;
- COVERING FIRE clamp;
- conditional damage regression matrix.

## Phase 5 — Trigger lifecycle
- SAFE HAVEN wave-clear semantics;
- debuff pruning;
- real damage amount propagation;
- PHOENIX lifecycle/reset.

## Phase 6 — Parameter/data hardening
- projector merge;
- ROADKILL/TWIN SHELL resolver;
- duplicate replacement single source;
- strict content validation.

## Phase 7 — Chest/roll regression
- first chest;
- unique duplicates;
- class-aware drops;
- atomic claim/reconnect.

## Phase 8 — Full regression and manual qualification
Run repository-appropriate equivalents of:

```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm run validate:progression-content
npm test
npm run test:progression
npm run test:progression:simulation
npm run test:netcode
npm run test:horde
npm run test:coreloop
npm run test:demo
npm run build
npm run test:progression:e2e
npm run test:e2e
```

Inspect `package.json` first. Do not invent scripts that do not exist.

---

# 16. Implementation report requirements

Create:

```text
docs/relics/RELIC_SYSTEM_BUGFIX_REPORT.md
```

Include:
- starting SHA;
- ending SHA;
- Codex-found bugs;
- this-document bugs;
- deduplicated final bug table;
- status of every item;
- root cause;
- files changed;
- tests added;
- actual command outputs;
- manual verification;
- any design conflicts;
- any bugs intentionally deferred and why.

Also include a final **28-relic matrix** with:

```text
relic
stack policy
effect test
SP pass
MP/authority pass where relevant
status
```

No relic may be marked "working" solely because its stack count changes. The actual player-facing effect must be proven.

---

# 17. Definition of done

Do not declare the relic system fixed until all are true:

```text
[ ] DOUBLE JUMP actually provides airborne jumps.
[ ] AIR MASTER air-dash reuse actually works.
[ ] AIR MASTER capability is granted once while air-control stacks.
[ ] AERIAL MASTER checks tank airborne state.
[ ] AERIAL MASTER only buffs intended gunner weapon damage.
[ ] APEX PREDATOR recognizes modern elites and bosses.
[ ] SAFE HAVEN fires once on real wave clear and never from purge.
[ ] PHASE DASH uses authoritative Dash state, not cosmetic timing.
[ ] COVERING FIRE cannot make enemy speed negative.
[ ] expired relic debuffs are pruned/bounded.
[ ] real damage amount is preserved in relic trigger event payload.
[ ] all effect parameter paths use one merge rule.
[ ] ROADKILL/TWIN SHELL use the same parameter authority.
[ ] relic modifier reset actually removes relic modifiers.
[ ] unique inventory stacks can never exceed 1.
[ ] PHASE DASH / PHOENIX CORE / TWIN SHELL are the correct unique set.
[ ] unique duplicate behavior is explicitly tested and matches the final design decision.
[ ] PHOENIX CORE activates at most once per match and resets for a new match.
[ ] TWIN SHELL produces exactly two shells and preserves Charge Shot behavior.
[ ] ROADKILL remains relic-gated and never double-hits with Dash.
[ ] every one of 28 relics has a deterministic effect-level test.
[ ] first chest remains E70/L30.
[ ] later chests remain C55/R30/E13/L2.
[ ] modern production monsters use class-aware chest drops.
[ ] leader grants exactly one guaranteed chest.
[ ] purge grants no XP/chest/relic trigger.
[ ] stackable repeated acquisitions present every time.
[ ] relic result/reveal/application is exact-once across reconnect.
[ ] progression-disabled modes remain inert.
[ ] all XP sources, including unique duplicate XP, use the shared grant path.
[ ] Single Player and Multiplayer share the same relic gameplay implementation.
[ ] Charge Shot is unchanged except that correct relic modifiers continue to apply to it.
[ ] Combat 05 contact invariants remain unchanged.
[ ] full test/build gates pass without hiding failures.
[ ] manual SP and two-client MP qualification passes.
```

Final invariant:

> A relic is considered implemented only when its authoritative gameplay effect, stack policy, condition/trigger, acquisition limit, networking behavior, and presentation all match the content contract. Owning an icon or incrementing a stack counter is not sufficient proof that the relic works.
