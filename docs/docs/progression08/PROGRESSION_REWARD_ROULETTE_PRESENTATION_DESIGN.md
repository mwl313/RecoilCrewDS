# Recoil Crew — Progression Reward Roulette Presentation Design
## Casino-energy level-up and relic reveals with seamless TPS input ownership

**Repository:** `mwl313/RecoilCrewDS`  
**Target branch:** `relic-addition` at implementation time  
**Scope:** level-up roulette presentation, upgrade selection interaction, relic roulette/reveal presentation, pointer-lock/input ownership, reward audio/VFX, reconnect, reduced motion/flash, tests  
**Primary goal:** make progression interruptions feel like a reward, not a web modal.

---

# 0. Product decision summary

This milestone replaces the current bare progression overlay with a dedicated reward-presentation system.

The experience target is:

```text
MegaBonk-style instant celebration
+ slot-machine/casino anticipation
+ Recoil Crew industrial hardware language
+ no TPS mouse-control whiplash
```

The presentation must be exciting without changing authoritative reward results.

## Binding decisions

### Upgrade selection
- Keep pointer lock if it was active when the reward begins.
- Do **not** force the player to press Escape.
- Do **not** require a cursor to choose an upgrade.
- `1`, `2`, `3` directly select the first, second, and third offers.
- Under pointer lock, horizontal relative mouse movement selects/highlights a card.
- Left click confirms the highlighted card.
- Arrow keys / A-D may move focus; Enter/Space confirms.
- If pointer lock was already absent when the overlay began, ordinary cursor hover/click remains supported.
- Gameplay camera, firing, dash, jump, and movement inputs are suppressed during progression presentation.
- Pointer lock is never destroyed merely to make the reward UI usable.
- When gameplay returns, stale mouse deltas and action edges are cleared before camera control resumes.

### Relic reveal
- No normal visible countdown.
- No normal automatic 2-second dismissal.
- The reveal remains until the player explicitly continues.
- After the reveal is readable, a fresh:
  - left click,
  - Space,
  - Enter
  dismisses it.
- In Multiplayer, each currently required connected player acknowledges independently; after local acknowledgement the screen shows local READY / partner VIEWING until all required connected players are ready.
- An input during the unrevealed/spinning portion **fast-forwards to the final result** but does not dismiss it.
- A second fresh input after the result is armed dismisses.
- Terminal match teardown/disconnect cleanup can still cancel presentation safely.
- Reconnect never rerolls or reapplies the relic.
- Stackable relics remain eligible after acquisition and can be rolled again; each acquisition increases their stack and stack-scaled effect according to relic content.
- Non-stackable relics are eligible only while unowned. Once acquired, they are removed from all future relic-roll eligibility for that match.
- A non-stackable owned relic must never reappear as a reward, and there is no duplicate-to-XP conversion path.

### Visual identity
Borrow the useful emotional grammar of casino/survivor reward screens:
- radial burst;
- rapid cycling;
- rising tick cadence;
- sequential locks;
- confetti/shard release;
- rarity-specific payoff;
- strong choice confirmation.

Do **not** copy MegaBonk's medieval frame or exact layout.

Recoil Crew's version remains:
- angular;
- industrial;
- mechanical;
- dark matte hardware;
- amber construction language;
- role colors;
- controlled rarity colors.

---

# 1. Why the current implementation feels bad

The current progression overlay is functionally a DOM modal.

Problems:

1. The selection screen appears while TPS pointer lock is still active.
2. The browser cursor is unavailable, so the DOM cards are technically clickable but practically inaccessible.
3. The user must press Escape to release pointer lock.
4. Escape/relock changes input state independently of progression.
5. Returning to gameplay can carry awkward mouse/context transitions.
6. The visual sequence immediately exposes static cards instead of building anticipation.
7. The relic reveal includes an auto timer and disappears before the player can read or enjoy it.
8. The current inline-styled cards do not follow the finished UI-system grammar.
9. The reward interruption feels like a web dialog rather than a game event.

The fix is not "release pointer lock when modal opens."

That solves only the cursor symptom and creates a second problem: browsers generally treat pointer-lock acquisition as a user-gesture operation. Multiplayer can remain paused waiting for the other player after the local click, so there may be no suitable gesture at the actual gameplay-resume moment.

The more robust design is a dedicated **progression input context** that works inside pointer lock.

---

# 2. Presentation architecture

Create:

```text
RewardRevealDirector
```

Suggested client structure:

```text
src/client/progression/
├── rewardRevealDirector.ts
├── rewardRevealView.ts
├── rewardFxLayer.ts
├── rewardAudio.ts              // optional facade over AudioManager
├── progressionInputContext.ts
├── progressionOverlay.ts       // refactor/current compatibility shell
└── progression-reveal.css
```

The director owns presentation state, not gameplay authority.

```ts
type RewardPresentationState =
  | 'hidden'
  | 'intro'
  | 'spinning'
  | 'decelerating'
  | 'revealed'
  | 'selectable'
  | 'confirmed'
  | 'waitingForPeer'
  | 'awaitingContinue'
  | 'exiting';
```

