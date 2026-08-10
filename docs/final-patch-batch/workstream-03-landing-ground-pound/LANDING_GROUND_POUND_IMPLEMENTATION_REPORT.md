# Landing & Ground Pound Implementation Report

## Change identity

- Branch: `feature/final-landing-ground-pound`
- Audit/start SHA: `4fd9af32605b04d8ff95f7d11bffc4c72885a988`
- Pre-rebase feature checkpoint SHA: `0edd863f54364519b6c84a3dc7e9f4092a114b23`
- Ending product SHA after prerequisite rebase: `5f3021aa9efb00c0424b9606115270b9d146c3af`
- Final branch/report SHA: `f58e1b1fb921c06cc295b6a53fafe4d173c56866`
- Binding design: `LANDING_AND_GROUND_POUND_DESIGN.md`

The audit covered `matchRuntime.ts`, `tankKinematics.ts`, shared event types,
progression dispatch and relic parameters, both Ground Pound content definitions,
the presentation router, VFX, procedural audio, camera handling, and the movement,
progression, audio, netcode, and browser test surfaces listed in the workstream.

## Authoritative tracker

`AuthoritativeFallTracker` is owned by `MatchRuntime`, so fall state exists only
inside the authoritative match simulation. It records:

- the previous grounded state;
- the Y at which the airborne interval began;
- the highest authoritative world Y observed during the entire airborne interval.

The tracker samples both the pre-step and post-step Y values. This prevents the
ground clamp on a landing frame from erasing the last airborne position. On the
airborne-to-grounded edge it reports:

```text
fallDistance = max(0, airbornePeakY - landingY)
impactSpeed = max(0, -preLandingVy)
```

Metrics are stabilized to three decimal places at the simulation boundary.
The lifecycle covers ordinary jumps, launch ascent, same-height and lower-ground
landings, and low-ceiling trajectories by keeping the maximum Y rather than the
airborne start Y. Progression pause does not mutate the tracker. Spawn, respawn,
rematch, teleport/reconnect authority initialization, and client authority snaps
use explicit reset semantics, so a position snap cannot become a landing.

There is no fall-damage call in the landing path. Existing collision damage
continues to use its independent collision/crash logic.

## Ground Pound formula

The shared `calculateGroundPound` function is the single formula source. It
rejects unowned relics and falls below 1.5 m, then applies the binding equations:

```text
effectiveFall = max(0, fallDistance - 1.5)
baseDamage = 10 * stacks
fallBonus = min(50, effectiveFall * 5)
damage = baseDamage + fallBonus
radius = min(12, 5 + effectiveFall * 0.65)
knockback = min(12, 4 + effectiveFall * 0.75)
```

Formula results are stabilized to four decimal places for deterministic event
payloads. Additional stacks add 10 internal base damage each; they do not
multiply the fall bonus. The content template exposes the same named tuning
parameters (`minimumFallDistance`, `baseDamagePerStack`, `fallBonusPerMeter`,
the three caps, and the radius/knockback bases and slopes).

Damage remains server/simulation authoritative. Before a landing query, the
enemy spatial index is refreshed because landing dispatch precedes the normal
enemy update. The broad-phase query includes the largest enemy collision radius,
and the exact test is `distance <= shockwave radius + enemy collision radius`.
Ordinary, Elite, and Boss enemies then use the existing damage and impulse rules.
Vertical knockback is held at 1.4; there is no self-damage.

## Event contract

`tankLanding` retains compatibility `value = impactSpeed` and adds explicit:

```ts
{
  type: 'tankLanding';
  x: number;
  y: number;
  z: number;
  value: number;
  fallDistance: number;
  impactSpeed: number;
  kind: 'none' | 'light' | 'heavy' | 'massive';
  groundPound: boolean;
}
```

The landed relic trigger receives `fallDistance`, `impactSpeed`, and the
authoritative impact position. An activated relic emits:

```ts
{
  type: 'groundPoundImpact';
  x: number;
  y: number;
  z: number;
  radius: number;
  damage: number;
  fallDistance: number;
  impactSpeed: number;
  stacks: number;
}
```

The event is emitted once even when no enemy intersects the radius, so both
multiplayer roles receive identical semantic presentation data. The client does
not calculate or apply Ground Pound damage.

## Presentation, audio, and camera

Presentation is separated into `landingPresentation.ts` and
`groundPoundPresentation.ts`.

Landing presentation uses fall distance as the tier classifier: below 2.5 m is
none, 2.5 m is light, 5.5 m is heavy, and 10 m is massive. Impact speed only
modulates intensity. Camera impulse follows the designed 0.12-to-0.65 curve,
allows only a small Ground Pound addition, and hard-caps the combined impulse at
0.72. Reduced motion scales the already-combined camera impulse to 28%.

The paired `tankLanding` event owns exactly one audio recipe and one camera
impulse. When `groundPound` is true it selects `groundPoundImpact`; the semantic
`groundPoundImpact` event owns VFX only. This prevents a heavy landing recipe,
Ground Pound recipe, and two camera impulses from firing independently.

