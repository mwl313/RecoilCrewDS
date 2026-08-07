# Codex Prompt — Implement Progression Reward Roulette Presentation

Repository:
```text
https://github.com/mwl313/RecoilCrewDS
```

Target:
```text
current origin/relic-addition
```

Binding implementation design:
```text
docs/progression08/PROGRESSION_REWARD_ROULETTE_PRESENTATION_DESIGN.md
```

Also read:
```text
docs/ui/UI_DESIGN_SYSTEM.md
docs/ui/RECOIL_CREW_UI_VISUAL_REWORK_DESIGN.md
docs/progression08/PROGRESSION08_NETWORK_AND_PAUSE_GUIDE.md
docs/relics/RELIC_CHEST_WORLD_INTEGRATION_DESIGN.md
```

## Mission

Replace the current poor level-up/relic progression presentation with the reward-roulette system in the binding design.

This is a presentation/input-ownership milestone, not a progression-balance rewrite.

The two user-facing problems that must be solved are:

1. Upgrade overlay currently appears while TPS pointer lock still owns the mouse, making DOM card clicking awkward/impossible without Escape.
2. Relic reveal disappears too quickly.

## Binding interaction decisions

### Upgrade selection
Do **not** solve the problem by releasing pointer lock every time.

Implement a progression input context:

```text
pointer lock stays active when it was active
camera/gameplay input suspended
relative mouse horizontally highlights cards
left click confirms highlighted card
1/2/3 directly choose card 1/2/3
Arrow/A-D moves focus
Enter/Space confirms
```

If pointer lock was already absent on progression entry, ordinary DOM mouse hover/click remains supported.

Returning to gameplay must clear all stale deltas/button/action edges before camera/weapon input resumes.

A click used to select an upgrade must not fire a gun after resume.

### Relic reveal
Remove the normal short auto-dismiss UX.

Required:

```text
physical chest opens
→ relic roulette animation
→ final relic readable
→ CLICK / SPACE TO CONTINUE
```

No normal visible countdown.

No normal automatic ~2 second resolution.

Early click/Space/Enter while animation is running:
```text
fast-forward to final result
```

It does not dismiss.

A subsequent fresh input after the final result is armed:
```text
acknowledge/continue
```

Continuation policy:
```text
Single Player
→ local acknowledgement resolves the reveal

Multiplayer
→ each currently required connected player acknowledges independently
→ local acknowledgement shows YOU // READY
→ unacknowledged partner shows PARTNER // VIEWING
→ all required connected players ready
→ CREW READY
→ authority resumes gameplay
```

A disconnected peer must not deadlock the run.

Do not use `Infinity` in replicated timing. Model no auto deadline explicitly.

### Relic stack / non-stack rules — binding correction

Do **not** implement unique/non-stackable duplicates as XP conversion.

Authoritative eligibility must be:

```text
stackable relic
→ remains eligible after acquisition
→ can roll again
→ stack count increases
→ stack-scaled effect increases according to relic content

non-stackable relic
→ eligible only while unowned
→ after first acquisition, remove from future candidate eligibility for that match
→ never appears again
→ never converts to XP
```

Filter owned non-stackable relics before candidate selection.

Do not add a duplicate relic reward screen for non-stackables.

If future content exhausts all eligible relics in a rolled rarity, implement a deterministic documented fallback using remaining eligible relics without ever returning an owned non-stackable relic.

## Visual direction

Use the binding design's `TRIPLE LOCK` level-up sequence and `SINGLE PRIZE` relic sequence.

Key motifs:
- amber/paper radial burst;
- dark angular hardware cards;
- vertical slot/reel windows;
- rapid tick cadence;
- sequential lock hits;
- rarity-specific edge/VFX/audio;
- rectangular brass/paper/rarity shards;
- strong confirmation;
- no generic rounded modal cards;
- no glassmorphism;
- no camera FOV/yaw/pitch animation.

Use Recoil Crew design tokens/classes, not inline `style.cssText` for the rebuilt reward UI.

