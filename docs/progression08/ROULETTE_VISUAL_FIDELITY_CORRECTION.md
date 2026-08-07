# Recoil Crew — Roulette Visual Fidelity Correction
## Make current `main` match the approved reward-roulette prototype

**Repository:** `mwl313/RecoilCrewDS`  
**Audited main SHA:** `12d7387c55b51d2bec602f926540ebd31128685b`  
**Scope:** visual and temporal fidelity only  
**Preserve:** current pointer-lock input context, reward authority, stack/non-stack rules, SP/MP readiness behavior, reconnect behavior, progression math

---

# 0. Executive diagnosis

The current implementation has the right architecture but the wrong visual execution.

Codex implemented the nouns from the design:

```text
reel
radial burst
ring
shards
sequential lock
rarity
sound
relic reveal
```

but several are placeholder-strength approximations.

The approved prototype in:

```text
docs/progression08/reference/progression_reward_roulette_preview.html
```

is the **visual source of truth** for this correction pass.

The target is not "inspired by the prototype."

The target is:

> Reproduce the prototype's composition, visual weight, reel illusion, card hierarchy, motion cadence, burst intensity, focus state, and relic payoff as closely as possible inside the production Recoil Crew UI system.

Keep Barlow / Barlow Condensed and production design tokens where they improve consistency. Do not preserve a production visual merely because it already exists if it visibly diverges from the reference.

---


# 1A. Binding new entrance direction — EXTREME PUNCH-IN

The entire reward composition must **not** simply fade into existence.

When either roulette overlay appears, its central reward stage begins almost microscopic at the center of the screen and violently punches toward the viewer.

This is a binding visual requirement.

## Upgrade entrance

Target outer-stage motion:

```text
0 ms      scale 0.04–0.07, opacity 0
45 ms     scale ~0.12, center core flashes
150 ms    scale ~0.55, radial rays explode outward
285 ms    scale 1.16–1.20, first overshoot
345 ms    scale 0.96–0.98, recoil
410 ms    scale 1.00, hard settle
```

Use the outer `.reward-stage`, not the gameplay camera.

Recommended keyframe character:

```css
0%   { transform: scale(.055); opacity: 0; }
12%  { opacity: 1; }
68%  { transform: scale(1.18); }
84%  { transform: scale(.97); }
100% { transform: scale(1); }
```

The effect should feel like:

```text
reward machine fired directly toward the player
```

not:

```text
modal gently zoomed in
```

### Do not mutate the TPS camera

Absolutely no:
- camera FOV punch;
- camera dolly;
- camera yaw/pitch;
- gameplay world scale.

Only the DOM reward composition scales.

This preserves seamless return to TPS.

---

# 1B. Make the intro deliberately over-the-top

The user explicitly wants the roulette to be **extremely flashy and exaggerated**.

Use controlled excess during the first ~450 ms and during rarity locks.

The ordinary readable/selectable state must calm down afterward.

## Required entrance layers

Create these independent FX layers:

```text
1. edge vignette / world darkening
2. giant amber + paper radial starburst
3. central white/amber core flash
4. expanding circular/hex shockwave
5. radial speedlines / streaks
6. outer reward-stage zoom punch
7. title slam
8. card housing slam
```

### Core flash

At the exact center:

```text
0–40 ms       nearly invisible
40–90 ms      paper-white / amber core blooms hard
90–170 ms     expands and collapses
```

Keep the peak brief.

A second smaller flash may occur on:
- third upgrade lock;
- Epic lock;
- Legendary lock;
- relic final lock.

### Shockwave

At least one large outline shockwave:

```text
scale .05 -> 1.6+
opacity .9 -> 0
duration ~420–520 ms
```

A second delayed ring may follow ~70 ms later at lower opacity.

Use angular/industrial geometry if desired:
- circle;
- clipped octagon;
- irregular mechanical ring.

The shockwave should clearly outrun the central stage zoom.

### Radial speedlines

