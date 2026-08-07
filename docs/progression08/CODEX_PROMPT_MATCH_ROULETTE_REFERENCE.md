# Codex Prompt — Match Progression Roulette to the Approved Visual Prototype

Repository:
```text
https://github.com/mwl313/RecoilCrewDS
```

Base:
```text
current origin/main
```

Audited main at prompt creation:
```text
12d7387c55b51d2bec602f926540ebd31128685b
```

Binding visual correction:
```text
docs/progression08/ROULETTE_VISUAL_FIDELITY_CORRECTION.md
```

Literal visual reference:
```text
docs/progression08/reference/progression_reward_roulette_preview.html
```

## Mission

The current reward system has the correct architecture and interaction behavior, but it does **not visually match the approved prototype**.

Do not redesign it again.

Do not interpret the document loosely.

Make current production look and move like the supplied HTML prototype as closely as possible while preserving Recoil Crew production fonts/tokens, real content, accessibility, authority, pointer-lock behavior, and Multiplayer readiness.

## Preserve all current working behavior

Do not regress:
- pointer lock stays active during progression;
- 1/2/3 direct upgrade selection;
- relative mouse focus;
- click confirmation;
- no gameplay input leakage;
- relic waits for explicit acknowledgement;
- SP has no peer status;
- MP has real READY / VIEWING status;
- stackable relics may repeat and stack;
- owned non-stackable/unique relics are filtered from future rolls;
- reconnect;
- reward authority;
- progression math.

This task is a **presentation fidelity correction**, not another progression rewrite.

## First audit current main

