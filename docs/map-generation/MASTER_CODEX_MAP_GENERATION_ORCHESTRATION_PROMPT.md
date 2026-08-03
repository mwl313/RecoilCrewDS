# Master Codex Prompt — Recoil Crew Seeded Map Generation Program

Use this prompt to coordinate, audit, or resume the staged implementation.

Binding specification:

```text
docs/design/01-맵-디자인.md
```

Phase prompts:

```text
CODEX_MAP_GEN_PHASE_1_SEED_TERRAIN_VALIDATION.md
CODEX_MAP_GEN_PHASE_2_ROUTES_ZONES_FURNITURE.md
CODEX_MAP_GEN_PHASE_3_RENDERING_NETWORK_DEBUG.md
CODEX_MAP_GEN_PHASE_4_STRESS_TEST_POLISH.md
```

# Mission

Implement a deterministic 400×400 pseudo-procedural map system supporting expansive tank driving, jumping, dashing, and recoil movement while guaranteeing:

- Server/client consistency
- Valid terrain
- Connected, wide routes
- Safe spawns and horde gates
- Safe ramps and landing areas
- Bounded barrel chains
- Bounded object/collider counts
- Deterministic retries
- Known-safe fallback
- JSON profile expansion
- Large seed-sweep validation

# Excluded scope

Do not implement:

- Loot Truck or truck routes
- New monster pathfinding
- Navmesh
- Caves
- Bridges
- Destructible terrain
- World streaming
- P2P networking
- Engine rewrite

Current monster following remains supported through broad, open, connected maps.

# Governance

1. Inspect repository and current map-generation status.
2. Read every completed Phase plan/report.
3. Find the earliest incomplete Phase.
4. Execute only that Phase.
5. Do not start later phases.
6. Preserve all current gameplay.
7. Run all required commands.
8. Record actual results.
9. Update the appropriate report.
10. Stop after that Phase passes.

# Non-breaking requirements

Preserve:

- Authoritative online server
- Two-browser play
- Practice
- Driver/Gunner prediction
- Independent cameras
- Jump/dash
- Collision
- Weapons/projectiles
- Enemies
- Pickups
- Results/rematch
- Content validation
- Semantic assets
- Fixed map fallback

# Full completion definition

- Same seed/profile/version produces the same Node/browser checksum.
- Rematch produces a different map.
- Reconnect restores the same map.
- Every accepted map passes validation.
- Failed candidates retry deterministically.
- Exhausted retries use fixed fallback.
- Checksum mismatch blocks gameplay.
- 10,000-seed sweep produces zero accepted invalid maps.
- Online and Practice remain playable.
- At least two JSON profiles create different map distributions without code branches.
- Designer documentation is complete.