## Architecture

Create/adapt:
```text
RewardRevealDirector
reward reveal view
reward FX layer
progression input context
```

Do not put gameplay authority in the view.

Current package does not include GSAP. Do not add GSAP solely for this milestone. Use CSS/Web Animations API plus focused RAF coordination unless the actual checkout has already introduced a project-wide timeline dependency.

## Audit first

Before editing:
```bash
git fetch --all --prune
git switch relic-addition
git pull --ff-only origin relic-addition
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -20
```

Record starting SHA.

Inspect at minimum:
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

Reconfirm current pointer-lock and relic deadline behavior before changing it.

Also audit current relic selection/inventory behavior for the old duplicate-to-XP rule. This prompt explicitly supersedes that old rule for this task:
- stackables may repeat and stack;
- non-stackables are removed from future eligibility after acquisition;
- no duplicate XP conversion.


## Critical input rule

During progression:
```text
no camera delta
no driver movement
no dash
no jump
no MG
no cannon
no Charge Shot press/release
```

Do not rely only on server rejection. Prevent local presentations and unnecessary network actions too.

On exit clear:
```text
mouse delta
mouse button edges
MG latches
cannon latches
jump/dash latches
reward hotkey state
```

Then resume fresh gameplay input.

## Upgrade animation timing

Implement approximately:

```text
0–100ms    reward impact/vignette/radial pulse
70–280ms   LEVEL UP banner slam
180–420ms  three reel housings enter
300–820ms  rapid visual reel cycle
720–1080ms cards lock one-by-one
~1100ms    selectable
```

Result is predetermined. Reel contents are presentation only.

Rarity effects:
```text
Common     steel/paper
Rare       cyan sweep
Epic       purple ring
Legendary  gold/paper + brief reward audio duck + stronger bass hit
```

No full-screen seizure-prone flashing.

## Upgrade confirmation

Selected:
- short thrust/flash;
- effect value emphasis;
- unselected cards slide/shear away.

Single Player:
- exit promptly.

Multiplayer:
- compact selected card;
- `LOCKED IN`;
- partner ready/choosing state;
- no ongoing aggressive reel animation while waiting.

Keep existing authoritative upgrade timeout unless the binding design explicitly changes only its presentation. Make it a subtle fuse, not the primary UI.

## Relic animation timing

Physical chest remains the physical chest.

After opening:
```text
650–780ms   chest-to-center prize streak
760–1320ms  single relic reel/rarity cycling
~1320ms     final lock / audio vacuum
1320–1480ms rarity payoff
1480–1750ms name + description + stack state
then        indefinite awaiting-continue
```

Reconnect after the original animation duration should show the final awaiting-continue state rather than replaying the whole roulette.

## Repeat-acquisition presentation

Stackable relic re-acquisition:
```text
normal relic reveal
→ same relic locks
→ STACK UP
→ show old stack -> new stack
→ apply the content-defined stacked effect
→ await continue
```

Owned non-stackable relics must never reach this screen because they are removed from roll eligibility after acquisition.

There is no non-stackable roll exclusion animation.

## Single Player / Multiplayer parity

Use one reward presentation implementation.

Shared in SP and MP:
```text
same animations
same timing
same layout
same cards
same relic reveal
same controls
same pointer-lock behavior
same rarity effects
```

The only intended presentation difference is Multiplayer peer synchronization status.

Single Player:
```text
local upgrade selection confirmed
→ exit when authority allows
```

No:
```text
partner ready
partner waiting
crew ready
```

Multiplayer:
after local selection, if the other player is not ready:
```text
YOU // READY
GUNNER // CHOOSING...
```
or the corresponding Driver label.

When both are ready:
```text
YOU // READY
PARTNER // READY
CREW READY
```

then exit according to authority.

For relic continuation, Multiplayer uses a real two-player acknowledgement gate:

```text
local player continues
→ local status = READY
→ other connected player remains VIEWING / NOT READY
→ final relic screen stays visible
→ other player continues
→ both READY
→ CREW READY
→ authority resumes gameplay
```

