# Codex Prompt — Recoil Crew Monster System Second-Pass Corrections

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target branch:

```text
monster-system
```

Expected audit anchor:

```text
18a8fe8054d948d32738d3d5ac4b993a7edf62a5
```

The branch may have advanced. Fetch and verify the actual remote head. Do not reset or overwrite newer work.

Binding documents:

```text
docs/monster-system/RECOIL_CREW_MONSTER_SYSTEM_DESIGN.md
docs/monster-system/MONSTER_SYSTEM_SECOND_PASS_FIX_SPECIFICATION.md
docs/monster-system/MONSTER_SYSTEM_SECOND_PASS_QUALIFICATION_PLAN.md
docs/monster-system/MONSTER_SYSTEM_POST_FIX_AUDIT_REPORT.md
```

If these second-pass documents are supplied outside the repository, copy them into `docs/monster-system/` before implementation and commit them separately or with the first focused fix commit.

---

# 1. Mission

Fix the remaining monster-system defects that survived the first bug-fix and automated qualification pass.

This task is not a redesign. Preserve the approved monster roster, gameplay structure, map systems, Demo behavior, and current core loop.

You must correct:

```text
1. Wrong-sign normal monster grounding
2. Broken XP instanced-slot/count behavior
3. Silent XP overflow
4. Monster level advancing during paused elite waves
5. Elite/boss engagement distances ignoring body size
6. Missing multiplayer Y/airborne state
7. Missing hard protocol compatibility gate
8. Reservation angles not used as physical targets
9. Density steering overwritten by melee pursuit
10. Aggregate sectors not following terrain height
11. Profile rotation/vector scale discarded by normalized transforms
12. Duplicate boss-intro signaling
13. Non-atomic reinforcement packs
14. Incomplete generated legacy runtime typing
15. Missing compact ownership replication
16. Qualification that checks metadata but not the actual rendered result
```

---

# 2. Safety and audit before editing

Run:

```bash
git fetch origin
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -30
git diff --stat origin/monster-system...HEAD
```

Requirements:

```text
work only on monster-system
never merge into main
preserve all valid current fixes
do not import unrelated map/UI work
keep Demo golden behavior unchanged
inspect local changes before editing
record the actual starting SHA
```

Read at minimum:

```text
docs/monster-system/MONSTER_SYSTEM_SECOND_PASS_FIX_SPECIFICATION.md
docs/monster-system/MONSTER_SYSTEM_SECOND_PASS_QUALIFICATION_PLAN.md
docs/monster-system/MONSTER_SYSTEM_POST_FIX_AUDIT_REPORT.md

src/client/app/entityViewFactory.ts
src/client/enemies/aggregateSectorRenderer.ts
src/shared/monsters/monsterNormalization.ts
src/generated/monsterDimensions.generated.ts
scripts/generate-monster-dimensions.ts

src/client/pickups/xpShardRenderer.ts
src/shared/pickups/xpShardSystem.ts
src/client/prediction/remoteInterpolator.ts
src/client/app/networkStatePresenter.ts

src/shared/monsters/monsterStageView.ts
src/shared/monsters/monsterDifficulty.ts
src/shared/enemies/enemySystem.ts
src/shared/enemies/enemyBehaviors.ts
src/shared/monsters/meleeReservations.ts
src/shared/monsters/movementProfiles.ts

src/shared/net/horde/hordeProtocol.ts
src/shared/net/horde/hordeReplication.ts
src/server/
src/shared/net/
src/shared/types.ts

src/shared/horde/hordeDirector.ts
src/shared/horde/waveController.ts
src/shared/horde/spawnOwnership.ts
content/horde/

tests/
e2e/
package.json
```

Confirm each defect in the current branch before changing it. If a defect has already been fixed by newer work, record that and add or verify the required regression test rather than reimplementing it.

---

# 3. Required phased implementation

## Phase 1 — Grounding and XP instances

### Grounding

Establish one convention:

```text
scaledGroundOffset = max(0, -sourceMinY) × finalScale
visualRootY = terrainY + authoredScaledY + scaledGroundOffset
```

Correct the normal near/far render path and aggregate terrain placement.

Preserve:

```text
profile position
full profile scale
profile rotation
normalization scale
tier scale
variant scale
```

Do not patch with a global arbitrary Y offset.

Add a production-transform test that applies the actual helper to an Object3D and measures its world bounding box.

### XP renderer

Replace arbitrary persistent slots plus `mesh.count = visibleCount`.

Preferred:

```text
pack all live instances contiguously every frame
pack all pop instances contiguously after live instances
set mesh.count to the exact packed total
```

Alternatively implement correct swap-removal, but prove arbitrary-removal correctness.

Define a deterministic policy above 128 shards. Silent dropping is forbidden.

Required tests:

```text
remove slot 0 while slot 1 remains
remove a middle slot
multiple simultaneous pops
129+ shards
reset/rematch
```

Commit:

```text
monster-fix2: correct monster grounding and xp instances
```

