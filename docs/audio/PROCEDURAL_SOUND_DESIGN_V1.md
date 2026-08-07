# Recoil Crew — Procedural Sound Design V1
## A consistent, expressive combat sound system built entirely from the existing Web Audio foundation

**Status:** Binding audio-design and implementation specification  
**Repository:** `mwl313/RecoilCrewDS`  
**Target:** current `origin/main` at implementation time  
**Scope:** combat SFX, monster SFX, vehicle SFX, impact SFX, spatial audio, audio mixing, voice management, and horde ambience  
**External SFX library:** **not required and not desired for V1**  
**Soundtrack:** preserve the separate long-form BGM system and its reward ducking/context filtering if already merged

---

# 0. Product goal

Recoil Crew should have a sound identity that is as recognizable as its visual identity.

The game already has:
- procedural oscillators;
- generated noise;
- Biquad filters;
- gain envelopes;
- a dynamics compressor;
- layered reward sounds;
- a continuous engine synth;
- semantic gameplay events.

The problem is not lack of raw audio technology. The problem is that current combat sounds are mostly isolated one-off sketches rather than a coherent sound language.

Examples of current structural weaknesses:
- modern ranged monsters and boss ranged attacks still collapse into the legacy `towerFire` presentation event;
- ordinary ranged telegraphs reuse `rammerTelegraph`;
- cannon impact reuses the generic `enemyDeath` sound;
- modern enemy projectile damage has no dedicated tank-impact audio path;
- most world sounds go straight to the master bus with no useful spatial panning or distance coloration;
- high-density combat can potentially emit too many simultaneous voices.

V1 should convert the existing Web Audio system into a deliberately designed procedural sound engine.

Core rule:

> Recoil Crew should sound physical, mechanical, hostile, and exaggerated — not like a collection of placeholder bleeps.

---

# 1. Acoustic identity

Use three strongly differentiated sound languages.

## 1.1 Player tank

Keywords:

```text
mechanical
heavy
pressure
steel
low-frequency authority
broad spectrum
physical
```

Player weapon sounds should communicate mass.

A player cannon should sound like a several-ton vehicle firing a large weapon, not a generic sci-fi blaster.

---

## 1.2 Monsters

Keywords:

```text
hostile
synthetic
unstable
sharper
inharmonic
directional
alien/mechanical
```

Monster sounds should remain clearly distinct from player weapons.

Even if both use oscillators and noise, the frequency shapes and envelopes should create an immediately recognizable enemy family.

---

## 1.3 UI / progression / rewards

Keywords:

```text
clean
digital-industrial
precise
high-contrast
rewarding
```

The current reward sounds are already the strongest procedural family in the project because they combine:
- sub tones;
- filtered-noise transients;
- higher harmonic accents;
- rarity-dependent layering.

Preserve that language.

Combat should learn from the reward system's layering discipline without copying its musical character.

---

# 2. Design philosophy

Do not design every sound independently.

Build a small vocabulary of reusable sound primitives and combine them into semantic recipes.

The same primitive should appear in multiple related sounds so the game develops acoustic consistency.

Recommended reusable procedural primitives:

```text
THUMP
CRACK
CHIRP
METAL
AIR
RUMBLE
PULSE
RING
```

Each primitive is a small helper, not a complete gameplay sound.

---

# 3. Procedural primitive library

Create a reusable synthesis layer.

Recommended location:

```text
src/client/audio/procedural/
```

Suggested files:

```text
proceduralSoundPrimitives.ts
proceduralSoundRecipes.ts
proceduralSoundTypes.ts
```

The exact source layout may follow current repo conventions.

---

# 4. Primitive: THUMP

Purpose:
- body;
- weapon weight;
- armor impact;
- low physical hit;
- recoil;
- heavy UI impact when appropriate.

Typical construction:

```text
oscillator:
sine or triangle

frequency:
start 80–180 Hz
rapid fall to 30–80 Hz

duration:
80–500 ms

gain:
fast attack
exponential or shaped decay
```

Example helper concept:

```ts
thump({
  at,
  frequencyStart,
  frequencyEnd,
  duration,
  gain,
  destination,
});
```

Use sine when very clean/sub-heavy.

Use triangle when slightly more mechanical mid-body is needed.

---

# 5. Primitive: CRACK

Purpose:
- projectile muzzle transient;
- gunshot attack;
- impact transient;
- debris break;
- armor strike.