Add 24–40 thin streaks that originate near center and shoot outward during the zoom.

Characteristics:
- amber / paper;
- narrow rectangular lines;
- varied length;
- varied opacity;
- 180–360 ms lifetime;
- disappear before the decision state.

Do not leave perpetual speedlines behind the cards.

### Screen-edge impulse

For the first 100–160 ms:
- allow a faint paper/amber edge luminance pulse;
- optional thin corner lines shoot outward.

Do not full-white the screen for more than a few tens of milliseconds.

---

# 1C. Exaggerated motion hierarchy

The entrance should stack motion in layers rather than animate everything equally.

## Outer stage
Largest motion:
```text
scale .055 -> 1.18 -> .97 -> 1
```

## LEVEL UP title
Inside the zooming stage:
```text
translateY(-34px)
scale 1.22
optional skewX(-5deg)
→ slam past final
→ settle
```

## Level badge
```text
scale .35 -> 1.18 -> 1
```

## Cards
Each housing:
```text
translateY(90–120px)
scale .80–.88
→ punch through final by ~6px
→ settle
```

Stagger:
```text
0 / 45 / 90 ms
```

This can be more exaggerated than the earlier 35 ms stagger.

## Slot symbols
During the first burst:
- spin fastest;
- use longer travel;
- slight motion smear via opacity layering/duplicate ghost if cheap;
- no expensive blur filter.

## Focus
Once selectable:
- calm down;
- retain only hard outline, 4–5px lift, tiny brightness change.

The player needs visual silence to read.

---

# 1D. Exaggerated lock payoff

Each card lock gets a small secondary explosion.

```text
card snaps
→ card scale 1.08
→ 40 ms hold
→ scale .98
→ settle
→ local shard burst
→ local rarity sweep
```

The **third card lock** should feel like the end of the machine sequence:
- slightly stronger center shock;
- extra bass transient;
- short ray re-brightening;
- 8–12 extra micro-streaks.

Epic and Legendary may exceed the ordinary third-lock treatment.

---

# 1E. Relic entrance must use the same tiny-to-huge punch

When the relic UI takes over from the physical chest:

```text
chest opens in world
→ reward energy transfers to center
→ relic reward stage appears at scale ~.05
→ rockets to ~1.20
→ recoils
→ settles
→ relic reel continues
```

Do not merely scale the inner relic card from `.8` to `1`.

The **whole relic composition** must participate:
- signal kicker;
- plate;
- rays;
- shockwave;
- speedlines.

This creates continuity with the level-up reward machine.

## Relic final lock

The final relic lock should be even more exaggerated than an upgrade lock:

Common:
- strong but short snap.

Rare:
- cyan sweep + ring.

Epic:
- purple double shockwave + heavier fragment spray.

Legendary:
```text
50–90 ms audio vacuum
→ paper-white/gold core flash
→ giant gold radial blast
→ double shockwave
→ 20+ fragments
→ icon punches forward to ~1.16
→ name slams in
→ bass + upper chime
```

The final state then becomes calm and readable indefinitely.

---

# 1F. Accessibility remains mandatory

For `prefers-reduced-motion`:
- skip microscopic scale and overshoot;
- use a 180–260 ms fade/very small scale (e.g. `.94 -> 1`);
- reveal final information quickly.

For reduced-flash mode:
- disable white core flashes;
- reduce starburst peak;
- use line/ring expansion and color-edge animation instead.

Flashy default mode is deliberate, but accessibility settings remain authoritative.

---

# 1. What is currently missing

## 1.1 The upgrade "reel" is not actually a reel

### Current main

`RewardRevealView.buildCard()` creates only three static text rows:

```text
DMG // ARMOR // MOBILITY
OUTPUT // CONTROL // CREW
SYSTEM // CALIBRATING
```

`progression-reveal.css` then applies:

```css
reward-reel-spin 150ms steps(2,end)
```

which moves the whole block only about 24px up/down.

This reads as:

```text
glitching loading text
```

not:

```text
slot machine / roulette reel
```

### Reference behavior

The prototype uses:

```text
fixed black reel viewport
→ tall reel track
→ multiple 112px symbols
→ real vertical travel through the clipped aperture
→ changing glyph + category
→ final symbol replaces the moving track on lock
```

### Required correction

Each card gets a true clipped slot aperture.

Production structure:

```html
<div class="reward-card__reel-window">
  <div class="reward-card__reel-track">
    <div class="reward-card__symbol">...</div>
    ...
  </div>
</div>
```

Minimum:
- 8–12 presentation-only symbols per reel.
- Symbol height equals aperture height.
- Track moves continuously through multiple full symbol heights.
- Each reel has a slightly different phase/velocity.
- The final lock snaps to the actual authoritative card.

Do not cycle full fake upgrade names that imply unavailable choices. Use generic:
- glyphs;
- category families;
- rarity strips;
- system words.

---

## 1.2 There is no real deceleration illusion

### Current main

Audio ticks are:

```text
every 58 ms
same pitch
only during `spinning`
```

Then the timeline moves to `decelerating`, but the casino cadence is effectively gone.

The visual reel also runs one fixed CSS loop speed.

### Reference behavior

The prototype feels like a machine losing angular momentum.

Required cadence approximately:

```text
fast:
32
34
37
41
46
52

slow:
60
70
82
98
118
145 ms
```

The reels visually travel less distance per tick as the lock approaches.

### Required correction

Move reel progression from one infinite CSS keyframe to presentation state driven by `RewardRevealDirector` or a small visual reel controller.

Presentation-only state may be deterministic from:

```text
offerId
card index
elapsed time
```

Do not use gameplay RNG.

Audio tick should accept normalized progress or pitch:

```ts
rewardTick({ pitch, intensity })
```

Pitch rises during rapid spin and becomes lower/heavier as the reel locks.

---

## 1.3 The radial burst is much too weak

### Current main

Current `.reward-burst`:

```text
opacity ~0.30
settles ~0.22
```

It is visually subordinate.

The irregular thin `.reward-ring` is more likely to read as HUD geometry than reward spectacle.

### Reference

The prototype's amber/paper radial field is the dominant background shape:

```text
impact peak ≈ .9+
settled ≈ .6
large centered rays
slow post-impact rotation
```

### Required correction

Make the **radial starburst dominant**.

Use:
- large centered circular ray field;
- stronger amber rays;
- faint paper rays between;
- high initial impact;
- stable visible hold behind the cards;
- very slow rotation after settling.

Target:

```text
impact opacity: ~0.85–0.95
settled opacity: ~0.48–0.62
```

The vignette protects readability.

The polygon ring may remain only as a very faint secondary line, or be removed if it fights the reference.

---

## 1.4 `LEVEL UP` currently does not slam in

### Current main

`.reward-title` is styled but there is no state-specific title entrance comparable to the reference.

The title is effectively present while cards enter.

### Reference

```text
LEVEL UP:
start +20–24px above
scale ≈1.08
opacity 0
slam past final by ~2px
settle scale 1
```

with:
- hard text shadow;
- tight negative tracking;
- level badge appearing just after the main title.

### Required correction

Implement explicit:

```text
reward-title-slam
reward-level-pop
```

The title must hit before the card bank becomes visually dominant.

Production typography should use Barlow Condensed italic 900 but match prototype silhouette:

```text
tracking: about -0.03 to -0.04em
line-height: ~.82–.86
```

Current positive tracking makes it feel more like a UI heading and less like an impact title.

---

## 1.5 Cards enter too generically

### Current main

Cards use:

```text
translateY(58px)
rotateX(-8deg)
fade
```

and begin immediately when DOM is rendered.

### Reference

The reference reads as three solid machine housings appearing under the already-hit title.

Required:
- title impacts first;
- card housings enter slightly later;
- left / center / right stagger ~35ms;
- use strong vertical travel without soft 3D flip;
- settle fully opaque.

