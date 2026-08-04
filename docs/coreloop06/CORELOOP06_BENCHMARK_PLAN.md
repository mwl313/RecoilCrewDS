# Core Loop 06 — Benchmark Plan

## Goal

Measure the current `combat-rework` enemy pipeline and select supported
population caps from data, not source inspection. No final cap is claimed
until the ladder and scenarios below are executed and recorded.

## Population ladder

```text
25, 50, 75, 100, 150, 200, 250, 300, 400, 500
```

## Scenarios

```text
stationary tank
moving tank
dense cluster
spread population
spawn burst (all at once)
large cannon splash
full Charge Shot splash
Dash through dense crowd
leader cohort purge (Core Loop 06)
two-client replication
```

## Authority-side metrics

```text
per-tick authority simulation p50/p95/p99
EnemySystem time
behavior time (incl. O(n²) separation)
EnemyImpulseController time
spatial-query time (after M5)
spawn time
purge time (after M2)
```

## Client-side metrics

```text
frame p50/p95/p99
enemy sync time
render time
draw calls
object/instance count
memory growth + GC spikes (long run)
```

## Network metrics

```text
snapshot bytes
enemy bytes
serialization time
parse time
interpolation time
WebSocket bufferedAmount
delta queue length (after M9)
```

## Method

- Controlled populations: spawn enemies directly into a deterministic
  `Match`/`SystemContext` (no live random spawning) using a seeded RNG.
- Fixed simulation step 1/30 s; measure wall-clock per tick over a fixed
  number of ticks per ladder count.
- Client-side measurements come from headless Chrome (Playwright) with a
  `?bench` page hook that spawns N enemies through the test hook.
- Re-run the ladder after each of: spatial index + separation removal (M5),
  instanced rendering (M6), flow field (M7), simulation LOD (M8), tiered
  replication (M9), far aggregation (M10).

## Output

`docs/coreloop06/CORELOOP06_BASELINE_REPORT.md` (baseline) and
`docs/coreloop06/CORELOOP06_PERFORMANCE_REPORT.md` (after milestones).

## Environment disclosure

All numbers are recorded with the test machine (Node version, CPU, GPU,
headless settings) and must not be treated as console/mobile targets.