A disconnected peer must not deadlock the run; only currently required connected players count toward the acknowledgement gate.

Single Player has no peer acknowledgement gate and no peer status row.

Outside this synchronization message/gate, SP and MP progression screens must be visually and behaviorally identical.

## Audio

Extend existing procedural/WebAudio vocabulary.

Add semantic reward sounds:
```text
level impact
roulette tick
card lock
focus
confirm
relic lock
non-stackable eligibility filtering
reward exit
```

Use short music duck on Legendary.

Do not require external sound assets for this milestone.

## Performance

- no per-frame card DOM rebuild;
- transform/opacity preferred;
- pooled shard nodes;
- target <48 active shard elements;
- no giant animated blur filter;
- no render-world duplication.

Presentation visual randomness may use a local visual PRNG seeded from `offerId` / `acquisitionSequence`.

Never use presentation randomness for authority.

## Tests

Add focused tests for:
- pointer lock retained through upgrade;
- 1/2/3 mapping;
- relative mouse focus;
- left click confirm;
- unlocked cursor fallback;
- no gameplay input leak;
- no stale mouse delta after exit;
- no cannon from selection click;
- no jump from relic Space dismissal;
- animation dedup by `offerId`;
- relic dedup by `acquisitionSequence`;
- no normal relic countdown;
- no normal relic auto-resolve;
- early relic click fast-forward only;
- second fresh click dismiss;
- Single Player has no peer-ready/waiting UI;
- Multiplayer shows peer-ready/waiting UI after local selection/acknowledgement;
- shared Multiplayer relic waits for all required connected-player acknowledgements;
- disconnected peer cannot deadlock relic continuation;
- reconnect final reveal;
- reduced motion/flash.

Run applicable:
```bash
npx tsc --noEmit
npm run generate:presentation-content
npm run generate:content-pack
npm run validate:progression-content
npm run build
npm test
npm run test:progression
npm run test:presentation
npm run test:netcode
npm run test:progression:e2e
npm run test:e2e
```

Inspect package scripts before running; use actual equivalents.

## Browser qualification

Record temporal evidence, not just screenshots.

Single Player:
```text
locked TPS
→ level-up
→ never press Escape
→ choose with 1
→ clean camera resume

next level-up
→ mouse move focus
→ left click
→ no gun fires
→ clean resume

relic
→ animation
→ early click fast-forwards
→ result stays
→ second click dismisses
→ dismissal click does not fire
```

Multiplayer:
```text
Driver chooses, waits for Gunner
Gunner chooses, waits for Driver
both resume without pointer-lock recapture click

shared relic
Driver dismisses
shared relic
Gunner dismisses
reconnect during final relic screen
```

Verify:
```text
1280×720
1920×1080
800×720
560×720
390×844
```

## Documentation

Create:
```text
docs/progression08/PROGRESSION_REWARD_ROULETTE_IMPLEMENTATION_REPORT.md
```

Include:
- start/end SHA;
- input ownership before/after;
- exact animation timing;
- authority changes to relic continuation;
- tests;
- command output;
- browser video evidence;
- performance notes;
- remaining limitations.

Update binding UI/progression docs if implementation intentionally supersedes their old short relic auto-timeout or GSAP-only recommendation.

## Forbidden

Do not:
- require Escape;
- auto release/relock pointer lock on every reward;
- use DOM cursor as the only selection method;
- let reward click fire weapons;
- alter camera orientation/FOV;
- auto-dismiss relic after ~2s;
- reroll rewards;
- change upgrade/relic balance;
- convert owned non-stackable relics into XP;
- allow owned non-stackable relics to remain eligible for future rolls;
- create different SP/MP roulette choreography beyond real Multiplayer peer-ready/waiting status;
- restore Jackpot;
- change Charge Shot;
- introduce generic rounded app UI;
- add huge dependency without reason;
- hide regressions by updating goldens.

Definition of done is the full checklist in the binding design.