---

## Phase 2 — Active-farming clock and engagement geometry

Use one authoritative active-farming time for:

```text
HUD level
spawn-locked HP
spawn-locked damage
spawn-locked XP/reward level inputs
diagnostics
```

Elite-wave duration must not advance the level.

Create one resolved engagement-geometry helper:

```ts
effectiveMeleeDistance = enemyCollisionRadius + tankCollisionRadius + authoredAttackReach;
```

Use it for:

```text
reservation eligibility
reservation target
approach stop
attack gate
release
staging ring
boss melee patterns
```

Use reservation angles as actual target points.

Preserve density steering by blending it after selecting the desired engagement vector.

Required tests:

```text
90-second wave does not advance level
HUD and spawn-lock agree
large elite/boss attacks without invalid overlap
reservation owners occupy distinct angles
density steering affects chase movement
```

Commit:

```text
monster-fix2: align farming difficulty and engagement geometry
```

---

## Phase 3 — Airborne replication and protocol gate

Extend near/mid horde replication with at least:

```text
quantized Y
airborne flag
```

Prefer:

```text
quantized vertical velocity
impulse sequence/start tick
```

Do not re-ground an airborne remote enemy.

Version the protocol and validate:

```text
protocol version
content-pack hash
enemy-definition-order hash
```

Reject incompatible clients and unknown definition indices before match start.

Required tests:

```text
airborne materialize
airborne delta
server/driver/gunner arc agreement
landing
airborne death
old/new version rejection
definition hash rejection
unknown index rejection
```

Commit:

```text
monster-fix2: replicate airborne monsters and gate protocol
```

---

## Phase 4 — Remaining correctness

Implement:

```text
terrain-correct aggregate sectors
full profile rotation/vector scale composition
one boss-intro signal
atomic reinforcement packs
generated runtime type for every enemy definition
compact ownership replication
```

Ownership must preserve enough for:

```text
population class
wave id
leader/featured state
elite/boss priority
formation role where relevant
reconnect
```

Explicitly test `enemy.scrapBugHorde`.

Commit:

```text
monster-fix2: preserve transforms ownership and atomic packs
```

---

## Phase 5 — Qualification

Follow the full qualification document.

At minimum run the exact available equivalents of:

```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm run generate:map-profiles
npm test
npm run build
npm run test:demo
npm run test:horde
npm run test:horde:benchmark
npm run test:netcode
npm run test:progression
npm run validate:enemy-animations
npm run test:monsterpack-import
npm run test:monsterpack-rendering
```

Also run:

```text
full production Single Player round
full production two-client round
actual grounding gallery
XP pressure test above 128
large elite/boss geometry gallery
airborne cannon-launch comparison
protocol mismatch tests
reconnect during airborne/boss/XP states
rematch cleanup
```

Human-review the screenshots and clips. Do not count a nonblank pixel check as visual review.

Commit:

```text
monster-fix2: qualify second-pass monster corrections
```

---

# 4. Reports

Create or update:

```text
docs/monster-system/MONSTER_SYSTEM_SECOND_PASS_FIX_REPORT.md
docs/monster-system/SECOND_PASS_PHASE_HANDOFF.md
```

The final report must identify:

```text
starting SHA
ending SHA
all commits
root cause and fix for every numbered defect
tests actually run
browser runs actually performed
visual gallery paths
human reviewer record
remaining known limitations
Demo unchanged
map systems untouched
branch unmerged
```

Do not claim work that was not run or visually inspected.

---

# 5. Forbidden shortcuts

Do not:

```text
flip the grounding sign without a real world-bounds test
drop XP records when capacity is exceeded
grant XP directly to hide invisible pickups
continue using global match time for farming level
multiply all attack range by tier scale
disable collision for elite/boss enemies
remove reservations or separation
ignore reservation angles
terrain-lock airborne remote enemies
accept protocol mismatches
fall back unknown definitions to Scrap Bug
manually list every monster slug
partially spawn an authored reinforcement pack
use one global Y offset
redesign the HUD
change map generation
rebalance the roster
change boss mechanics
update Demo golden to hide failures
merge into main
```

---

# 6. Definition of done

The task is complete only when all are true:

```text
ordinary, elite, and boss feet contact terrain in actual rendered bounds
near/far/aggregate transitions preserve the same vertical envelope
profile rotation and vector scale work
XP survives arbitrary removal order
XP pressure has no silent invisible pickups
elite waves freeze both timer and monster level
HUD and spawn-lock level agree
large elite/boss attack geometry includes body size
reservation owners physically use their assigned angles
density steering remains active
driver and gunner see the same airborne arc
protocol mismatches are rejected
aggregate sectors follow terrain
boss incoming presentation fires once
reinforcement packs are atomic
scrapBugHorde retains correct runtime type
ownership survives multiplayer reconnect
all required tests and builds pass
full SP and two-client rounds pass
screenshots and clips receive human visual review
reports are complete
branch remains unmerged
```
