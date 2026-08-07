# Relic Chest World Integration Report

## Delivery record

- Branch: `relic-addition`
- Starting `origin/main`: `88bd3807e855f81d3f7486c52a715c5acd6c9700`
- Qualified implementation SHA: `29d7ad5` (`relics: integrate chest presentation and inventory HUD`)
- Main was fetched and used as the rebase baseline. Main was not merged into or from this branch after implementation began.
- Existing 28-relic effect projection, trigger registration, inventory rules, and rarity tables remain authoritative.

## Confirmed production bug and repair

The audit confirmed that the modern `enemy.monster` branch in `ProgressionSystem.onEntityKilled()` awarded XP, emitted its reward event, dispatched triggers, and returned before legacy chest logic. Modern ambient/wave/elite enemies therefore bypassed random chest rolls, and modern wave leaders could bypass the guaranteed leader chest.

Kill rewards now use one normalized, award-once path:

```text
kill → normalize reward class → award XP once → resolve leader/boss policy
     → resolve chest once → emit reward event → dispatch relic trigger
```

`monster.rewardClass` is authoritative for modern monsters. Spawn ownership upgrades wave, special, and boss instances into the corresponding normalized class. Legacy ownership maps through the same path. Per-enemy resolution guards prevent duplicate XP/chest rewards. Purges do not emit kill rewards.

The content-driven drop table is:

| Class | Random chest rate | Notes |
|---|---:|---|
| Ambient | 1% | Modern and legacy normalized path |
| Wave | 2% | Non-leader wave enemies |
| Elite/special | 8% | Generic class metadata; no monster-ID switches |
| Boss | 0% | Current single-stage policy |
| Wave leader | Guaranteed exactly one | Does not also random-roll |

## Content and deterministic placement

`relicChestSpawnPolicies` is a validated content category loaded through the existing pack pipeline. `progression.mainStage` references `relicChestSpawn.mainStage`; there is no second JSON loader.

Settled tuning is implemented exactly: ten starting chests, a 25–55 m discovery annulus, provisional 28 m spacing, 20 ±4 s periodic interval, 35 m periodic stealth distance, 14 active map chests, 20 total map-generated chests, 0.50 s spawn, 2.6 m claim, 0.65 s open, 2.0 s reveal, 0.35 s minimum skip, 2.0 s minimum fully-open life, and 0.45 s despawn.

`RelicChestSpawnDirector` owns placement independently from map generation and uses dedicated deterministic progression streams for initial, periodic, enemy-drop, and periodic-timing decisions. Candidate validation checks finite coordinates, arena bounds, driveable ground, normal slope, cliff walls, obstacles, collision contacts, and chest spacing. A generated production-city integration test verifies exactly ten starting placements and a discovery chest. World map spawning is enabled for generated player-facing Main Stage worlds; static unit-test arenas remain free of automatic production-map content.

Periodic time advances only during active simulation and `playing` flow. Pause time is not accumulated. Failed/capped placement defers without a catch-up burst.

## Authoritative lifecycle and reward sequencing

Replicated chest state uses:

```text
spawning → closed → opening → revealing → open → despawning → removed
```

Every source (`mapStart`, `mapPeriodic`, `enemyDrop`, `waveClear`) begins in `spawning`. Authority alone transitions it to claimable `closed`. Proximity claim is automatic; candidates sort by distance then chest ID. Claim fixes the offer and timestamps, changes flow to `relicOpening`, and pauses gameplay. The relic is acquired and applied once only after the 0.65 s physical opening completes, at reveal start. Reveal has its own two-second timeout, either player can skip after 0.35 s, and resolution cannot reroll or reapply.

The reward protocol is future-ready:

```ts
{
  offerId,
  chestId,
  candidates: [],
  selectionMode,
  selectedIndex,
  resolved
}
```