Authoritative result remains:

```text
simulation/server decides reward
→ replicated reward state arrives
→ RewardRevealDirector presents that already-fixed state
```

Never roll gameplay results inside presentation code.

---

# 3. Input architecture — solve pointer lock properly

## 3.1 Add input contexts

Recommended:

```ts
type InputContext =
  | 'gameplay'
  | 'progressionUpgrade'
  | 'progressionRelic'
  | 'pause'
  | 'disabled';
```

`InputManager` remains the owner of:
- raw keyboard;
- raw mouse;
- pointer lock;
- relative mouse deltas;
- mouse buttons.

`GameClient` / a focused progression input controller decides what those raw inputs mean.

## 3.2 Context transition

When authoritative flow changes:

```text
playing
→ upgradeSelection
```

perform:

```text
clear gameplay mouse buttons
clear dash/jump/action latches
clear accumulated mouse delta
record whether pointer lock is currently active
keep pointer lock unchanged
set context progressionUpgrade
stop camera consumption
stop gameplay weapon/action polling
```

For:

```text
relicOpening / relicSelection
```

use:

```text
set context progressionRelic
keep pointer lock unchanged
clear gameplay actions
```

On return:

```text
progression context
→ playing
```

perform:

```text
clear relative selection delta
clear mouse-button edges
clear movement/action latches
set gameplay context
wait one RAF/input frame before camera consumes fresh relative movement
resume camera
```

This prevents the first post-overlay frame from receiving stale progression motion.

## 3.3 Upgrade input mapping

### Direct selection
```text
Digit1 / Numpad1 → offer 0
Digit2 / Numpad2 → offer 1
Digit3 / Numpad3 → offer 2
```

These shortcuts are always shown on the three cards.

### Pointer-locked mouse selection
Maintain a virtual horizontal selector:

```ts
virtualSelectionX: number // 0..1
```

On relative mouse movement:

```text
virtualSelectionX += movementX * sensitivity
clamp 0..1
```

Card zones:

```text
0.00–0.333 -> card 1
0.333–0.666 -> card 2
0.666–1.00 -> card 3
```

Add a small hysteresis margin around boundaries so tiny movement does not flicker between cards.

Do not render a fake OS cursor.

Instead, the active card gets a strong mechanical focus state:
- 3px semantic top edge;
- amber/role bracket rails;
- small `// SELECT` utility label;
- slight 4px upward/forward translation;
- short focus click sound on index change.

### Other controls
```text
ArrowLeft / A  → previous card
ArrowRight / D → next card
Enter / Space  → confirm highlighted card
Left click     → confirm highlighted card
```

`A/D` only perform this behavior in progression context. They must not mutate driver steering.

## 3.4 Mouse-unlocked fallback

If the player entered progression while pointer lock was already absent:

- keep it absent;
- enable normal DOM hover/click;
- keyboard mappings still work.

Do not automatically steal pointer lock from an unlocked user when progression ends.

Store:

```ts
pointerLockWasActiveOnProgressionEntry
```

The key requirement is no forced pointer-lock state transition caused solely by reward UI.

## 3.5 Gameplay suppression

While progression context is active:

- `consumeMouse()` for camera returns zero or camera path does not consume it;
- `pollGunnerActions()` must not emit MG/cannon actions;
- `sampleDriverInput()` must not submit driving/dash/jump;
- local cannon presentation must not fire;
- held charge is cancelled/cleared safely;
- mouse button presses are interpreted by reward UI;
- no network gameplay action spam occurs.

Authority already pauses simulation; client presentation/input must match that state.

---

# 4. Level-up sequence — "TRIPLE LOCK"

This is the default level-up/upgrade roulette presentation.

Target time from authoritative state arrival to fully readable/selectable cards:

```text
~1.10–1.30 seconds
```

It should be dramatic but short enough to happen repeatedly.

---

## 4.1 Stage A — reward hit
### 0–100 ms

On entry:

```text
gameplay freezes
HUD priority recedes
reward vignette rises
one radial amber-white pulse expands from center
LEVEL UP impact sound
```

Visual:
- background world remains visible;
- no camera yaw/pitch/FOV animation;
- 50–65% dark vignette at edges;
- center stays readable;
- a thin radial burst begins behind future cards.

No full white flash for ordinary level-ups.

A very short 20–30ms paper-white center pulse is allowed at low opacity.

---

## 4.2 Stage B — level banner slam
### 70–280 ms

Display:

```text
LEVEL UP
LEVEL <N>
```

Recommended composition:

```text
small utility: FIELD UPGRADE AVAILABLE
large: LEVEL UP
large numeric badge: 12
```

Motion:
- title begins 20px above;
- 1.08 scale;
- lands to 1.0 with hard ease;
- mechanical overshoot no more than 3px.

