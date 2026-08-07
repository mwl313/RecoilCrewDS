# Codex Prompt — Implement Procedural Sound Design V1

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target:

```text
current origin/main
```

Binding design:

```text
docs/audio/PROCEDURAL_SOUND_DESIGN_V1.md
```

## Mission

Replace the current placeholder-like combat SFX structure with a coherent procedural sound-design system using the Web Audio technology already in the project.

Do **not** import a generic sound library.

The game already has:
- oscillators;
- noise;
- filters;
- gain envelopes;
- compressor;
- layered reward sounds;
- engine synth;
- semantic gameplay events.

Use those tools properly.

The target is a consistent sound language:

```text
PLAYER:
heavy, mechanical, pressure-driven

MONSTERS:
hostile, synthetic, unstable, directional

UI/REWARDS:
clean digital-industrial
```

---

# 1. Audit current main first

Run:

```bash
git fetch --all --prune
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

Inspect at minimum:

```text
src/client/audio.ts
src/client/audio/
src/client/app/presentationEventRouter.ts
src/client/app/gameClient.ts
src/client/app/cameraManager.ts
src/shared/types.ts
src/shared/enemies/enemyBehaviors.ts
src/shared/enemies/enemyBehaviorRegistry.ts
src/shared/content/schemas/enemy.ts
src/shared/damage/damageSystem.ts
src/shared/projectiles/projectileSystem.ts
src/shared/sim/matchRuntime.ts
src/shared/monsters/
src/client/settings/
src/client/netcode/
```

Also inspect:
- soundtrack controller if already merged;
- reward ducking;
- audio tests;
- UI/reward sound code;
- Horde Density V1 telemetry if merged;
- current browser test hooks.

Record starting SHA.

---

# 2. Preserve existing good systems

Do not regress:
- reward roulette audio;
- relic lock audio;
- results cue;
- soundtrack music-context/muffling system if merged;
- reward music ducking;
- engine responsiveness;
- local Gunner immediate presentation;
- authoritative duplicate suppression.

Combat SFX architecture should integrate around these systems.

---

# 3. Create reusable procedural primitives

Implement reusable helpers equivalent to:

```text
THUMP
CRACK
CHIRP
METAL
AIR
RUMBLE
PULSE/RING
```

Suggested module:

```text
src/client/audio/procedural/proceduralSoundPrimitives.ts
```

Do not leave oscillator construction duplicated across dozens of recipe functions.

Primitives must:
- create short-lived nodes;
- schedule envelopes;
- stop sources;
- route to supplied destinations;
- support deterministic micro-variation.

---

# 4. Create semantic sound recipes

Move gameplay sound identity into recipe functions.

Recommended:

```text
playPlayerMg
playPlayerCannon
playCannonImpact

playEnemyTelegraph
playEnemyRangedFire
playEnemyProjectileImpact
playEnemyMeleeImpact
playEnemyDeath

playBossTelegraph
playBossFire
playBossDeath

playBarrelExplosion

playDash
playJump
playLanding
playCollision
```

Recipes call primitives.

Gameplay routing must not know oscillator graph details.

---

# 5. Split audio buses

Create sensible SFX buses:

```text
playerWeaponBus
enemyWeaponBus
impactBus
vehicleBus
worldAmbienceBus
uiRewardBus
→ sfxBus
→ master
```

If soundtrack system is present:
- preserve its independent chain;
- do not route combat SFX through music filtering/ducking.

Existing reward duck should still operate on the music duck bus only.

---

# 6. Player MG redesign

Implement design recipe:

```text
short CRACK:
~1.8–2.6 kHz

body:
~170 → ~95 Hz
~30–45ms

optional tiny metal snap
```

Use tiny deterministic variation:
```text
±3–5% pitch
±2–4% gain
```

Keep rapid-fire response.

Do not turn MG into a huge explosion.

---

# 7. Player cannon redesign

Implement layered cannon:

```text
CRACK
2–4 kHz
20–35ms

BODY
~105–135 Hz → ~35–45 Hz
~350–450ms

MECHANICAL
~220–280 → ~80–110 Hz
~100–160ms

PRESSURE
lowpass noise
~900–1200 → ~100–140 Hz
~350–550ms
```

Tune listening-wise, but preserve the four-layer architecture.

---

# 8. Charge Shot

Use same cannon DNA.

Scale with `chargeRatio`:
- sub/body weight;
- pressure duration;
- crack brightness;
- metal accent.

Do not simply multiply final gain.

Full charge:
- additional metallic snap;
- strongest low body;
- longest controlled tail.

---

# 9. Improve charge hold/full-state audio

Audit current charge loop.

If full charge can be held indefinitely:
- rising sweep must transition into a stable held-full state;
- no endlessly restarting/rising oscillator.

Full-charge confirmation:
- short high lock cue;
- optional low pulse.

---

# 10. Enemy semantic event cleanup

Current production monsters still collapse ranged presentation into legacy:

```text
towerFire
rammerTelegraph
```

Fix this.

Preferred semantic events:

```text
enemyTelegraph
enemyFire
enemyProjectileImpact
enemyMeleeImpact
bossTelegraph
bossFire
```

or an equivalent typed `enemyAudioCue`.

The client must be able to distinguish:
- ordinary ranged;
- specialist;
- elite;
- boss;
- rammer/charge;
- melee impact.

Preserve compatibility mapping for legacy Demo events.

---

# 11. Enemy metadata resolution

For audio recipe resolution, use:
- enemy id lookup;
- tier;
- sizeClass;
- presentation profile;
- attack semantic.

Do not send whole definitions over wire.

If latest client enemy state can reliably resolve tier/profile:
- event id is enough plus semantic kind.

If not:
- add compact tier/profile metadata.

---

# 12. Ordinary ranged monster shot

Implement hostile `ZZAK` family:

```text
CHIRP:
~1300–1600 → ~350–500 Hz
70–100ms

