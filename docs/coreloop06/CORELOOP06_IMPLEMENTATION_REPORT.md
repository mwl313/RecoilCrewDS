# Core Loop 06 — Implementation Report

Branch: `combat-rework` · Base: completed Combat 05 (no merges/rebase/cherry-picks)

## 1. Initial code audit

`CORELOOP06_CODE_AUDIT.md` (created in M0) recorded:

- Match/round ownership: `MatchRuntime` owns the fixed 1/30 s step; legacy `RoundSystem`/`SpawnDirectorRuntime`/`DemoScoreAttackModeRuntime` drive the 90 s demo loop; total `MatchState.time` was used for spawns.
- Spawning: legacy `SpawnDirectorRuntime` uses `Math.random`, global `s.enemies.filter` scans, and a two-step tower bug.
- Removal: `EnemySystem` filtered dead enemies; purge hooks were introduced with ownership.
- Combat 05 contracts intact: Dash-only contact (`TankContactCombat`), instant turret + click-time aim (protocol v3), zero fall damage, Charge Shot as `weapon.mainCannon`, no Jackpot.
- Full-population scans: enemy separation O(n²), projectile direct-hit/splash, barrel explosion, Dash contact, runtime cleanup O(n·m).
- Client: per-enemy cloned rigs; full enemy array in every snapshot; 20 Hz snapshots.

## 2. Baseline test results

`CORELOOP06_BASELINE_REPORT.md` (M0) recorded the pre-implementation gate: `npx tsc --noEmit`, content generation, `npm run build`, `npm test` all passed (555/570 era; the current suite is 623 tests). Enemy benchmark showed super-linear tick cost:

| Population | Tick p50 (baseline) |
| --- | --- |
| 100 | 0.29 ms |
| 300 | 1.89 ms |
| 500 | 4.86 ms |

## 3. Baseline capacity results

Measured, not assumed: legacy full-rate simulation of 500 enemies costs ~0.96 ms p50 after M5 (O(n²) removed). The selected engineering cap is 300 fully active enemies with far-horde sectors for perceived population up to 500+ (`populationLimits.json`: hardEntityCap 300, aggregateVisualCap 500).

## 4. Stage state machine (M1)

`src/shared/stage/` — `StageDirector`, `FarmingClock`, `stageTypes`. Phases `farming1 → wave1 → farming2 → wave2 → farming3 → bossWave → clear | gameOver`. Countdown starts at 180 s, Wave 1 at 120 remaining, Wave 2 at 60, Boss at 0; countdown pauses during waves; leader death resumes at the exact threshold; boss death clears; tank death game-overs immediately. `totalElapsedTime` is tracked separately.

## 5. Population ownership (M2)

`src/shared/horde/spawnOwnership.ts` — `populationClass`, `waveId`, `leaderId`, `packInstanceId`, `spawnAnchorId`, `purgeOnLeaderDeath`; direct-removal purge with zero reward hooks.

## 6. Wave and boss lifecycle (M2/M3)

`WaveController` allocates wave IDs, designates leaders, opens opening cohorts, spends a finite reinforcement reserve, purges only the matching cohort on leader death, and fires the leader reward once. Boss waves reuse the controller with `completion: clearStage`.

## 7. Purge reward suppression

Purge uses `EnemySystem.purge()` — no XP, drops, kill hooks, Dash/cannon credit, combo, or death-chain reward. Tests prove ambient and other-wave cohorts survive.

## 8. Content schemas (M3)

`src/shared/content/schemas/horde.ts` — `StageSequence`, `FarmingPhase`, `SpawnPack`, `Wave`, `BossWave`, `PopulationLimits`, `SpawnAnchorPolicy`, `HordeNavigationPolicy`, `EnemyLodPolicy`, `HordeReplicationPolicy`, `HordeDirector`, `RewardTable`. Content lives in `content/horde/`; both gameplay modes reference the single `horde.mainStage` definition; `ContentPack` gained registries/getters; `ReferenceValidator` cross-checks every new reference.

## 9. Spawn packs

