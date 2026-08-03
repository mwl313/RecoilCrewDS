# Codex Prompt — Map Generation Phase 3
## Server/Client Arena Synchronization, Checksum Gate, Terrain Rendering, LOD, Culling, Fog, and Debug Overlay

Prerequisite:

```text
Phases 1 and 2 complete
generated arenas pass traversal validation
fixed fallback remains playable
```

Read all prior plans/reports and the adopted map specification.

# Goal

Make generated arenas the actual online and Practice map path.

Implement:

```text
server authoritative arena selection
client deterministic reconstruction
checksum/version gate
terrain rendering
generated prop rendering
LOD/culling/fog
debug overlay
rematch reroll
reconnect consistency
```

# Mandatory preservation

- Server remains authoritative.
- Clients do not choose placement.
- Existing fixed map remains fallback.
- Cameras, prediction, weapons, enemies, UI, PIP, results, jump, and dash remain functional.
- Monster pathfinding and truck routes remain excluded.

# Required first step

Create:

```text
docs/map-generation/MAP_GENERATION_PHASE_3_PLAN.md
```

Audit room lifecycle, match index, rematch, content metadata, join/start flow, Practice startup, arena rendering, asset service, snapshot metadata, loading/error UI, fog/shadows/quality settings, and reconnect flow. Then implement.

# 1. Server arena selection

At room or match creation:

1. Resolve map profile ID.
2. Resolve match index.
3. Calculate base seed.
4. Generate and validate arena.
5. Use fallback if needed.
6. Calculate checksum.
7. Store the arena in match-scoped state.
8. Pass it to collision, ground, spawn, gate, and recovery queries.
9. Include arena metadata in lobby/match-start state.

Required metadata:

```text
mapProfileId
arenaBaseSeed
arenaCandidateSeed
arenaAttempt
arenaGeneratorVersion
arenaChecksum
arenaFallbackUsed
```

Do not use a global current arena. Two rooms must support different maps simultaneously.

# 2. Client reconstruction

Before gameplay:

1. Receive profile/seed/version/checksum.
2. Load same profile.
3. Generate arena locally.
4. Calculate checksum.
5. Compare with server.
6. Build terrain and props only after a match.
7. Block gameplay and show reload/version error on mismatch.

Never continue with mismatched collision geometry.

# 3. Rematch and reconnect

Rematch:

```text
same room
matchIndex + 1
new seed
new map
```

Reconnect during the same active match:

```text
same room
same matchIndex
same seed
same checksum
same map
```

Test both.

# 4. Practice

Practice must use the same profile, generator, validation, and arena queries.

Use a deterministic local Practice seed when no room code exists.

Do not leave Practice permanently on separate legacy terrain.

Fallback remains available.

# 5. Terrain rendering

Build client terrain mesh from authoritative heightfield data.

Requirements:

- Visual mesh and `groundHeightAt` agree
- Smooth normals
- Stable UV mapping
- No seams
- Chunked terrain
- Frustum culling
- Material reuse
- Optional zone/material variation
- Rendering never mutates authoritative data

# 6. LOD and culling

For 400×400:

- Terrain chunks
- Practical near/far detail system
- Off-screen culling
- `InstancedMesh` for repeated props
- Shadow distance limits
- Shared materials
- Client-only small decoration excluded from checksum

Visual quality settings may alter decoration density, but never authoritative collision.

# 7. Fog

Add profile or presentation-controlled fog.

Initial recommended range:

```text
100–150 m
```

Fog is visual only. Keep nearby enemies, gates, ramps, and landmarks readable.

# 8. Generated prop rendering

Use semantic IDs through the asset service.

Requirements:

- Custom GLB or fallback
- Deterministic transforms
- Instancing where possible
- Collision objects visibly represented
- Clear separation of authoritative and decorative objects
- Proper disposal on rematch
- No scene/listener/pass leaks

# 9. Debug overlay

Development-only controls must show:

- Seed
- Profile
- Version
- Attempt
- Checksum
- Generation time
- Fallback state
- Height/slope heatmap
- Macro features
- Routes/corridors
- Zones
- Spawns/gates
- Ramps/landings
- Recovery zones
- Collider bounds
- Barrel clusters
- Validation warnings

Add a way to force a seed through development UI, URL, or test parameter.

# 10. Networking tests

Test:

- Matching checksum
- Version mismatch rejection
- Profile mismatch rejection
- Corrupted checksum rejection
- Two rooms with different maps
- Rematch reroll
- Reconnect same map
- Practice same pipeline
- Fallback metadata
- No start on mismatch

# 11. Rendering and lifecycle tests

Verify:

- Heightfield and visual terrain align
- Tank does not float/sink from mismatch
- Chunk seams absent
- Fog works
- Nearby collision visuals are not culled
- Old map disposes on rematch
- Scene counts do not grow across rematches
- Ramps align with collision
- Custom assets and fallbacks work

# Forbidden

Do not send full map blobs by default, allow client seed override, change AI, add truck routes, add streaming, add caves/bridges, or continue after checksum failure.

# Verification

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
```

Add Playwright coverage for generated-map join, mismatch handling, reconnect, and rematch.

# Documentation

Create:

```text
docs/map-generation/MAP_GENERATION_PHASE_3_REPORT.md
```

Update architecture, network, asset, smoke-test, and build-status docs. Report actual command results and manual browser checks.
