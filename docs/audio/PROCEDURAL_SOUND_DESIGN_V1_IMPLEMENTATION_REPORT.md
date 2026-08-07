# Procedural Sound Design V1 — Implementation Report

## Repository state

- Starting branch target: current `origin/main`
- Starting SHA: `d307a0c7fd9e29e08e3207c093fdbecc69f8281b`
- Implementation branch: `codex/procedural-sound-design-v1`
- Ending revision: the commit containing this report
- External sound libraries added: none

The separate `codex/dynamic-soundtrack` branch was not merged into `origin/main` at the start of this work. This implementation therefore preserves the current main-branch music path and keeps all SFX buses independent so the soundtrack branch can retain its own fade/filter/duck chain when integrated.

## Modules added

| Module | Responsibility |
| --- | --- |
| `src/client/audio/procedural/proceduralSoundTypes.ts` | Recipe, bus, spatial, tier, debug, and voice-category contracts |
| `src/client/audio/procedural/proceduralSoundMath.ts` | Seeded micro-variation, event seeds, pan, attenuation, and distance filtering |
| `src/client/audio/procedural/proceduralSoundPrimitives.ts` | Reusable THUMP, CRACK, CHIRP, METAL, AIR, RUMBLE, PULSE, and RING synthesis |
| `src/client/audio/procedural/proceduralSoundRecipes.ts` | Semantic sound recipes and their mix/priority descriptors |
| `src/client/audio/procedural/proceduralVoiceManager.ts` | Category/global caps, priority/distance replacement, lifecycle cleanup, and statistics |
| `src/client/audio/procedural/enemyAudioResolver.ts` | Tier/profile recipe resolution, semantic event mapping, landing classification, and legacy mapping |
| `src/client/audio/procedural/hordePresenceAudio.ts` | One continuously reused aggregate horde bed |

`src/client/audio.ts` now coordinates buses, local/world routing, engine texture, music-only reward ducking, charge state, reverb, recipes, horde presence, and debug statistics. Gameplay presentation no longer builds oscillator graphs.

## Audio buses

```text
playerWeaponBus  1.00 ┐
enemyWeaponBus   0.78 ├─> sfxBus 0.90 ─> master ─> compressor ─> destination
impactBus        0.90 │
vehicleBus       0.62 │
worldAmbienceBus 0.35 │
uiRewardBus      0.72 ┘

legacy music/musicGain 0.34 ────────────────────────> master
```

Combat never routes through music gain. `duckForReward()` automates only `musicGain`; SFX bus values are untouched. A deterministic 0.32-second procedural room impulse provides low per-recipe reverb sends.

## Primitive definitions

| Primitive | Construction and use |
| --- | --- |
| THUMP | Sine/triangle downward sweep with exponential decay; body, recoil, armor, landing |
| CRACK | Deterministic noise slice through band/high/low-pass filter; muzzle and impact transient |
| CHIRP | Short oscillator sweep through a band-pass; hostile discharge and warning identity |
| METAL | Two to four short inharmonic CHIRP layers with unequal decay |
| AIR | Filtered noise sweep; pressure, debris, dash, and explosion tails |
| RUMBLE | Low THUMP plus low-passed AIR; bosses, wipeout, and heavy collapse |
| PULSE | Short square/triangle/sine warning or lock tone |
| RING | Compact inharmonic METAL resonance preset |

Every scheduled oscillator and buffer source has an explicit stop time. Semantic voice cleanup also stops and disconnects all registered primitive nodes if the voice is displaced or disposed early.

The shared noise buffer is generated once with a stable LCG. Recipe identity variation uses deterministic seeds with the following bounds:

- pitch: ±4%
- gain: ±3%
- filter center: ±6%
- noise slice: deterministic offset within the shared buffer

## Recipe table

