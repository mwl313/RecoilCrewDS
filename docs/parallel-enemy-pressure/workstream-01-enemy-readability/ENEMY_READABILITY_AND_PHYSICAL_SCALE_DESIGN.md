# Enemy Readability & Physical Scale V1
## Larger ordinary monsters, truthful hit volumes, and cheap world-space threat presence

**Branch:** `feature/enemy-readability-scale`  
**Workstream:** 1 of 5  
**Difficulty:** Medium  
**Primary risk:** accidental visual/gameplay scale divergence  
**Explicit exclusions:** attacks, speeds, minimap, horde spawning, progression, chest beacon

---

# 1. Goal

Ordinary monsters are currently difficult to identify against the map, especially at medium distance and during dense combat.

Improve readability through:

```text
moderate physical enlargement of ordinary monsters
+
matching hitbox/engagement/socket/clearance scale
+
cheap world-space ground-presence treatment
```

Do not solve the issue by:
- doubling every model;
- globally recoloring the art;
- adding outlines to every enemy;
- applying visual-only scale;
- changing HP/damage/speed;
- enlarging already-large elites and bosses again.

---

# 2. Current dimension model

Current normalized base target heights are approximately:

```text
small   1.02m
medium  1.53m
large   1.70m
```

Tier scales are approximately:

```text
fodder      1×
specialist  1×
elite       3×
boss        5×
```

The current shared normalization system correctly derives:
- render scale;
- width/height/depth;
- collision radius/height;
- spawn clearance;
- engagement width;
- shadow radius;
- ground offset;
- projectile socket.

Preserve this single-authority architecture.

---

# 3. Binding size decision

Increase **ordinary tiers only**:

```text
fodder
specialist
```

Use a first-pass ordinary readability multiplier:

```text
ORDINARY_READABILITY_SCALE = 1.176
```

This produces clean target heights:

```text
small   1.20m
medium  1.80m
large   2.00m
```

Do not multiply elites and bosses by this additional factor.

Their current final scale remains based on the existing baseline target heights and tier scales.

Conceptually:

```ts
function readabilityScaleForTier(tier) {
  return tier === 'fodder' || tier === 'specialist'
    ? 1.176
    : 1;
}
```

Use exact clean target-height mapping if that produces more stable generated values.

---

# 4. One resolved dimension authority

The resolved dimensions returned for an ordinary monster must be used by every consumer.

Required derived properties:

```text
finalScale
finalWidth
finalHeight
finalDepth
collisionRadius
collisionHeight
spawnClearanceRadius
engagementRadius
shadowRadius
groundOffset
projectileSocket
projectileSocketY
world-UI anchor height
```

Forbidden architecture:

```text
mesh.scale *= 1.176
but collision remains old
```

Required architecture:

```text
source bounds
→ normalized dimensions with ordinary readability scale
→ render and gameplay consume same record
```

---

# 5. Hitbox requirement

The user explicitly requires enlarged enemies to have enlarged hitboxes.

For ordinary monsters, collision must grow in exact proportion to resolved physical dimensions.

This affects:
- player cannon/MG target contact;
- tank contact;
- melee spacing;
- spawn overlap;
- obstacle resolution;
- knockback geometry;
- health-bar anchor;
- world feedback anchor.

Do not add an invisible extra aim-assist radius beyond the physical resolved body in this milestone.

The readability change itself should make them easier to hit.

---

# 6. Engagement and crowd-spacing implications

Larger ordinary collision bodies require:
- larger melee reservation spacing;
- larger spawn clearance;
- more separation room;
- accurate formation spacing qualification.

Do not leave the old body size in melee reservation geometry.

After the change, test:
- six-enemy farming clusters;
- seven-enemy mixed packs;
- narrow streets;
- building corners;
- large specialist bodies;
- dense Wave 2.

If existing formation radii become too tight, adjust only the relevant formation/clearance data after measurement. Do not silently reduce collision back down.

---

# 7. Projectile sockets

Ranged ordinary monsters must fire from sockets that follow the enlarged body.

The projectile socket should be recomputed from the same final scale.

Do not:
- multiply the mesh but leave the projectile spawning inside the torso;
- hand-author new offsets for every monster unless a real source-socket defect is found.

---

# 8. Elite and boss size preservation

Elites and bosses are already large:

```text
elite medium baseline ≈ 1.53 × 3
boss large baseline   ≈ 1.70 × 5
```

Do not apply the ordinary 1.176 factor to them.

They gain readability through:
- stronger ground-presence treatment;
- advanced minimap markers from Workstream 3;
- existing encounter bars;
- their large physical silhouette.

