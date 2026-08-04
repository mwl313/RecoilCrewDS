# Animation07 — Performance Report

Headless benchmark (`npm run test:animation:benchmark`) on the procedural
skinned test rig (3 bones, 1 SkinnedMesh, 4 clips). Machine: developer
workstation, Node 24. Units: ms.

| Scenario | ctrl p50 | p95 | p99 | mixer p50 | p95 | p99 | mixers | mem Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 hero mixer | 0.002 | 0.012 | 0.097 | 0.000 | 0.000 | 0.000 | 1 | 1.2 MB |
| 10 hero/elite | 0.007 | 0.023 | 0.067 | 0.000 | 0.000 | 0.000 | 10 | 2.0 MB |
| 25 near | 0.010 | 0.022 | 0.122 | 0.000 | 0.000 | 0.000 | 25 | -2.6 MB |
| 50 near | 0.013 | 0.028 | 0.110 | 0.000 | 0.000 | 0.000 | 50 | 0.9 MB |
| 100 near | 0.024 | 0.033 | 0.274 | 0.000 | 0.000 | 0.000 | 100 | 2.4 MB |
| 50 near + 100 mid | 0.050 | 0.137 | 0.255 | 0.000 | 0.001 | 0.001 | 150 | 10.0 MB |
| 50 near + 200 far | 0.011 | 0.017 | 0.031 | 0.000 | 0.000 | 0.000 | 50 | -6.2 MB |
| 200 far rigid | 0.012 (clone) | – | – | – | – | – | 0 | – |
| LOD selection (300) | 0.033 | 0.079 | 0.351 | – | – | – | – | – |
| model swap | 0.069 | 0.132 | 0.200 | – | – | – | – | – |
| 100 deaths | 0.002 | 0.005 | 0.005 | – | – | – | 0 | – |
| 100 purge | 0.002 | 0.005 | 0.005 | – | – | – | 0 | – |
| restart cycles (10×50) | 1.384 | 4.784 | 4.784 | – | – | – | 0 | – |

Skinned clone (with materials): ~0.05 ms. Rigid clone: ~0.03 ms.

## Conclusions

- 100 near mixers update in well under a frame (p50 0.024 ms, p99 0.274 ms).
- Mid-tier reduced updates keep 150 mixers under 0.06 ms p50.
- Far rigid presentation costs a plain instance (no mixer).
- Cleanup is leak-free: live mixers 0, owned material clones 0, heap trend
  ~10.9 MB across all scenarios.
- Final near-skinned cap on real hardware should be measured with the
  preview tool (draw calls/renderer frame time are renderer-bound).
