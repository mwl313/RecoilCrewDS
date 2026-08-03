# Codex Prompt — Map Generation Phase 4
## Large Seed Sweep, Performance Budgets, Regression Hardening, Profile Authoring, and Final Acceptance

Prerequisite:

```text
Phases 1–3 complete
generated maps active online and in Practice
checksum gate works
```

Read all map-generation plans/reports and the adopted specification.

# Goal

Harden the generator for real use.

Implement:

```text
10,000-seed validation
performance metrics
rotating CI seed subset
bad-seed corpus
profile authoring
additional JSON profile proof
final regression
cleanup and documentation
```

Do not introduce a new architecture in this phase.

# Required first step

Create:

```text
docs/map-generation/MAP_GENERATION_PHASE_4_PLAN.md
```

Record current failure rates, generation times, retry counts, object budgets, scene counts, and known bad seeds before modifying behavior.

# 1. Full seed sweep

Add:

```text
npm run test:maps:sweep:full
```

Generate at least 10,000 base seeds for the primary profile.

Record:

- Accepted maps
- Candidate validation failures
- Retry distribution
- Fallback count
- Generation p50/p95/p99/max
- Checksum collisions
- Reachability ratio
- Loop count
- Dead-end ratio
- Minimum route width
- Maximum required slope
- Object/collider counts
- Largest barrel component
- Ramp acceptance
- Recovery-zone count

Accepted invalid maps must be zero.

Document actual fallback rate rather than hiding it.

# 2. CI seed subset

Add a stable or rotating 100–500-seed subset suitable for normal CI.

Keep the 10,000-seed sweep available for manual or scheduled execution.

# 3. Performance budgets

Enforce profile-controlled budgets for:

- Generation duration
- Validation duration
- Heightfield samples
- Route nodes/edges
- Authoritative colliders
- Furniture
- Ramps/platforms
- Barrels
- Terrain chunks
- Client arena build time
- Scene objects
- Draw calls where measurable

Do not optimize by disabling validation.

# 4. Bad-seed corpus

Persist seeds that:

- Required retries
- Failed a validator
- Hit boundary cases
- Produced dense layouts
- Produced high slopes
- Maximized ramps
- Triggered fallback

Every future procedural-map bug should add its seed to this corpus.

# 5. Additional profile proof

Add at least one more JSON profile using the same algorithms.

Examples:

```text
open rolling basin
ridge-heavy highland
```

Requirements:

- No profile-ID code branch
- Distinct feel
- Independent seed due to profile ID
- Full validation
- No large biome catalog

# 6. Authoring guide

Create:

```text
docs/guides/MAP_PROFILE_AUTHORING_GUIDE.md
```

Explain simply:

- Copying a profile
- Feature counts
- Height range
- Route width
- Furniture density
- Barrel limits
- Spawn/gate counts
- Testing a profile
- Forcing a seed
- Reading validation errors
- When TypeScript behavior is required

# 7. Final regression

Verify:

- Fixed fallback
- Generated online map
- Generated Practice map
- Rematch reroll
- Reconnect same map
- Two simultaneous rooms
- Jump
- Dash
- Cannon recoil
- JACKPOT recoil
- Moon Yard gravity
- Enemy gates
- Pickups
- Results
- Assets
- PIP/cameras
- No map/scene leaks after repeated rematches

# 8. Cleanup

Remove only temporary adapters that are no longer needed.

Keep the fixed fallback arena.

Search for:

- Global `ARENA` assumptions
- Hardcoded half-size
- `Math.random()` in generation
- Unversioned checksum
- Duplicate server/client algorithms
- Old fixed spawn arrays still active
- Debug overlay enabled in production

Document retained exclusions:

- No monster pathfinding replacement
- No truck route
- No caves/bridges/destructible terrain
- No streaming world

# Verification

Run and report:

```bash
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
npm run test:maps:sweep:full
```

Also test two browsers in Chrome and Edge.

# Final report

Create:

```text
docs/map-generation/MAP_GENERATION_FINAL_REPORT.md
```

Include architecture, tree, profiles, determinism/checksum evidence, seed-sweep metrics, retry/fallback rate, performance, budgets, online/Practice integration, browser results, limitations, author instructions, and next milestone.

Do not claim completion without actual outputs.