Behind it:
- 24–32 radial ray wedges;
- asymmetric ray lengths;
- amber + paper at low opacity.

At approximately 230 ms, title compacts upward to make space for the card bank.

---

## 4.3 Stage C — card bank enters
### 180–420 ms

Three dark angular hardware plates enter from below.

Layout at desktop:

```text
card 1   card 2   card 3
```

Each card:
- approx 230–260px width;
- 300–340px height depending on content;
- cut corners from design system;
- matte near-black;
- one strong rarity edge, not a glowing border around every side;
- large icon/glyph zone;
- name;
- rolled effect;
- hotkey badge `1`, `2`, `3`.

Entrance stagger:

```text
card 1 +0 ms
card 2 +35 ms
card 3 +70 ms
```

They enter as closed "reel housings" before final content is readable.

---

## 4.4 Stage D — slot/reel spin
### 300–820 ms

Each card contains a vertical reel window.

Presentation-only reel content may cycle:
- category icons;
- rarity bars;
- abbreviated labels;
- numeric fragments.

Do not consume authority RNG.

Do not alter the final offer.

Do not imply that a cycling item was actually available in the final selection.

A safe approach is to use:
- category silhouettes;
- rarity color strips;
- generic stat glyphs;
rather than full misleading item names.

### Tick cadence

Example tick schedule:

```text
32 ms
34
37
41
46
52
60
70
82
98
118
```

Each reel can start 20–35 ms offset from the previous reel.

Audio tick pitch rises slightly during the fastest phase, then drops/heavies as the lock approaches.

---

## 4.5 Stage E — sequential locks
### 720–1080 ms

Lock the three actual offers one by one:

```text
card 1 locks
+130 ms
card 2 locks
+130 ms
card 3 locks
```

Each lock:

```text
reel snaps to authoritative offer
2–3px vertical impact
36–50ms micro hold
mechanical clack
rarity edge ignites
small shard burst
```

Do not use actual gameplay hit-stop because gameplay is already paused.

The "hit-stop" is purely a pause/hold in the UI timeline.

### Rarity lock treatment

#### Common
- paper/steel edge;
- 4–6 tiny fragments;
- dry metal click;
- no bloom blast.

#### Rare
- cyan edge sweep;
- 8–10 shards;
- short high chime after clack.

#### Epic
- purple edge;
- double ring pulse behind card;
- 12–16 shards;
- stronger low hit + chime.

#### Legendary
- gold edge;
- 40–60ms reward-audio vacuum/duck;
- 18–24 shards;
- paper-white core pulse;
- wider amber radial shock;
- deeper bass lock;
- 100–140ms longer settle than Common.

Rarity affects coordinated:
- timing;
- line weight;
- VFX count;
- sound;
- brief luminance;
not merely glow.

---

## 4.6 Stage F — selectable state
### ~1100 ms onward

Title changes to:

```text
CHOOSE UPGRADE
```

The radial burst slows and holds.

Do not continuously spin/flicker once the user must read.

Selectable card behavior:

Inactive:
- stable;
- dark;
- rarity edge visible.

Focused:
- translateY(-4px);
- stronger top/left hardware edge;
- `// SELECT` appears;
- effect value brightens;
- small focus tick.

Do not use large float/bob loops.

### Key labels

Prominently show:

```text
[1]
[2]
[3]
```

Prefer top-left of each card, large enough to read instantly.

This makes selection discoverable even if the player never moves the mouse.

---

# 5. Upgrade confirmation

When the player chooses a card:

## 5.1 Confirmation impact
### 0–80 ms

Chosen card:
- 4% scale/plate thrust;
- rarity core flash;
- confirm thump;
- effect value flashes once.

Unchosen cards:
- instantly lose focus edge;
- darken 25%.

## 5.2 Reject the other outcomes
### 80–260 ms

Unselected cards:
- shear/slide outward;
- 28–48px horizontal travel;
- fade to 0;
- small particle strips pull toward selected card or offscreen.

Selected card remains centered/weighted.

## 5.3 Single Player
After approximately 250–330 ms:

```text
selected plate exits upward
vignette/rays collapse
gameplay layer returns
input context -> gameplay
fresh mouse frame begins
```

No pointer-lock operation occurs.

## 5.4 Multiplayer local-lock state

If the peer still needs to choose:

```text
<SELECTED UPGRADE>
LOCKED IN

DRIVER  READY
GUNNER  CHOOSING...
```

or inverse depending on role.

The chosen card stays as a compact stable plate.

No roulette motion remains.

Keep:
- light radial background;
- low particle activity;
- peer status.

Do not keep an aggressive casino loop while waiting.

When the second player completes:
- dual side lamps flash;
- short `CREW LOCKED` utility callout;
- exit within 250ms.

---

# 6. Upgrade timeout presentation

The authoritative upgrade timeout may remain for Multiplayer deadlock protection unless separately redesigned.

Do not make the countdown the visual focus.

Recommended presentation:

```text
thin perimeter/fuse line along bottom of reward composition
```

