# Machine Gun Implementation Report

Date: 2026-08-10
Branch: `feature/final-machine-gun-pass`

## Revision audit

- Starting SHA: `4fd9af32605b04d8ff95f7d11bffc4c72885a988`
- Ending product SHA: `606aa07bd19f3fcbc7096271a172aed82e8841c2`
- Audited `origin/main`: `7717abcaab7a41a0ef2268985f507733d909f58b`
- The implementation was committed on the requested branch at the ending product SHA above. The subsequent report-only commit records that immutable product revision.
- `feature/final-localization-settings-copy` was an ancestor at the same starting SHA. Its implementation had not diverged when this work began; rebase this branch onto the eventual localization/settings integration before final merge.

## Final base weapon

| Stat | Final value |
| --- | ---: |
| Damage | 3 |
| Fire rate | 11 rounds/sec |
| Range | 45 m |
| Spread | 0.012 |
| Recoil impulse | 0.18 |

The Machine Gun remains `weapon.hitscan`. The obsolete `weapon.mgSpeed` compatibility value was removed; there is no bullet-speed/velocity upgrade, projectile entity, client hit authority, or tracer travel mechanic.

## Upgrade pool and rarity bands

The production MG pool contains exactly three multiplier categories. `MG PRECISION` was removed from the manifest and its source definition was deleted. Historical `weapon.mgSpread` presentation metadata remains so old run summaries fail gracefully.

| Category | Common | Rare | Epic | Legendary |
| --- | --- | --- | --- | --- |
| MACHINE GUN POWER | +30–40% | +55–70% | +90–110% | +150–180% |
| MACHINE GUN RANGE | +25–35% | +45–60% | +75–90% | +120–150% |
| MACHINE GUN FIRE RATE | +20–25% | +35–45% | +55–70% | +85–100% |

One card continues to roll one value within its authored rarity band. No Cannon category or Cannon localization was added or changed.

English and Korean upgrade keys use the localization workstream's documented stable schema, including `upgrade.upgrade_weapon_mgRate.name` = `MACHINE GUN FIRE RATE` / `기관총 연사력`.

## Resolution, cadence, and caps

`weapon.mgRate` is canonically rounds per second:

```text
resolvedRate = min(baseRate × 2.25, resolved weapon.mgRate × resolved match.mgRate)
shotInterval = 1 / resolvedRate
```

Thus +100% converts 11/s to 22/s, never 5.5/s. The authoritative fixed-step weapon system carries fractional cooldown overshoot for accurate average cadence and accepts at most one round per simulation tick, so higher rate cannot create a gameplay event backlog.

Intrinsic caps are applied after authored adds/multipliers and explicit clamps:

- damage: 5× base = 15 maximum;
- range: 3× base = 135 m maximum;
- rate: 2.25× base = 24.75 rounds/sec maximum.

Relic and level-up modifiers compose inside `StatResolver`. The match/mode rate multiplier composes afterward, followed by the final 24.75/s bound. This makes the cap effective regardless of whether excess rate came from cards, relics, or a mode.

## Hitscan and visual synchronization

Damage and collision resolve immediately from the authoritative ray. Each accepted shot event carries normalized ray direction plus the actual enemy/barrel hit distance, or the resolved range on a miss. Cosmetic tracers therefore end at exactly the registered hit/range endpoint.

The prior Cannon synchronization work was reviewed:

- `d39d0c3` bypassed delayed interpolation for Cannon shells and extrapolated their real velocity/gravity for at most 120 ms.
- `46a0a57` centralized shared rig geometry and authoritative muzzle alignment.

Projectile extrapolation cannot be copied literally to an instantaneous hitscan ray. The MG solution uses the same shared rig geometry but applies a bounded hitscan-specific correction:

- the first local muzzle flash/audio/recoil is immediate;
- authoritative confirmation suppresses duplicate first-shot transients but still draws the exact tracer;
- ordinary render/network delay reanchors the tracer to the latest visible/predicted muzzle only when origin correction is at most 3 m and the current barrel is within 6 degrees of the authoritative endpoint;
- the authoritative endpoint is never moved;
- a large turret flick falls back to the historical authoritative ray, avoiding a visually aligned but false hit path.

