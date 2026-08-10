# Relic System Bugfix Report

- Date: 2026-08-07
- Implementation base: `9fe8b8e13f764e6bbf7ed4dca51b02fd17785479`
- Implementation branch: `relic-addition`
- Integrated companion work: complete 28-relic icon catalog and packaged HUD artwork

> Superseded on 2026-08-10: duplicate-to-XP conversion was removed. Owned unique relics are excluded from future offers, and TWIN SHELL now stacks with +1 Cannon shell per stack. References below describe the earlier implementation state.

## Scope and source reconciliation

This implementation reconciles:

- `docs/relic-bug-fix/gpt5.5analysis.md`;
- `docs/relic-bug-fix/RELIC_SYSTEM_BUGFIX_SPEC.md`;
- the earlier Codex runtime/data-flow audit.

The binding unique-relic decision is: an owned unique may roll again, never gains a second stack or capability, and converts that acquisition to the relic definition's XP replacement (currently 250 XP) through the shared authoritative XP path. Unique relics are not removed from the roll pool.

## Deduplicated final bug table

| ID | Problem and root cause | Resolution | Status |
|---|---|---|---|
| R-01 | DOUBLE JUMP projected a stat that shared kinematics never consumed. | Added replicated jump capacity/remaining state, airborne consumption, landing refill, midair acquisition handling, and predictor parity. | Fixed |
| R-02 | AIR MASTER projected a charge but Dash acceptance ignored it; stacks could also imply multiple charges. | Shared kinematics now permits one airborne cooldown bypass per airborne cycle; the capability remains capped at one while air control stacks. | Fixed |
| R-03 | AERIAL MASTER used enemy airborne state and could affect non-gunner sources. | Uses authoritative tank grounded state and a shared MG/cannon source predicate. | Fixed |
| R-04 | APEX PREDATOR used legacy ownership rather than modern monster reward class. | Added one normalized enemy classification helper with modern-first and legacy fallback behavior. | Fixed |
| R-05 | FRIENDLY SHIELD, MOMENTUM SHIELD, and IRON WILL used `1 + reduction`; GLASS CANNON's negative reduction therefore reduced incoming damage. | Reduction math is now `max(0, 1 - percent/100)` at each conditional layer; splash is recognized as cannon self-damage. | Fixed |
| R-06 | PHASE DASH used the cosmetic presentation timer. | Damage immunity now follows authoritative non-inactive Dash gameplay state. | Fixed |
| R-07 | HEAT SINK's modifier changed the resolver, but MG read its frozen weapon definition and timed modifiers were not ticked. | MG reads `weapon.mgDamage` from the resolver and the active simulation ticks timed modifiers once per step. | Fixed |
| R-08 | RAPID RELOAD fired once per splash victim. | Projectile impact emits one semantic cannon-hit trigger after resolving all splash victims. | Fixed |
| R-09 | SAFE HAVEN treated wave purge as wave clear and could double-trigger. | Only semantic `stageEvent.waveCleared` triggers it; wave IDs are deduplicated. | Fixed |
| R-10 | Passive and triggered effects, ROADKILL, and TWIN SHELL did not share one parameter merge rule. | Added template-default then relic-override resolver and routed all effect paths through it. | Fixed |
| R-11 | Projector reset removed a non-matching exact source and could leave ghost modifiers. | Added explicit source-prefix removal and reset/reprojection regression tests. | Fixed |
| R-12 | Unique duplicate XP came from a global value rather than the relic definition. | Relic-specific `duplicateReplacement` is authoritative; global value is only a compatibility fallback. | Fixed |
| R-13 | PHOENIX activation was not represented as a general match-scoped once-state. | Registry owns match-scoped once keys; PHOENIX consumes its key only on a real revive and a new runtime begins unused. | Fixed |
| R-14 | COVERING FIRE could produce negative movement and expired/killed target entries could remain. | Enemy speed clamps at zero; progression prunes expired entries and removes killed-enemy entries immediately. | Fixed |
| R-15 | Damage triggers discarded the authoritative event amount. | The real applied event amount is forwarded to handlers. | Fixed |
| R-16 | Guaranteed leader chest placement was only best effort, and multi-leader waves could reward the wrong leader. | Guaranteed placement searches beyond the local ring with deterministic fallback; only the final co-leader awards one chest per wave. | Fixed |
| R-17 | Random initial placement could finish below ten and discovery placement had no deterministic fallback. | Added deterministic exhaustive fallbacks while preserving placement validity/spacing. | Fixed when the map has sufficient valid capacity |
| R-18 | An obsolete global 1.5% chest-drop field competed with the class-aware policy. | Removed `enemyChestDropChance`; runtime authority remains the content-driven class table. | Fixed |
| R-19 | UNSTOPPABLE's Dash damage modifier leaked into ROADKILL's separate coefficient base. | ROADKILL uses the authored base contact value; active Dash and ROADKILL remain mutually exclusive. | Fixed |
| R-20 | New movement counters were absent from snapshots/prediction state. | Added tank state fields, predictor reconciliation/display sync, and protocol version 15. | Fixed |
| R-21 | Relic failures were difficult to inspect. | Debug state now exposes capability sources, movement charges, Dash/PHASE state, PHOENIX use, SAFE HAVEN wave ID, AERIAL eligibility, debuff count, and last relic result. | Fixed |