For most of the timer:
- no large numeral.

At last 3 seconds:
```text
AUTO 3
AUTO 2
AUTO 1
```

small but visible near the lower rule.

Single Player may continue using the existing authority contract for now unless a separate gameplay decision removes the timeout.

This milestone does not silently alter level-up timeout gameplay rules.

---

# 7. Relic sequence — "SINGLE PRIZE"

Relic acquisition should feel more valuable than a normal level-up because there is one large run-defining prize.

Target animation before readable final state:

```text
~1.70–2.10 seconds after relic-reveal phase begins
```

The physical world chest still opens first.

---

# 8. Physical chest → UI handoff

Existing intended world sequence remains:

```text
proximity claim
→ gameplay freeze
→ physical chest opens
→ gold rays expand
→ relic presentation
```

Do not cover the chest instantly with a fake second chest.

## 8.1 During physical opening
### T0–650 ms

Overlay:
- edge vignette grows;
- center remains mostly clear so player sees the real chest;
- subtle radial line source is centered on projected chest location;
- music ducks modestly;
- no relic card yet.

At ~500 ms:
- small utility text can appear near center:

```text
RELIC SIGNAL ACQUIRED
```

No name/rarity yet.

---

# 9. Relic roulette / anticipation

At physical open completion:

## 9.1 Prize transfer
### 650–780 ms

Project the world chest reward anchor to screen coordinates.

Send:
- 6–10 gold line streaks;
- 2–4 heavier rectangular fragments;
from chest position toward screen center.

At center they collapse into a single dark relic plate/silhouette.

If the exact world reward anchor is not accessible in the client integration, use the rendered chest center as fallback.

---

## 9.2 Single reel spin
### 760–1320 ms

The relic plate begins as:

```text
RELIC
???
```

Around it:
- rarity strips cycle;
- abstract relic silhouettes cycle vertically;
- edge lamps tick;
- radial burst accelerates.

Suggested cadence:

```text
45
48
52
58
65
74
86
102
124
155 ms
```

Do not display the final name until lock.

Do not consume RNG.

The authoritative relic is already fixed.

---

# 10. Relic lock and rarity payoff

## 10.1 Audio vacuum
Immediately before final lock:

```text
50–90 ms music/effect duck
```

The reel nearly stops.

One last mechanical tick.

## 10.2 Final impact
### ~1320–1480 ms

Reveal:
- final rarity;
- icon/fallback silhouette;
- relic name.

Motion:
- plate punches 5–7px forward;
- icon rises 12px and settles;
- final rarity edge draws around selected sides;
- radial rays expand once.

### Common
- steel/paper hit;
- small amber accent.

### Rare
- cyan sweep + short ray pulse.

### Epic
- purple ring + spiral fragment arc.

### Legendary
- gold + paper core;
- stronger radial burst;
- brief controlled whole-screen luminance pulse;
- largest bass hit;
- longer settling chime;
- no text reading `JACKPOT`.

Recoil Crew has casino energy; it does not restore the removed Jackpot gameplay concept.

---

# 11. Relic readable state

### ~1480–1750 ms

After name impact, reveal:

```text
RARITY
RELIC NAME
DESCRIPTION
STACK ×N
```

or:

```text
STACK UP
NEW STACK
```

Description enters last.

No typewriter effect.

Use one short upward/fade motion.

The final state must be readable indefinitely.

---

# 12. Relic dismissal behavior — no normal timer

After the final content settles:

```text
CLICK / SPACE TO CONTINUE
```

or Multiplayer:

```text
CLICK / SPACE TO CONTINUE
EITHER CREW MEMBER MAY CONTINUE
```

Do not show:
- `AUTO 2`;
- `SKIP 0.3`;
- countdown timer.

## 12.1 Fresh-input arming

Avoid accidental dismissal from the input that caused the chest interaction or a held cannon button.

On relic presentation entry:
- clear mouse-button state;
- require release before next press counts;
- clear Space/Enter held state.

Then:

```text
during intro/spinning:
fresh continue input -> fast-forward to final reveal
```

The same input does **not** dismiss.

After the final result has been visibly stable for approximately:

```text
200–300 ms
```

arm:

```text
awaitingContinue
```

A second fresh input dismisses.

This gives experienced players a fast path without letting one accidental click erase the reward.

## 12.2 Authority

Replace the normal short relic auto-dismiss behavior.

Authoritative relic-selection state remains until:
- explicit continue/ack from an eligible player;
- terminal match teardown;
- room/match destruction.

Multiplayer:
- either Driver or Gunner may acknowledge;
- acknowledgement is idempotent;
- result cannot reroll/reapply.

Reconnect:
- reconstruct the authoritative result;
- if reveal animation elapsed, reconnect directly into final `awaitingContinue`;
- do not replay the entire roulette unless the authoritative reveal genuinely began only moments ago.

---

# 13. Relic eligibility and repeat-acquisition presentation

There is **no duplicate-conversion reward flow** for non-stackable relics.