Construction:

```text
generated noise buffer
→ bandpass or highpass filter
→ very short gain envelope
```

Typical:

```text
center frequency 1.5–4.5 kHz
duration 15–80 ms
Q ~0.6–1.5
```

Avoid long white-noise bursts for every weapon.

A crack should be fast.

---

# 6. Primitive: CHIRP

Purpose:
- hostile energy weapon identity;
- electronic warning;
- lock-on cue;
- enemy projectile discharge.

Construction:

```text
square / saw / triangle oscillator
frequency ramp
short gain envelope
optional bandpass
```

Monster weapon family should often use:

```text
high → low
```

for discharge.

Telegraphs often use:

```text
low → high
```

to imply increasing danger.

---

# 7. Primitive: METAL

Purpose:
- tank chassis;
- armor hit;
- heavy impact;
- cannon mechanical layer;
- debris;
- elite/boss attack authority.

Construction:

2–4 short inharmonic oscillators, for example:

```text
410 Hz
690 Hz
1,070 Hz
1,610 Hz
```

Do not tune them into a clean chord.

Use:
- different durations;
- short decays;
- slight detune.

Typical total:

```text
60–300 ms
```

The result should read as resonant steel, not a musical arpeggio.

---

# 8. Primitive: AIR

Purpose:
- pressure;
- dash;
- explosion tail;
- projectile fly-by;
- cannon pressure wave;
- large movement.

Construction:

```text
noise
→ bandpass or lowpass
→ moving filter cutoff
→ gain envelope
```

Examples:

Dash:

```text
900 Hz → 2,400 Hz
short rising sweep
```

Explosion tail:

```text
1,200 Hz → 120 Hz
long downward lowpass
```

---

# 9. Primitive: RUMBLE

Purpose:
- boss attack;
- wipeout;
- heavy explosion;
- horde presence;
- massive vehicle event.

Construction:

```text
low-passed noise
+
sub sine/triangle
+
slow modulation
```

Keep it subtle when used continuously.

Do not continuously occupy the sub range at high gain.

---

# 10. Primitive: PULSE / RING

Purpose:
- warning tones;
- lock-on feedback;
- machine state;
- reward/UI accents.

Use short harmonic tones.

Combat warning pulses should not sound as clean or musical as reward UI.

---

# 11. Central sound recipes

Create explicit recipes for semantic sound events rather than writing oscillator graphs directly inside a giant `switch`.

Recommended shape:

```ts
interface ProceduralSoundRecipeContext {
  now: number;
  intensity: number;
  tier?: 'fodder' | 'specialist' | 'elite' | 'boss';
  sizeClass?: 'small' | 'medium' | 'large';
  distance?: number;
  seed?: number;
  chargeRatio?: number;
  damage?: number;
}
```

Recipes should call primitives.

Examples:

```ts
playPlayerCannon(ctx)
playEnemyRangedFire(ctx)
playEnemyProjectileImpact(ctx)
playEnemyDeath(ctx)
```

Do not make gameplay code know oscillator details.

---

# 12. Audio bus architecture

If the new soundtrack system is already merged, preserve its dedicated music chain.

Combat audio should use a separate SFX structure.

Recommended graph:

```text
                       ┌─ playerWeaponBus
                       ├─ enemyWeaponBus
                       ├─ impactBus
SFX recipes / voices ──┼─ vehicleBus
                       ├─ worldAmbienceBus
                       └─ uiRewardBus
                              ↓
                           sfxBus
                              ↓
                       master compressor
                              ↓
                         destination
```

Music remains separate:

```text
soundtrack
→ soundtrack fade/context/filter/duck chain
→ master
```

Do not route combat SFX through the music duck/context filter.

---

# 13. Suggested bus relative levels

Initial targets, subject to listening:

```text
playerWeaponBus       1.00
impactBus             0.90
enemyWeaponBus        0.78
vehicleBus            0.62
worldAmbienceBus      0.35
uiRewardBus           0.72
```

These are gain relationships, not absolute final loudness.

The player weapon family must remain dominant.

---

# 14. Master dynamics

Keep the master compressor, but audit settings.

Goal:
- prevent clipping;
- allow cannon/impact transients to punch;
- avoid making everything equally loud.

Do not over-compress into a flat wall.

If the existing default compressor is adequate, preserve it.

