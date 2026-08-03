# Build Plan

## Stack

TypeScript + Vite + Three.js client, custom authoritative Node simulation,
`ws` WebSocket server. Rationale recorded in `DECISIONS.md`.

## Execution order

1. Inspect repository and toolchain.
2. Scaffold npm/Vite/TypeScript project with shared, server, client, test,
   and e2e folders.
3. Shared simulation:
   - math helpers, configuration, arena data (zones, obstacles, ramps,
     barrels, truck route)
   - authoritative match: tank movement/grip/boost/brace/auto-right, cannon
     recoil, machine gun, shells, enemies (Scrap Bug, Rammer, Gun Tower,
     Loot Truck), barrels and chains, pickups/magnetism, Crew Combo, Crew
     Links, JACKPOT meter/charge/assistance, integrity/wipeout/respawn,
     spawn pacing, 90-second timer, results/grades/titles, modifiers.
4. Server: room codes, create/join/rejoin, ready/countdown, per-role input
   validation with sequence protection, stale-input clearing, snapshots,
   events, results, rematch, disconnect grace, static hosting.
5. Client:
   - semantic asset registry + generated low-poly models
   - arena view, TPS Driver/Gunner cameras with collision
   - interpolation + local turret prediction, PIP feed
   - DOM HUD/menus/results, procedural audio, pooled VFX
   - practice mode with local sim + camera swap
   - performance adaptation (pixel ratio, shadows, bloom, PIP rate)
6. Tests: config validity, asset fallback, math, match systems, room
   lifecycle, full-round integration, two-browser e2e, headless full-loop.
7. Docs: README, DEPLOYMENT, ASSET_GUIDE, SMOKE_TEST, BUILD_STATUS, env file.
8. Final verification: unit tests, production build, real-time 90-second
   headless round + rematch, two-browser Playwright round + rematch.

## Status

See `BUILD_STATUS.md`.
