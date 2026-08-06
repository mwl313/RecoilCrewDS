# Recoil Crew — Monster System Bug-Fix Specification

## Document status

```text
Status: Binding bug-fix specification
Target branch: monster-system
Scope: Correctness and integration defects only
Out of scope: gameplay improvements, balance overhaul, UI redesign, map work
```

This document consolidates the defects found during the post-implementation audit and playtest of the `monster-system` branch.

The goal is to make the approved monster-system and core-loop designs work correctly. Do not add new mechanics or broader improvements until these defects are resolved and qualified.

---

# 1. Confirmed defects

1. Melee fodder does not reliably chase the tank.
2. The same shared movement defect affects melee specialists and melee elites.
3. Ranged monsters can oscillate around preferred range.
4. Elite and boss visual tier scales are authored but not applied to rendered models.
5. Elite and boss collision does not match intended size.
6. Model-family ground offsets are discarded, leaving some monsters buried in terrain.
7. Multiplayer generalized monsters are compressed through a legacy type codec and reconstructed as Scrap Bugs.
8. Aggregate-sector identity encoding also loses generalized monster identity.
9. Production wave and reinforcement packs collapse all entries into the first monster type.
10. Boss escorts suffer the same pack-entry collapse.
11. Farming-phase population and threat ramps use the global clock instead of phase-local farming time.
12. Boss intro is presentation-only; the boss may already move or attack.
13. Farming time continues during elite waves.
14. A long elite fight can consume the next farming interval and cause the next elite to spawn immediately after the current one dies.
15. XP shards are created and collected but are not rendered.
16. XP collection feedback is not emitted through the intended pickup event.
17. Collected and expired XP shards are not removed from authoritative state.
18. Enemy speed modifiers are applied after movement integration.
19. Semantic animation state is evaluated before current-frame behavior finishes.
20. Existing multiplayer tests do not round-trip a generalized monster, elite, or boss.
21. Existing visual qualification does not verify actual model identity, tier scale, collision, or ground contact.

---

# 2. Binding timer behavior

The farming clock must stop while an elite wave is active.

```text
180 → 120 seconds
Wave 1 begins
Timer freezes at 120
Elite dies
Timer resumes from 120

120 → 60 seconds
Wave 2 begins
Timer freezes at 60
Elite dies
Timer resumes from 60

60 → 0 seconds
Boss intro begins
```

The farming clock also remains paused during authoritative upgrade and relic selection because gameplay simulation is paused.

Production content must use:

```json
{
  "pauseCountdownDuringWave": true
}
```

No queued threshold may be consumed while an elite wave is active.

---

# 3. P0 — Multiplayer monster identity

## Problem

The compressed horde protocol recognizes only legacy enemy types. A generalized monster uses `type: "monster"` and an exact `defId`, but the unknown type encodes as zero and the client fallback reconstructs it as a Scrap Bug. The client then routes it through the legacy Scrap Bug renderer.

## Required fix

Replicate a stable exact enemy-definition identity.

Recommended approach:

```text
generated deterministic enemy-definition order
enemy definition ID ↔ numeric index
```

A materialize record must preserve at minimum:

```text
entity ID
exact definition index
type
position and yaw
HP and max HP
flags
presentation profile
required ownership/leader data
semantic action state
```

Client reconstruction must produce:

```ts
{
  type: 'monster',
  defId: 'enemy.quaternius.<exact identity>',
  presentationProfileId: '<exact profile>'
}
```

Do not hardcode all monster names into the legacy five-entry switch.

## Aggregate identity

Aggregate sectors must also transmit a stable exact definition identity. Never derive unknown monsters through a Scrap Bug fallback.

## Required tests

```text
server Ninja ordinary → client Ninja ordinary
server Wizard ranged → client Wizard ranged
server Demon elite → client Demon elite
server Yeti boss → client Yeti boss
generalized monster → never Scrap Bug
aggregate identity → exact definition preserved
```

Browser tests must assert rendered definition/profile identity, not only encounter-bar labels.

---

# 4. P0 — Scale, collision, and grounding

## Intended scale

```text
small  = 1.02 m
medium = 1.53 m
large  = 1.70 m

fodder/specialist = ×1
elite             = ×3
boss              = ×5
```

Representative target heights:

```text
medium elite = 4.59 m
large boss   = 8.50 m
```

## Current defect

The normalization math exists, but the resolved scale is not applied to the visual rig. Generalized collision commonly falls back to radius `0.8`. The generated dimension cache hardcodes every ground offset to zero, while the renderer places the visual root directly at terrain Y.