Production creates one candidate with `automaticSingle` and selected index zero. Three-candidate `chooseOne` state is serialization-tested only; triple-choice UI/gameplay is intentionally disabled. Protocol version 14 records the new lifecycle/offer/acquisition-order snapshot contract.

## Renderer and material fidelity

`RelicChestWorldRenderer` mirrors authoritative snapshots through a chest-ID map and cached `custom.item.relicChest` instances. It reconstructs spawn scale, wall-clock lid progress, open/reveal state, and game-time despawn progress without owning gameplay decisions. Repeated snapshots reuse the existing instance and cannot restart rewards.

Per-instance materials are cloned only because opacity changes during despawn. Base colors, metalness, roughness, textures, and other PBR values are preserved. Gold light remains separate `RelicChestPresentation` VFX and fades independently. Removal disposes presentation geometry/textures and owned material clones while shared GLB geometry remains cached.

## HUD and reveal UI

The persistent right-side owned-relic rail:

- uses stable replicated acquisition order;
- incrementally adds/updates cells rather than rebuilding each frame;
- stacks duplicates in the same cell as `×N`;
- measures the top-right and bottom-right HUD clusters for its available lane;
- uses 42 px cells and 6 px spacing, reducing to 36 px at smaller breakpoints;
- supplies reduced-motion behavior;
- uses the content `iconId`, but renders an intentional neutral geometric fallback while relic icon files are unavailable;
- never exposes raw IDs, emoji, or broken images.

The reveal layer treats the world chest as the only chest. It shows rarity, icon/fallback, label, description, stack/duplicate result, auto timing, and minimum skip timing. It does not create a fake overlay chest.

## Networking, reconnect, and telemetry

Snapshots contain all six retained lifecycle states, wall/game timestamps, fixed candidate offer, resolution flags, relic stacks, and acquisition order. Unit roundtrips cover all states and a three-candidate offer. A production two-client browser test verifies identical ten-chest snapshots and reconnect reconstruction.

Telemetry now includes initial/periodic/enemy/leader spawn counts, claims, unopened terminal count, first-claim time, rolls and drops by reward class, relic/rarity distribution, acquisitions, duplicate conversions, active peak, placement attempts, and placement failures. Terminal unopened capture is idempotent.

## Qualification evidence

Passed:

- `npx tsc --noEmit`
- `npm run generate:content-pack`
- `npm run generate:presentation-content`
- `npm run build`
- `npm run test:demo` (golden unchanged)
- `npm run test:progression` — 130 tests
- `npm run test:netcode` — 33 tests
- `npm run test:horde` — 101 tests
- `npx playwright test e2e/progression-world-chest.spec.ts`
- `npx playwright test e2e/progression-world-chest-multiplayer.spec.ts`
- Existing progression browser group: 6 of 7 passed; the remaining old multiplayer-selection case reports a pre-existing missing `environment.urban.zombie.streetStraight` preload.

The full `npm test` run reached 1,200 passing tests before baseline issues were isolated. After relic-caused failures were repaired, the remaining out-of-scope failures are three driver-predictor pending-count assertions and two Monster Pack importer tests whose expected local ZIP is absent.

In-app visual inspection loaded a real generated 400×400 single-player city at the QA site, confirmed the live Main Stage HUD/world rendered, and found no new console errors; only existing animation fallback notices appeared.

## Known limitations

- Relic icon image assets do not exist yet, so the designed fallback is shown.
- Three-candidate selection is protocol/state-ready but deliberately not player-enabled.
- Automatic map-start/periodic seeding is limited to generated Main Stage worlds. Direct static `MatchRuntime.fromContentPack()` fixtures do not receive city chests; enemy drops and manually spawned lifecycle chests still work there.
- The unrelated urban online-preload error should be repaired separately before treating the older multiplayer-selection E2E group as fully green.
- The unrelated predictor assertions and missing Monster Pack import ZIP keep the repository-wide aggregate command from being fully green; focused required gates pass.
