# Recoil Crew — Monster System Second-Pass Phase Handoff

## Status

```text
Starting SHA: 18a8fe8054d948d32738d3d5ac4b993a7edf62a5
Branch: monster-system
Unmerged: true
```

## Phase 1 — Render grounding and XP instancing

### Commits

```text
a589ad1 monster-fix2: add second-pass binding documents
<pending>  monster-fix2: correct monster grounding and xp instances
```

### Grounding

Implemented one production convention in `src/client/app/monsterTransform.ts`:

```text
sourceGroundOffset = max(0, -sourceMinY)
scaledGroundOffset = sourceGroundOffset x finalScale
visualRootY = terrainY + authoredScaledY + scaledGroundOffset
```

The helper composes normalization scale x tier scale x variant scale with the
full authored profile scale (vector), rotation, and position, then measures
the model's own final local bounds so the lowest visible point lands on the
terrain plane even for authored rotation and nonuniform scale. The canonical
unrotated case reduces exactly to `model.position.y = scaledGroundOffset`.
The sign defect (`- groundOffset` in the normal path, missing terrain height
in the aggregate path) is fixed in both renderers.

### XP instancing

`XpShardRenderer` now packs all live instances contiguously every frame,
packs pop instances after them, and sets `mesh.count` to the exact packed
total. Persistent arbitrary slots are gone, so arbitrary removal order can
never hide a surviving shard. Overflow policy is deterministic: 512 live
shards render individually; beyond that, a visible overflow cluster
indicator plus throttled diagnostics; pop effects (presentation-only) may be
dropped after live shards at capacity. `reset()`/`dispose()` clear all maps,
and rematch now calls the renderer reset.

### Tests added

```text
tests/monsters/groundingTransform.test.ts   (12 tests, real Object3D world bounds)
tests/pickups/xpShardRenderer.test.ts       (7 tests: removals, pops, 129/256/512, overflow, reset)
```

### Gates run

```text
npx tsc --noEmit                     PASS
npm test                             PASS (144 files / 1050 tests)
npm run test:demo                    PASS (golden unchanged)
```

### Handoff notes

Phase 2 (difficulty clock + engagement geometry), Phase 3 (airborne
replication + protocol gate), Phase 4 (transforms/ownership/atomic packs),
and Phase 5 (qualification) remain.