CRACK:
~2.5–3.5 kHz
20–30ms

BODY:
~170–210 → ~110–140 Hz
50–80ms
```

Short and aggressive.

Do not use a clean laser pew.

---

# 13. Specialist ranged shot

Same family, heavier:

```text
chirp lower
~1050–1250 → ~230–320

body lower
~120–150 → ~65–90

slightly wider noise
slightly longer tail
```

---

# 14. Elite ranged shot

Add:
- low THUMP;
- METAL resonance;
- stronger crack;
- small pressure tail.

It must read as the same enemy technology but higher threat.

---

# 15. Boss telegraph and boss fire

Boss telegraph:
- sub pulse;
- rising hostile sweep;
- high lock tone;
- optional tiny pre-fire vacuum moment.

Boss fire:
- dedicated recipe;
- low THUMP;
- CHIRP;
- CRACK;
- METAL;
- short RUMBLE/AIR tail.

Do not make boss fire just a louder elite recipe.

---

# 16. Rammer telegraph

Give rammer a separate warning family:

```text
low distorted/square pulse
~170–220 Hz

sub thump
~70–90 Hz

short rising noise scrape
```

Do not share with ranged warning.

---

# 17. Enemy projectile impact on tank

Create dedicated armor impact.

Use:
- metal/noise crack;
- low thump;
- short metal ring;
- small hostile chirp residue.

Resolve impact scale based on:
- source tier;
- damage magnitude;
- boss flag.

Do not route modern enemy hits through generic `collision`.

---

# 18. Monster melee hit

Create separate melee-on-armor recipe.

Small:
- short body + metal.

Large:
- lower/longer.

Rammer:
- strongest ordinary body-impact family.

Use semantic event routing.

---

# 19. Cannon impact

Stop using generic `enemyDeath`.

Implement:
- crack;
- mid dirt;
- low body;
- pressure/debris;
- optional metal.

Scale with:
- charge ratio;
- splash radius;
- visual scale if available.

---

# 20. Barrel explosion

Dedicated barrel recipe:
- sharper transient;
- noisier flame/debris;
- lighter mechanical body than cannon;
- small sub.

Chain reaction must respect voice cap.

---

# 21. Enemy death hierarchy

Resolve:
```text
fodder
specialist
elite
boss
```

Fodder:
- very short;
- spam-safe.

Specialist:
- stronger rupture + metal.

Elite:
- sub + rupture + metal + longer tail.

Boss:
- multi-stage ~1–1.5s collapse.

Boss death must have top death priority and should suppress/drop low-priority fodder death voices around it.

---

# 22. Spatial audio

Implement `playWorld` vs `playLocal`.

World SFX:
- enemy fire;
- enemy warning;
- enemy death;
- impacts;
- barrel explosions;
- truck;
- distant crashes.

Local:
- own MG;
- own cannon;
- UI;
- reward;
- engine.

Add listener pose API driven from active camera.

---

# 23. Stereo panning

Use `StereoPannerNode` or equivalent cheap path.

Pan from source direction relative to camera yaw.

Tests:
- left -> negative;
- right -> positive;
- center -> ~0.

No expensive full HRTF requirement.

---

# 24. Distance attenuation and low-pass

Per world voice:

```text
near:
full gain/full spectrum

mid:
reduced gain

far:
lower gain + lower cutoff

