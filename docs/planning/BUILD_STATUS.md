# Build Status

## Completed

- **Stack chosen and scaffolded** — TypeScript + Vite + Three.js client,
  Node authoritative server (`ws`), vitest, Playwright e2e.
- **Authoritative simulation** — all gameplay systems implemented in
  `src/shared/sim/match.ts` (tank, recoil, weapons, four enemy types,
  barrels, scrap, combo, links, JACKPOT, wipeout, spawn pacing, modifiers,
  results).
- **Server** — room creation/join codes, roles, ready/countdown, per-role
  validated inputs, sequence protection, stale-input clearing (per role),
  snapshot/event streaming, results, rematch, reconnect grace, static
  serving + WebSocket on one port.
- **Client** — two independent TPS cameras with collision, pointer-locked
  aim, local turret prediction, PIP feed, HUD/menus/results, procedural
  audio, pooled VFX, practice mode, quality fallback.
- **Assets** — semantic registry with generated low-poly fallbacks for every
  required ID + optional `/assets/manifest.json` overrides.
- **Tests and docs** — vitest suites, Playwright e2e, headless verification
  script, README, DEPLOYMENT, ASSET_GUIDE, SMOKE_TEST, DECISIONS, env
  example, Dockerfile.

## Verification evidence

- **Refactor Phases 0-6 complete** — data-driven content, immutable rules,
  modular weapons/enemies/items, client coordinator split, and proof
  content (alternate mode, rapid cannon, composed enemy, stat item).
  Verified: `npm run build` PASS; `npm test` **238/238 PASS** (24 files);
  `npm run test:e2e` **14/14 PASS**; `npm run test:loop` PASS (full round +
  rematch); `npm run test:demo` PASS (golden Demo byte-identical).
  Details: `REFACTOR_STATUS.md`, `ARCHITECTURE.md`.

- **Tank Jump & Dash milestone complete** — Space is an edge-triggered jump,
  Left Shift is an edge-triggered chassis-forward dash; both are
  server-authoritative, locally predicted, deterministic through shared
  kinematics, data-driven (`tank.jumpHeight`, `tank.dashImpulse`,
  `tank.dashCooldown`, `tank.dashAirMultiplier`,
  `tank.dashMaxHorizontalSpeed`, `tank.dashPresentationSeconds`), and
  reconciliation-safe. Held boost and active brace are removed from the
  Driver control path (recoil/JACKPOT/scoring/HUD/PIP cleaned up).
  Verified: `npm run build` PASS; `npm test` **270/270 PASS** (25 files);
  `npm run test:demo` PASS (golden intentionally regenerated: score
  14633 → 16264, kills 36 → 39, JACKPOT ×2 → ×4, events 1647 → 1708 with
  new jump/dash event types and tank state fields);
  `npm run test:e2e` and `npm run test:loop` PASS.
  Details: `JUMP_DASH_IMPLEMENTATION_PLAN.md` and
  `JUMP_DASH_IMPLEMENTATION_REPORT.md`.

- **Map Generation Phases 1-3 complete** — deterministic seed pipeline,
  400×400 heightfield + macro terrain, routes/zones/spawns/gates/furniture/
  ramps/recovery with traversal validation, and full online activation:
  server-authoritative arena selection, client regeneration + checksum/
  version/profile gate, rematch reroll, reconnect consistency, Practice on
  the same pipeline, chunked terrain rendering with LOD/culling/fog,
  instanced props, and a dev debug overlay. Verified: `npm run build` PASS;
  `npm test` **328/328 PASS** (28 files); `npm run test:demo` PASS (golden
  byte-identical); `npm run test:e2e` **21/21 PASS**; `npm run test:loop`
  PASS (generated arena, grade S); `npm run test:maps` + `test:maps:sweep`
  PASS (1000/1000, 0 fallbacks). Details: `docs/map-generation/`.

- `npm test` → **5 files, 47 tests passed** (config, math, asset fallback,
  match systems, room lifecycle, full-round integration).
- `npm run build` → client `dist/` + server `dist-server/` build cleanly.
- `npm run test:e2e` → **PASS** — two real Chrome clients created a crew,
  played a full 90-second round (movement, kills, cannon recoil, Loot Truck,
  first-round JACKPOT, results), then rematched in the same room with a
  modifier; practice mode also plays a full local round to results.
- `npm run test:loop` → **PASS** — headless two-client real-time round in
  ~92 s (score 11175, grade A, JACKPOT ×3, combo ×5), rematch with Moon Yard
  modifier, fresh zeroed match in the same room, 1353 snapshots received.

## Remaining limitations

- Audio is procedural synthesis (no licensed sample files); the named-event
  registry is the extension point for custom files.
- Jump is grounded-only by default (no coyote time, no buffering) and dash
  is a single instantaneous burst per accepted press edge; both are tuned
  through tank JSON/runtime stats, not hardcoded.
- Mobile/controller input and spectator modes are intentionally out of scope
  per the design document.
- No dedicated public matchmaking lobby; rooms are created and shared via
  six-character codes as designed.
