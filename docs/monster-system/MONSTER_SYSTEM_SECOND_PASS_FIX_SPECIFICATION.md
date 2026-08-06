# Recoil Crew — Monster System Second-Pass Fix Specification

## Document status

```text
Status: Binding implementation specification
Target branch: monster-system
Scope: Remaining correctness, rendering, networking, and qualification defects
Out of scope: balance redesign, map work, UI redesign, new mechanics
Audit anchor: 18a8fe8054d948d32738d3d5ac4b993a7edf62a5
```

Codex must fetch the branch and record the actual starting SHA. Never reset a newer remote branch back to the audit anchor.

---

# 1. Objective

Correct the remaining monster-system defects that survived the first automated qualification pass.

Completion requires:

```text
exact terrain grounding in real rendered transforms
stable XP rendering under arbitrary removal and pressure
one authoritative active-farming difficulty clock
large-monster engagement distances consistent with collision
airborne monster replication in multiplayer
hard protocol compatibility checks
reservation-angle movement and preserved separation
terrain-correct aggregate presentation
complete transform composition
atomic authored reinforcement composition
generated runtime enemy typing
compact ownership replication
visual and human qualification
```

---

# 2. Repository safety

Before editing:

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
preserve all valid first-pass fixes
do not merge into main
do not import unrelated map or UI branches
keep Demo mode and its golden fixture behavior unchanged
do not overwrite a newer remote head
record the starting SHA
keep every phase in a focused commit
```

Create or update:

```text
docs/monster-system/MONSTER_SYSTEM_SECOND_PASS_FIX_REPORT.md
docs/monster-system/SECOND_PASS_PHASE_HANDOFF.md
```

---

# 3. Required implementation phases

```text
Phase 1 — Render grounding and XP instancing
Phase 2 — Active-farming difficulty and scaled engagement
Phase 3 — Airborne replication and protocol compatibility
Phase 4 — Reservation, separation, transforms, ownership, and atomic packs
Phase 5 — Full visual and multiplayer qualification
```

Each phase must:

```text
build
pass focused tests
pass the relevant existing regression suites
end in one focused commit
update the report
leave a clean handoff
```

---

# PHASE 1 — Render grounding and XP instancing

## 1A. Correct real monster grounding

Use one documented convention:

```text
sourceGroundOffset = max(0, -sourceMinY)
scaledGroundOffset = sourceGroundOffset × finalScale
visualRootY = terrainY + authoredScaledY + scaledGroundOffset
```

Requirements:

- Correct the sign in the normal monster entity path.
- Include terrain height in aggregate-sector placement.
- Preserve the same vertical envelope through near/far/aggregate LOD transitions.
- Apply profile rotation and full profile scale before measuring or correcting the final bounds.
- Do not add one global arbitrary Y offset.
- Do not special-case individual families unless the source manifest explicitly supplies a family override.

### Required real-transform test

Construct or load a test Object3D whose local bounding box has a known negative `minY`.

Apply the production transform helper and assert:

```text
world bounding-box minimum Y = terrain height ± 0.05 m
```

Run the same assertion for:

```text
small ordinary
medium elite
large boss
near model
far model
aggregate representation
nonzero terrain height
authored rotation
nonuniform profile scale
```

## 1B. Replace XP arbitrary-slot drawing

Preferred implementation:

```text
build a contiguous visible list each frame
write matrices to indices 0..N-1
set mesh.count = N
```

Live and pop instances may share one packed mesh or use separate bounded meshes.

Requirements:

- Removing any shard must not hide another shard.
- Multiple pops in the same frame must use distinct visible matrices.
- No stale matrices may be rendered after count shrink.
- Clear internal maps on reset/dispose.
- Preserve authoritative magnet positions.
- Client presentation never grants XP.

## 1C. Define XP overflow behavior

Choose a deterministic policy and document it.

Recommended:

```text
authoritative shard coalescing
or
renderer capacity derived from a hard authoritative shard cap
```

At minimum:

- No silent invisible XP.
- Emit diagnostics when nearing capacity.
- Add a stress test beyond 128 shards.
- Confirm bounded CPU/GPU state.

## 1D. Required tests

```text
remove slot 0 while slot 1 remains
remove a middle shard from 10 live shards
simultaneous removal of several nonadjacent shards
multiple pop effects in one frame
more than 128 authoritative shards
reset and rematch cleanup
actual world-space foot contact on sloped/nonzero terrain
near↔far↔aggregate vertical continuity
```

## 1E. Commit

```text
monster-fix2: correct monster grounding and xp instances
```

---

# PHASE 2 — Active-farming difficulty and scaled engagement

## 2A. One authoritative difficulty clock

Create or expose a canonical value:

```ts
activeFarmingTime = stage.activeFarmingElapsed;
```

All farming/elite-wave monster level calculations must use it.

Requirements:

```text
HUD level uses active farming time
spawn-lock HP uses active farming time
spawn-lock damage uses active farming time
spawn-lock XP/reward level inputs use active farming time
elite waves do not advance the level clock
boss level remains the authored boss lock
```

Do not derive one subsystem from global `match.state.time` and another from stage time.

## 2B. Resolved engagement distances

Create one helper, for example:

```ts
resolveMonsterEngagementGeometry(enemy, attack, tank)
```

It must return at least:

```text
enemy collision radius
tank collision radius
authored attack reach
effective attack distance
reservation radius
staging inner radius
staging outer radius
release radius
```

For melee:

```ts
effectiveAttackDistance = enemyRadius + tankRadius + authoredAttackReach;
```

Use the same result for:

```text
reservation eligibility
reservation target position
reserved approach
attack hold
melee hit acceptance
release
boss melee patterns
```

## 2C. Use reservation angles physically

For a reservation angle `a`:

```ts
targetX = tank.x + cos(a) * effectiveAttackDistance;
targetZ = tank.z + sin(a) * effectiveAttackDistance;
```

Reserved enemies must move toward that point.

## 2D. Preserve density steering

Do not overwrite density steering after it is computed.

Required order:

```text
determine engagement state
compute desired engagement vector
compute density/separation vector
blend with authored weights
normalize
integrate
```

Large elites and bosses must have stronger physical separation because their resolved radius is larger, not because of bespoke AI.

## 2E. Required tests

```text
90-second wave keeps the same monster level
post-wave spawn uses the expected level
HUD and spawn-lock level agree
elite/boss can reach attack hold without collider overlap
elite/boss attack acceptance matches visible geometry
six reservation owners occupy distinct angular targets
unreserved enemies do not deal melee damage
density steering remains active during chase
large boss and escorts do not occupy the same body space
```

## 2F. Commit

```text
monster-fix2: align farming difficulty and engagement geometry
```

---

# PHASE 3 — Airborne replication and protocol compatibility

## 3A. Replicate vertical monster state

Near/mid enemy replication must include:

```text
quantized Y
airborne flag
```

Prefer:

```text
quantized vertical velocity
impulse sequence or start tick
```

Requirements:

- A newly materialized airborne enemy appears at authoritative Y.
- Deltas preserve the launch arc.
- Remote clients do not re-ground an airborne enemy.
- Landing returns to terrain projection cleanly.
- Far/aggregate enemies may remain terrain-projected.
- Death while airborne remains visually consistent.

## 3B. Version the protocol

Increment the authoritative protocol version.

Handshake must validate:

```text
protocol version
content-pack hash
enemy-definition-order hash
```

Requirements:

- Old client/new server mismatch is rejected.
- New client/old server mismatch is rejected.
- Unknown definition indices never silently fall back.
- Reconnect uses the same compatibility gate.

## 3C. Required tests

```text
materialize airborne monster round-trip
vertical delta round-trip
launch arc comparison server/driver/gunner
landing comparison server/driver/gunner
death during airborne impulse
old protocol rejection
enemy definition hash mismatch rejection
unknown definition index rejection
```

## 3D. Commit

```text
monster-fix2: replicate airborne monsters and gate protocol
```

---

# PHASE 4 — Remaining composition and presentation correctness

## 4A. Preserve full profile transforms

Compose:

```text
normalization scale
tier scale
optional variant scale
full authored profile scale
authored rotation
authored position
ground correction
```

Do not collapse a vector scale to X only.

## 4B. Terrain-correct aggregate sectors

Use the map/world ground-height function at the sector center or sampled aggregate footprint.

Ensure near/far/aggregate transition envelopes match.

## 4C. Remove duplicate boss-intro signaling

Exactly one intro event.

Optional activation event must have a distinct semantic identifier and must not replay the incoming sting.

## 4D. Make reinforcement packs atomic

Preflight:

```text
entity capacity
total threat budget
all entry definitions
positions
wave state
```

Then:

```text
spawn every authored entry
or spawn none
```

A content-authored fallback pack is permitted.

## 4E. Generate runtime enemy type from content

The exact runtime type for every definition must be generated from validated enemy content.

Do not keep a partial handwritten map.

Explicitly test:

```text
enemy.scrapBug
enemy.scrapBugHorde
enemy.rammer
enemy.gunTower
enemy.lootTruck
enemy.testHound
ordinary monster
elite
boss
```

## 4F. Replicate compact ownership metadata

Materialize and reconnect must preserve enough data for:

```text
population class
wave id
featured/leader status
elite/boss status
formation role when relevant
animation priority
encounter presentation
```

Use compact indexed fields and document the bit layout.

## 4G. Required tests

```text
profile rotation preserved
nonuniform scale preserved
aggregate sector follows raised terrain
no LOD vertical pop beyond tolerance
BOSS INCOMING emitted exactly once
activation event emitted at most once
reinforcement pack all-or-none under cap pressure
scrapBugHorde retains legacy runtime type
ownership survives materialize/delta/reconnect
boss/elite animation priority survives multiplayer
```

## 4H. Commit

```text
monster-fix2: preserve transforms ownership and atomic packs
```

---

# PHASE 5 — Full qualification

Follow `MONSTER_SYSTEM_SECOND_PASS_QUALIFICATION_PLAN.md`.

Minimum required gates:

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
production Single Player full round
production two-client multiplayer full round
airborne launch comparison
XP >128 stress scene
large elite/boss geometry gallery
near/far/aggregate terrain gallery
rematch cleanup
protocol mismatch rejection
```

