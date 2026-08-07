# Horde Density V1 Implementation Report

## Revision and scope

- Branch: `horde`
- Starting SHA: `d307a0c7fd9e29e08e3207c093fdbecc69f8281b`
- Ending SHA: not assigned yet; the implementation is intentionally left uncommitted for review.
- Scope: production Multiplayer Main Stage and Single Player Main Stage. Both resolve `horde.mainStage.production` with identical horde configuration.

## Implemented values

| Area | Before | Density V1 |
|---|---:|---:|
| Phase 1 entities | 10 → 18 | 20 → 32 |
| Phase 1 threat | 12 → 22 | 25 → 42 |
| Phase 1 income/s | 0.8 → 1.2 | 1.6 → 2.4 |
| Phase 2 entities | 18 → 26 | 32 → 50 |
| Phase 2 threat | 22 → 32 | 42 → 66 |
| Phase 2 income/s | 1.2 → 1.6 | 2.4 → 3.2 |
| Phase 3 entities | 26 → 36 | 50 → 72 |
| Phase 3 threat | 32 → 46 | 66 → 95 |
| Phase 3 income/s | 1.6 → 2.2 | 3.2 → 4.4 |
| Farming cluster | 3 entities / 3 threat / 1.5 s | 6 / 6 / 1.25 s |
| Mixed farming | 3 entities / 4 threat / 2.0 s | 7 / 8 / 1.5 s |
| Wave cohort | 4 entities / 8 threat | 8 / 15 |
| Ordinary role mix | 50 / 30 / 20 | 65 / 25 / 10 |
| Boss escorts | 4–6 | 8–10 |
| Visible near-field | 18 m | 23 m |
| Preferred spawn distance | hard-coded 70 m | policy-driven 55 m; 70 m fallback |
| Ambient soft cap | 80 entities / 100 threat | 96 / 125 |
| Wave soft cap | 100 entities / 120 threat | 120 / 150 |

Formation changes are cluster radius 8 m at 2.2 m spacing, mixed radius 10 m at 2.6 m spacing, and wave radius 12 m at 3.0 m spacing. `maximumStoredBudget` remains 40 because the larger income did not require a larger post-stall dump allowance.

Wave values are:

| Encounter | Active entities | Active threat | Reinforcement threat/s |
|---|---:|---:|---:|
| Wave 1 | 48 | 75 | 2.5 |
| Wave 2 | 64 | 100 | 3.5 |
| Boss | 80 | 130 | 3.5 |

The one-leader-per-elite-wave and one-boss rules are unchanged. Melee engagement remains capped at six slots. Ranged/specialist concurrency machinery was not added: the role reduction to 25%/10% kept the first-pass implementation simple, and the browser soak did not expose a projectile or world-UI performance failure. A live-input difficulty pass remains the right place to decide whether attack-window limits are needed.

## Runtime fixes and telemetry

`WaveRuntime` now stores authored active entity/threat maxima. Opening and reinforcement packs enforce authored caps, global soft caps, hard capacity/reserves, valid definitions, and reinforcement reserve before atomic spawn. Live wave threat uses resolved enemy definitions rather than a pack-cost approximation.

Every wave-owned death decrements authoritative entity and threat counters once. The guard also covers repeated kill delivery, and purge subtracts only unaccounted live individuals plus aggregate-sector entity/threat totals. Reinforcement accumulation now waits for a full pack's threat cost instead of treating one accumulated threat point as permission to spawn an entire pack.

Ambient soft capacity now governs ambient population only; existing ambient monsters can overlap a wave while hard and wave caps remain separately enforced.

The debug path now reports global/45 m/70 m population, ambient/wave/boss/special classes, close/ranged/specialist roles, interpolated entity/threat targets, spawn income, stored budget, last pack and size, last anchor distance, failures, wave live values/authored caps, LOD tiers, client-observed replication population, and animation cost.

## Engineering invariants

- `hardEntityCap = 300` (unchanged)
- `FODDER_CAPACITY = 512` (unchanged and now directly testable)
- Elite/boss reserve = 16 (unchanged)
- Technical emergency reserve = 8 (unchanged)
- Replication policy and LOD policy are unchanged.
- Instancing, aggregation/materialization, flow-field navigation, spatial queries, terrain validation, safe-zone exclusion, deterministic planning, and anchor-capacity rejection remain enabled.
- The deterministic `urban400` audit retains at least eight valid anchors with capacity for an eight-enemy pack.

## Server benchmark

Synthetic results are milliseconds, reported as p50/p95/p99. The benchmark itself does not consume production density content, so differences between runs are normal machine/run variance; its purpose is regression capacity.

