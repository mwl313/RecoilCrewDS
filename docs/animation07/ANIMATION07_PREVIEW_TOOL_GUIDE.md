# Animation07 — Preview Tool Guide

Run `npm run dev:animation-preview` (port 5191) or
`npm run build:animation-preview`.

## Controls

- **Presentation profile** — pick any generated profile (legacy, witch,
  spider, beast).
- **Model variant** — near (skinned/clip-capable) or far (rigid).
- **Semantic role** — force a role (idle, walk, run, attacks, cast, hit,
  stagger, knockback, death, …).
- **LOD preview** — near (full rate), mid (12 Hz mixer), far (no mixer).
- **Play / Loop / Restart** — mixer behavior.
- **Scrub** — normalized clip time (pauses).
- **Playback speed / Movement speed** — locomotion scaling inputs.
- **Attack cue / Death / Hit flash** — authoritative-state simulation.
- **Skeleton / Bounds / Origin / Ground / Shadows** — debug helpers.
- **Spawn count** — 1, 10, 25, or 50 animated copies.

The diagnostics panel reports triangles, meshes, materials, bones, clips,
mixers, animation update time, draw calls, active LOD counts, and telemetry.

The tool imports the production `AssetService`, generated content bundle,
`EnemyAnimationController`, clip resolver, and LOD manager — it never
reimplements the runtime.
