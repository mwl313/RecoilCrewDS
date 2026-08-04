# Core Loop 06 — Performance Report

## Method

`scripts/benchmark-enemies.ts` creates controlled populations (25–500) in deterministic matches and measures authoritative tick p50/p95/p99, enemy-only time, spawn time, JSON bytes, and enemy bytes. Run with:

```bash
npm run test:horde:benchmark
```

Machine: developer workstation (Windows, Node 24). Absolute frame-time targets for the release build are documented in `docs/planning/BUILD_STATUS.md`; this report uses relative before/after measurements on the same machine.

## Baseline (M0, before M5)

| Population | Tick p50 | Tick p95 | p99 |
| --- | --- | --- | --- |
| 100 | 0.29 ms | 0.33 ms | 0.40 ms |
| 300 | 1.89 ms | 2.08 ms | 2.31 ms |
| 500 | 4.86 ms | 5.47 ms | 5.88 ms |

Enemy JSON at 500 ≈ 155 KB per full snapshot.

## After M5 (spatial index; O(n²) removed)

| Population | Tick p50 | Tick p95 | p99 |
| --- | --- | --- | --- |
| 100 | 0.17 ms | 0.24 ms | 0.31 ms |
| 300 | 0.55 ms | 0.67 ms | 0.79 ms |
| 500 | 0.96 ms | 1.18 ms | 1.25 ms |

## Architecture headroom

- Area queries (Dash contact, cannon splash, barrel explosion) use the spatial index — no global scans in hot paths.
- Simulation LOD (30/12/3/1.5 Hz) reduces per-frame behavior cost with distance; movement distance over real time is preserved.
- Far-horde sectors remove individual sim objects beyond 165 m, preserving count/threat.
- Fodder rendering is instanced (bounded 512-slot pool), draw calls bounded by archetype/LOD, not entity count; specials stay unique.
- Replication sends quantized records per tier with far coalescing; no unchanged full enemy records.

## Pending measurements

- Two-client soak (15 min, 100/150 ms RTT) — snapshot bytes, parse ms, `bufferedAmount`, delta queue length, memory.
- Client frame p50/p95/p99 with 300–500 enemies + far sectors.
- Full-charge splash on a dense crowd, Dash through dense crowd, leader purge with 100+ wave monsters.

## Stability properties already verified by tests

- Instance slot pool: no leaks after purge, stable reuse, bounded capacity.
- Spatial index: reusable scratch arrays, no unbounded allocation.
- Sector aggregation: no memory growth (per-sector records, collapse on purge).
- Flow field: refresh rate-limited, forced on tank cell change.
- LOD: bounded per-enemy update queues (`nextUpdateAt`), phase offsets deterministic.