This keeps normal sustained fire attached to the Gunner's current barrel without lying about where hit detection registered.

## VFX architecture

Machine-Gun orchestration is isolated in `src/client/weapons/machineGunPresentation.ts`. It composes generic pooled primitives from `VfxSystem`:

- 64 solid box-geometry streaks (portable thickness, not unsupported line width);
- warm glow/core tracer pair with 70 ms lifetime;
- pooled muzzle flashes and short sparks;
- warm hit flash/sparks plus a small dark impact fleck;
- coalesced camera recoil of 0.028 per shot, capped at 0.12 per 100 ms;
- camera recoil disabled under reduced motion.

At 24.75/s, the expected core/glow overlap is four streak meshes, well below the pool of 64. If a stalled frame nevertheless fills the pool, the oldest streak is recycled for the newest accepted shot rather than allocating or dropping the new shot presentation.

## Audio

`playerMg` now has a stronger crack/body/metal recipe and a 90 ms descriptor. `playerMgImpact` is a dedicated, distance-bounded minor-impact recipe (75 ms descriptor, 72 m maximum distance, lower priority than the player weapon).

The existing AudioManager SFX user-gain chain was not bypassed or modified. A fake-timer 60-second sustained-fire qualification, including a worst-case impact for every round, produced:

| Rate | Shots | Max player-weapon voices | Max minor-impact voices | Dropped requests |
| --- | ---: | ---: | ---: | ---: |
| 11/s | 660 | 2 / 8 | 2 / 8 | 0 |
| 24.75/s | 1,485 | 5 / 8 | 4 / 8 | 0 |

## Verification

Passed:

- `npx tsc --noEmit`;
- `npm run build` (client and server);
- canonical content generation through `npm run build`;
- `npm run demo:write` followed by `npm run test:demo`;
- 25/25 focused final-pass, alignment/presentation, readability, and sustained-audio tests;
- 39/39 Monster Pack tests after exposing the already-present canonical ZIP through ignored `local-imports`;
- focused weapon/progression/audio/netcode coverage, including the existing Cannon projectile presenter regression test.

Full `npm test` result: 1,480 passed, 5 failed (1,485 total). The five remaining failures are in paths unchanged by this branch:

- three DriverPredictor pending-queue expectations (`predictor.test.ts`, `predictorNetwork.test.ts`, `jumpDash.test.ts`);
- one XP-shard cleanup expectation (`xpShardLifecycle.test.ts`);
- one stale baseline assertion that expects the shipped asset manifest to be empty even though it currently contains four tank assets (`baselineCharacterization.test.ts`).

An explicit `git diff --exit-code` confirmed that the related predictor, pickup, manifest, and test paths were not changed by this implementation.

Focused Playwright netcode run: 1 passed, 3 failed. The failure screenshots show the second browser assigned `DRIVER` while the existing harness assumes it is the Gunner; consequently its Cannon/MG input and shared-driving assertions target the wrong role. The e2e specs and seat/network implementation are unchanged on this branch. Unit/integration coverage verifies first-shot suppression, every accepted round, SP/MP stat parity, and independent Gunner/Driver observer delivery at maximum rate.

## Manual and capture notes

No screenshots or video were captured. Automated scenarios cover base data, Common/Legendary band endpoints, combined/repeated modifiers through caps, immediate hitscan damage, misses/hits, maximum sustained rate, Single Player/Multiplayer rule parity, reduced motion, and Gunner/Driver presentation delivery. Interactive Phase 3, Elite, Boss, and card-by-card feel qualification remains a final playtest step because the existing browser crew-role harness did not produce a reliable Gunner session.

## Scope confirmation

- No Cannon category, stat, behavior, or localization was added or modified.
- No Machine Gun velocity/bullet-speed stat or projectile was added.
- No client-side damage authority was added.
- No Ground Pound, boundary, announcement, chat, or chest-beacon work is included.