## Required resolved record

Create one authoritative resolved record per monster definition/family:

```ts
interface ResolvedMonsterDimensions {
  enemyId: string;
  familySlug: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceDepth: number;
  sourceGroundOffset: number;
  targetBaseHeight: number;
  normalizationScale: number;
  tierScale: number;
  variantScale: number;
  finalScale: number;
  finalWidth: number;
  finalHeight: number;
  finalDepth: number;
  groundOffset: number;
  collisionRadius: number;
  collisionHeight: number;
  spawnClearanceRadius: number;
  engagementRadius: number;
  shadowRadius: number;
  projectileSocketY: number;
}
```

Use this same record for:

- Render scale
- Render Y placement
- Collision
- Spawn clearance
- Melee reservation width
- Melee stopping distance
- Projectile socket
- Shadow size
- Debug bounds
- Near/far/aggregate envelope validation

## Ground offset generation

The dimension generator must preserve the actual neutral-pose foot plane and correctly interpret the catalog axes.

```text
scaledGroundOffset = sourceGroundOffset × finalScale
visualRootY = terrainHeight - scaledGroundOffset + authoredPresentationYOffset
```

The sign must be verified in a flat-plane test.

Forbidden:

```text
one universal +Y offset for every monster
```

## Tests

```text
small ordinary target height ≈ 1.02 m
medium elite target height ≈ 4.59 m
large boss target height ≈ 8.50 m
boss collider > elite collider > ordinary collider
lowest visible point within 0–0.05 m above a flat test plane
```

Validate every possible featured boss identity visually.

---

# 5. P0 — Melee pursuit and engagement

## Current defect

An unreserved melee monster immediately rotates its movement sideways. Reservations are granted only near attack range, so many enemies circle before they have approached the tank.

## Required shared movement states

```text
CHASE
STAGE
RESERVED_APPROACH
ATTACK_HOLD
```

### CHASE

```text
distance > stagingOuterRadius
→ move directly toward tank
→ apply density steering
→ no circling
```

### STAGE

```text
inside staging band and no reservation
→ maintain radial staging distance
→ controlled tangential movement
→ search for an open attack arc
→ do not cross through the tank
```

### RESERVED_APPROACH

```text
reservation owned and outside attack position
→ approach reserved angular position
→ radial correction
→ slow near attack point
```

### ATTACK_HOLD

```text
reservation owned and inside tolerance
→ stop or nearly stop
→ face tank
→ attack
```

Use a small reusable data profile:

```ts
interface MeleeMovementProfile {
  stagingRadiusMultiplier: number;
  stagingBandWidth: number;
  tangentialSpeedMultiplier: number;
  radialCorrectionStrength: number;
  attackStopTolerance: number;
}
```

Do not introduce per-monster special AI.

## Tests

Run multi-second simulations:

```text
far unreserved melee → distance decreases
near unreserved melee → stays near staging ring
reserved melee → reaches attack position
only reservation owners attack
large elites occupy wider arcs
bosses do not use ordinary reservation slots
```

---

# 6. P1 — Ranged movement hysteresis

Use a hold band rather than flipping directly between approach and retreat:

```text
distance > preferredRange × outerRatio → approach
distance < preferredRange × innerRatio → retreat
otherwise → hold or slow strafe
```

Initial defaults:

```text
innerRatio = 0.80
outerRatio = 1.10
```

Store these in a reusable ranged movement profile. A ranged enemy near preferred range must not alternate direction every update.

---

# 7. P0 — Wave pack composition

## Current defect

Wave code resolves only `entries[0]`, sums all entry counts, and spawns the total as that first enemy definition.

A configured pack such as:

```text
2 close fodder
1 ranged fodder
1 specialist
```

can therefore become:

```text
4 close fodder
```

The same defect affects reinforcements and boss escorts.

## Required fix

Iterate every entry:

```ts
for (const entry of pack.entries) {
  spawnCohort({
    enemyDefId: resolveSlot(entry.slotId),
    count: entry.count,
    formationRole: entry.formationRole,
  });
}
```

Preserve:

- Exact slot identity
- Exact entry count
- Formation role
- Wave/leader ownership
- Deterministic spawn order

Boss escorts must use the selected Phase 3 close, ranged, and specialist identities.

## Tests

Assert exact composition for opening packs, reinforcement packs, and boss escorts.

---

# 8. P1 — Phase-local farming progression