## 13.1 Stackable relics

Stackable relics remain in the eligible relic pool after acquisition.

When the same stackable relic is rolled again:

```text
normal relic roulette
→ same relic locks again
→ stack result increments
→ stack-scaled effect is applied according to relic content
→ final screen emphasizes the new stack
```

Example:

```text
MAGNET CORE ×1
→ later rolls MAGNET CORE again
→ MAGNET CORE ×2
→ effect reflects two stacks
```

Presentation should make the repeat acquisition feel intentional rather than mistaken:

```text
MAGNET CORE
STACK UP
×1 → ×2
```

Use a short extra stack pulse/impact after the normal relic lock.

Do not call this a duplicate error or consolation reward.

## 13.2 Non-stackable relics

Non-stackable relics are **roll-limited**, not duplicate-converted.

Once one is acquired:

```text
owned non-stackable relic
→ remove from future eligible relic candidate pool
→ it cannot appear again in that match
```

Required invariant:

```text
nonStackable && owned
=> ineligibleForRoll
```

Do not:
- roll it and convert it to XP;
- show a duplicate screen;
- add a second stack;
- reapply its unique effect;
- consume a chest on an impossible result.

The authoritative offer generator must filter owned non-stackable relics **before candidate selection**.

If a future content set exhausts every relic of a rolled rarity after eligibility filtering, use a deterministic documented fallback that selects from remaining eligible relics without reintroducing an owned non-stackable relic. Current shipped content should still preserve the configured rarity rules whenever an eligible relic exists in that rarity.

---

# 14. Screen FX language

Create a dedicated fixed layer:

```text
reward-fx-layer
```

Responsibilities:
- vignette;
- radial rays;
- scan sweep;
- rarity ring;
- shards;
- short center pulse.

## 14.1 Radial burst

Use CSS/DOM rather than manipulating the TPS camera.

Suggested:
- conic-gradient mask or 24–32 preallocated ray nodes;
- center behind card bank;
- slow rotation after reveal no more than a few degrees per second;
- opacity low during reading state.

## 14.2 Shards

Recoil Crew replacement for generic confetti:

```text
brass ticket strips
paper-white chips
rarity-color fragments
small rectangular armor flakes
```

Not:
- round emoji confetti;
- rainbow paper;
- hearts/stars.

Particle cap:
```text
ordinary lock: 4–10
Epic: 12–16
Legendary: 18–24
full sequence peak target: <48 active DOM shard nodes
```

Pool/reuse nodes.

Do not allocate hundreds of elements per level-up.

## 14.3 Screen shake

Do not shake the actual gameplay camera on reward entry/exit.

If desired:
- 2–3px transform shake on reward composition only;
- maximum ~80ms.

The user must return to exactly the same TPS camera pose.

---

# 15. Audio design

The current game already synthesizes much of its audio through WebAudio.

Do not require external sound assets for the first implementation unless a later audio pass replaces them.

Add semantic reward cues such as:

```text
rewardLevelImpact
rewardTick
rewardCardLock
rewardFocus
rewardConfirm
relicCharge
relicLock
relicStackUp
rewardExit
```

Rarity may be a parameter rather than separate sound enum members.

## 15.1 Roulette tick

Very short:
- square/triangle click;
- ~20–35ms;
- pitch changes with reel cadence.

Avoid piercing volume.

## 15.2 Lock

Combine:
- 120–220Hz short mechanical thump;
- 700–1100Hz metal click.

## 15.3 Legendary

Use:
- brief music duck;
- 45–70Hz bass drop;
- three-note upper chime;
- noise sweep.

No prolonged ear-fatiguing siren.

## 15.4 Ducking

Add a small API rather than directly mutating music gain from view code:

```ts
audio.duckForReward({
  depth: 0.25,
  attackMs: 40,
  holdMs: 80,
  releaseMs: 450,
});
```

---

# 16. Rarity visual matrix

| Rarity | Primary | Timing | Shards | Pulse | Audio |
|---|---|---:|---:|---|---|
| Common | steel/paper | baseline | 4–6 | single tight | dry click |
| Rare | cyan | +30ms settle | 8–10 | cyan sweep | click + chime |
| Epic | purple | +60ms settle | 12–16 | double ring | low hit + chime |
| Legendary | gold/paper | +100–140ms settle | 18–24 | wide radial + core | duck + bass + chime |

Rarity identity must still be obvious with glow disabled.

---

# 17. CSS/DOM component design

Stop building these screens through large inline `style.cssText` blocks.

Use semantic classes.

Suggested:

```text
.reward-overlay
.reward-scrim
.reward-burst
.reward-stage

.reward-title
.reward-level-number

.reward-card-bank
.reward-card
.reward-card__hotkey
.reward-card__reel
.reward-card__icon
.reward-card__rarity
.reward-card__name
.reward-card__effect
.reward-card__focus-rail

.reward-relic
.reward-relic__icon
.reward-relic__name
.reward-relic__description
.reward-relic__stack

.reward-continue
.reward-peer-status
.reward-auto-fuse

.reward-shard-layer
.reward-ring
.reward-scan
```