Five data-driven packs (wandering cluster, vanguard wall, escort ring, reinforcement column, boss guard) with threat/entity costs, formations, anchor requirements, cooldowns, and tags.

## 10. Spawn anchors (M4)

`spawnAnchors.ts` derives perimeter/regional/valley/cliffTop/cliffBottom/accessRoad/elite/boss/specialist anchors from generated arena layout (gates, zones, cliff edges, corridors) in world space. `spawnPlanner.ts` validates visible-near-field, safe zones, capacity, cooldown, terrain tags, and cliff blocking, then lays out deterministic formations. Same seed + authoritative state ⇒ same plan.

## 11. Spatial index (M5)

`enemySpatialIndex.ts` (uniform hash, reusable scratch outputs) backs Dash contact, cannon splash, shell direct hits, barrel explosions, and density steering. O(n²) `movement.separation` was removed and replaced by `movement.densitySteering`.

## 12. Flow-field navigation (M7)

`hordeFlowField.ts` — ~4 m cells over the arena, multi-source BFS from the tank with terrain penalties and cliff walls impassable, region labels, rate-limited refresh (policy 3 Hz) plus forced refresh on tank cell change. `movement.flowSeek` blends flow + direct steering near the tank, and far enemies follow flow primarily. Stuck detection uses progress gating, alternate-direction recovery, and last-resort invisible despawn.

## 13. Instanced rendering (M6)

`instanceSlotPool.ts` + `instancedEnemyRenderer.ts` — bounded 512-slot pool, free-list reuse, per-instance transform/color/death states, one InstancedMesh per source mesh of the archetype model. Fodder (`scrapBug`) routes through instancing; specials keep unique rigs; overflow falls back safely.

## 14. Simulation LOD (M8)

Four authoritative tiers with hysteresis (42/52, 90/105, 145/165) and per-tier frequencies (30/12/3/1.5 Hz), deterministic phase offsets, elapsed-time dt preserving movement distance. Promotion overrides: boss/leader, telegraph/flash, attack states, active knockback. Legacy demo matches keep full-rate simulation.

## 15. Multiplayer replication (M9)

Protocol bumped deliberately to v4. `hordeProtocol.ts` + `hordeReplication.ts` define materialize/despawn/death/near/mid/far/wave/sector records with quantized transforms; near/mid rate-limited, far change-driven coalesced; critical events never delayed. Server emits the horde block (dropping the full enemy array) for enforced-horde matches; client reconstructs and interpolates.

## 16. Far aggregation (M10)

`hordeSectors.ts` merges demotion-eligible tier-3 enemies into sectors (count/threat/ownership/wave preserved, no rewards), materializes them before interaction range (tier2Enter + 10), collapses wave-owned sectors on leader death, and feeds sector tallies into population caps and replication.

## 17. HUD and debug (M11)

Content-driven stage HUD (`hud-stage` nodes: wave label, farming countdown MM:SS, leader HP bar) projected from `HudProjector` (`stage.*` binding paths added). Stage state is replicated to clients via `snapshot.stage`. Horde Debug overlay rows (phase, farming, wave, leader, population, sectors, budget, anchor failures, tier counts) refresh per frame.

## 18. Files added/modified/deleted

Added: `src/shared/stage/*`, `src/shared/horde/{spawnOwnership,waveController,hordeDirector,populationManager,spawnAnchors,spawnPlanner,hordeSectors}.ts`, `src/shared/navigation/hordeFlowField.ts`, `src/shared/spatial/enemySpatialIndex.ts`, `src/shared/net/horde/*`, `src/client/enemies/*`, `content/horde/*`, `content/enemies/scrapBugHorde.json`, tests under `tests/coreloop06` and `tests/horde`, scripts/benchmark-enemies.ts.

Modified: `contentPack`, `contentLoader`, `referenceValidator`, horde/pack schemas, `matchRules`, `legacyDemoRules`, `matchRuntime`, `systemContext`, `enemySystem`/behaviors/runtime, `tankContactCombat`, `projectileSystem`, `protocol`, `room`, client presenter/registry/factory/main/HUD/debug overlay, generated content.