## Files changed by this bugfix

Runtime/data:

- `content/progression-definitions/mainStage.json`
- `src/generated/contentPack.generated.ts`
- `src/shared/config.ts`
- `src/shared/types.ts`
- `src/shared/content/schemas/progression.ts`
- `src/shared/enemies/enemyClassification.ts`
- `src/shared/damage/damageTypes.ts`
- `src/shared/damage/damageSystem.ts`
- `src/shared/items/capabilitySystem.ts`
- `src/shared/progression/relicEffectParameters.ts`
- `src/shared/progression/progressionSystem.ts`
- `src/shared/progression/relicChestSpawnDirector.ts`
- `src/shared/progression/relicEffectRegistry.ts`
- `src/shared/progression/relicInventory.ts`
- `src/shared/progression/relicStatProjector.ts`
- `src/shared/projectiles/projectileSystem.ts`
- `src/shared/combat/tankContactCombat.ts`
- `src/shared/rules/contentConfig.ts`
- `src/shared/rules/matchRules.ts`
- `src/shared/sim/matchRuntime.ts`
- `src/shared/sim/tankKinematics.ts`
- `src/shared/stats/statResolver.ts`
- `src/shared/weapons/weaponBehaviors.ts`
- `src/shared/net/protocol.ts`
- `src/client/prediction/sharedTankPredictor.ts`
- `src/client/app/predictionController.ts`

Tests:

- `tests/progression08/relicEffectMatrix.test.ts`
- `tests/progression08/relicUniqueLimits.test.ts`
- `tests/progression08/relicConditionalDamage.test.ts`
- `tests/progression08/relicMovementEffects.test.ts`
- `tests/progression08/relicSystemHardening.test.ts`
- `tests/progression08/relicTriggers.test.ts`
- `tests/progression08/relicChestWorldIntegration.test.ts`
- protocol-version assertions in progression, netcode, Combat 05, and lobby tests.

Concurrent `codex/relic-icons` files (`content/assets/project.json`, `src/generated/presentationContent.generated.ts`, and `public/assets/images/`) are not part of this bugfix and must be scoped separately before committing.