Recommended reference values:

```text
translateY: 58px -> 0
duration: 260–300ms
stagger: 0 / 35 / 70ms
```

Remove or greatly reduce `rotateX(-8deg)` if it creates a lightweight "web card flipping in" feeling.

---

# 2. Card visual geometry must match the prototype

Desktop target:

```text
card width: 220–272px
card height: ~318px
gap: 12–16px
top rarity bar: 4px
reel aperture top: ~54px
reel aperture height: ~112px
content begins around 178px
```

## 2.1 Reel aperture

The current reel consumes most of the card.

Replace with a compact black slot window:

```text
left/right inset: 18px
top: ~54px
height: ~112px
background: near-black
1px top/bottom mechanical line
overflow: hidden
```

This one change is critical.

It creates a physical "machine" inside each card.

## 2.2 Hotkey badge

Reference:
- neutral dark hardware key;
- light border;
- white/paper number.

Current main:
- solid rarity-colored badge.

Change to reference behavior.

Rarity should be carried primarily by:
- top edge;
- final rarity label;
- lock payoff.

Not by making the shortcut key a colored candy tile.

## 2.3 Final hierarchy

After lock:

```text
RARITY          small
UPGRADE NAME    dominant
EFFECT          readable
```

Do not give a huge square `DMG / MOV / ARM / SYS` placeholder equal visual weight to the actual upgrade name.

If a generic icon remains, make it smaller/subordinate.

The reference's power comes from:
- slot aperture first;
- strong name second;
- clean effect summary third.

---

# 3. Focus/selection must match the reference

### Current main
Focus:
- border change;
- 4px lift;
- left amber line;
- small top-right `// SELECT`.

### Reference
Focus feels much stronger:

```text
translateY(-5px)
brightness ~1.1
2px amber outer outline
~4px outline offset
explicit // SELECT marker
```

Required:

```css
outline: 2px solid rgba(255,173,34,.8);
outline-offset: 4px;
```

Use a hard, angular selection state.

Do not add soft box-shadow glow.

---

# 4. Sequential locks need a real payoff

Current lock animation is mostly:

```text
-12px -> +3px -> 0
```

plus shards.

That is not enough.

Each lock needs:

```text
SNAP
→ 2–3px impact overshoot
→ very short visual hold
→ rarity bar flash
→ card content appears
→ shard burst
→ sound clack
```

Recommended:

```text
lock visual duration: 110–140ms
micro hold: 35–50ms
card 1: ~720ms
card 2: ~850ms
card 3: ~980ms
```

The final authoritative content must feel like the reel mechanically stopped on it.

---

# 5. Shards are too small and uniform

### Current main

```text
11 × 4px
deterministic radial angle
same flight length family
same 520ms motion
```

This looks like small sparks.

### Reference

The prototype uses visibly chunkier rectangular "ticket/armor" pieces:

```text
about 5 × 14px base
varied rotations
varied distances
varied direction
```

Required mix:
- amber brass strips;
- paper-white strips;
- rarity strips.

Use deterministic **visual** PRNG seeded from reward identity so E2E remains stable.

Vary:
- width/height slightly;
- distance;
- rotation;
- delay;
- angle.

Keep current pool limit <=48.

---

# 6. Rarity needs to change more than color

Current main mostly changes:
- card edge color;
- shard count/color.

`rewardCardLock` audio currently plays the same sound regardless of rarity.

Required matrix:

## Common
- shortest lock;
- dry mechanical click;
- 4–6 fragments;
- no big secondary pulse.

## Rare
- cyan edge sweep;
- 8–10 fragments;
- high confirmation note;
- one short colored radial pulse.

## Epic
- purple edge;
- double ring/ripple behind locked card/bank;
- 12–16 fragments;
- deeper transient + chime.

## Legendary
- gold/paper core hit;
- 18–24 fragments;
- strongest radial expansion;
- ~50–90ms music duck;
- deeper bass transient;
- 3-note top chime;
- slightly longer settle.