Each farming phase lasts 60 active farming seconds, but progress is currently derived from the global 180-second remaining value. Phase 1 and Phase 2 stay clamped near zero progress.

Use active phase-local farming time:

```ts
phaseElapsed = stage.activeFarmingElapsed - stage.phaseActiveFarmingStartedAt
phaseProgress = clamp(phaseElapsed / phase.durationSeconds, 0, 1)
```

Elite-wave time must not increase phase-local farming progress.

For every phase, test start, midpoint, and end values for:

- Entity target
- Threat target
- Spawn income

---

# 9. P0 — Farming timer pause

Set `pauseCountdownDuringWave` to `true` for production.

Verify:

```text
Wave 1 starts at 120
simulate 90 seconds
remaining still 120
leader dies
simulate 1 second of farming
remaining ≈119

Wave 2 starts at 60
simulate 90 seconds
remaining still 60
```

During an elite wave, the HUD may show the frozen time with an active-wave label or `WAVE ACTIVE`. Do not perform a broad HUD redesign in this task.

---

# 10. P1 — Authoritative boss intro

## Current defect

The boss wave begins immediately and the first four seconds are only presented as an intro. The boss may already move, collide, telegraph, or attack.

## Required sequence

```text
FARMING
→ BOSS_INTRO
→ BOSS_ACTIVE
→ RESULTS
```

During `BOSS_INTRO`:

- No boss movement
- No boss collision damage
- No targeting
- No telegraph
- No projectile
- No attack-cycle advancement

After the authored intro duration, spawn or activate the boss and escorts exactly once.

---

# 11. P0 — XP shard rendering and lifecycle

## Confirmed behavior

Monster deaths create authoritative XP shards. The shards magnetically collect and grant progression, which explains why the player levels up despite seeing no XP objects.

The primary defect is a missing client presentation path.

## Remote-frame integration

Add:

```ts
xpShards: XpShardState[]
```

to the remote-frame contract and carry it through:

- Multiplayer frame construction
- Single Player frame construction
- Reset/cleanup

## Rendering

Add a bounded instanced XP-shard renderer.

Visual minimum:

```text
spawn → visible above grass
idle → hover, pulse, rotate
magnet → visibly travel toward tank
collection → flash/pop and disappear
```

Use a high-contrast emissive presentation. Do not clone a heavy hierarchy per shard.

## Collection feedback

On collection:

1. Grant XP once.
2. Emit the intended pickup event once.
3. Trigger audio/VFX once.
4. Mark collected.
5. Remove after at most a short presentation-safe grace period.

Connect or replace the currently unused XP pickup-event helper.

## Cleanup

Collected and expired shards must be removed from authoritative state. Prevent unbounded `xpShards` growth and snapshot bloat.

## Tests

```text
monster death → XP shard state created
remote frame → shard included
renderer → visible instance
collect → one XP grant and one pickup event
collected → removed
expired → missed telemetry and removed
Single Player and multiplayer → same authoritative reward
```

---

# 12. P1 — Speed modifier ordering

Apply the final monster speed before `movement.integrate`:

```text
authored speed
→ spawn-level effects
→ progression/relic debuff
→ movement direction
→ integration
```

A speed-debuff test must measure reduced displacement over a fixed duration.

---

# 13. P1 — Semantic action ordering

Update semantic actions after current-frame behavior establishes final movement, attack, telegraph, and death state:

```text
death lock
→ behavior update
→ attack/cue state
→ semantic action
→ replication
```

Required same-tick behavior:

```text
attack accepted → Attack cue
movement begins → Walk cue
death → Death overrides everything
```

---

# 14. Ordinary mix authority

For this fix pass, authored spawn-pack entry counts are the gameplay authority. The gameplay roster’s `ordinaryMix` may remain informational or be validated against packs.

Do not add a new procedural ratio generator during bug fixing.

---

# 15. Test gaps to close

Add coverage for:

- Exact generalized `defId` round-trip
- Presentation profile round-trip
- Elite and boss multiplayer identity
- Aggregate identity
- Render scale metadata
- Ground-contact metadata
- Wave pack composition
- Timer freeze during long waves
- Phase-local pacing
- Boss inactivity during intro
- XP shard frame inclusion
- XP render lifecycle
- XP state-growth cleanup

Browser diagnostics may expose test-only attributes such as:

```text
data-enemy-id
data-def-id
data-presentation-profile
data-tier
data-final-scale
```

---

# 16. Phased implementation order

