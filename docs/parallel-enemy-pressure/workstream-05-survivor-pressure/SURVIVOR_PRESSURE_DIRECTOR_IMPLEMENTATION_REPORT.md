# Survivor-Style Pressure Director V1 — Implementation Report

## Revision and audit

- Branch: `feature/survivor-pressure-director`
- Base/working-tree HEAD SHA: `2e80f3916e06deccfa915e56f3087acf51ead218`
- Implementation state: uncommitted working tree on the branch above.
- Isolation: work was performed in a dedicated Git worktree so the pre-existing dirty desktop checkout was not modified.
- Binding design: `SURVIVOR_STYLE_PRESSURE_DIRECTOR_DESIGN.md`

The requested horde, enemy, navigation, progression, damage, network, content, test, and benchmark paths were audited before implementation. The baseline horde suite passed 110 tests in 13 files. The baseline enemy benchmark was captured at `C:\Users\Public\recoil-survivor-baseline.json` (format 2). Baseline `npx tsc --noEmit` already failed in the audio presentation router and procedural audio tests; the same failures remain after this work and are listed under Validation.

## Architecture

The implementation keeps two semantic pressure layers explicit:

- **Ordinary pressure** is selected by `isOrdinaryPressure`. It may be aggregated into moving sectors or recycled, and its individual identity and HP are intentionally disposable. Aggregation and recycling preserve approximate count, enemy definition/composition, threat, population ownership, wave/leader ownership, and broad direction. Neither path calls death or reward hooks.
- **Persistent threats** are selected by `isPersistentThreat`. Elite, Boss, named/featured leaders, active special encounter entities, and priority Elite/Boss definitions never enter ordinary aggregation or recycling. The predicate uses classification plus encounter semantics; it does not depend on one ownership flag.

The main orchestration remains in `HordeDirector`. `PopulationManager` owns ordinary/persistent and 45m/70m density counts, `SpawnPlanner` owns angular and multi-anchor planning, `WaveController` owns atomic reservations, `HordeSectorAggregator` owns far abstraction/movement, and central simulation/progression systems own reward suppression. The existing stage, hard-cap, LOD, instancing, and replication authorities remain in place.

## Nearby pressure targets

Targets are content-authored, schema-validated, and have binding-design fallbacks:

| Phase | Nearby ordinary target |
| --- | ---: |
| Phase 1 | 14–20 |
| Phase 2 | 22–32 |
| Phase 3 | 32–46 |
| Wave 1 | 35–48 |
| Wave 2 | 42–56 |
| Boss | 45–60, including maintenance summons |

Farming targets interpolate across phase progress. Wave targets use the authored range midpoint. The director records global ordinary deficit, nearby ordinary deficit, and deficit duration. The existing technical hard cap remains 300 and was not raised.

Ordinary clear rate is measured over a five-second window and only adjusts ordinary spawn income: 0.85x below 1 kill/s, 1.0x through 4 kills/s, and a bounded ramp up to 1.30x. It does not change caps, attack behavior, movement speed, or specialist proportions.

## Moving aggregate sectors

Eligible far ordinary enemies aggregate by 40m cell, definition, population class, wave, leader, and maintenance/reward metadata. Sectors update at the content replication rate clamped to 1.5–2Hz. Movement blends flow-field direction with a direct tank vector, performs coarse terrain/bounds/reachability validation, attempts an alternate direction, and finally relocates a persistently stuck sector to a valid far/off-camera anchor while preserving count, definition, threat, and ownership.

Sector movement uses aggregate role speeds only; no individual enemy speed values changed. Sectors materialize before interaction range. The network sector record remains append-compatible: `leaderId` and sector flags were added after the original ten fields, and the tactical consumer's existing field positions remain valid.

Because the authoritative server has tank heading but no client camera transform, off-camera planning uses a conservative tank-heading visibility proxy. All selected anchors still pass terrain, safe-zone, obstacle, cliff, bounds, and reachability checks.

## Recycling

Recycling activates only when all of these are true:

1. The nearby ordinary target has a positive deficit for at least two seconds.
2. The global ordinary target is full, including the population-neutral hard-cap case.
3. A source is ordinary, at least 145m away for a sector or 150m for a live entity, and outside the heading visibility cone.
4. A valid off-camera replacement anchor can be committed first.