| Family | Recipes | Character |
| --- | --- | --- |
| Player | `playerMg`, `playerCannon` | Dry mechanical TAK; four-layer KRAK/BOOM/WHUMP with charge-scaled body, pressure, brightness, and metal |
| Player impact | `cannonImpact` | Crack, dirt, low body, pressure/debris, optional charged metal |
| Ordinary enemy | `enemyTelegraph`, `enemyRangedFire` | Rising hostile warning; short dirty ZZAK discharge |
| Specialist | `enemySpecialistFire` | Lower chirp/body with wider noise and longer tail |
| Elite | `enemyEliteFire` | Family chirp plus stronger crack, thump, metal, and pressure |
| Boss | `bossTelegraph`, `bossFire`, `bossDeath` | Dedicated multi-stage warning, discharge, and 1.5-second collapse |
| Incoming damage | `enemyProjectileImpact`, `enemyMeleeImpact` | Armor crack/body/metal/residue; separate body-impact family with rammer variant |
| Death | `enemyDeathFodder`, `enemyDeathSpecialist`, `enemyDeathElite`, `bossDeath` | Spam-safe hierarchy with increasing body, rupture, metal, and tail |
| World explosions | `barrelExplosion`, `barrelChainExplosion` | Brittle/noisy barrel identity; lighter chain variant |
| Vehicle | `dash`, `jump`, `landingLight`, `landingHeavy` | AIR/torque/mechanical surge, suspension release, severity-based landing |
| Collision | `wallCollision`, `monsterCollision`, `truckCollision` | Separate hard-wall, body/armor, and heavy truck identities |
| Other | `truckSiren`, `wipeout` | World-space siren and top-priority collapse |

Charge hold preserves the previous finite 160–1,500 Hz sweep and does not introduce a separate full-charge cue from the gameplay client. The legacy 880 Hz full-charge cue remains available through the compatibility entrypoint.

## Semantic event changes

New production presentation events:

- `enemyTelegraph`
- `enemyFire`
- `enemyProjectileImpact`
- `enemyMeleeImpact`
- `bossTelegraph`
- `bossFire`
- `playerCannonImpact`
- `tankLanding`

Because these events cross the client/server boundary, `PROTOCOL_VERSION` was bumped from 17 to 18.

Modern ranged and boss behavior paths emit compact metadata:

- enemy id
- tier
- size class
- presentation profile id
- attack semantic
- attack/event sequence

Enemy projectiles capture the same compact source metadata at fire time, so a later tank/world impact remains resolvable even if the source enemy is gone. Whole enemy definitions are never replicated.

Kill events retain their existing type for HUD/scoring compatibility and now carry tier/size/profile metadata for tier-aware death recipes.

## Legacy mappings

- legacy `towerFire` → specialist enemy-fire family by default
- legacy `rammerTelegraph kind=tower|enemy` → ranged telegraph
- legacy `rammerTelegraph` for rammer/normal → rammer warning
- legacy tower tank hit → dedicated armor impact
- legacy `enemyExplosion kind=cannon` → cannon-impact recipe on the client
- legacy rules pack continues emitting its existing cannon, collision, and landing event vocabulary so Demo golden traces do not gain new production-only events

## Spatialization model

`AudioManager` exposes separate `playLocal()` and `playWorld()` APIs. The active camera updates a listener pose (`x/y/z/yaw`) every rendered frame.

World voices use:

- stereo pan from relative camera yaw (`left < 0`, `right > 0`, centered ≈ 0);
- a reduced rear-pan multiplier to avoid hard side placement behind the camera;
- per-voice gain attenuation;
- per-voice distance low-pass;
- recipe-specific maximum distance and priority culling.

Distance curve:

| Range | Gain/color behavior |
| --- | --- |
| 0–20 m | Full gain, 20 kHz cutoff |
| 20–40 m | Smooth gain reduction, 20 → 10 kHz |
| 40–60 m | Continued gain reduction, 10 → ~6.7 kHz |
| 60–70 m | ~0.52 gain region, toward 5 kHz |
| 70–100 m | Strong attenuation, 5 → 2.5 kHz |
| Beyond recipe max | Cull priorities below 84; preserve boss/major warnings |

## Voice caps and priorities

| Category | Cap |
| --- | ---: |
| Player weapon | 8 (ordinary gameplay never reaches this) |
| Enemy fire | 8 |
| Enemy telegraph | 6 |
| Enemy death | 6 |
| Minor impact | 8 |
| Major explosion | 4 |
| Vehicle | 6 |
| UI/reward | 8 |
| Horde ambience | 1 |
| Global semantic voices | 28 |

Priority order preserves player cannon (100), wipeout/boss death (96–98), boss warning/fire (92/90), elite threats (84), heavy impacts/explosions, ordinary threats, deaths, collisions, then ambience. When full, the manager replaces by lowest priority, then farthest distance, then oldest age. Player cannon cannot be displaced by fodder sound requests.

## Horde ambience