Use binding visual tokens and cut polygons from `UI_DESIGN_SYSTEM.md`.

No rounded 10px web-card corners.

No generic glassmorphism.

---

# 18. Animation technology

The current package does not include GSAP.

For this milestone, do **not** add a large dependency solely for two bounded reward timelines.

Recommended:
- CSS transitions/keyframes for stable component states;
- Web Animations API for one-shot coordinated entrance/lock/exit movements;
- `requestAnimationFrame` only for timeline phase coordination, virtual selector, and small pooled particles.

Keep `RewardRevealDirector` API timeline-library-agnostic so a future project-wide cinematic library can replace the implementation without changing game state/input contracts.

If the team explicitly chooses GSAP for boss intros/results later, this director can be migrated then.

---

# 19. Reduced motion and reduced flash

## Reduced motion

Skip:
- reel scrolling;
- shard ballistic motion;
- large translations.

Use:

```text
impact fade
→ final cards appear
→ short rarity edge draw
→ selectable
```

Target:
```text
250–350ms
```

Relic:
```text
physical chest completes
→ final relic plate fades in
→ awaiting continue
```

## Reduced flash

Remove:
- paper-white core pulses;
- rapid rarity luminance cycling;
- high-opacity radial shocks.

Keep:
- color edge;
- line weight;
- audio;
- controlled motion.

Both modes must preserve all information and input behavior.

---

# 20. Single Player / Multiplayer presentation parity

The progression reward screens must be visually and interactively the **same system** in Single Player and Multiplayer.

Shared across both modes:

```text
same level-up intro
same roulette timing
same card layout
same rarity effects
same selection controls
same relic roulette
same relic timing
same click/Space continue behavior
same pointer-lock handling
same animation quality
same responsive layout
```

Do not create:
- a simplified Single Player reward screen;
- a slower/faster Multiplayer roulette;
- separate CSS themes for SP vs MP progression;
- different card sizes or content hierarchy;
- different relic reveal choreography.

## The only intended mode-specific presentation difference

### Single Player

After the local player selects an upgrade:

```text
selection confirmed
→ confirmation animation
→ reward overlay exits
→ gameplay resumes
```

There is no peer status row, no READY/WAITING copy, and no empty placeholder for another player.

For relics:

```text
final relic reveal
→ CLICK / SPACE TO CONTINUE
```

No peer-ready message.

### Multiplayer

After the local player selects an upgrade, if the other crew member has not yet completed their selection, keep the local confirmed card visible in the calm waiting state and show peer status.

Example:

```text
YOU // READY
GUNNER // CHOOSING...
```

or:

```text
YOU // READY
DRIVER // CHOOSING...
```

When the other player becomes ready:

```text
YOU // READY
GUNNER // READY
```

Briefly show:

```text
CREW READY
```

then exit when authority resumes gameplay.

For shared relic reveals, both players see the same reveal.

After the local player presses continue:

```text
YOU // READY
PARTNER // VIEWING...
```

The local relic screen remains in its final, calm readable state while waiting.

When the other connected player also acknowledges:

```text
YOU // READY
PARTNER // READY
CREW READY
```

Then the authority resumes gameplay and both clients exit together.

This Multiplayer two-acknowledgement rule exists specifically so each player has enough time to read the relic and so the screen can truthfully communicate whether the other player is ready to play.

There is no visible countdown.

Disconnect rule:
- a disconnected peer cannot deadlock the run forever;
- if only one eligible connected player remains, that player's acknowledgement is sufficient;
- reconnect restores the correct ready/viewing state without rerolling or reapplying the relic.

### Parity invariant

Outside the peer-ready/waiting message required by Multiplayer synchronization:

> Single Player and Multiplayer progression screens are the same presentation.

---

# 21. Multiplayer behavior

### Upgrade
Each client receives its own applicable offer.

Presentation uses the exact same roulette, cards, timing, rarity effects, and controls as Single Player.

After local selection:
- no gameplay resumes until authority says selection complete;
- selected card remains stable;
- the **only added Multiplayer UI** is real peer-ready/waiting status from replicated state.

Do not unlock the camera while waiting.

### Relic
Relic is team-shared.

Both clients:
- see the same relic;
- see the same stack result;
- see the same rarity;
- enter the same authoritative reveal;
- use the same animation and continue controls as Single Player.

Multiplayer shows peer-ready/waiting status when one player has acknowledged and the other has not.

For a shared relic reveal, each connected player must acknowledge once. Gameplay resumes when all currently required connected players are ready. A disconnected peer must not deadlock the run.

Repeated/stale acknowledgements are idempotent.

The UI must display actual readiness faithfully and must not add any other SP/MP visual difference.

---

# 22. Reconnect behavior

Presentation identity:

```text
upgrade -> offerId
relic -> acquisitionSequence
```