If tuning:
- mild ratio;
- moderate threshold;
- fast-ish attack;
- controlled release.

Document changes.

---

# 15. Player machine gun recipe

Target character:

> dry mechanical `TAK`, repeated rapidly.

Layers:

## Layer A — crack

```text
bandpassed noise
center ~1.8–2.6 kHz
duration ~18–28ms
```

## Layer B — body

```text
triangle or square
~170 Hz → ~95 Hz
duration ~30–45ms
```

## Layer C — optional tiny metal snap

```text
~700–1,200 Hz
duration ~15–25ms
low gain
```

Variation per shot:

```text
pitch ±3–5%
gain ±2–4%
filter ±5%
```

Do not use large random variation.

Cooldown/voice guard:
- preserve high fire rate;
- avoid duplicate local + authoritative playback;
- category voice limiting should not make the MG randomly disappear at ordinary fire rates.

---

# 16. Player cannon recipe

The cannon is a signature sound.

Target character:

> `KRAK — BOOM — WHUMP`

Use four layers.

## A. CRACK

```text
filtered noise
2–4 kHz
~20–35ms
high initial attack
```

## B. BODY

```text
sine
~105–135 Hz
→ ~35–45 Hz
~350–450ms
```

## C. MECHANICAL

```text
triangle / restrained saw
~220–280 Hz
→ ~80–110 Hz
~100–160ms
```

## D. PRESSURE TAIL

```text
lowpass noise
~900–1,200 Hz
→ ~100–140 Hz
~350–550ms
```

Optional:
- very small room-send;
- short METAL resonance.

Do not simply increase gain versus the current cannon.

Improve spectral layering.

---

# 17. Charge Shot scaling

Charge Shot remains the cannon family.

Do not create a completely different unrelated sound.

Let:

```text
chargeRatio 0 → 1
```

scale:

```text
sub gain
body duration
pressure-tail duration
metal transient strength
high crack brightness
```

Suggested behavior:

```text
0.0:
normal cannon

0.25:
slightly deeper / broader

0.50:
noticeably larger

0.75:
heavy sub + longer pressure

1.0:
maximum body
additional high metallic snap
longest pressure tail
```

Do not scale volume linearly to dangerous clipping.

Use perceptual layering.

---

# 18. Cannon charge loop

Current charge sound already uses a rising oscillator/filter.

Keep the general concept, but refine it.

Desired:

```text
start:
low mechanical energy hum

mid:
increasing band energy

full:
stable locked high-energy state
```

Avoid an endlessly restarting sweep.

If the current charge state can remain held at full:
- transition to a stable full-charge loop/tone;
- do not keep rising forever.

Full-charge cue:
- short sharp lock tone;
- subtle low pulse;
- no excessive musical flourish.

---

# 19. Ordinary ranged monster fire

This is the most important enemy-SFX fix.

Target character:

> short hostile synthetic `ZZAK`.

Layers:

## A. CHIRP

```text
square or saw
~1,300–1,600 Hz
→ ~350–500 Hz
~70–100ms
```

## B. CRACK

```text
noise bandpass
~2.5–3.5 kHz
~20–30ms
```

## C. BODY

```text
triangle
~170–210 Hz
→ ~110–140 Hz
~50–80ms
```

Result:
- synthetic but dirty;
- unmistakably hostile;
- short enough for many simultaneous enemies.

Do not make it a clean laser `pew`.

---

# 20. Specialist ranged fire

Same genetic family as ordinary ranged fire.

Change:

```text
chirp:
~1,050–1,250 Hz → ~230–320 Hz

body:
~120–150 Hz → ~65–90 Hz

noise:
slightly wider / longer

tail:
slightly longer
```

Target character:

> heavier hostile discharge.

Do not create unrelated sound branding.

---

# 21. Elite ranged fire

Same family, clearly more dangerous.

Add:

```text
THUMP:
~70–90 Hz
~150–220ms

METAL:
2–3 short inharmonic tones

CRACK:
stronger

AIR:
small pressure tail
```

Target hierarchy:

```text
fodder      = short
specialist  = heavier
elite       = heavy + resonant
boss        = unique telegraphed event
```

---

# 22. Boss ranged telegraph

Bosses should not just sound like louder elites.

Before boss projectile discharge:

```text
sub pulse
+
rising resonant hostile sweep
+
brief high lock tone
+
optional ~40–80ms perceived vacuum / attenuation moment
```

