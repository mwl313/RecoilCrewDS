# Enemy Capacity Benchmark

## Milestone record

- Branch: `quality-improvement`
- Starting SHA: `f0f4fc1824da5bf4b08f2cfae24e787ba17902ae`
- Ending implementation SHA at final qualification: `a28da4a`
- Recommendation: keep the measured current-machine ceiling at 750 with a 40 near / 120 mid mixer budget; treat lower hardware rows as release gates until physically measured.

## Decision

The engine supports a 750-enemy production ceiling on the current development machine only when skeletal presentation is bounded and the remaining population uses animated rigid or aggregate tiers.

Recommended production allocation:

```text
Near full skeletal animation:     40
Mid reduced semantic animation:  120
Far animated rigid instances:    590
Aggregate representation:        optional replacement inside the far 590
Maximum total population:        750 (current development machine)
Conservative low-end ceiling:    500 pending physical-device verification
```

Measured isolated limits are higher in some tiers, but they are not the production allocation:

```text
100 all-near mixers passed the 16.7 ms frame target.
250 all-near mixers did not.
750 animated-far instances passed.
750 enemies represented by 94 aggregate sectors passed.
```

Do not promote all far monsters to skeletal rigs. At 750 full skeletal enemies the measured frame p95 was 52.7 ms and GPU p95 was 20.9 ms.

## Harnesses and raw evidence

Server/replication benchmark:

```text
npm run test:horde:benchmark -- --json=docs/quality/evidence/enemy-capacity-server.json
```

Client/GPU benchmark:

```text
npm run dev:animation-preview -- --host 127.0.0.1 --port 5192
http://127.0.0.1:5192/?capacity=1&width=1280&height=720
```

Evidence:

- [enemy-capacity-server.json](evidence/enemy-capacity-server.json)
- [enemy-capacity-client.json](evidence/enemy-capacity-client.json)
- [phase-c-capacity-benchmark.png](evidence/phase-c-capacity-benchmark.png)

The browser route runs 24 fixed scenarios: 100, 250, 500 and 750 enemies across all-near, mixed, reduced-mid, animated-far, combat-pressure, and aggregate-far presentation.

## Test machine

```text
OS: Windows 10/11 x64 as reported by Chrome
Browser: Chrome 151
GPU: NVIDIA GeForce RTX 4060 Ti, ANGLE D3D11
Resolution: 1280×720
Renderer pixel ratio: 1
GPU timer: EXT_disjoint_timer_query_webgl2 available
Server runtime: Node.js x64, 30 Hz simulation
```

Only the current development machine was physically available. Integrated/low-end laptop and mid-range desktop hardware were not available in this workspace, so this report does not invent measurements for them. The 500-enemy low-end ceiling is a conservative release gate, not a claimed device result. Before raising that ceiling, run the committed browser route on at least one integrated laptop and one mid-range desktop at their target resolution.

## Client results

Representative p50/p95 measurements:

| Scenario | CPU frame p50/p95 | GPU p50/p95 | Draw calls | Mixers | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| 100 all near | 7.2 / 9.0 ms | 1.25 / 2.19 ms | 201 | 100 | Pass |
| 250 all near | 17.7 / 20.9 ms | 6.03 / 9.20 ms | 501 | 250 | Fail 60 fps |
| 500 all near | 35.0 / 39.5 ms | 12.52 / 16.67 ms | 1,001 | 500 | Fail |
| 750 all near | 47.0 / 52.7 ms | 16.53 / 20.92 ms | 1,501 | 750 | Fail |
| 250 mixed (40/120/90) | 9.0 / 11.9 ms | 2.40 / 6.26 ms | 323 | 160 | Pass |
| 500 mixed (40/120/340) | 7.3 / 9.6 ms | 2.58 / 4.91 ms | 323 | 160 | Pass |
| 750 mixed (40/120/590) | 9.0 / 11.8 ms | 3.01 / 5.96 ms | 323 | 160 | Pass |
| 750 combat pressure + elite + boss | 8.9 / 13.8 ms | 2.89 / 6.52 ms | 331 | 162 | Pass |
| 750 animated far | 0.5 / 1.3 ms | 0.29 / 2.71 ms | 3 | 0 | Pass |
| 750 aggregate far (94 sectors) | 0.3 / 0.4 ms | 0.05 / 0.06 ms | 3 | 0 | Pass |