Never restart simply because another snapshot arrives.

For reconnect to upgrade:
- show current actual cards immediately;
- if intro timing is unknown/old, skip roulette and enter selectable/waiting state;
- preserve local/peer selected state.

For reconnect to relic:
- show authoritative result;
- if the original reveal start is older than animation duration, show final awaiting-continue state;
- do not replay acquisition;
- do not emit reward audio repeatedly on every snapshot.

---

# 23. Input edge safety

Mandatory regression rule:

```text
no progression input may leak into the first gameplay frame
```

On progression exit clear:
- relative mouse accumulator;
- primary/secondary held edge;
- MG start/stop latches;
- cannon press/release latches;
- jump latch;
- dash latch;
- recenter latch if used by reward controls;
- temporary selector key state.

A click used to dismiss a relic must **not** fire the cannon after gameplay resumes.

A Space press used to dismiss a relic must **not** jump the tank after gameplay resumes.

---

# 24. Upgrade accessibility

Even though pointer-locked selection is the premium interaction:

- DOM cards remain real buttons;
- visible focus state;
- Tab/Shift+Tab works when cursor/unlocked accessibility mode is active;
- Enter activates focused button;
- `1/2/3` remain shortcuts;
- text does not rely only on color;
- rarity is written;
- reduced motion/flash respected.

---

# 25. Recommended implementation changes

Inspect and modify at minimum:

```text
src/client/input.ts
src/client/main.ts
src/client/app/gameClient.ts
src/client/progression/progressionOverlay.ts
src/client/audio.ts
src/client/ui/
src/shared/progression/progressionTypes.ts
src/shared/progression/progressionSystem.ts
src/shared/net/protocol.ts
src/server/room.ts
content/relic-chest-spawn-policies/mainStage.json
tests/progression08/
e2e/progression-*.spec.ts
package.json
```

Do not change gameplay reward math in this milestone except the relic auto-dismiss/ack timing contract explicitly described above.

---

# 26. New client state contract

Recommended `GameClient` helper:

```ts
private progressionInputMode:
  | { kind: 'none' }
  | {
      kind: 'upgrade';
      offerId: string;
      highlightedIndex: number;
      virtualX: number;
      localSelectionSent: boolean;
      pointerWasLocked: boolean;
    }
  | {
      kind: 'relic';
      acquisitionSequence: number;
      phase: 'animating' | 'awaitingContinue';
      pointerWasLocked: boolean;
    };
```

The view should not own authority.

The input controller sends:
- `submitUpgrade(index)`;
- `continueRelic(acquisitionSequence)`.

---

# 27. Relic authority timing change

Current behavior includes a short reveal deadline/auto resolution.

Change contract to:

```text
opening deadline
→ physical opening completes
→ authoritative relic reveal begins
→ no normal auto-resolve deadline
→ explicit continue resolves
```

Keep:

```text
minimum continue arm time
```

only to prevent immediate accidental acknowledgement.

A useful authority field:

```ts
revealStartedAtWallMs: number;
continueAllowedAtWallMs: number;
```

The client may animate longer than `continueAllowedAtWallMs`; it should not send continue until its local final result is actually visible unless fast-forward was requested.

Do not represent "never expires" with `Infinity` in network state.

Model absence of an auto deadline explicitly.

---

# 28. Early fast-forward behavior

For experienced players:

### Upgrade
Optional:
- a selection key during reel animation may fast-forward the **presentation only** to selectable cards;
- it must not select before final cards are visible.

This can be enabled after initial implementation if it feels necessary.

### Relic
Binding:
- click/Space/Enter during animation fast-forwards to final result;
- does not dismiss;
- a subsequent fresh input dismisses.

This avoids long forced repetition while protecting the first viewing.

---

# 29. Test plan

## Unit / DOM

### Pointer lock retained
Start gameplay locked:

```text
upgradeSelection begins
→ pointer lock remains active
→ camera does not consume reward mouse delta
```

### Number selection
```text
Digit1 -> submit card 0 once
Digit2 -> card 1
Digit3 -> card 2
key repeat -> no duplicate submission
```

### Relative mouse
```text
movement right -> focus advances
movement left -> focus retreats
boundary hysteresis -> no flicker
left click -> selected focus submitted
```

### Gameplay suppression
During upgrade/relic:
```text
left click does not fire MG/cannon
right click does not charge/fire cannon
Space does not jump
Shift does not dash
WASD does not send driving movement
```

### Exit
```text
dismiss/selection click does not leak into gameplay
first gameplay RAF mouse delta = fresh only
```

## Upgrade animation

- presentation starts once per `offerId`;
- three final cards exactly match authoritative offer;
- reel is presentation only;
- selectable only after reveal;
- local selection disables additional submissions;
- peer waiting state;
- timeout still authority-owned;
- repeated snapshot does not restart.

## Relic

