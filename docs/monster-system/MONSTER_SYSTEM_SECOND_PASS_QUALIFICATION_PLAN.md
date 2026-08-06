# Recoil Crew — Monster System Second-Pass Qualification Plan

## Status

```text
Status: Required acceptance plan
Target branch: monster-system
Purpose: Catch render, networking, geometry, and pressure bugs missed by the first pass
```

A helper unit test is not sufficient when the defect exists in the production render or replication path.

---

# 1. Qualification layers

Run every applicable layer:

```text
Layer A — Static/type/content generation
Layer B — Unit tests
Layer C — Integrated authoritative simulation
Layer D — Real Three.js render-path tests
Layer E — Single Player browser
Layer F — Two-client multiplayer browser
Layer G — Stress/performance/state growth
Layer H — Human visual and feel review
```

---

# 2. Layer A — Static and generated content

Required:

```bash
npx tsc --noEmit
npm run generate:content-pack
npm run generate:presentation-content
npm run generate:map-profiles
npm run validate:enemy-animations
npm run test:monsterpack-import
```

Checks:

```text
generated files are clean after regeneration
enemy-definition order is deterministic
enemy-definition hash is emitted
runtime enemy types are generated for every enemy definition
protocol version is explicit
no unknown definition silently falls back
```

---

# 3. Layer B — Focused unit tests

## Grounding and transforms

Test production helpers with actual Object3D bounds.

Cases:

```text
negative source minY
nonzero terrain height
small ordinary
medium elite
large boss
authored position
authored rotation
uniform profile scale
nonuniform profile scale
near model
far model
aggregate envelope
```

Assertions:

```text
world minimum Y within 0.05 m of terrain
world dimensions match resolved envelope tolerance
near/far/aggregate vertical center and foot plane stay within tolerance
```

## XP renderer

Cases:

```text
remove first live shard
remove middle live shard
remove several nonadjacent shards
add and remove in the same frame
multiple simultaneous pops
pop plus live replacement
129, 256, and configured maximum shards
reset
dispose
rematch
```

Assertions:

```text
all expected live instances are visible
no live shard is hidden by mesh.count
pop matrices are distinct
no stale matrices remain inside draw count
overflow policy is deterministic
state remains bounded
```

## Difficulty clock

Cases:

```text
farming 0–60 s
wave 1 held for 90 s
farming 2
wave 2 held for 90 s
farming 3
boss intro
boss active
```

Assertions:

```text
level does not advance in waves
HUD level equals authoritative spawn level
boss is level-locked
```

## Engagement geometry

Cases:

```text
small melee
medium elite
large boss
six simultaneous reservation owners
dense chase group
boss with escorts
```

Assertions:

```text
attack hold is outside invalid collider overlap
reservation positions are angularly distinct
hit gate and visual distance agree
density steering affects final movement
```

## Protocol

Cases:

```text
current client/current server
old client/current server
current client/old server
wrong content hash
wrong definition-order hash
unknown definition index
airborne materialization
airborne delta
reconnect during airborne state
```

---

# 4. Layer C — Authoritative simulation

Run deterministic simulation tests with fixed seeds.

## Frozen-wave level test

```text
advance to wave 1
record active farming time and level
keep leader alive for 90 seconds
assert both remain unchanged
kill leader
assert farming resumes from the same level clock
```

Repeat for wave 2.

## Large-monster attack geometry test

For each featured elite/boss identity:

```text
spawn on flat ground
measure resolved collision
approach tank
acquire reservation or boss attack state
attack
verify no invalid body overlap
verify damage occurs exactly once at the accepted attack point
```

## Atomic reinforcement test

Create cap/budget conditions where:

```text
whole pack fits
whole pack does not fit
only first entry would fit under the old algorithm
```

Assert:

```text
all entries spawn
or none spawn
```

## State cleanup

After victory, defeat, and rematch:

```text
no XP slots
no XP pops
no stale reservations
no stale boss state
no stale airborne flags
no stale ownership
no stale encounter bars
```

---

# 5. Layer D — Real render-path qualification

Create a deterministic render gallery.

## Monster grounding gallery

Rows:

```text
small ordinary
medium specialist
medium elite
large boss
```

Columns:

```text
near
far
aggregate
```

Terrain:

```text
flat Y=0
raised flat Y=8
slope
ridge transition
```

Overlay diagnostics:

```text
terrain plane
world bounding box
collision circle/capsule
foot-plane marker
resolved dimensions
defId
tier
LOD
```

Acceptance:

```text
no buried feet
no floating feet above 0.05 m
no near/far/aggregate vertical jump beyond tolerance
collision visually matches body envelope
```

## XP gallery

Show:

```text
1 live shard
10 live shards
non-tail removal
multiple pops
capacity threshold
overflow policy
magnet travel
collection
```

Inspect the actual InstancedMesh instance matrices and the frame.

---

# 6. Layer E — Single Player browser qualification

Run one complete production round without directly skipping every state.

Verify:

```text
opening monsters use exact models
ordinary grounding
XP objects visible
XP magnet movement visible
level clock
wave 1 freeze
wave 1 elite geometry
wave 2 freeze
wave 2 elite geometry
boss intro one-shot signal
boss spawn after intro
boss scale/collision/attack distance
cannon-launch airborne arc
boss victory
result
rematch cleanup
```

Use debug acceleration only where documented and ensure at least one normal-duration segment for:

```text
XP pickup
elite engagement
airborne launch
boss melee/ranged behavior
```

Capture screenshots and short clips.

---

# 7. Layer F — Two-client multiplayer qualification

Use driver and gunner clients.

Verify on both:

```text
same run configuration
same exact defIds
same rendered profile/model identity
same tier scale
same ground contact
same XP visibility and collection
same frozen difficulty level
same wave state
same boss intro count
same airborne launch arc
same landing
same encounter ownership
same boss result
same rematch state
```

Diagnostics must compare:

```text
server enemy Y
driver rendered Y
gunner rendered Y
server defId/profile
driver rig userData
gunner rig userData
server ownership
driver ownership
gunner ownership
```

Tolerance must be stated.

---

# 8. Layer G — Stress and performance

## XP pressure

Run:

```text
256+ shard creation pressure
continuous collection
continuous expiry
simultaneous pops
```

Assert:

```text
no invisible-authoritative XP without the documented overflow indicator
bounded authoritative state
bounded renderer state
no slot corruption
no increasing stale maps
```

## Horde pressure

Run the existing 500-enemy benchmark and an additional scene with:

```text
large elite
large boss
dense escorts
airborne enemies
XP pressure
```

Record:

```text
p50
p95
p99
allocations/state growth
draw count
instance capacity
```

## Protocol reconnect

Reconnect both roles during:

```text
farming
elite wave
boss intro
boss active
airborne enemy
XP pressure
```

---

# 9. Layer H — Human visual and feel review

The first-pass report explicitly lacked visual screenshot review. This layer is mandatory.

A human reviewer must inspect:

```text
every grounding gallery image
every XP gallery image
SP wave and boss screenshots
MP driver/gunner comparisons
airborne launch clip
near/far/aggregate transition clip
large boss attack clip
```

Checklist:

```text
[ ] No buried or floating monsters
[ ] No model orientation regression
[ ] No giant collider/body mismatch
[ ] No XP disappearance after arbitrary collection order
[ ] No duplicate boss-intro presentation
[ ] Driver and gunner see matching monster arcs
[ ] No obvious LOD vertical pop
[ ] No Scrap Bug fallback
[ ] No partial malformed reinforcement group
```

Record reviewer name/initials and date in the final report.

---

# 10. Required final report contents

`MONSTER_SYSTEM_SECOND_PASS_FIX_REPORT.md` must include:

```text
1. Starting SHA
2. Ending SHA
3. Commit list
4. Files changed
5. Root cause per defect
6. Fix per defect
7. New tests
8. Existing tests run
9. Generated-content results
10. Grounding gallery results
11. XP pressure results
12. Active-farming clock results
13. Large-monster geometry results
14. Airborne replication results
15. Protocol mismatch results
16. Single Player results
17. Two-client results
18. Reconnect/rematch results
19. Performance/state-growth results
20. Screenshot and clip paths
21. Human visual-review record
22. Remaining known limitations
23. Confirmation Demo unchanged
24. Confirmation map systems untouched
25. Confirmation branch unmerged
```

Do not claim a pass for a command or playtest that was not actually run.