## Phase 1 — Multiplayer identity and wave composition

- Exact definition identity protocol
- Aggregate identity
- Pack-entry iteration
- Reinforcement and boss-escort composition
- Protocol and composition tests

## Phase 2 — Scale, collision, and grounding

- Dimension generator correction
- Ground offsets
- Render scale
- Collision/clearance/engagement/socket propagation
- Flat-plane validation

## Phase 3 — Movement and behavior ordering

- Melee pursuit/staging/reservation movement
- Ranged hysteresis
- Speed modifier ordering
- Semantic ordering

## Phase 4 — Timer, phase pacing, and boss intro

- Pause farming clock during waves
- Phase-local farming progression
- Authoritative boss intro
- Long-wave tests

## Phase 5 — XP presentation and cleanup

- XP remote-frame data
- Instanced renderer
- Pickup feedback
- Authoritative cleanup
- SP/MP tests

## Phase 6 — Full qualification

- Full Single Player round
- Full two-client round
- Long elite fights
- Every featured identity as elite and boss
- Ground-contact gallery
- Rematch cleanup
- Performance and state-growth test

Each phase must end buildable, tested, committed, and documented.

---

# 17. Acceptance checklist

```text
[ ] Melee fodder chases from long range
[ ] Melee circling occurs only near staging range
[ ] Reservation owners reach attack position
[ ] Ranged monsters do not oscillate at preferred range

[ ] Elite visual scale is ×3
[ ] Boss visual scale is ×5
[ ] Collision matches visual scale
[ ] Spawn clearance matches scale
[ ] Projectile sockets match scale
[ ] All validated monsters stand on terrain

[ ] Exact monster defId survives multiplayer
[ ] Generalized monsters never decode as Scrap Bugs
[ ] Elite identity survives multiplayer
[ ] Boss identity survives multiplayer
[ ] Aggregate identity survives multiplayer

[ ] Wave packs preserve all entries
[ ] Reinforcements preserve all entries
[ ] Boss escorts preserve Phase 3 composition

[ ] Wave 1 freezes timer at 120
[ ] Wave 2 freezes timer at 60
[ ] Timer resumes from exact value
[ ] Long elite fights do not consume the next farming interval
[ ] Phase-local ramps work for all three phases

[ ] Boss cannot move or attack during intro
[ ] Boss activates exactly once after intro

[ ] XP shards render in Single Player
[ ] XP shards render in multiplayer
[ ] XP grants exactly once
[ ] Pickup feedback fires exactly once
[ ] Collected shards are removed
[ ] Expired shards are removed
[ ] XP state remains bounded

[ ] Speed debuffs reduce actual displacement
[ ] Semantic actions update on the correct tick

[ ] Demo regression remains unchanged
[ ] Progression formulas remain unchanged
[ ] Monster roster remains unchanged
[ ] No balance overhaul added
[ ] No map work added
[ ] No UI redesign added
[ ] Branch remains unmerged
```

---

# 18. Final qualification scenarios

## Long Wave 1

```text
Reach Wave 1
Keep elite alive for 90 seconds
Verify timer remains 120
Kill elite
Verify farming resumes from 120
```

## Long Wave 2

```text
Reach Wave 2
Keep elite alive for 90 seconds
Verify timer remains 60
Kill elite
Verify farming resumes from 60
```

## Multiplayer identity

Spawn one ordinary, one ranged, one specialist, one elite, and one boss. Verify both clients render the exact selected definitions.

## Scale and grounding

Spawn representative fodder, specialist, elite, and boss. Verify final height, collider size, and foot contact.

## XP

Kill a monster outside collect radius. Verify the shard remains visible, then visibly magnetizes to the tank, grants XP once, emits feedback, and is removed.

## Boss intro

Reach zero farming time. Verify the full intro duration contains no boss movement, damage, or projectile, then verify one activation.

---

# 19. Required report

Create:

```text
docs/monster-system/MONSTER_SYSTEM_BUG_FIX_REPORT.md
```

Include:

1. Starting and final SHA
2. Commits by phase
3. Root cause and fix for every defect
4. Multiplayer protocol change
5. Identity tests
6. Scale and grounding results
7. Movement results
8. Wave composition results
9. Long-wave timer results
10. Boss intro results
11. XP presentation and cleanup results
12. Tests actually run
13. Browser qualification
14. Performance/state-growth results
15. Remaining known bugs
16. Confirmation improvements were deferred
17. Confirmation Demo remains unchanged
18. Confirmation branch remains unmerged