The procedural massive/Ground Pound recipe layers a low thump, short crack,
metal body, low rumble, and air tail. It routes through the existing local SFX
path and SFX bus, preserving the user's SFX gain rather than bypassing it.

## Radius-truthful pooled shockwave

The VFX system owns a fixed pool of 12 ground-ring meshes. Ground Pound uses a
warm inner ring at 72% of the radius and an amber outer ring whose end radius is
the authoritative event radius with no multiplier. The outer ring reaches the
exact radius at 60% of its lifetime, holds that edge briefly while fading, and
returns to the pool after cleanup. A radial terrain-colored debris burst and a
brief pale center flash complete the effect. Existing depth testing remains
enabled, so geometry can occlude the ground effect.

Pool diagnostics expose both the requested end radius and the live ring radius.
Unit and browser tests prove that the live outer edge reaches the authoritative
damage radius and that expired rings are reusable without growing the pool.

Visual evidence:

- [Single Player, 15 m / 12 m capped radius](ground-pound-single-player-15m.png)
- [Multiplayer Driver, 6 m / 7.925 m radius](ground-pound-driver-6m.png)
- [Multiplayer Gunner, matching 6 m event](ground-pound-gunner-6m.png)

## Copy and localization

The relic's authored JSON no longer claims a fixed 3 m radius or fixed damage.
Its effect-aware presenter resolves the active template values and passes these
parameters through the localization extension seam:

```text
minimumFallDistance = 1.5
maximumRadius = 12
baseDamagePerStack = 100 display units
```

The final localized key is `relic.relic_ground_pound.description`; the name key
is `relic.relic_ground_pound.name`. The English copy describes the minimum fall,
height scaling, 12 m cap, and per-stack base damage. The Korean copy describes
the same minimum fall and scaling/cap behavior. Neither locale hardcodes the
obsolete `3 m, 10 damage` behavior.

## Verification

Focused automated results before prerequisite integration:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; only the existing Vite chunk-size advisory |
| `npx vitest run tests/movement` | PASS, 3 files / 30 tests |
| `npm run test:progression` | PASS, 34 files / 222 tests |
| `npx vitest run tests/audio` | PASS, 9 files / 39 tests |
| `npm run test:netcode` | PASS, 8 files / 45 tests |
| `npx playwright test --config=playwright.landing.config.ts` | PASS, 2 browser scenarios |

The isolated browser qualification uses a dedicated port and the existing
server-side test authorization gate. It exercises the requested deterministic
manual-drop matrix in Single Player and validates both multiplayer clients:

| Fall | Stack state | Damage | Radius | Knockback | Landing tier |
| ---: | ---: | ---: | ---: | ---: | --- |
| 2.49 m | relic disabled | n/a | n/a | n/a | none |
| 3 m | 1 | 17.5 | 5.975 | 5.125 | light |
| 6 m | 1 | 32.5 | 7.925 | 7.375 | heavy |
| 10 m | 1 | 52.5 | 10.525 | 10.375 | massive |
| 15 m | 1 | 60 | 12 | 12 | massive |

Formula coverage separately proves rejection at 1.49 m, exact activation at
1.5 m, the 2.49 m owned-relic result, cap behavior at 11.5/15/20 m, and additive
stack behavior. The multiplayer test proves byte-identical Driver/Gunner event
payloads and equality with the Single Player formula output.

The initial full `npm test` run exposed seven unrelated failures. Every one was
reproduced unchanged in a clean detached worktree at the recorded audit SHA:

- `tests/predictor.test.ts` — pre-existing pending-input queue expectation;
- `tests/predictorNetwork.test.ts` — pre-existing pending-input queue expectation;
- `tests/jumpDash.test.ts` — pre-existing pending-input queue expectation;
- `tests/combat05/chargeScaling.test.ts` — pre-existing Double Barrel shell expectation;
- `tests/pickups/xpShardLifecycle.test.ts` — pre-existing manager cleanup expectation;
- `tests/demoRegression.test.ts` — pre-existing golden mismatch;
- `tests/baselineCharacterization.test.ts` — pre-existing shipped-manifest expectation.

The monster-pack importer fixture is an ignored local asset, not repository
content. Its existing ZIP was hard-linked into this worktree for verification;
the importer suite then passed. A fresh feature-branch run completed with 191
test files / 1,487 tests passing and only the same seven baseline failures.
Final post-rebase results are appended below.

## Scoped exclusions

- No fall damage was added.
- No machine-gun, arena-boundary, announcement, chat, or chest-beacon behavior
  is implemented by this workstream.
- The browser drop control is test-only. Multiplayer use is server-authoritative
  and gated by the existing `ALLOW_TEST_DAMAGE` test permission.
- The workstream does not introduce external SFX files or a client damage path.

## Final integration and post-rebase verification

The branch was rebased after localization, boundary, and Machine Gun. Conflict
resolution preserved the localized presentation callback, the Machine Gun
event/audio paths, and the final Ground Pound tuning. TypeScript, 112 focused
cross-workstream tests, and both Single Player and Driver/Gunner browser flows
passed before the no-fast-forward integration merge.