The telegraph should be recognizable even when the boss is off-center or partly occluded.

Duration should follow actual gameplay telegraph timing.

Audio must not imply a longer/shorter attack window than gameplay.

---

# 23. Boss projectile fire

Use a multi-layer discharge.

Suggested:

```text
THUMP:
45–65 Hz
longer body

CHIRP:
~900–1,300 → 180–260 Hz

CRACK:
2–4 kHz

METAL:
mid/high inharmonic resonance

AIR/RUMBLE:
short pressure tail
```

The boss shot should be clearly identifiable from:
- ordinary monster fire;
- elite fire;
- player cannon.

Do not merely increase ordinary enemy-fire gain.

---

# 24. Ranged telegraph semantics

Stop treating all ranged telegraphs as `rammerTelegraph`.

Introduce semantic presentation events or equivalent typed cue data.

Recommended:

```text
enemyRangedTelegraph
enemyRangedFire

enemyChargeTelegraph

bossTelegraph
bossFire
```

If project protocol conventions favor fewer event types, an equivalent semantic event with `kind`/tier metadata is acceptable.

The important rule:

> Presentation must know what action happened and what class of enemy caused it.

Do not collapse all monster ranged attacks into `towerFire`.

---

# 25. Enemy event metadata

For enemy audio, expose enough metadata to resolve sound recipe.

Recommended payload fields:

```text
enemy id
world x/y/z
enemy definition id OR presentation profile id
tier
sizeClass
attack semantic
projectile/fire subtype if needed
```

Do not replicate huge enemy definitions.

A compact tier/profile identifier is sufficient.

If the client can resolve tier/size from the latest enemy state by id reliably:
- the event may only need the id and semantic event.

Fallback:
- include compact `kind`/tier.

---

# 26. Enemy projectile hitting the tank

Create a dedicated sound.

Do not reuse:
- player collision;
- enemy death;
- firing sound.

Target character:

> armor strike.

Layers:

## A. armor crack

```text
noise
~1–2.5 kHz
~30–60ms
```

## B. body

```text
THUMP
~90–120 Hz
~120–220ms
```

## C. metal resonance

```text
METAL
short
```

## D. hostile residue

```text
small downward CHIRP
~600–900 → ~250–350 Hz
```

Scale by damage magnitude/tier.

---

# 27. Tank impact magnitude

Use semantic tiers:

```text
LIGHT
HEAVY
BOSS
```

Example:

```text
light enemy projectile:
short metallic strike

heavy specialist/elite:
larger metal + body

boss:
large armor KRAANG + sub impact
```

Do not create a critical-hit semantic.

This is presentation magnitude only.

---

# 28. Monster melee hit on tank

Do not use generic `collision` for every monster body attack.

Target:

```text
low body thump
+
armor metal clack
+
small noise
```

Large monsters:
- lower;
- longer;
- more metal.

Small fodder:
- very short;
- low voice priority.

Rammer collision:
- stronger than ordinary melee;
- preserve rammer identity.

---

# 29. Rammer telegraph

Make it unmistakable.

Target:

> mechanical warning horn / servo alarm.

Recipe:

```text
low distorted/square pulse ~170–220 Hz
+
sub THUMP ~70–90 Hz
+
short rising filtered-noise scrape
```

Optional two-stage timing:

```text
warning pulse
→ brief lock click
```

Do not share with ranged warning.

---

# 30. Cannon impact

Create a dedicated `cannonImpact` recipe.

Current cannon explosion must no longer route only to `enemyDeath`.

Layers:

```text
CRACK
2–4 kHz

DIRT
mid-band noise ~500–1,500 Hz

THUMP
~70–100 → ~35–50 Hz

AIR
lowpass debris/pressure tail

optional METAL fragments
```

Scale using:
- splash radius;
- charge ratio;
- visual scale if available.

---

# 31. Barrel explosion

Distinct from cannon.

Target:
- more brittle;
- more flame/noise;
- less mechanical body.

Recipe:

```text
very sharp CRACK
+
larger noisy flame/debris tail
+
short sub
+
optional metal fragments
```

Chain explosion should use a lighter variant if many happen rapidly.

Voice limiter must prevent chain reactions from producing unbearable audio.

---

# 32. Enemy death hierarchy

Current generic enemy death should become tier-aware.

## Fodder death

