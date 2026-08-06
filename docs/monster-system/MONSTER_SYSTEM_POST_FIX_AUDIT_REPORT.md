# Recoil Crew — Monster System Post-Fix Audit Report

## Document status

```text
Status: Second-pass audit handoff
Target branch: monster-system
Scope: Remaining defects after the first bug-fix and qualification pass
Audit anchor head: 18a8fe8054d948d32738d3d5ac4b993a7edf62a5
Qualified implementation commit: 8d93a5d3414488760170572269a3f4b0198fef86
```

The first fix pass materially improved the monster system. Automated unit, build, Demo, Single Player browser, and two-client browser gates were reported as passing. However, the qualification report also states that the captured screenshots were checked for nonblank pixels rather than visually reviewed.

This audit therefore focuses on defects that can survive helper tests while still failing in the rendered game, multiplayer presentation, or large-monster combat geometry.

---

# 1. Executive verdict

Do not merge `monster-system` as complete until the P0 defects below are resolved and requalified.

```text
Authoritative core loop:       mostly functional
Multiplayer identity:          substantially improved
Timer and boss sequence:       substantially improved
Monster grounding:             critical render-path defect remains
XP presentation:               critical instancing defect remains
Large-monster engagement:      geometry and range are inconsistent
Multiplayer launch physics:    vertical state is not preserved
Protocol compatibility:        wire meaning changed without a hard gate
```

---

# 2. P0 defects

## P0-1 — Normal monster grounding uses the opposite sign from the generated convention

### Evidence

The dimension generator defines:

```ts
groundOffset = Math.max(0, -minY);
```

The generated/tested convention is:

```text
worldRootY = terrainY + scaledGroundOffset
```

because the source model's lowest point is below its root.

The normal entity renderer instead applies:

```ts
model.position.y = authoredOffsetY * finalScale - dims.groundOffset;
```

The aggregate renderer applies the opposite sign:

```ts
aggregateY = dims.groundOffset;
```

### Failure

Models with a negative source `minY` are moved farther into the terrain in the normal near/far renderer.

### Why the existing test misses it

The current grounding test validates dimension arithmetic but does not apply the real Three.js transform and measure the transformed world-space bounding box.

### Required behavior

For a terrain height `groundY`:

```ts
model.position.y = groundY + authoredOffsetY * finalScale + dims.groundOffset;
```

The visual minimum Y after scale, authored transform, rotation, and translation must be within `0.00–0.05 m` of the terrain surface.

---

## P0-2 — XP instanced rendering fails after non-tail removals

### Evidence

The XP renderer assigns persistent arbitrary instance slots but sets:

```ts
mesh.count = numberOfVisibleItems;
```

Three.js only draws instance indices `0..mesh.count - 1`.

### Reproduction

```text
Shard A occupies slot 0
Shard B occupies slot 1
Shard A disappears
Shard B remains in slot 1
Pop expires
mesh.count becomes 1
Only slot 0 is drawn
Shard B disappears visually
```

Pop effects also take a free slot and return it immediately inside the same loop, allowing several pops to overwrite the same slot while `mesh.count` increases.

### Required behavior

Visible instance matrices must be packed contiguously each frame, or removals must swap the last occupied slot into the removed slot and update ownership mappings.

Given the small bounded capacity, contiguous frame packing is preferred.

---

## P0-3 — XP rendering silently drops authoritative shards above capacity

### Evidence

The renderer has a fixed capacity of 128 and silently skips an item when no slot remains.

### Failure

Authoritative XP still exists and grants progression, but some XP objects become invisible.

### Required behavior

Choose and document one deterministic policy:

1. Size capacity from the maximum supported authoritative shard budget, with overflow impossible under legal content; or
2. Merge nearby low-value shards authoritatively; or
3. Render a deterministic priority subset and a visible aggregate overflow indicator.

Silent omission is forbidden. Add overflow telemetry and a test above the old 128 limit.

---

## P0-4 — Monster level still advances with global match time during paused elite waves

### Evidence

The farming countdown and phase-local spawn ramps now pause during elite waves, but monster-level projection still uses global match time.

### Failure

During a 90-second elite fight:

```text
farming countdown: frozen
spawn ramp: frozen
monster level: advances
```

After the wave, newly spawned enemies can jump several levels despite no farming time elapsing.

### Required behavior

Use one authoritative active-farming clock for:

```text
HUD monster level
spawn-time HP level
spawn-time damage level
spawn-time XP level/reward inputs
run diagnostics
```

Boss phase remains locked to the authored boss level.

---

## P0-5 — Large elite/boss engagement ranges ignore resolved body size

### Evidence

Elite and boss visual/collision scale now use normalized dimensions, but melee stopping, reservation, and hit distances still use raw authored center-to-center attack range.

### Failure

A ×3 elite or ×5 boss can have:

```text
collision radius + tank radius > authored attack range
```

Possible symptoms:

```text
body overlap before attack
unreachable attack gate
animation connects without damage
damage occurs with visible separation
escort and leader overlap
```

### Required behavior

Define one effective engagement distance:

```ts
effectiveMeleeDistance = enemyCollisionRadius + tankCollisionRadius + authoredAttackReach;
```

Use it consistently for:

```text
reservation eligibility
reserved target positions
approach stopping
attack acceptance
release distance
staging ring
boss melee patterns
```

Do not multiply the authored reach by tier scale unless the design explicitly requires that. Body size and reach are separate terms.

---

## P0-6 — Multiplayer does not preserve monster vertical/airborne state

### Evidence

The generalized horde materialization/delta path preserves X/Z/yaw/HP/identity but not authoritative Y, vertical velocity, or airborne state. The client reconstructs Y from terrain.

### Failure

Server-authoritative cannon launch or impulse behavior can appear ground-locked or snap back on remote clients.

### Required behavior

For near and mid replicated monsters, preserve at minimum:

```text
quantized Y
airborne flag
```

Preferably preserve:

```text
quantized vertical velocity
impulse sequence or timestamp
```

Far/aggregate presentation may continue to use terrain projection.

Single Player and both multiplayer clients must display the same airborne arc and landing.

---

## P0-7 — The horde wire meaning changed without an explicit compatibility gate

### Evidence

The second materialize field changed from a legacy enemy-type index to a generated exact-definition index.

### Failure

Old and new clients can decode valid integers with incompatible meanings.

### Required behavior

Increment the network protocol version and reject mismatched clients before match start.

Handshake compatibility must include:

```text
protocol version
content-pack hash
enemy-definition-order hash
```

Do not attempt permissive decoding.

---

# 3. P1 defects

## P1-1 — Reservation owners do not move toward their assigned angular slots

The reservation manager stores an attack angle, but reserved movement only moves directly toward the tank center.

Required:

```ts
target = tankPosition + direction(reservation.angle) * effectiveMeleeDistance;
```

Reserved enemies must approach their assigned point, not merely gain permission to attack.

---

## P1-2 — Melee engagement overwrites density steering

The behavior order applies density steering and then replaces direction with a pure pursuit vector.

Required:

```text
select engagement state
compute desired engagement vector
blend separation/density steering
normalize
integrate
```

Separation must remain active in CHASE and RESERVED_APPROACH.

---

## P1-3 — Aggregate monsters ignore terrain height

Aggregate sectors currently use a dimension offset without adding terrain height.

Required:

```ts
worldY = groundHeightAt(x, z) + resolvedGroundOffset;
```

Near, far, and aggregate envelopes must remain vertically consistent across LOD transitions.

---

## P1-4 — Normalized monster transform discards profile rotation and vector scale

The new transform helper applies position and one scalar scale, but does not preserve authored rotation and collapses vector scale to its X component.

Required:

```text
preserve authored rotation
preserve nonuniform profile scale when authored
compose profile scale with normalization/tier scale
apply grounding after final transform
```

The final world-space bounds, not only the scalar metadata, are authoritative.

---

## P1-5 — Boss intro notification can be emitted twice

`BOSS INCOMING` is emitted at deferred-intro start and again when the wave opens.

Required:

```text
intro start: BOSS INCOMING
boss activation: no duplicate, or a distinct BOSS ENGAGED event
```

Audio, VFX, and HUD must each trigger once.

---

## P1-6 — Reinforcement packs are not atomic

Pack entries are spawned sequentially. Entity-cap or budget failure can leave only the first authored entry spawned.

Required:

```text
preflight whole pack
spawn all entries
or spawn none
```

A separately authored fallback pack is allowed. Partial accidental composition is not.

---

## P1-7 — Generated legacy runtime type mapping is incomplete

`enemy.scrapBugHorde` is absent from the handwritten legacy-definition map and can reconstruct as `type: monster`.

Required:

Generate the runtime type for every enemy definition from validated content. Do not maintain a partial handwritten map.

---

## P1-8 — Replicated monsters lose compact ownership metadata

Exact definition identity is preserved, but population class, wave identity, leader/featured status, and formation role are not.

Required compact replication:

```text
population class
wave id
leader/elite/boss flag
formation role index when needed
```

This metadata must survive materialization and reconnect so animation priority and encounter presentation are stable.

---

# 4. Qualification gaps that must be closed

## Grounding

Test the actual rendered Object3D and its world bounding box.

## XP rendering

Test non-tail removal, multiple simultaneous pops, capacity overflow, and visible contiguous instances.

## Multiplayer identity

Inspect the rendered rig diagnostics, not only reconstructed `EnemyState.defId`.

## Airborne behavior

Run an actual cannon-launch sequence in Single Player and two-client multiplayer.

## Screenshots

Human-review every final screenshot. A nonblank pixel check is not visual qualification.

## Large monsters

Test real elite and boss bodies against their stopping, attack, reservation, and collision distances.

---

# 5. Scope restrictions

This second pass must not:

```text
rebalance the 39 ordinary monsters
redesign the HUD
redesign boss mechanics
change map generation or map art
replace Quaternius monsters
remove server authority
update Demo golden to hide regressions
merge into main
perform broad unrelated refactors
```

The objective is correctness and integration only.