## 19. Protocol changes

`PROTOCOL_VERSION` 3 → 4. Snapshot may carry `horde` (typed replication block) and `stage` (HUD state). Combat 05 action protocol unchanged; tests updated deliberately.

## 20. Generated-content changes

New content categories (`hordeDirectors`, `populationLimits`, `spawnPacks`, `waves`, `bossWaves`, policies, `rewardTables`, `stageSequences`, `farmingPhases`) added to the pack manifest/schema pipeline; `contentPack.generated.ts` and `presentationContent.generated.ts` regenerated with new source hashes.

## 21. Unit/integration/E2E outputs

Executed this session: `npx tsc --noEmit` PASS, `npm run generate:content-pack` PASS, `npm run generate:presentation-content` PASS, `npm run build` PASS, `npm test` **623 passing**, `npm run test:horde` **59 passing** (10 files). The full command gate (demo/e2e/loop/maps/maplab/presentation/netcode/netcode:e2e) has not yet been re-run end-to-end in this session and is listed as pending in BUILD_STATUS.

## 22. Manual verification

Not yet performed for the new horde loop (full core loop to boss clear, two-client soak, 100/150 ms RTT manual runs). Automated fixtures cover stage transitions, purge suppression, spawn determinism, LOD behavior, replication codecs, and sector materialization. Manual steps are documented in `CORELOOP06_AUTHORING_GUIDE.md`/`SMOKE_TEST.md` updates.

## 23. Performance before/after

| Population | Tick p50 before | Tick p50 after (M5) |
| --- | --- | --- |
| 100 | 0.29 ms | 0.17 ms |
| 300 | 1.89 ms | 0.55 ms |
| 500 | 4.86 ms | 0.96 ms |

Enemy snapshot JSON at 500 shrank from ~155 KB to the quantized horde block (tracker `enemyBytes` reported per snapshot; exact two-client numbers pending soak). Client fodder rendering is now draw-call bounded by archetype instead of entity count.

## 24. Selected cap and evidence

hardEntityCap 300, ambient soft 80/100 threat, wave soft 100/120 threat, elite+boss reserve 16, technical reserve 8, aggregate visual cap 500. Evidence: 500-enemy tick p50 ≈ 0.96 ms (legacy full rate) with LOD/sector headroom above that; final release cap requires the two-client soak + client frame budget.

## 25. Known limitations

- `horde.mainStage.enforceStage` remains `false` for the shipped Demo/Single Player modes, so those modes still run the legacy 90 s demo loop; the horde loop is fully tested with enforcement enabled. Flipping enforcement is an intentional integration step requiring a focused golden-demo update.
- Far-horde client visuals (billboards/crowd clusters) are not yet rendered; sector state is replicated and available for a future `farHordeRenderer`.
- Two-client soak, 15-minute population stability, and 100/150 ms RTT manual runs are pending.
- LOD tier 3 still simulates individual far enemies before sector demotion; sector frequency is policy-driven.

## 26. Completion checklist

Implemented and tested: farming countdown 180/120/60/0, wave pause/resume, boss clear, immediate game-over, ambient persistence, cohort tagging/purge isolation, reward suppression, finite reinforcements, data-driven packs, one shared `horde.mainStage`, identical definitions across modes, deterministic terrain-aware anchors, spatial-index area queries, Dash/Charge/fall/Jackpot invariants intact, flow-field movement, instanced fodder, simulation LOD with hysteresis and promotion, tiered/delta replication (protocol v4), sector aggregation/materialization, stage HUD + debug overlay, bounded queues/pools.

Pending: shipped-mode enforcement flip, far-horde client visuals, two-client/manual verification, full command gate re-run, and the four performance/capacity docs (see network/capacity/performance reports).

Final invariant status: the architecture now has one shared authoritative core loop and horde simulation for both Single Player and Multiplayer; farming continuously fills the map, elite-led waves add finite crisis populations, and scalable navigation/simulation/rendering/replication preserve gameplay pressure at distance.