```text
short crunch/noise
+
small downward body
~120–180ms
```

Low priority.

Designed to tolerate rapid repeated kills.

## Specialist death

```text
stronger crunch
+
METAL fragment
+
slightly longer body
~220–300ms
```

## Elite death

```text
large rupture
+
sub impact
+
metal resonance
+
~400–550ms tail
```

## Boss death

Multi-stage event:

```text
initial rupture
→ sub collapse
→ debris/noise
→ secondary lower collapse
→ long filtered tail
```

Target total:
```text
~1.0–1.5s
```

Boss death should be an event.

It should not be drowned by ten simultaneous fodder death sounds.

---

# 33. Death event metadata

Modern monsters use broad `type: 'monster'`.

The audio resolver therefore needs:
- tier;
- size class;
- presentation profile;
or
- enemy id lookup before removal.

Do not rely solely on legacy `EnemyType`.

Make kill presentation capable of resolving:

```text
fodder
specialist
elite
boss
```

---

# 34. Spatial audio

World-space enemy sounds should use inexpensive arcade spatialization.

Recommended API:

```ts
audio.playWorld(soundId, {
  x,
  y,
  z,
  priority,
  tier,
  intensity,
});
```

Player-local SFX:

```ts
audio.playLocal(...)
```

Examples local:
- player cannon;
- own MG;
- UI;
- progression;
- local vehicle engine.

Examples world:
- enemy fire;
- enemy telegraph;
- enemy death;
- cannon impact away from camera;
- barrel explosion;
- truck siren;
- distant crashes.

---

# 35. Listener pose

The audio system needs:

```text
camera x/y/z
camera yaw
```

Update listener presentation each rendered frame or at a modest rate.

The camera manager already owns the active camera pose.

Provide a clean seam such as:

```ts
audio.setListenerPose({
  x,
  y,
  z,
  yaw,
});
```

Do not couple audio directly to Three.js internals everywhere.

---

# 36. Stereo pan

Use cheap `StereoPannerNode` or equivalent.

Approximate:

```text
relative horizontal angle
→ pan -1..1
```

Examples:

```text
direct left:
-1

center:
0

direct right:
+1
```

Back-left/back-right can use reduced but still useful pan.

Full HRTF is not required for V1.

---

# 37. Distance attenuation

Recommended world SFX distance behavior:

```text
0–20m:
near/full

20–60m:
smooth attenuation

60–100m:
stronger attenuation

100m+:
very quiet or culled depending on priority
```

Boss/wipeout/major explosions may have larger audible radii.

Minor fodder sounds may cull much sooner.

Use per-recipe max distance.

---

# 38. Distance coloration

Far sounds should not merely be quieter.

Apply distance-dependent low-pass.

Example:

```text
0–20m:
~18–20 kHz / open

40m:
~8–12 kHz

70m:
~4–6 kHz

100m:
~2–3 kHz
```

This gives natural mix separation without expensive simulation.

Do not filter player-local SFX this way.

---

# 39. Optional world reverb send

Generate a tiny procedural room impulse at audio initialization.

No external IR file needed.

Suggested:

```text
0.25–0.40s decaying noise impulse
```

Feed a subtle `ConvolverNode`.

Per-category send examples:

```text
UI                    0%
MG                    2–4%
player cannon         8–12%
enemy ranged          6–10%
normal impact         8–12%
large explosion      12–18%
boss attack          15–20%
```

Keep it subtle.

The sound should not become cavernous.

If the convolver causes measurable performance or browser issues, make it optional/quality-scaled.

---

# 40. Voice management

Horde Density V1 makes voice limiting mandatory.

Do not play every eligible world sound.

Introduce a voice manager with priorities.

Suggested priority order:

```text
100  player cannon / Charge Shot
 96  heavy player damage / wipeout
 92  boss telegraph
 90  boss fire
 84  nearby elite fire / elite death
 76  nearby enemy projectile impact
 70  major explosion
 64  nearby enemy fire
 52  specialist death
 42  fodder death
 30  distant enemy fire
 20  minor collision
 10  ambient detail
```

Exact numbers are implementation details; the ordering is binding.

---

# 41. Category voice caps

Recommended initial caps:

```text
player weapons:
never arbitrarily culled under normal gameplay

enemy firing:
max ~8 simultaneous active voices

enemy telegraphs:
max ~6, with boss/elite priority

enemy deaths:
max ~6

minor impacts:
max ~8

large explosions:
max ~4

world procedural combat voices total:
~24–32
```