Create actual screenshots and record human visual review.

## Commit

```text
monster-fix2: qualify second-pass monster corrections
```

---

# 4. Forbidden shortcuts

Do not:

```text
flip a sign without adding a real transformed-bounds test
hide XP overflow by dropping records
grant XP directly to hide missing visuals
use global match time for farming difficulty
multiply all authored attack ranges by tier scale
disable collision to make bosses attack
remove reservations
remove density steering
re-ground airborne monsters on the client
accept incompatible protocol versions
fall back unknown monsters to Scrap Bug
special-case every monster slug by hand
partially spawn an authored reinforcement pack
apply one global Y offset
redesign the HUD
change map generation
rebalance the roster
update Demo golden to conceal a regression
merge into main
```

---

# 5. Final acceptance checklist

```text
[ ] Normal monster world-space feet contact terrain
[ ] Near/far/aggregate use one grounding convention
[ ] Profile rotation and vector scale preserved
[ ] No visible LOD vertical pop

[ ] XP remains visible after arbitrary removals
[ ] Multiple pops use distinct instances
[ ] XP overflow has a deterministic visible policy
[ ] XP state and renderer state remain bounded
[ ] Rematch clears XP presentation

[ ] Elite-wave time does not advance monster level
[ ] HUD and spawn-lock level agree
[ ] Boss level remains locked

[ ] Elite/boss engagement includes body radii
[ ] Reservation owners move to assigned angles
[ ] Density steering survives engagement selection
[ ] Large monsters attack without invalid overlap

[ ] Airborne Y survives multiplayer
[ ] Driver and gunner see the same launch arc
[ ] Landing and airborne death are stable

[ ] Protocol version bumped
[ ] Definition-order hash checked
[ ] Incompatible clients rejected
[ ] Unknown definition index rejected

[ ] Aggregate sectors follow terrain
[ ] Boss incoming signal fires once
[ ] Reinforcement packs spawn atomically
[ ] scrapBugHorde retains correct runtime type
[ ] Ownership metadata survives reconnect

[ ] TypeScript passes
[ ] Full unit suite passes
[ ] Build passes
[ ] Demo golden unchanged
[ ] Horde/netcode/progression suites pass
[ ] Single Player full round passes
[ ] Two-client full round passes
[ ] Screenshots visually reviewed by a human
[ ] Reports updated
[ ] Branch remains unmerged
```