| Population/scenario | Baseline server step | Density V1 server step | Density V1 AI | Density V1 horde replication |
|---|---:|---:|---:|---:|
| 100 baseline | 0.285/0.687/1.895 | 0.285/0.811/1.742 | 0.348/0.899/1.581 | 5.4 KB/s |
| 100 pressure | 0.284/0.588/0.738 | 0.239/0.540/0.806 | 0.189/0.320/0.488 | 5.8 KB/s |
| 150 baseline | not previously sampled | 0.322/0.504/0.932 | 0.286/0.435/0.705 | 6.6 KB/s |
| 200 baseline | not previously sampled | 0.411/0.686/0.897 | 0.382/0.605/0.855 | 7.3 KB/s |
| 300 baseline | not previously sampled | 0.668/1.044/1.428 | 0.671/1.068/1.213 | 9.3 KB/s |
| 500 baseline | 1.686/2.413/6.321 | 1.203/1.675/1.930 | 1.192/1.639/1.985 | 13.7 KB/s |
| 500 pressure | 1.326/2.260/2.869 | 1.125/1.574/1.929 | 1.468/2.076/2.450 | 15.7 KB/s |
| 750 baseline | 2.068/2.989/3.576 | 2.149/2.888/3.382 | 2.004/2.709/3.002 | 19.3 KB/s |
| 750 pressure | 1.821/3.167/3.881 | 1.838/2.472/2.795 | 1.660/2.221/2.458 | 21.8 KB/s |

Full machine-readable results: `docs/horde/horde-density-v1-server.json`.

## Two-client urban400 browser qualification

The binding Chrome run passed with Driver and Gunner through Phase 1, Wave 1, Wave 2, Phase 3, boss, Gunner reconnect, victory, and rematch. The qualification server's test-only heal grants an AFK shield so the run measures presentation/network load rather than idle survival. Normal gameplay is unchanged.

| Sample | Replicated live | Within 45/70 m | Driver FPS / frame p95 | Gunner FPS / frame p95 | Render p95 max | Animation max | Server step sample | Outbound buffer |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Phase 1 | 12 | 12 / 12 | 60.0 / 17.1 ms | 116.9 / 8.7 ms | 4.7 ms | 0.3 ms | 0.64 ms | 0 B |
| Wave 1 | 45 | 38 / 38 | 60.0 / 17.0 ms | 120.2 / 8.7 ms | 7.0 ms | 0.6 ms | 2.45 ms | 0 B |
| Wave 2 | 64 | 56 / 56 | 60.0 / 17.1 ms | 120.3 / 8.8 ms | 8.0 ms | 0.8 ms | 2.28 ms | 0 B |
| Phase 3 sample | 48 | 48 / 48 | 60.2 / 17.1 ms | 120.1 / 9.1 ms | 8.2 ms | 0.9 ms | 1.54 ms | 0 B |
| Boss | 75 | 66 / 66 | 57.8 / 25.2 ms | 107.7 / 10.4 ms | 9.4 ms | 1.0 ms | 2.61 ms | 0 B |

Peak observed scene load was 751 estimated draw calls and 2,497,116 triangles. Boss inbound traffic was approximately 665–666 KB/s per client with zero outbound buffering. Client-observed replication population at the boss was 66 near, 0 mid, 9 far, and 0 aggregated sectors; the stationary tank and 55 m preferred band explain the near-heavy split. Machine-readable evidence: `docs/horde/qualification/horde-density-v1-browser.json`.

The Phase 3 sample was captured five seconds after Wave 2 purge, so it had refilled to 48 of the eventual 50→72 target. Wave and boss snapshots exceeded the requested nearby feel bands, confirming substantially denser immediate combat space without close pop-in.

## Progression comparison

The deterministic one-minute production comparison uses the same 120 maximum kill opportunities and pulls XP shards to the tank so it measures reward throughput rather than pickup travel.

| Metric | Baseline | Density V1 | Ratio |
|---|---:|---:|---:|
| Kills/min | 57 | 108 | 1.89× |
| XP/min | 988 | 1,696 | 1.72× |
| Completed level-ups/min | 7 | 9 | 1.29× |
| Enemy chest rolls/min | 57 | 108 | 1.89× |
| Enemy-drop chests/min | 0 | 0 | — |
| Relics/run | 0 | 0 | — |
| Score/min from ordinary kills | 0 | 0 | — |

Completed level-up pace lands inside the requested 1.2–1.35× band, despite the deliberately aggressive clear-rate model. No reward values were changed. Chest/relic rates need a longer multi-seed sample because neither one-minute run produced a drop.

## Validation

- Content generation: pass
- TypeScript typecheck: pass
- Production client/server build: pass
- Horde suite: 110/110 tests passed
- Netcode suite: 44/44 tests passed
- 100/150/200/300/500/750 server benchmark: pass
- Two-client `urban400` Chrome qualification: pass
- Fixed-rate progression simulation: pass
- Baseline-vs-Density-V1 production progression comparison: pass
- Progression suite: 201/202 passed; the unrelated existing `relicSystemHardening` expectation still expects pre-×10 `7.5` while current Main reports `15`
- `git diff --check`: pass

## Follow-up recommendation

Run a human Driver/Gunner combat session before changing attack concurrency or rewards. Specifically observe projectile avoidance, specialist readability, damaged-only bars, popup coalescing, and chest/relic presentation while actively killing at Wave 2 and boss density. If lethality is excessive, first reduce ranged/specialist pressure or add attack-window budgets; preserve the new entity counts. For progression, keep rewards unchanged unless a longer multi-seed human-clear sample pushes completed level-ups materially above 1.35× baseline.
