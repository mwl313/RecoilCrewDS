# Monster Pack 10 — Performance Report

Browser benchmark (`npm run test:monsterpack-rendering`) on headless Chrome,
1280×720, SWANGLE/WebGL defaults. Each scenario renders 120 frames; values
are ms/frame.

| Scenario | p50 | p95 | p99 | Draw calls | Triangles | Mixers | Far instances | Aggregate groups/instances |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| heroBoss (Dragon Evolved) | 0.20 | 0.60 | 0.80 | 3 | 14,876 | 1 | 0 | 0 |
| heroElite (Blue Demon) | 0.20 | 0.40 | 0.60 | 3 | 11,596 | 1 | 0 | 0 |
| commonNear 25 | 1.10 | 1.50 | 1.60 | 51 | 62,400 | 25 | 0 | 0 |
| commonFar 100 | 0.20 | 0.30 | 0.40 | 5 | 101,000 | 0 | 100 | 0 |
| commonFar 300 | 0.20 | 0.40 | 0.50 | 5 | 301,000 | 0 | 300 | 0 |
| commonFar 500 | 0.20 | 0.30 | 0.40 | 5 | 501,000 | 0 | 500 | 0 |
| aggregate stress (25 near + aggregate) | 1.20 | 1.40 | 1.70 | 51 | 62,400 | 25 | 0 | 1 / 24 |

Raw JSON: `build/monsterpack10-import/BENCHMARK_RESULTS.json` (ignored,
recreated by the benchmark).

## Recommended presentation caps (evidence-based)

- Near mixer cap: **48** (25 near mixers cost ~1.1 ms/frame; the existing
  `animationLod.defaultHorde` cap is already 48 and fits).
- Elite/hero cap: **24** (`animationLod.hero`); hero models are ~0.2 ms each
  at 3 draw calls.
- Far rigid cap: **500+** — 500 instanced far models cost ~0.2–0.4 ms/frame
  at only 5 draw calls; existing population caps remain authoritative and
  were not raised.
- Aggregate group cap: **1 group per asset id** with up to 512 instances;
  24 sector instances add negligible cost.
- Preload budget: roster-preload all assets a stage needs before spawn
  (the preview roster is ~2 MB of GLBs); unused heroes are never fetched.

Quality tiers: low quality may shorten `nearEnter`/`farEnter` distances and
disable near shadows (presentation only — never enemy count/HP/damage).

## Mixer hygiene

Demotion to far disposes the mixer and owned materials; promotion rebuilds
from the cached prototype; purge/removal cleans all tiers; aggregate models
never create mixers.