Implement rarity-specific classes/states, not only `--rarity`.

---

# 7. Reward audio currently lacks casino motion

Current main:

```text
rewardTick = 680Hz every time
rewardCardLock = same two blips for every rarity
```

That destroys acceleration/deceleration perception.

Required:
- changing tick pitch;
- changing tick interval;
- heavier final ticks;
- rarity-aware lock transients;
- stronger level impact.

`rewardLevelImpact` should include:
- low bass hit;
- short metal/high transient;
- optional noise snap.

Do not make it louder by simply increasing every gain.

Use frequency layering and silence.

---

# 8. Natural relic reveal is missing its strongest payoff

This is a concrete current-main bug.

`ProgressionOverlay.update()` currently triggers natural relic lock sound using effectively:

```ts
if (timeline.startedNow && timeline.finalVisible) {
    rewardSound('relicLock')
}
```

On normal reveal start:
- `startedNow === true`
- `finalVisible === false`

When the timeline naturally reaches final reveal later:
- `startedNow === false`
- `finalVisible === true`

Therefore the normal transition does **not** trigger the relic-lock payoff.

Fast-forward explicitly triggers:
- shard burst;
- `relicLock`;
- Legendary duck.

Normal non-fast-forward reveal does not get the equivalent transition call.

### Required fix

Track:

```text
previousFinalVisible
previousRelicPhase
```

On:

```text
false -> true finalVisible
```

fire exactly once:

```text
relic impact FX
relicLock audio
rarity treatment
Legendary duck if applicable
```

Reconnect into an already-finished final state must not replay it unless presentation policy explicitly wants one reconnect settle cue.

---

# 9. The relic reel is also a placeholder

### Current main

The relic "roulette" is:

```text
RELIC // ???
```

with a ~10px vertical jitter / opacity cycle.

That is not a reel.

### Reference

The prototype cycles:

```text
glyph
rarity word
glyph
rarity word
...
```

inside a central prize machine before final lock.

Required:
- 7–10 generic relic glyph states;
- Common/Rare/Epic/Legendary labels cycling;
- visible slowing;
- one almost-stopped final tick;
- short audio vacuum;
- then authoritative icon.

Do not cycle actual unselected relic names.

---

# 10. Relic final content currently appears all at once

Current final `.reward-relic__final` contains:
- rarity;
- icon;
- name;
- description;
- stack.

The whole container fades/slides together.

Reference staging:

```text
1. rarity / icon lock impact
2. relic name slam
3. description fades upward
4. stack result hits
5. continue prompt appears later
```

Suggested relative timing after lock:

```text
0ms      icon + rarity
50ms     name
160ms    description
220ms    stack
280ms+   continue prompt becomes visually present when allowed
```

For stack-up:

```text
STACK UP
×1 -> ×2
```

gets one extra 100–140ms pulse.

---

# 11. Continue prompt should not look like a standard button

The reference final state uses a quiet prompt:

```text
CLICK / SPACE TO CONTINUE
```

Current production styles it as a fairly normal amber button once armed.

Change it closer to prototype:
- text-led;
- no large solid button fill;
- centered utility text;
- slow opacity pulse;
- still preserve a real accessible button hit target underneath/around it.

Visually:
```text
CLICK / SPACE TO CONTINUE
```
not:
```text
[ CLICK / SPACE TO CONTINUE ]
```

---

# 12. The world/background composition should remain visible

The reward should feel like it erupts **over the game**, not like another full opaque UI screen.

Preserve:
- visible gameplay world;
- strong edge vignette;
- readable center;
- no camera pose/FOV mutation.

The scrim should protect the cards but let the tank/world remain recognizable.

The prototype's radial field is allowed to be loud because the world still reads underneath.

---

# 13. Implementation approach

Do **not** rewrite the working authority/input architecture.

Preserve:
- `RewardRevealDirector`;
- `ProgressionInputContext`;
- `acknowledgeRelic`;
- pointer-lock retention;
- SP/MP peer readiness;
- unique relic filtering;
- stackable relic rules.

