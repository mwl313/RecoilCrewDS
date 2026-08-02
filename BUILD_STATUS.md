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

- **Final corrective patch (TPS controls, jitter, collision, copy)** —
  implemented and verified: `npm run build` PASS; `npm test` **97/97 PASS**
  (11 files); `npm run test:e2e` **14/14 PASS** including the new
  `e2e/tps.spec.ts` suite (mouse directions, A/D forward/reverse, recenter,
  camera independence, aim-while-turning, smooth rendering, wall/high-speed
  collision, copy feedback, pointer capture, pause neutrality, full round,
  results, rematch, practice); `npm run test:loop` PASS in 91.8 s
  (score 15465, grade S, JACKPOT ×4, rematch with Moon Yard).
  Details: `BUGFIX_REPORT_FINAL.md`, `BUGFIX_PLAN_FINAL.md`.

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
- Mobile/controller input and spectator modes are intentionally out of scope
  per the design document.
- No dedicated public matchmaking lobby; rooms are created and shared via
  six-character codes as designed.