Voice manager should drop:
1. lowest priority;
2. farther sounds;
3. older/less relevant sounds.

Do not only lower all gains when overloaded.

---

# 42. Cooldown / de-duplication

Some events happen extremely frequently.

Add per-sound or per-source cooldown where appropriate.

Examples:

```text
same enemy repeated fire:
allow actual authored cadence

same collision:
suppress micro-repeats within ~40–80ms

chain explosion:
aggregate/suppress excessive duplicate tails

enemy death:
allow multiple, but category voice cap applies
```

Player MG cadence must remain responsive.

---

# 43. Deterministic variation

Avoid uncontrolled random sound identity.

Use seeded micro-variation.

Seed candidates:

```text
enemyId
attackSequence
shellId
event sequence
```

Variation:

```text
pitch ±3–5%
gain ±2–4%
filter center ±5–8%
```

Goal:
- avoid robotic repetition;
- preserve recognizability.

Do not randomly change waveform/category.

---

# 44. Horde presence audio

With many monsters, individual footsteps/grunts are the wrong solution.

Create one aggregate `HordePresenceAudio`.

Input:

```text
nearby live enemy count
optional close/ranged/specialist mix
optional average distance
```

Use existing/new density telemetry if available.

Suggested behavior:

```text
0–5:
silent

6–15:
barely audible low rustle

15–30:
filtered movement/noise bed

30–50:
audible mass / pressure

50+:
strong but still underneath gameplay-critical cues
```

Construction:

```text
low-pass noise
+
very low triangle/saw modulation
+
occasional quiet filtered transient
```

Do not synthesize one footstep per enemy.

---

# 45. Horde presence spectral placement

Keep it out of the player's weapon range.

Suggested:

```text
main energy:
80–450 Hz

small texture:
500–1,200 Hz

very low gain
```

Sidechain/duck slightly when:
- player cannon fires;
- boss telegraph;
- major results/reward cue.

Do not make horde ambience mask attack warnings.

---

# 46. Player tank engine

Current engine is a workable base.

Keep:

```text
two oscillator engine core
speed-driven pitch
speed-driven filter
```

Improve with optional layers:

## Track/road rumble

```text
lowpass noise
gain based on grounded speed
```

## Mechanical harmonic

```text
very low-gain saw/triangle harmonic
speed-linked
```

## Surface variation

V1 does not need full material-dependent tire/track audio unless terrain materials already expose an easy semantic.

Do not over-scope.

---

# 47. Dash

Current dash already uses noise sweep + blip.

Refine into:

```text
AIR pressure sweep
+
low torque THUMP
+
small mechanical click/snap
```

Should feel like:
- engine/transmission surge;
- chassis mass accelerating.

Not a magical teleport.

---

# 48. Jump

Current jump is upward triangle + noise.

Refine:

```text
suspension/mechanical release
+
short low THUMP
+
small AIR lift
```

Avoid a cartoon spring sound.

---

# 49. Landing — new required cue

Add a landing audio event/presentation seam.

The simulation already detects grounded transition.

Capture impact severity from:
- pre-contact downward velocity;
- or an equivalent stable kinematic value.

Add:

```text
landingLight
landingHeavy
```

Suggested:

## Light

```text
small THUMP
short metal
```

## Heavy

```text
larger THUMP
metal resonance
low dirt/noise
```

Do not add fall damage.

This is presentation only.

---

# 50. Drift / tire-track scrape

Current drift uses a simple bandpassed noise hit.

Convert it into a controlled short loop/retrigger model.

Use:
- bandpassed noise;
- speed/drift intensity;
- very low volume;
- voice reuse rather than creating many disconnected hits every frame.

Avoid harsh constant hiss.

---

# 51. Collision sounds

Separate:

```text
tank vs hard wall
tank vs monster
tank vs truck
enemy projectile vs tank
landing
```

Do not route all to one `collision` recipe.

Hard wall:
- low body;
- metal impact.

Monster:
- body + armor slap.

Truck:
- heavier metal/body.

---

# 52. Results and reward compatibility

Do not regress:
- reward roulette cues;
- relic lock;
- reward ducking;
- results cue.

If the soundtrack system uses a separate `musicDuckGain`, keep reward ducking there.

Combat SFX should never reset music gain.