## Automated verification

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run test:progression` | PASS — 29 files, 184 tests |
| `npm run test:netcode` | PASS — 6 files, 33 tests |
| `npx vitest run tests/tankKinematics.test.ts tests/movement tests/combat05` | PASS — 9 files, 107 tests |
| `npm run build` | PASS — client and server production builds |
| Combined relevant gate (`progression08`, netcode, tank kinematics, movement, Combat 05, lobby protocol) | PASS — 45 files, 325 tests |
| `npm test` | 1,255/1,261 passed on the recorded run; one protocol assertion was then updated and passed in isolation. Three stale predictor assertions conflict with the predictor's existing acknowledged-operation retention contract, and two Monster Pack importer tests require a missing local ZIP fixture. These five remaining failures are unrelated to this relic patch. |
| `npm run test:progression:e2e` | 6/9 passed. Remaining failures: an unrelated unloaded environment model, reconnect snapshots compared across the expected spawning→closed lifecycle transition, and a stale fallback-icon assertion while real relic icons were concurrently added. |

No failure was hidden or converted into a skip.

## 28-relic verification matrix

`Effect test` refers to the numbered test in `tests/progression08/relicEffectMatrix.test.ts`, reinforced by focused suites where noted. `Authority` means the effect executes in shared/server-owned logic; it does not claim that two-client manual play was completed.

| # | Relic | Stack policy | Effect test | SP automated | Authority/MP path | Status |
|---|---|---|---|---|---|---|
| 1 | MAGNET CORE | addPercent | 01 + XP shard suite | Pass | Shared resolver/shard system | Working |
| 2 | HEAT SINK | addPercent | 02 + actual MG/expiry/refresh | Pass | Server weapon/resolver timer | Working |
| 3 | COVERING FIRE | addPercent | 03 + 2,000-entry prune stress | Pass | Server debuff registry | Working |
| 4 | DOUBLE JUMP | addFlat + capability | 04 + movement consumption/refill | Pass | Shared authority/predictor state | Working |
| 5 | VAMPIRE ROUNDS | addFlat | 05 + source/parameter tests | Pass | Server kill trigger | Working |
| 6 | FRIENDLY SHIELD | addPercent | 06 + 1x/2x/source boundary | Pass | Server tank damage | Working |
| 7 | HEARTY TANK | addFlat | 07 | Pass | Shared stat resolver | Working |
| 8 | DASH REFUND | addPercent | 08 | Pass | Server dash-hit trigger | Working |
| 9 | AIR MASTER | capability + addPercent | 09 + movement reuse/refill | Pass | Shared authority/predictor state | Working |
| 10 | HE PAYLOAD | addPercent | 10 | Pass | Shared cannon stats | Working |
| 11 | ROADKILL | capability + addPercent | 11 + dedicated contact suite | Pass | Server contact system | Working |
| 12 | AERIAL MASTER | addPercent | 12 + source/class boundary suite | Pass | Server damage using tank state | Working |
| 13 | GROUND POUND | addFlat | 13 + parameter test | Pass | Server landing trigger | Working |
| 14 | MOMENTUM SHIELD | addPercent | 14 + boundary math | Pass | Server tank damage | Working |
| 15 | ARMOR SHRED | addPercent | 15 + killed/expired cleanup | Pass | Server debuff registry | Working |
| 16 | BULLET TIME | addPercent | 16 | Pass | Shared airborne tick | Working |
| 17 | TWIN SHELL | unique | 17 + immutable charge ratio/parameter | Pass | Server weapon burst state | Working |
| 18 | DEATH MARK | addPercent | 18 + source/parameter test | Pass | Server kill/AoE trigger | Working |
| 19 | GLASS CANNON | addPercent | 19 + sign tests | Pass | Server outgoing/incoming damage | Working |
| 20 | SAFE HAVEN | addFlat | 20 + purge/semantic dedupe | Pass | Server stage event | Working |
| 21 | RAPID RELOAD | addPercent | 21 + multi-victim one-shell test | Pass | Server projectile impact | Working |
| 22 | IRON WILL | addPercent | 22 + 50% boundary | Pass | Server tank damage | Working |
| 23 | LAST RESORT | addPercent | 23 + 30% boundary | Pass | Server enemy damage | Working |
| 24 | PHASE DASH | unique | 24 + cosmetic/gameplay separation | Pass | Authoritative Dash state | Working |
| 25 | XP SURGE | addPercent | 25 + XP routing suites | Pass | Shared authoritative XP path | Working |
| 26 | PHOENIX CORE | unique | 26 + once/new-match tests | Pass | Match-scoped server registry | Working |
| 27 | UNSTOPPABLE | capability + addPercent | 27 + ROADKILL isolation | Pass | Shared Dash stats/server contact | Working |
| 28 | APEX PREDATOR | addPercent | 28 + modern/legacy class suite | Pass | Server normalized classification | Working |

## Manual qualification and deferred items

Manual force-grant play for every relic and a dedicated two-client movement/combat session were not completed in this implementation pass. Automated shared-authority, protocol, predictor, production build, and six browser progression scenarios passed, but the three unrelated/stale browser failures listed above prevent marking the full browser/manual gate complete.

No relic logic is intentionally deferred. The following broader QA items remain outside this patch:

- reconcile the pre-existing predictor test expectations with the implemented retained-unacknowledged-input contract;
- restore/provide the local Monster Pack import ZIP fixture for its importer tests;
- fix the unrelated environment asset preload error and update the remaining lifecycle browser assertion;
- repeat manual Single Player and two-client Multiplayer qualification after the concurrent TPS-camera work is integrated.

## Design conflicts resolved

- Unique means inventory/activation uniqueness, not removal from roulette; duplicates convert to relic-defined XP.
- RAPID RELOAD is once per shell impact, not once per damaged target.
- Leader reward is exactly one per wave, after the final co-leader.
- Purge is cleanup only and never a SAFE HAVEN, XP, or chest source.
- AIR MASTER's air-control percentage stacks; its airborne Dash-reuse capability does not.