beyond max:
culled if low priority
```

Recommended distance-color curve from design.

Boss/major explosion max range may be larger.

---

# 25. Voice manager

Implement global voice manager.

Required:
- category caps;
- priority;
- distance-aware replacement/drop;
- active voice stats.

Initial caps:

```text
enemy fire ~8
enemy telegraph ~6
enemy death ~6
minor impact ~8
major explosion ~4
global procedural combat ~24–32
```

Player cannon must outrank fodder sounds.

Boss warnings must outrank fodder sounds.

---

# 26. Deterministic micro-variation

Replace uncontrolled sound identity randomness.

Use seed from:
- enemy id;
- shell id;
- attack sequence;
- event sequence.

Variation bounds:
```text
pitch ±3–5%
gain ±2–4%
filter ±5–8%
```

Same seed -> same variation in tests.

---

# 27. Horde presence audio

Add one aggregate horde ambience voice/controller.

Inputs:
- nearby enemy count;
- average distance if easy;
- perhaps role mix.

Density bands:
```text
0–5 silent
6–15 subtle
15–30 moderate
30–50 strong
50+ capped
```

Build from:
- lowpass noise;
- low oscillator modulation;
- occasional subtle transient.

No per-monster ambient loops.

---

# 28. Engine texture

Keep existing engine core.

Optionally add:
- grounded speed-linked low noise rumble;
- tiny mechanical harmonic.

Do not over-scope into a complete vehicle simulator.

---

# 29. Dash and jump

Refine existing effects using new primitives.

Dash:
```text
AIR + torque THUMP + mechanical snap
```

Jump:
```text
mechanical release + low THUMP + small AIR
```

---

# 30. Landing cue

Add a presentation-only landing event.

Capture stable impact severity.

Implement:
```text
landingLight
landingHeavy
```

No fall damage.

Heavy landing:
- stronger thump;
- metal;
- small dirt/noise.

---

# 31. Drift

Audit current per-hit drift noise.

Prefer reusable/retriggered continuous scrape model if current event rate is noisy.

Keep:
- low gain;
- bandpassed noise;
- speed/intensity scaling.

Avoid harsh white-noise hiss.

---

# 32. Collision semantics

Separate:
- wall crash;
- monster collision;
- truck collision;
- enemy projectile impact;
- landing.

Do not keep one generic collision sound for all.

---

# 33. Procedural room/reverb

Optional but recommended.

Generate short 0.25–0.40s decay impulse.

Use Convolver send.

Low send for:
- MG.

More for:
- cannon;
- explosions;
- boss.

Disable in low-quality mode if necessary.

---

# 34. BGM/reward compatibility

If soundtrack system is merged:
- preserve track fade/filter/context/duck bus split;
- do not modify soundtrack gain from SFX code.

Reward ducking:
- still ducks music only;
- does not duck combat SFX unless an existing design intentionally does so.

Reward SFX remain clean and readable.

---

# 35. Legacy compatibility

Map old events safely.

Examples:

```text
towerFire
→ enemyFire legacy tower profile

rammerTelegraph kind=tower/enemy
→ enemyTelegraph legacy profile

rammerTelegraph normal
→ enemyChargeTelegraph
```

Do not break legacy/demo regression fixtures while production moves to new semantics.

---

# 36. Debug tooling

Expose development stats:

```text
active voices
voice counts per category
dropped voices
last recipe
last world distance
last pan
horde presence amount
```

Optionally add debug recipe trigger.

This is important for tuning.

---

# 37. Automated tests

Implement all binding tests from the design:

- primitive cleanup;
- voice caps;
- priority replacement;
- pan;
- attenuation;
- distance filtering;
- seeded variation;
- semantic enemy recipe resolution;
- enemy tank-impact path;
- cannon impact path;
- death tiers;
- landing;
- reward/music compatibility;
- legacy mapping.

---

# 38. Manual QA

Run dense Main Stage combat.

Test all major sounds:
- MG;
- cannon;
- Charge Shot;
- cannon impact;
- barrel chain;
- rammer;
- ranged fodder;
- specialist;
- elite;
- boss;
- tank hit;
- melee hit;
- deaths;
- dash;
- jump;
- landing;
- wall/truck collisions.

Run both Single Player and Multiplayer.

For Multiplayer:
- verify local player weapon sounds do not duplicate;
- enemy sounds remain authoritative/world-space;
- Driver/Gunner both hear consistent enemy threat cues.

---

# 39. Performance soak

In Horde Density V1 Phase 3/Wave 2:
- monitor active audio voices;
- dropped voices;
- JS frame time;
- AudioContext stability.

Do not allow hundreds of oscillators to accumulate.

No node/timer leaks after:
- rematch;
- results;
- return menu;
- reconnect;
- repeated progression pauses.

---

# 40. Implementation report

Create:

```text
docs/audio/PROCEDURAL_SOUND_DESIGN_V1_IMPLEMENTATION_REPORT.md
```

Include:
- starting/ending SHA;
- modules added;
- buses;
- primitive definitions;
- recipe table;
- semantic event changes;
- legacy mappings;
- tier/size resolution;
- spatialization model;
- distance curve;
- voice caps/priorities;
- horde ambience behavior;
- landing implementation;
- soundtrack/reward compatibility;
- automated tests;
- manual listening results;
- dense-horde audio soak metrics;
- remaining sound follow-ups.

---

# 41. Forbidden shortcuts

Do not:
- import a generic SFX library;
- keep one `towerFire` sound for all production monsters;
- keep cannon impact mapped to `enemyDeath`;
- play unlimited voices;
- create per-enemy horde ambience;
- use huge random pitch ranges;
- make bosses just louder;
- route all SFX directly into master;
- add fall damage;
- break soundtrack/reward buses;
- regress Gunner duplicate suppression.

Definition of done is the full checklist in the binding design.