Likewise music context changes should not alter SFX bus gain.

---

# 53. Semantic event cleanup

The current event vocabulary should be modernized enough to support meaningful sound design.

Recommended new presentation-facing event semantics:

```text
enemyTelegraph
enemyFire
enemyProjectileImpact
enemyMeleeImpact
enemyDeath
bossTelegraph
bossFire
playerCannonImpact
barrelExplosion
tankLanding
```

Exact type names may follow existing protocol naming.

Alternative:

```text
enemyAudioCue
kind = rangedTelegraph | rangedFire | ...
```

is acceptable if it reduces protocol churn.

Binding requirement:

> Presentation must no longer infer multiple unrelated sounds from the same legacy `towerFire` or `rammerTelegraph` event.

---

# 54. Backward compatibility

Legacy/demo modes may still emit:
- `towerFire`;
- `rammerTelegraph`.

Keep a compatibility mapping until all production paths are migrated.

Example:

```text
legacy towerFire
→ enemyFire / legacyTower profile

legacy rammerTelegraph kind=tower
→ enemyTelegraph / legacyTower profile
```

Do not break regression fixtures merely for event naming cleanliness.

---

# 55. Sound profile metadata

Avoid encoding every monster-specific sound decision into TypeScript `if` chains.

Add or reuse a compact presentation audio profile.

Possible:

```text
enemyAudioProfile.defaultRanged
enemyAudioProfile.heavyRanged
enemyAudioProfile.elite
enemyAudioProfile.boss
```

A monster can resolve profile from:
- tier;
- size class;
- attack type;
- optional content override.

V1 can use deterministic defaults without requiring hundreds of content edits.

---

# 56. Tier/size scaling

Use tier and size class to tune recipes.

Example multipliers:

```text
fodder:
pitch 1.05
body 0.85
tail 0.80

specialist:
pitch 0.95
body 1.00
tail 1.00

elite:
pitch 0.85
body 1.20
tail 1.20

boss:
dedicated boss recipe
```

Size class can further influence:
- sub frequency;
- duration;
- gain;
- metallic resonance.

Avoid huge loudness jumps.

---

# 57. Audio debug tooling

Add a development-only audio debug panel or hooks.

Expose:
- current active procedural voices;
- voice counts by category;
- dropped voices;
- max voice count;
- horde presence level;
- listener pose;
- recent semantic cue;
- recent recipe;
- distance/pan of recent world sound.

Optional:
- hotkeys/buttons to trigger recipes for tuning.

This will drastically reduce tuning time.

---

# 58. Test hooks

In test/debug mode, expose something like:

```ts
window.__recoil.audio = {
  stats: () => ...,
  playRecipe: (...) => ...,
}
```

Do not expose production-sensitive internals unnecessarily.

Automated tests can use controller-level APIs instead.

---

# 59. Automated tests

Required tests:

## Primitive lifecycle
- oscillator/source stops after envelope;
- no leaked nodes/timers.

## Voice cap
- 20 fodder shots request sound;
- only category/global cap plays;
- boss shot displaces low-priority distant sound.

## Priority
- player cannon never loses to fodder death.

## Spatial pan
- source left of listener -> negative pan;
- right -> positive pan;
- center -> near zero.

## Distance attenuation
- near gain > mid gain > far gain.

## Distance filtering
- far cutoff lower than near cutoff.

## Deterministic variation
- same seed produces same micro-variation.

## Different seed
- remains within configured bounds.

## Enemy semantic mapping
- ordinary ranged fire -> ordinary recipe;
- specialist -> specialist;
- elite -> elite;
- boss -> boss.

## Tank impact
- enemy projectile hit does not use generic collision/death recipe.

## Cannon impact
- cannon explosion calls cannon impact recipe.

## Death tier
- fodder/elite/boss resolve different recipes.

## Landing
- light/heavy classification.

## Reward compatibility
- reward ducking still uses music duck path;
- SFX bus unaffected.

## Legacy compatibility
- old `towerFire`/`rammerTelegraph` fixture still maps safely.

---

# 60. Manual sound QA sequence

Perform at least:

```text
Main Stage
Single Player
Multiplayer Driver
Multiplayer Gunner
```

Test:

```text
MG sustained fire
normal cannon
partial charge
full charge
cannon impact
barrel chain
dash
jump
light landing
heavy landing
wall crash
monster melee
rammer warning + hit
ordinary ranged warning + shot
specialist ranged
elite ranged
boss warning
boss shot
enemy projectile hit tank
fodder death spam
elite death
boss death
```

Also run dense Phase 3 / Wave 2.

---

# 61. Mix QA

In a dense fight, verify hierarchy:

```text
player cannon
> boss warning
> heavy tank damage
> elite/ranged threats
> impacts
> enemy deaths
> horde ambience
```

The player should never lose:
- cannon feedback;
- dangerous warning cues;
- heavy incoming hit cues

inside fodder noise.

---

# 62. Multiplayer duplication

Preserve local-vs-authoritative action suppression.

Player cannon/MG local presentation must not double-play when authoritative event arrives.

Enemy world sounds are authoritative.

Do not create a second predicted enemy-audio layer.

---

# 63. Performance

Procedural audio should remain lightweight.

Avoid:
- hundreds of active oscillators;
- one node graph per horde enemy continuously;
- per-enemy ambient loops;
- per-frame allocations when avoidable.

Use:
- short-lived voices;
- global voice manager;
- aggregate horde audio;
- pooled/reused continuous nodes where appropriate.

---

# 64. Quality scaling

Optional:

Low-quality mode may:
- disable reverb send;
- lower max minor enemy voices;
- simplify horde ambience.

Never remove:
- player weapon sounds;
- boss warning;
- heavy incoming-damage cues.

---

# 65. Forbidden implementations

Do not:

- import a generic external SFX library for V1;
- keep using one generic `towerFire` sound for all monsters;
- keep using one generic `enemyDeath` for cannon impact and deaths;
- route every world SFX directly to master;
- use full HRTF for hundreds of enemies by default;
- create individual ambient footsteps for every horde enemy;
- allow unlimited simultaneous procedural voices;
- use giant random pitch ranges;
- make boss sounds merely louder fodder sounds;
- create UI-musical tones for every combat effect;
- restart soundtrack or change music context from SFX code;
- break reward ducking;
- introduce fall damage with landing SFX;
- regress local gunner duplicate suppression.

---

# 66. Definition of done

- [ ] Procedural sound primitives exist and are reusable.
- [ ] Combat sounds are recipes built from primitives, not one-off oscillator blobs.
- [ ] Player MG has a dry mechanical identity.
- [ ] Player cannon has layered crack/body/mechanical/pressure identity.
- [ ] Charge Shot scales within the cannon family.
- [ ] Charge hold reaches a stable full-charge audio state.
- [ ] Ordinary ranged monster fire has a distinct hostile sound.
- [ ] Specialist ranged fire is a heavier version of the same family.
- [ ] Elite ranged attacks are clearly more dangerous acoustically.
- [ ] Boss telegraph and boss fire have dedicated recipes.
- [ ] Ranged telegraph no longer reuses rammer warning semantically.
- [ ] Enemy projectile hitting the tank has a dedicated armor-impact sound.
- [ ] Rammer warning is unmistakable.
- [ ] Cannon impact has a dedicated sound.
- [ ] Barrel explosion is distinct from cannon impact.
- [ ] Fodder/specialist/elite/boss death sounds are tier-aware.
- [ ] Boss death is a multi-stage event.
- [ ] World enemy SFX use stereo spatialization.
- [ ] World SFX attenuate and low-pass with distance.
- [ ] Voice priorities and category caps exist.
- [ ] Dense horde combat cannot spawn unlimited sound voices.
- [ ] Seeded micro-variation replaces chaotic random identity changes.
- [ ] Horde presence is aggregate, not per-enemy.
- [ ] Engine keeps existing base and gains optional physical texture.
- [ ] Dash and jump are refined.
- [ ] Landing light/heavy sounds exist with no gameplay damage change.
- [ ] Collision categories are semantically separated.
- [ ] Existing BGM/reward audio systems remain compatible.
- [ ] Legacy enemy audio events retain safe compatibility mapping.
- [ ] Debug audio stats exist.
- [ ] Dense two-client Multiplayer audio remains responsive and intelligible.
- [ ] No meaningful audio-node/timer leak appears after repeated matches.

Final audio invariant:

> At any moment, the player should be able to hear what matters: their tank feels heavy, their weapons feel powerful, monster attacks sound hostile and readable, major threats cut through the mix, and the horde feels enormous without becoming an uncontrolled wall of noise.