Run:
```bash
git fetch --all --prune
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

Read:
```text
src/client/progression/rewardRevealDirector.ts
src/client/progression/rewardRevealView.ts
src/client/progression/rewardFxLayer.ts
src/client/progression/progressionOverlay.ts
src/client/ui/progression-reveal.css
src/client/audio.ts
```

Then run/open the supplied reference HTML.

Do not start implementation until you have compared the current production classes against the reference source.


## NEW BINDING DIRECTION — Extreme tiny-to-huge zoom entrance

The supplied visual reference has been revised.

When the reward overlay begins, the **entire central reward stage** must start nearly microscopic and violently punch toward the player.

This applies to:
- level-up roulette;
- relic roulette.

Do not implement a gentle modal scale-in.

Target default entrance:

```text
0 ms      scale .04–.07, opacity 0
45 ms     scale .12, core flash begins
150 ms    scale ~.55, rays/speedlines exploding
285 ms    scale 1.16–1.20 overshoot
345 ms    scale .96–.98 recoil
410 ms    scale 1.00 settle
```

Use the DOM reward stage only.

Do **not** change:
- TPS camera FOV;
- TPS camera position;
- camera orientation;
- world scale.

### Flashy/exaggerated entrance is intentional

Add:
```text
giant amber/paper radial starburst
+ central paper-white/amber core flash
+ 1–2 expanding shockwave rings
+ 24–40 short-lived radial speedlines
+ violent outer-stage zoom
+ stronger title slam
+ exaggerated card housing slam
```

The first ~450 ms may be intentionally excessive.

Then calm the effects before the player needs to read/select.

### Stronger internal motion

Inside the outer-stage zoom:

`LEVEL UP`:
```text
translateY ~-34px
scale ~1.22
optional -5deg skew
slam/overshoot
settle
```

Cards:
```text
translateY 90–120px
scale .80–.88
overshoot by ~6px / ~1.025
settle
stagger 0 / 45 / 90ms
```

### Lock explosions

Every card lock:
```text
snap -> scale 1.08 -> 40ms hold -> .98 -> 1
+ local shards
+ rarity sweep
```

Third card lock gets an extra global micro-shock.

Epic/Legendary get stronger variants.

### Relic

When the UI reward transfers from the physical chest:
```text
whole relic stage scale ~.05
→ 1.20 overshoot
→ recoil
→ settle
→ reel continues
```

Legendary final lock should be deliberately huge:
```text
audio vacuum
→ gold/paper core flash
→ giant radial blast
→ double shockwave
→ heavy shards
→ icon punch
→ name slam
→ bass + chime
```

### Accessibility

`prefers-reduced-motion`:
- no .05 scale spawn;
- no violent overshoot;
- short fade / subtle .94 -> 1.

Reduced-flash:
- no white core flash;
- lower radial peak;
- line/ring motion replaces luminance blast.


## Critical deficiencies to fix

### 1. Build a REAL vertical reel
Current production's 3 static text rows moving ~24px are not acceptable.

Implement:
```text
black clipped aperture
8–12 symbol cells
one cell height ≈ aperture height
track moves through multiple cells
real vertical travel
deceleration
snap to authoritative final card
```

Use generic visual glyph/category symbols only.

### 2. Reproduce reference radial burst
Current burst is too dim.

Target roughly:
```text
impact opacity .85–.95
settled .48–.62
large centered circular ray field
slow post-impact rotation
```

The radial burst is the dominant FX shape.

Demote/remove the irregular polygon ring if it competes visually.

### 3. Animate title exactly like reference
`LEVEL UP`:
```text
translateY about -22px
scale 1.08
opacity 0
slam to final over ~240ms
small overshoot
tight negative tracking
```

Then reveal the level badge.

### 4. Match card geometry
Desktop approximately:
```text
220–272px wide
~318px tall
12–16px gap
4px rarity top edge
reel window top ~54px
reel height ~112px
```

Neutral dark hotkey badge like the reference.

Do not use the current rarity-filled key tile.

### 5. Match focus
Add the reference hard amber outline:
```css
outline: 2px solid rgba(255,173,34,.8);
outline-offset: 4px;
```

Keep ~5px lift and slight brightness increase.

### 6. Make locks hit
Each card:
```text
snap
overshoot
35–50ms visual hold
content reveal
rarity pulse
shards
clack
```

Keep sequential lock times around:
```text
720 / 850 / 980ms
```

### 7. Replace tiny uniform shards
Use reference-style rectangular strips:
```text
base ~5×14px
amber / paper / rarity mix
varied angle
varied distance
varied rotation
varied delay
```

Use a deterministic visual PRNG keyed by reward identity.

Keep pool <=48.

### 8. Make rarity materially different
Do not stop at colors/shard count.

Common:
- dry mechanical.

Rare:
- cyan sweep + chime.

Epic:
- purple double ring + deeper hit.

Legendary:
- gold/paper core;
- stronger radial kick;
- music duck;
- bass;
- top chime;
- slightly longer settle.

`rewardCardLock` must actually use rarity.

### 9. Fix roulette audio cadence
Current fixed:
```text
58ms / 680Hz
```
is not casino-like.

Use changing interval and pitch.

Approx cadence:
```text
32,34,37,41,46,52,60,70,82,98,118,145ms
```

Reel motion and tick audio must feel synchronized.

### 10. Fix natural relic payoff bug
Current normal relic reveal does not reliably fire the same final-impact FX/audio path as fast-forward.

Detect the transition:
```text
finalVisible false -> true
```

On that transition exactly once:
```text
rarity burst
relicLock audio
Legendary duck if legendary
```

Do not replay on every snapshot.

### 11. Build a real relic reel
Do not use only:
```text
RELIC // ???
```
jitter.

Cycle generic:
```text
glyph + rarity
```
states visibly, then decelerate and lock.

### 12. Stage final relic content
Do not show all final content in one fade.

Order:
```text
rarity/icon
→ name
→ description
→ stack result
→ continue prompt
```

### 13. Match the reference continue prompt
Visually use quiet pulsing text:
```text
CLICK / SPACE TO CONTINUE
```

not a large solid amber UI button.

Keep accessible button semantics/hit target.

## Recommended code scope

Primarily:
```text
src/client/progression/rewardRevealView.ts
src/client/progression/rewardFxLayer.ts
src/client/progression/progressionOverlay.ts
src/client/ui/progression-reveal.css
src/client/audio.ts
```

Optional:
```text
src/client/progression/rewardReelAnimator.ts
```

Avoid protocol/server/progression changes unless a test reveals an actual regression.

## Visual fidelity over checklist fidelity

The previous implementation satisfied structural words like "reel" and "burst" without reproducing the illusion.

Do not do that again.

Examples:

Bad:
```text
three static labels + 24px CSS bounce = reel
```

Required:
```text
multiple cells physically pass through a clipped aperture = reel
```

Bad:
```text
opacity .22 ray texture = radial burst
```

Required:
```text
visually dominant reward starburst comparable to reference
```

## Temporal acceptance

Screenshots are insufficient.

Record/inspect real-time sequences.

Required captures:
```text
upgrade roulette 1280×720 including the full tiny-to-huge entrance
relic roulette 1280×720 including the full tiny-to-huge entrance
Epic or Legendary lock
reduced-motion entrance
```

The video must visibly prove the outer reward stage begins near pin-size, overshoots past full size, recoils, and settles.

Run production and reference side-by-side.

Implementation is not complete until a human visual comparison can say they clearly look like the same presentation.

## Tests

Preserve existing progression/input/E2E suites.

Add/update tests only for objective presentation invariants:
- real reel track contains >=8 symbol cells;
- reel viewport is clipped;
- natural relic final transition fires one impact;
- repeated snapshots do not replay impact;
- rarity lock callback receives rarity;
- reduced motion reaches final state;
- no input behavior regression.

Do not write brittle tests that force exact animation frame coordinates.

## Final requirement

The current production version feels like a functional HUD approximation.

The corrected production version must reproduce the **visual weight and motion illusion of `progression_reward_roulette_preview.html`**.

Do not stop at "implemented the requested effects." Compare it visually.