- physical opening precedes relic reveal;
- no normal countdown text;
- no normal auto resolve;
- early click fast-forwards;
- same early click does not dismiss;
- fresh second click dismisses;
- Space/Enter equivalent;
- each connected MP player acknowledges once;
- local acknowledgement shows READY while waiting for the peer;
- gameplay resumes when required connected players are ready;
- duplicate acknowledgement ignored;
- reconnect final state;
- stack count correct;
- repeat-acquisition stack-up animation correct.

## Reduced motion / flash

- final state reachable;
- input works;
- no information missing;
- durations collapse appropriately.

---

# 30. E2E qualification

Single Player:

```text
enter gameplay with pointer lock
force level up
never press Escape
select 1 with key
verify camera returns smoothly

force next level
move locked mouse to highlight card
left click select
verify no cannon/MG action leaks

force relic chest
watch physical opening
watch relic roulette
verify screen remains indefinitely
click once during spin -> reveal only
click again -> continue
verify dismissal click does not fire weapon
```

Multiplayer:

```text
both clients pointer locked
force level up
Driver chooses and waits
Gunner chooses
both resume with no relock click

repeat reverse order

force relic
both see same result
Driver dismisses -> both resolve

repeat Gunner dismisses
reconnect during final relic screen
result remains stable
```

Visual QA:
- 1280×720;
- 1920×1080;
- 800×720;
- 560×720;
- 390×844.

Record a short video for temporal review. Screenshots alone cannot prove roulette pacing.

---

# 31. Performance constraints

- no full card DOM rebuild every frame;
- no full-screen canvas particle simulation just for reward UI;
- <48 shard nodes active target;
- pooled nodes;
- no `filter: blur()` animation on large full-screen layers;
- no camera render duplication;
- no per-frame layout thrashing;
- transform/opacity preferred for animation;
- no `Math.random()` for gameplay authority;
- presentation randomness may use a local visual PRNG seeded by `offerId`/`acquisitionSequence` for repeatable E2E evidence.

---

# 32. Forbidden implementations

Do not:

- force Escape to choose upgrades;
- release/reacquire pointer lock for every reward by default;
- require a normal cursor for core reward selection;
- let selection clicks fire weapons;
- let dismissal Space cause a jump;
- shake or reset TPS camera orientation;
- change camera FOV as the progression handoff;
- auto-dismiss relic after ~2 seconds;
- show an obvious relic countdown;
- reroll reward during animation;
- change result when player fast-forwards;
- show raw stat IDs;
- use rounded generic web cards;
- add rainbow neon/glassmorphism;
- use hundreds of confetti DOM nodes;
- use the word `JACKPOT` as a gameplay feature/reward label;
- add GSAP solely because an older design draft mentioned it;
- change relic rarity probabilities;
- change upgrade reward math;
- change Charge Shot behavior;
- change combat camera behavior outside reward input suppression.

---

# 33. Definition of done

```text
[ ] Level-up begins with a short high-impact reward hit.
[ ] Three upgrade reels visibly spin/decelerate/lock.
[ ] Final cards match authority exactly.
[ ] Rarity changes coordinated timing/VFX/audio.
[ ] Cards become readable before selection.
[ ] 1/2/3 select offers.
[ ] Pointer-locked mouse highlights offers.
[ ] Left click confirms highlighted offer.
[ ] Normal cursor click still works when already unlocked.
[ ] Upgrade overlay never requires Escape.
[ ] Pointer lock is not destroyed by normal reward presentation.
[ ] Camera does not move during reward selection.
[ ] No gameplay action leaks through reward input.
[ ] Return to TPS has no stale delta/click/jump/dash.
[ ] Multiplayer waiting state is calm and readable.
[ ] Physical relic chest opens before UI prize reveal.
[ ] Relic has a longer casino-style single-prize anticipation.
[ ] Relic has no normal visible timer.
[ ] Relic does not normally auto-dismiss.
[ ] Early click fast-forwards only.
[ ] Fresh click/Space/Enter after reveal dismisses.
[ ] Multiplayer shows real peer-ready/waiting state after local confirmation/acknowledgement.
[ ] Shared Multiplayer relic reveal waits for all required connected players to acknowledge.
[ ] A disconnected peer cannot deadlock the relic reveal.
[ ] Single Player never shows peer-ready/waiting UI.
[ ] Dismissal is idempotent and does not reapply.
[ ] Reconnect does not restart old roulette.
[ ] Reacquiring a stackable relic shows a satisfying stack-up animation.
[ ] Owned non-stackable relics are excluded from future roll eligibility and never reappear.
[ ] Reduced motion and reduced flash work.
[ ] Presentation obeys Recoil Crew UI geometry/type language.
[ ] Test suite and E2E prove pointer-lock/input safety.
[ ] Short gameplay capture receives human temporal review.
```

Final experience invariant:

> Progression should feel like the game briefly turned into a reward machine, not like the browser opened a modal. The player never has to fight pointer lock, never loses their TPS camera orientation, and every reward gets enough anticipation and impact to feel valuable before control returns instantly and cleanly.