Change primarily:

```text
src/client/progression/rewardRevealView.ts
src/client/progression/rewardFxLayer.ts
src/client/progression/progressionOverlay.ts
src/client/ui/progression-reveal.css
src/client/audio.ts
```

A small presentation-only reel helper is encouraged:

```text
src/client/progression/rewardReelAnimator.ts
```

It may compute deterministic visual state from elapsed time.

---

# 14. Exact visual source of truth

Codex must open/run:

```text
docs/progression08/reference/progression_reward_roulette_preview.html
```

before editing.

At 1280×720 compare:

## Upgrade
- radial ray density/intensity;
- title silhouette;
- title-to-card spacing;
- card width/height;
- neutral hotkey badge;
- black slot aperture;
- real symbol motion;
- content placement after lock;
- focus outline;
- shard size;
- chosen/rejected animation.

## Relic
- plate width/height;
- icon block size;
- roulette glyph motion;
- final name scale;
- description placement;
- continue prompt behavior.

Production can retain Barlow typography and actual icons, but geometry/motion should visually match the reference.

---

# 15. Temporal qualification is mandatory

The previous implementation report explicitly lacked video qualification.

This pass is not complete with screenshots only.

Required:
- record a real-time 1280×720 capture of upgrade roulette;
- record a real-time relic roulette;
- record one Epic/Legendary lock;
- compare timing to the reference running side-by-side.

Static screenshot tests remain useful for:
- layout;
- clipping;
- responsive geometry.

They cannot approve:
- spin illusion;
- cadence;
- deceleration;
- impact feel;
- audio synchronization.

---

# 16. Completion checklist

```text
[ ] Entire upgrade reward stage begins at approximately scale .05 and violently zooms to full size.
[ ] Reward stage overshoots to roughly 1.16–1.20 then recoils and settles.
[ ] Entrance includes a brief central core flash.
[ ] Entrance includes at least one expanding shockwave.
[ ] Entrance includes short-lived radial speedlines.
[ ] Relic reward stage uses the same tiny-to-huge punch-in language.
[ ] Epic/Legendary final locks include exaggerated second-stage impact FX.
[ ] Reduced-motion/reduced-flash modes suppress the extreme entrance appropriately.
[ ] Upgrade has a real clipped vertical reel, not bouncing text.
[ ] Reel travels through multiple full symbol cells.
[ ] Reel visibly decelerates.
[ ] Tick cadence changes with deceleration.
[ ] Tick pitch changes with progression.
[ ] LEVEL UP visibly slams into place.
[ ] Level badge arrives after title hit.
[ ] Cards enter after title impact, with 35ms stagger.
[ ] Radial burst is as visually dominant as the reference.
[ ] Polygon ring no longer dominates the composition.
[ ] Hotkey badge is neutral hardware, not a bright rarity tile.
[ ] Card hierarchy matches reference.
[ ] Focus has hard outer amber outline.
[ ] Locks have real snap/impact/hold.
[ ] Rarity changes motion/audio/pulse, not just color.
[ ] Shards are larger and varied like the reference.
[ ] Selection confirmation matches reference thrust/rejection.
[ ] Relic has a real cycling reel, not `RELIC // ???` jitter.
[ ] Natural relic final transition triggers full lock FX/audio.
[ ] Legendary natural reveal triggers music duck.
[ ] Relic icon/name/description/stack reveal sequentially.
[ ] Continue is a quiet pulsing prompt.
[ ] Stack-up gets a distinct extra pulse.
[ ] Pointer-lock/input behavior from current main remains unchanged.
[ ] SP/MP readiness behavior remains unchanged.
[ ] No progression balance/authority regression.
[ ] 1280×720 temporal video reviewed side-by-side with reference.
```

Final visual invariant:

> If the production screen and the reference prototype are played side-by-side at 1280×720, they should immediately read as the same reward presentation rather than two implementations of the same written specification.
