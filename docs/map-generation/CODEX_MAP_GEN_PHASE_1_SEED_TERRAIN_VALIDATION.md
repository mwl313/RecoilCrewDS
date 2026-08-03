# Codex Prompt — Map Generation Phase 1
## Deterministic Seed Pipeline, Heightfield Terrain, Macro Features, Validation, and Fallback

Treat this as the binding product specification:

```text
docs/design/01-맵-디자인.md
```

Also read:

```text
README.md
docs/README.md
docs/guides/ARCHITECTURE.md
docs/guides/CONTENT_AUTHORING_GUIDE.md
docs/guides/NETWORK_RULES.md
docs/guides/SMOKE_TEST.md
docs/refractor/REFACTOR_STATUS.md
src/shared/arena.ts
src/shared/sim/tankKinematics.ts
src/shared/sim/match.ts
src/shared/sim/matchRuntime.ts
src/server/index.ts
src/server/room.ts
src/client/arenaView.ts
src/client/app/gameClient.ts
```

Inspect the actual repository before editing and adapt paths to the current tree.

# Goal

Implement only the first safe foundation:

```text
seed/version pipeline
deterministic PRNG and substreams
400×400 heightfield
macro terrain features
legacy arena compatibility
core validation
deterministic retries
known-safe fallback
unit tests
```

Do not implement route graphs, semantic zones, furniture generation, LOD, or full online activation in this phase.

# Mandatory preservation

The fixed arena remains available and playable. Online rooms, Driver/Gunner controls, prediction, collision, jump, dash, enemies, projectiles, pickups, results, rematch, Practice, and Demo regression must keep working.

Do not change game balance.

# Required first step

Create:

```text
docs/map-generation/MAP_GENERATION_PHASE_1_PLAN.md
```

Document:

- Static `ARENA` data
- `groundHeightAt`
- `obstacleAt`
- `resolveCircle`
- Ramp/barrel representation
- Server/client arena imports
- Practice arena source
- Existing tests
- Hardcoded arena half-size assumptions

Then implement immediately.

# 1. Seed system

Implement a stable unsigned 32-bit hash conceptually equivalent to:

```ts
hash32(roomCode, matchIndex, profileId, generatorVersion, attempt)
```

Do not use raw XOR as the final combination.

Requirements:

- Identical in Node/browser
- Stable across restarts
- Fixed expected-value tests
- Rematch changes seed
- Profile/version/attempt affect seed

Add:

```ts
export const ARENA_GENERATOR_VERSION = 1;
```

# 2. PRNG and substreams

Implement one owned PRNG such as Mulberry32 or SplitMix32.

Requirements:

- No `Math.random()` in generation
- Node/browser identical sequences
- Named substreams:

```ts
forkSeed(seed, "terrain")
forkSeed(seed, "routes")
forkSeed(seed, "furniture")
forkSeed(seed, "spawns")
```

Terrain output must not change when later furniture logic changes.

# 3. Data definitions

Add validated content categories:

```text
content/maps/
content/terrain-profiles/
content/validation-profiles/
```

Add them to the manifest/loader.

Create:

- One 400×400 primary map profile
- Approximately 4 m cells
- Height range approximately -5 to +10
- Basin/ridge/plateau/valley/hill distributions
- Slope limits
- Retry limit 8
- Fixed fallback map definition

Definitions must be validated and frozen.

# 4. Heightfield

Implement deterministic heightfield data.

Recommended:

```text
400×400 m
4 m cell size
101×101 edge-inclusive samples
Float32Array
```

Requirements:

- Deterministic interpolation
- Height and normal/slope queries
- Finite values
- Explicit border behavior
- Same data later drives rendering and authoritative ground queries
- No raw per-cell white noise
- No sharp spikes

# 5. Macro features

Implement:

```text
basin
ridge
plateau
valley
hill
```

Profile-controlled parameters:

- Count
- Position
- Rotation
- Radius/width/length
- Height/depth
- Falloff
- Minimum separation

Use broad smooth feature stamps.

Recommended order:

```text
base
→ macro stamps
→ smoothing
→ height clamp
→ iterative slope correction
→ final smoothing
→ slope classification
```

No caves, overhangs, bridges, or destructible terrain.

# 6. Runtime arena model

Create generated arena data containing at least:

```text
baseSeed
candidateSeed
attempt
profileId
generatorVersion
width/depth
heightfield
macro feature records
validation report
fallback flag
```

Avoid global mutable current-arena state.

Preserve old query callers through a compatibility adapter.

# 7. Core validators

Pure validators for:

- Determinism
- Bounds
- Height range
- Finite samples
- Slope limits
- Feature spacing
- Generation time metric
- Stable terrain checksum

Return structured errors/warnings/metrics.

# 8. Retry and fallback

```text
attempt 0–7
→ generate
→ validate
→ accept first valid

all fail
→ current known-safe fixed arena
```

Retry order must be deterministic. Fallback must implement the same runtime interface and clearly report `fallbackUsed`.

Normal gameplay may remain on the fixed arena behind a feature flag until Phase 3.

# Tests

Add tests for:

- Seed expected values
- PRNG expected sequence
- Fork independence
- Same seed byte-identical terrain
- Different seed variation
- Version/rematch differences
- Finite samples
- Height bounds
- Slope rules
- Feature spacing
- Retry order
- Forced fallback
- Existing arena-query compatibility

Add:

```text
npm run test:maps
```

Report success, retries, fallback count, generation p50/p95, height min/max, and maximum slope.

# Forbidden

Do not add routes, generated obstacles, enemy pathfinding, truck routes, full rendering replacement, map blobs, or remove the fixed map.

# Verification

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
```

# Documentation

Create:

```text
docs/map-generation/MAP_GENERATION_PHASE_1_REPORT.md
```

Report actual files, algorithms, values, test results, limitations, and Phase 2 prerequisites.