This avoids unintended 10m+ size escalation solely from an ordinary-fodder readability pass.

---

# 9. World-space enemy presence layer

Add a cheap instanced ground-presence layer.

Recommended implementation:

```text
one instanced mesh
or
a very small fixed number of instanced meshes by marker style
```

No DOM markers.

No per-enemy Sprite object allocation.

No full-screen post-process outline.

## Ordinary

```text
shape:
soft disc / broken ring

color:
dark hostile red

suggested:
#9e332c

opacity:
~0.14–0.20 near
fades at distance

behavior:
stable; no pulse
```

It should help separate feet/body from road and terrain without looking like a targeting circle.

## Elite

```text
shape:
segmented ring
color:
violet #b56cff
opacity:
~0.28–0.36
```

## Boss

```text
shape:
wider crimson ring + restrained pale outer segment
color:
#ff304d
outer:
paper/pale line
```

A very slow restrained pulse is allowed for boss only and must respect reduced motion.

---

# 10. Depth and occlusion

Ground-presence geometry should:
- depth-test against the world;
- not appear through buildings;
- not write depth;
- use polygon offset or tiny ground lift to prevent z-fighting;
- follow terrain Y;
- scale from the authoritative shadow/engagement radius.

Do not render presence markers through walls.

---

# 11. Distance policy

Suggested:

```text
0–45m:
full intended presence

45–90m:
fade gradually

90m+:
ordinary presence disabled
elite/boss may remain at reduced opacity
```

Use current near/mid/far policies when possible.

The marker must not become the main visual at far distance.

---

# 12. Material and lighting constraints

The project already has a source-fidelity material/lighting pass.

Do not:
- blanket-add emissive to all monsters;
- replace vertex colors;
- tint every model red;
- globally raise exposure;
- flatten source materials.

Readability comes primarily from:
- moderate physical size;
- accurate silhouettes;
- ground presence;
- existing neutral fill/fog policy.

A small bounded enemy-only shadow/readability adjustment is acceptable only with before/after evidence.

---

# 13. Generated dimensions

Update:
- source math/schema/generator;
- generated dimension cache/index;
- tests.

Do not manually edit generated dimension tables.

Ensure exact definition IDs with `.boss` / `.elite` suffixes still resolve to the correct source family.

---

# 14. Tests

## Dimension math

```text
fodder small:
final target height ≈ 1.20

specialist medium:
≈ 1.80

specialist large:
≈ 2.00

elite:
unchanged from baseline

boss:
unchanged from baseline
```

## Render/gameplay parity

For representative small/medium/large ordinary definitions:

```text
render bounds
collision radius/height
spawn clearance
engagement radius
socket
world UI anchor
```

all derive from the same resolved dimensions.

## Collision

- MG/cannon hits at the new silhouette edge register.
- Hits outside the new body do not gain an arbitrary extra radius.
- Tank contact uses the enlarged radius.
- Knockback remains stable.

## Spawn/formation

- No systematic overlap from 6–8 enemy packs.
- Valid urban anchors still accept intended packs.
- Failure telemetry does not spike unexpectedly.

## Presence renderer

- bounded instance count;
- no per-frame object churn;
- correct semantic colors;
- correct terrain height;
- no reset/rematch leaks;
- reduced-motion boss pulse disabled.

---

# 15. Performance gate

Test at:
- 100 ordinary enemies;
- 200 ordinary enemies;
- Phase 3;
- Wave 2;
- two-client Driver/Gunner.

The ground-presence layer should remain a tiny draw-call cost.

Do not trade enemy readability for a large post-process GPU cost.

---

# 16. Definition of done

- [ ] Ordinary small/medium/large targets are ~1.20/1.80/2.00m.
- [ ] Elite/boss final scale is not unintentionally enlarged.
- [ ] Hitboxes match enlarged ordinary bodies.
- [ ] Spawn clearance and melee engagement match enlarged bodies.
- [ ] Ranged sockets follow enlarged bodies.
- [ ] World UI anchors follow enlarged bodies.
- [ ] Cheap ordinary/elite/boss ground-presence styles exist.
- [ ] Presence markers respect depth/terrain/distance.
- [ ] Source colors/materials remain intact.
- [ ] Dense horde performance remains acceptable.
- [ ] No attack, speed, minimap, progression, chat, or chest-beacon work is included.

Final invariant:

> An ordinary monster is easier to see and hit because its real resolved physical body is moderately larger, not because a disconnected visual effect lies about where the monster can be damaged.