The combat-pressure scenario adds projectile and XP visual pressure plus one elite and one boss. It retained three shadow casters and 163 skinned meshes while the remaining 590 enemies used animated far instances.

### Animation-frequency result

Reducing semantic selection frequency does not make hundreds of skeletal mixers cheap by itself. The 750 reduced-mid scenario still had 750 mixers and failed badly. The winning constraint is the mixer budget: 40 near + 120 mid, not “all mid at 12 Hz.” Mid mixers advance at render frequency for visual smoothness; only their semantic selection is reduced.

### GPU resource lifecycle

The first matrix run exposed an accumulating bone-texture leak: mixer/material cleanup did not dispose each cloned skeleton. `disposeAnimationInstance` now disposes every unique per-instance skeleton. The repeated matrix finishes every scenario with:

```text
postCleanupTextures: 0
stateGrowth: 0
```

This is covered by an automated skeleton-disposal regression.

## Server, interpolation, and network results

Worst observed 750-enemy values:

| Budget | Baseline | Combat pressure | Budget assessment |
| --- | ---: | ---: | --- |
| Server step p95 / p99 | 3.99 / 7.66 ms | 2.86 / 3.69 ms | Pass against 33.3 ms tick |
| Client interpolation p95 | 0.19 ms | 0.21 ms | Pass |
| Compact horde replication | 19.3 KB/s | 21.8 KB/s | Acceptable starting point |
| Raw JSON snapshot | 248.0 KB | 370.5 KB | Not acceptable at 20 Hz |
| Raw JSON at 20 Hz | 4.96 MB/s | 7.41 MB/s | Must not be production path |

The compact tiered horde protocol is therefore mandatory at high population. Full JSON state is recorded only as a diagnostic upper bound.

The server stress case includes up to 240 enemy projectiles, 400 XP shards, an elite-priority enemy and a boss-priority enemy. Authoritative state did not grow across the six-second run. Some projectiles were removed by normal collision/expiry behavior; enemy and XP arrays had zero unexpected growth.

## Separate budget conclusions

- Server AI/simulation: 750 passes on the development CPU with substantial 30 Hz margin.
- Client interpolation: sub-0.25 ms p95 at 750.
- Skeletal animation/GPU skinning: draw-call and mixer bound; 100 all-near passes, 250 fails.
- Animated far: 750 rigid instances are inexpensive and retain display-frame motion.
- Aggregate far: 750 represented by 94 sectors is effectively negligible.
- Shadows: keep common mid/far shadows disabled; reserve them for a few elite/boss actors.
- Projectiles/XP: the 750 combat-pressure mix remains under the 16.7 ms p95 frame target.
- Snapshot/network: compact tiered replication is required; raw snapshots are prohibited at this scale.
- Memory/state growth: skeleton GPU resources and authoritative arrays return to baseline after cleanup.

## Release gates by hardware class

| Class | Initial ceiling | Required verification |
| --- | ---: | --- |
| Integrated/low-end laptop | 500 total; near 24, mid 72 | Physical device run must keep p95 ≤ 16.7 ms at 1280×720 low quality. |
| Mid-range desktop | 650 total; near 32, mid 96 | Physical device run must keep p95 ≤ 16.7 ms at 1920×1080. |
| Current RTX 4060 Ti development machine | 750 total; near 40, mid 120 | Measured pass at 1280×720. |

The lower-class rows are deliberately conservative gates. They become measured recommendations only after evidence JSON is captured on those machines using the same committed route.

The final serial server rerun passed at 750 with baseline step p50/p95/p99 `2.270/3.794/4.465 ms`, combat-pressure step `2.328/3.791/3.944 ms`, compact replication `19.3/21.8 KB/s`, and no unexpected enemy/sector/XP growth. These rerun values confirm the committed evidence conclusions; they do not replace the fixed browser/GPU matrix. No integrated laptop or mid-range desktop was physically available, so no performance claim is made for those classes.
