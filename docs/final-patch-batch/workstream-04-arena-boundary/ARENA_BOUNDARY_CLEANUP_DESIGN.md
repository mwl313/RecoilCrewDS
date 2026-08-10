# Final Workstream 4 — 400×400 Arena Boundary Cleanup
## Remove decorative outside-world rendering and line authoritative bounds with `prop.barrier`

**Branch:** `feature/final-arena-boundary`  
**Difficulty:** Medium  
**Primary risks:** visual gaps, visual/collision mismatch, camera seeing under the world edge

---

# 1. Goal

The authoritative arena is 400×400m.

Remove the decorative exterior world that currently renders outside those bounds.

Replace it with a clean, deliberate perimeter made from the existing:

```text
prop.barrier
```

The boundary should make the playable square feel intentionally enclosed rather than like a map floating inside a broken infinite world.

---

# 2. Current exterior system

Current gameplay `RenderWorld` creates:

```text
VisualWorldApron
```

The apron can contain:
- outside buildings;
- props;
- road strips;
- skyline silhouettes.

This final design disables/removes it from gameplay.

Do not replace it with another decorative exterior city.

---

# 3. Authoritative bounds

Use actual:

```text
world.bounds
```

or equivalent authoritative world half-size.

Do not hardcode `±200` in several renderer files.

The primary map is 400×400, but the renderer should derive:

```text
minX
maxX
minZ
maxZ
```

from the world.

---

# 4. Barrier asset

Use:

```text
prop.barrier
```

already present in the project furniture set.

Do not import a new boundary asset.

Load through `AssetService`.

Measure the source model's local AABB once.

Determine its long horizontal axis and effective segment length.

---

# 5. Placement

Create four perimeter runs.

Suggested:

```text
north/south:
segments along X
yaw aligned to barrier length

east/west:
segments along Z
yaw rotated 90°
```

Place slightly inside or centered on authoritative boundary according to actual collider geometry.

Use overlap:

```text
5–10% of measured segment length
```

to eliminate gaps.

At corners:
- overlap perpendicular runs;
- or use a small deterministic corner arrangement.

Do not leave diagonal sight gaps.

---

# 6. Rendering architecture

Prefer instancing.

The source asset may contain several meshes/materials.

Create one `InstancedMesh` batch per source mesh/material group, not one clone per barrier.

Preserve:
- source material;
- transforms;
- color;
- texture;
- roughness.

No shadows if perimeter shadow cost is excessive; receive/cast policy should be measured.

---

# 7. Terrain alignment

For each segment:
- sample ground height;
- place its base correctly;
- use yaw only unless source terrain requires a safe bounded pitch policy.

On uneven edge terrain:
- small stepped height differences are acceptable;
- no floating or buried runs;
- consider simple footings only if necessary.

Do not reshape authoritative terrain solely to make the decorative barrier perfect without evidence.

---

# 8. Collision truth

Audit existing world-bound enforcement.

Preferred:

```text
authoritative arena bounds remain the gameplay blocker
barrier is positioned to visually match that blocker
```

If there is no reliable boundary collision:
- add deterministic boundary colliders from measured barrier/bounds;
- keep server/client world queries consistent.

The player must not visibly pass through barriers before invisible clamping.

The barrier must not reduce playable dimensions unpredictably.

---

# 9. Enemy/spawn interaction

Ensure:
- ordinary spawn anchors do not spawn beyond barriers;
- persistent recovery anchors remain inside;
- pressure-director recycling stays inside;
- enemy movement cannot route beyond bounds;
- projectiles resolve against intended world/boundary rules.

Do not create permanent horde congestion along the outermost meter.

A small inside spawn exclusion strip is acceptable if data-driven.

---

# 10. Outside geometry removal

Gameplay mode:

```text
no apron buildings
no apron props
no apron roads
no skyline boxes
```

Keep:
- sky;
- fog;
- authoritative arena;
- perimeter.

The old class may remain for tools/debug profiles, but production gameplay must disable it explicitly and tests must assert that.

---

# 11. Edge seam

With exterior geometry removed, inspect elevated camera views.

Allowed minimal seam treatment:
- a narrow non-playable dark footing/skirt directly beneath the barrier;
- only enough to prevent cracks or seeing under terrain;
- not an explorable outside world;
- no buildings/roads/landmarks.

Prefer barriers and sky/fog first.

Do not rebuild an apron under another name.

---

# 12. Fog and sky

Retune only if needed after apron removal.

Goal:
- silhouettes inside 400×400 remain clear;
- sky remains attractive;
- outside does not become a bright void;
- barrier remains readable near edges.

Do not hide the entire map in fog.

---

# 13. Quality manager

Remove/deprecate apron quality work from normal gameplay.

If interface compatibility is needed:
- no-op safely when apron absent;
- diagnostics report disabled/zero.

Do not let adaptive quality recreate outside geometry.

---

# 14. Tests

- exact four-side placement;
- no segment gaps;
- corner coverage;
- derived bounds;
- model AABB spacing;
- terrain alignment;
- instanced draw count;
- gameplay apron disabled;
- boundary collision parity;
- pressure spawns inside;
- rematch/rebuild/dispose;
- 400×400 map;
- fallback/other maps.

---

# 15. Browser qualification

Drive around all four edges.

Test:
- ground view;
- elevated jump view;
- camera looking outward;
- each corner;
- fog;
- collisions;
- enemy pursuit;
- two clients;
- map reroll/reconnect.

Capture before/after from the same edge viewpoints.

---

# 16. Definition of done

- [ ] Gameplay VisualWorldApron is disabled/removed.
- [ ] No exterior buildings/roads/skyline render.
- [ ] `prop.barrier` lines all four bounds.
- [ ] Placement derives from world bounds and model AABB.
- [ ] No visible gaps at runs/corners.
- [ ] Barrier and authoritative collision agree.
- [ ] Spawn/recovery remains inside bounds.
- [ ] Instanced rendering is used.
- [ ] Edge seam is clean without rebuilding an outside world.
- [ ] Sky/fog remain attractive.
- [ ] No MG/localization/Ground Pound/announcement/chat/chest-beacon work is included.

Final invariant:

> The 400×400 arena ends where it says it ends: a clean barricaded perimeter replaces the broken decorative exterior, and visuals, collision, spawning, and camera views all agree on the same boundary.