The token bucket is bounded from 4 to 8 ordinary entities per second. Sector slices are decremented only after the replacement callback succeeds. Live candidates in telegraph, flash, lock, charge, or fire states are excluded. Elite/Boss/persistent entities cannot enter either source list. Recycling directly purges and respawns ordinary pressure without kill, score, XP, chest, objective, drop, combo, or death-presentation routing.

## Multi-anchor atomic packs and rotation

The planner scores eight angular sectors (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`) using live/aggregate counts, recent use, and optional interception bias. It backtracks across sector combinations so a multi-anchor plan is accepted only when every subgroup has a valid anchor.

Six-to-eight entity packs split as `3+3`, `3+2+2`, `3+3+2`, or `4+4` according to formation. Normal subgroups target 90–135 degrees of separation. Subgroup A is immediate, B is delayed 0.12–0.22s, and C is delayed 0.24–0.38s. The pending subgroup queue is capped at 12.

Ambient and wave packs reserve whole-pack entity/threat/cost capacity before subgroup A appears. A later invalid subgroup gets one off-camera replan; if that fails, only its slice is refunded and its composition commitment is rolled back. Wave reservations are cancelled safely on wave completion/purge. Reinforcement selection now advances a deterministic cyclic cursor instead of selecting index zero, while preserving finite reserve affordability and preventing a cheaper later pack from starving the current pack.

## Persistent Elite/Boss recovery

For a persistent threat beyond 120m that fails to close by at least 1.5m:

- 4s stalled: force a route refresh.
- 5s stalled: increase pursuit priority.
- 6s stalled: use the alternate flow/direct pursuit blend.
- 6.5s stalled: as a last resort, re-enter the same entity at a validated 50–70m off-camera anchor.

Re-entry mutates only the existing entity's transform and temporary recovery routing. It preserves ID, HP/maxHP, state timers, status/debuff registry entries, attack/action sequence, encounter ownership, monster/chest guards, reward guards, formation metadata, and minimap identity. It does not replay the encounter intro or reset rewards.

## Maintenance summons and reward suppression

Maintenance policy is bounded as follows:

| Leader | Desired | Hard cap | Batch | Minimum interval |
| --- | ---: | ---: | ---: | ---: |
| Elite | 10 | 16 | 4 | 7.5s |
| Boss | 16 | 24 | 6 | 6s |

When the leader is more than 120m away, the interval becomes 0.85x to keep escape routes pressured. Summons are only requested below the floor and within wave/global/technical capacity. They use the same atomic reservation system, spawn 40–65m around the tank in underfilled/off-camera directions, and weight escape/interception routes.

Ownership now carries `summonedByLeaderId`, `maintenanceSummon`, `rewardSuppressed`, and pursuit priority. Reward suppression is enforced centrally before score, stats, combo, drops, kill presentation, XP, chest rolls, relic triggers, or objective kill routing. Suppressed entities remain damageable combat pressure. Live entities, aggregate sectors, and pending subgroups are purged without death/reward hooks when their leader dies, including one leader in a multi-leader encounter.

## Telemetry

The director/client debug telemetry now exposes:

- global ordinary and persistent counts;
- ordinary within 45m and 70m;
- phase target range, current target, global/near deficits, and deficit duration;
- sector count, update rate, movement progress, relocations, and stuck recoveries;
- recycled units/s and recycle reason;
- eight angular counts and recent anchor directions;
- pending atomic subgroups;
- maintenance summon count;
- persistent recovery stages/re-entry count;
- reward-suppressed kills;
- ordinary clear rate and income multiplier.

These are debug/telemetry additions only; no tactical minimap art or gameplay rarity/UI feedback was changed.

## Benchmark results

`npm run test:horde:benchmark -- --json=C:\Users\Public\recoil-survivor-final.json` passed and produced format 3 evidence. The dedicated pressure benchmark aggregated 240 ordinary entities into 31 sectors, moved sectors 54.133m, and completed 120/120 multi-anchor plans.

| Pressure workload | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Director step | 0.014ms | 0.111ms | 0.932ms |
| Sector step | 0.000ms | 0.103ms | 0.415ms |
| Multi-anchor plan | 0.035ms | 0.119ms | 0.283ms |

Selected baseline-to-final server-step p95 measurements from the same workstation:

| Entities | Baseline scenario | Combat-pressure scenario |
| ---: | ---: | ---: |
| 100 | 0.991 → 0.611ms | 0.543 → 0.390ms |
| 300 | 1.435 → 0.987ms | 1.581 → 0.911ms |
| 500 | 2.821 → 1.567ms | 2.833 → 1.564ms |
| 750 | 12.107 → 2.500ms | 7.200 → 3.071ms |

Snapshot sizes, replication rates, Elite/Boss counts, and bounded state-growth checks remained stable. Timing comparisons are single-process workstation runs and should be treated as directional rather than laboratory measurements.

## Validation and scenario matrix

| Check | Result |
| --- | --- |
| `npm run build` | PASS; Vite client and bundled server built successfully |
| `npm run test:horde` | PASS; 14 files, 120/120 tests |
| `npm run test:netcode` | PASS; 7 files, 44/44 tests |
| `npm run test:progression:hardening` | PASS; 7 files, 53/53 tests |
| `npm run test:progression` | 207/208; one unrelated relic magnet expectation failure |
| Enemy/pressure benchmark | PASS |
| `git diff --check` | PASS |
| `npx tsc --noEmit` | Pressure-director files clean; repository still has the baseline audio typing failures described below |
| Full `vitest run` / `npm test` equivalent | 1,394/1,403 passed; all nine failures are in unrelated or environment-dependent paths described below |

Scenario evidence:

- Phase 1/2/3, Wave 1/2, and Boss: horde director, timer pacing, wave composition, and survivor-pressure suites.
- Sustained fleeing: far recycling, moving-sector recovery, persistent same-entity recovery, interception-biased maintenance, and live two-client round.
- Fast/slow clear: bounded clear-rate income test.
- Single Player: existing local/online parity and single-player suites passed in the full run.
- Driver/Gunner: live two-WebSocket-client production-server soak.
- Rematch: survivor reset test and live same-room rematch passed.
- Reconnect: existing room/arena reconnect coverage passed in the full run; no live reconnect was injected into the soak.

No visual manual play session was performed. The phase/wave/boss and fast/slow/fleeing matrix was qualified through deterministic authoritative simulation, and multiplayer through the real built server and two network clients.

### Two-client soak

The repository verifier was brought up to the current protocol (18), taught to consume the tiered horde replication block, and updated to use production kill count rather than the legacy score table. Against the production server bundle:

- Driver created room `VZN87R`; Gunner joined the second seat.
- Authoritative round duration observed: 107.7s.
- Result: 58 kills, best combo x2, Boss Slayer result.
- Driver received 2,159 snapshots.
- Both clients requested rematch; a fresh match ID, zero score, `moonYard` modifier, and same room were verified.
- Soak result: PASS, 145.1s total verifier time.

Production monster definitions do not use the legacy `scrapBug`/`rammer`/`gunTower` score switch, so score zero with a positive production kill count is expected and unrelated to maintenance reward suppression.

### Pre-existing/unrelated validation failures

- TypeScript: six `ResolvedEnemyAudioProfile`/`Record<string, unknown>` errors in `presentationEventRouter.ts`, plus eight procedural audio test union errors for `tier`/`sizeClass`. These were present at baseline.
- Progression: `relicSystemHardening` expects magnet radius 7.5 but the unchanged relic projection resolves 15.
- Predictor: three unchanged pending-input-count expectations fail.
- Asset characterization: the test expects an empty shipped asset override list, while the base manifest contains four tank model overrides.
- Monster pack importer: two checks require the gitignored local ZIP, which is absent in the isolated worktree.
- XP shard lifecycle: one unchanged manager-size expectation fails.
- Demo golden: behavior, event counts, checkpoints, enemy counts, and scores are identical; the stored golden omits `enemyExplosion.id`, which the existing projectile path emits.

## Explicit exclusions

This implementation does not modify enemy attack patterns, individual speed values, physical scale, minimap art/presence rules, rarity or gameplay UI feedback, chat, or chest beacon behavior. It does not raise the hard cap, preserve ordinary HP through abstraction, proportionally increase dangerous specialists, replay persistent encounter intros, or grant rewards for maintenance pressure.
