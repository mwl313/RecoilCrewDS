# Core Loop 06 — Baseline Report

**Date:** 2026-08-04 (branch `combat-rework` @ `09ae211` + benchmark harness)  
**Machine:** Windows (Node v24.13.0, `tsx`), single-threaded authority benchmark.

## Baseline gates (executed)

```text
npx tsc --noEmit                       PASS
npm run generate:presentation-content  PASS (10 scenes, 1 hud)
npm run generate:content-pack          PASS (3 modes)
npm run generate:map-profiles          PASS (5 maps)
npm run build                          PASS
npm test                               555/555 PASS (63 files)
npm run test:demo                      PASS (golden byte-identical)
```

No baseline failure existed; all gates pass on the current checkout.

## Benchmark method

`scripts/benchmark-enemies.ts`:

- Creates a `Match('bench')`, stubs the legacy Demo spawn director.
- Spawns exactly N `enemy.scrapBug` with a seeded LCG (stationary spread
  over 160 m or dense cluster radius 16 m).
- 240 ticks at 1/30 s; records full `match.step()` tick times and
  `EnemySystem.update()`-only times, p50/p95/p99.
- Measures spawn wall-time and full-state JSON bytes (total and enemy-only).

## Stationary scenario (ms/tick)

| count | tick p50 | tick p95 | tick p99 | enemyOnly p50 | p95 | p99 | JSON bytes | enemy bytes |
|---|---|---|---|---|---|---|---|---|
| 25 | 0.068 | 0.194 | 0.444 | 0.054 | 0.107 | 0.171 | 9 785 | 7 720 |
| 50 | 0.146 | 0.238 | 0.333 | 0.115 | 0.191 | 0.223 | 17 500 | 15 435 |
| 75 | 0.198 | 0.294 | 0.439 | 0.179 | 0.224 | 0.242 | 25 239 | 23 174 |
| 100 | 0.290 | 0.394 | 0.472 | 0.285 | 0.411 | 0.429 | 32 990 | 30 924 |
| 150 | 0.580 | 0.643 | 0.676 | 0.559 | 0.625 | 0.697 | 48 438 | 46 372 |
| 200 | 0.947 | 1.250 | 1.419 | 0.906 | 0.989 | 1.104 | 63 943 | 61 877 |
| 250 | 1.375 | 1.496 | 1.620 | 1.343 | 1.520 | 2.031 | 79 489 | 77 423 |
| 300 | 1.894 | 1.972 | 2.111 | 1.859 | 1.949 | 2.281 | 94 983 | 92 917 |
| 400 | 3.237 | 3.608 | 4.262 | 3.200 | 3.651 | 4.421 | 125 950 | 123 884 |
| 500 | 4.860 | 5.296 | 5.954 | 4.833 | 5.935 | 6.986 | 157 004 | 154 938 |

## Dense-cluster scenario (ms/tick)

Same ladder; dense results are statistically equivalent to stationary
(0.309 ms at 100, 1.915 ms at 300, 4.893 ms at 500 p50), confirming the
O(n²) separation dominates rather than geometry.

## Observations

- The tick cost is super-linear in population: from 0.29 ms at 100 to
  4.86 ms at 500 (p50), with the **EnemySystem update (incl. O(n²)
  `movement.separation`) consuming nearly the entire tick**.
- Spawn cost is negligible (< 0.3 ms for 500).
- Snapshot bytes scale linearly (~310 B/enemy). At 500 enemies a 20 Hz
  full-state JSON broadcast is ~157 KB per snapshot ≈ 3.1 MB/s before
  overhead — a scaling risk for multiplayer.
- At 300 enemies the authority tick (~1.9 ms p50) is still within budget,
  but the demo currently targets < 30 simultaneous enemies; the ladder shows
  why LOD/spatial/replication work is required before selecting a final cap.

## Baseline conclusion

No supported cap is claimed yet. Provisional engineering target remains
"measure, then select"; the first horde milestone target (200–300 fully
active enemies) requires the spatial index + separation removal (M5) before
the tick curve stops being super-linear.