One looped noise source and one triangle oscillator represent aggregate horde presence. The controller accepts nearby count and average distance and maps these bands:

- 0–5: silent
- 6–15: subtle
- 15–30: moderate
- 30–50: strong
- 50+: capped

Primary energy remains in approximately 80–860 Hz at low gain. No per-enemy ambient loop exists.

## Vehicle, landing, and collision

The existing two-oscillator engine remains. Additions are:

- a low-gain speed-linked mechanical harmonic;
- a continuously reused low-passed track/road noise layer;
- a continuously reused, retriggered band-passed drift texture;
- refined AIR/THUMP/METAL dash and jump recipes.

Production simulation captures downward velocity immediately before contact and emits `tankLanding` after the grounded transition. `>= 7.5 m/s` resolves heavy; lower impact resolves light. No integrity/fall-damage mutation was added.

Wall, monster, truck, enemy-projectile, and landing impacts now have distinct routing.

## Debug tooling

In test mode, `window.__recoil.audioStats()` exposes:

- active voice count;
- counts by category;
- dropped voices;
- peak active voices;
- last recipe;
- last world distance and pan;
- horde presence;
- listener pose.

`window.__recoil.audioPlay(recipe)` triggers a deterministic local recipe for tuning.

## Automated validation

Added 19 passing tests across six files:

- primitive scheduled stop and early cleanup;
- deterministic variation and bounds;
- left/right/center pan;
- near/mid/far attenuation and filtering;
- low-priority distance culling while preserving boss priority;
- category cap and drop count;
- boss priority replacement;
- player-cannon protection under global overflow;
- ordinary/specialist/elite/boss fire mapping;
- death hierarchy mapping;
- enemy projectile tank-impact routing;
- cannon-versus-barrel routing;
- landing light/heavy classification and no fall damage;
- bus separation and charge-duration scaling;
- aggregate horde curve;
- legacy mapping;
- production semantic telegraph/fire metadata;
- projectile source metadata and impact semantics;
- kill metadata.

Build results:

- production client build: pass
- production server build: pass
- focused audio, protocol, charge, and legacy weapon suites: 57/57 pass

The full repository suite currently reports unrelated baseline failures already present on `origin/main`, including a missing local Monster Pack ZIP, stale protocol/predictor/relic expectations, and asset-manifest baseline expectations. The Demo golden mismatch is also pre-existing at current main: the current legacy cannon impact already includes a shell id while the stored fixture does not.

## Runtime and dense-horde QA

Focused runtime QA on the production build:

- Main Stage loaded successfully;
- Web Audio unlocked from the boot gesture;
- Single Player entered active combat;
- nine nearby enemies were present in the aggregate horde telemetry;
- player cannon input exercised the local cannon recipe without an error screen;
- the game continued advancing normally.

Synthetic voice-pressure soak:

```text
requests:             5,000
request processing:   5.05 ms
peak active voices:   28
final active voices:  28
dropped/replaced:     4,972
category maxima:      enemy telegraph 6, enemy death 6, major explosion 4
```

The manager was disposed after the soak and cleared all active timers/leases.

The existing Playwright Single Player scenario completed a full 90-second match and rematch, but its final assertion failed on two existing missing-asset 404 console messages. The isolated two-client Gunner scenario reached gameplay but both pages received the Driver seat, so its input assertions could not qualify Gunner audio. These are recorded as baseline test blockers, not counted as successful multiplayer audio QA.

Subjective listening cannot be performed by the automated environment. Frequency/envelope identity was verified structurally and the runtime paths were exercised, but final mix approval still requires a human listening pass on speakers/headphones.

## Remaining follow-ups

1. Human listening/mix pass for MG cadence, partial/full charge, enemy tiers, boss warning/fire, and dense Phase 3 combat.
2. Two-client Driver/Gunner listening pass after the current lobby seat-assignment E2E baseline is corrected.
3. Merge/rebase with the dynamic soundtrack branch and resolve `src/client/audio.ts` by retaining its music chain while keeping these SFX buses; reward duck must remain music-only.
4. Consider a low-quality switch that disables reverb and lowers minor world caps.
5. Add an optional tuning UI over the existing `audioStats`/`audioPlay` hooks if frequent sound iteration is planned.

## Final invariant

The implementation enforces the intended hierarchy: player cannon and critical warnings outrank fodder, world threats carry directional/distance information, individual horde voices remain bounded, and aggregate horde pressure grows without creating per-monster loops.
