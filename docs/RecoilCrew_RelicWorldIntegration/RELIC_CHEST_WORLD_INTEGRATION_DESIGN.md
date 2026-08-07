# Recoil Crew — Full Relic Chest World Integration Design

> Reward presentation supersession (2026-08-07): the short skippable/automatic
> relic reveal described below is replaced by
> `docs/docs/progression08/PROGRESSION_REWARD_ROULETTE_PRESENTATION_DESIGN.md`.
> The physical chest lifecycle remains binding, but the UI reveal has no normal
> countdown or auto-dismiss and Multiplayer waits for each currently connected
> required player to acknowledge. Owned unique relics are filtered before roll
> selection and never convert to XP.

## Status and authority

```text
Status: Binding implementation design
Repository: https://github.com/mwl313/RecoilCrewDS
Baseline: current main at implementation time
Scope: chest world spawning, class-aware enemy drops, lifecycle, proximity opening, physical presentation, relic reveal, future multi-relic offer contract, persistent relic HUD
```

Source priority: direct user decisions → current main code/content → Progression08 design → relic table → UI design system → UI visual rework.

This milestone does **not** redesign the 28 existing relic effects. It connects the existing authoritative progression/relic system to a complete, visible in-world chest loop.

---

# 1. Current-state diagnosis

## 1.1 Why production monsters have not dropped chests

Current `ProgressionSystem.onEntityKilled()` has a modern production-monster branch that:

```text
detects enemy.monster
→ awards monster XP
→ emits reward telemetry
→ dispatches relic kill trigger
→ returns
```

The existing `enemyChestDropChance` roll is below that return in the legacy/non-monster path.

Therefore production horde monsters currently do not execute the old chest-drop roll. The same early return can bypass the older guaranteed leader-chest path.

This must be repaired before visual integration.

## 1.2 Why a logical chest could still be invisible

`MatchState.chests` already exists, but the production client does not yet provide the complete world renderer, spawn animation, proximity interaction, opening/despawn lifecycle, and persistent HUD feedback.

The finished chest asset/presentation must be reused:

```text
custom.item.relicChest
public/assets/models/items/relic-chest/relic-chest.glb

RelicChest
├── Base
│   ├── GlowOrigin
│   └── RewardAnchor
└── Lid
```

`RelicChestPresentation` already provides the 0.65 s lid opening, gold rays, aura, open/close/reset, and source-faithful chest materials.

---

# 2. Settled gameplay decisions

## 2.1 Abundance
- Spawn **10 map chests at match start**.
- Spawn additional map chests periodically during active gameplay.
- Relics should be common enough to become a major run-building layer.

## 2.2 Enemy drops
- Drop rates are class-aware.
- Special/elite enemies have much higher chest-drop probability than ordinary enemies.
- Wave leaders remain guaranteed.
- Purged enemies never drop.

## 2.3 Spawn animation
Every chest source uses the same default spawn:
```text
scale 0.001 → full scale
```
A spawning chest is never claimable. It must fully complete its spawn animation first.

## 2.4 Interaction
Automatic proximity opening. No new interaction key.

## 2.5 Claim/open/reveal
```text
proximity claim
→ authority reserves reward
→ gameplay freezes
→ physical chest opens for 0.65 s
→ gold rays expand with lid
→ relic reveal
→ gameplay resumes
```
Normal reveal target: ~2.0 s, with skip available after a short anticipation delay.

## 2.6 Reward count
Current production: one relic per chest.

The state/network architecture must support future:
```text
3 candidates → choose 1
```
without redesigning the chest contract. Triple choice is not enabled now.

## 2.7 Cleanup
```text
open through reveal
→ gold settles/fades
→ chest fades/shrinks
→ entity removed
```

## 2.8 Discovery chest
Do not ban near-spawn chests. At least one of the starting ten must be in a deliberate discovery annulus around the initial tank spawn.

Initial provisional annulus:
```text
25–55 m
```

## 2.9 Persistent HUD
All acquired relics appear once in a vertical rail on the **right side** of the gameplay HUD, with stack counts.

Relic icon art is not ready. Use the existing `iconId` contract plus a deliberate fallback; never show broken images/raw IDs/emoji.

---

# 3. Existing systems to preserve

Do not rebuild:
- all 28 relic definitions/pool
- first chest E70/L30
- later C55/R30/E13/L2
- RelicInventory and unique duplicate → XP
- RelicStatProjector
- RelicEffectRegistry
- capability system
- ROADKILL/Twin Shell/Phoenix Core/Phase Dash/etc.
- progression pause/reconnect state
- Single Player + Multiplayer progression
- finished relic chest GLB/presentation

`ProgressionSystem` remains the authority.

---

# 4. Authoritative chest lifecycle

Migrate the simple chest state into an explicit lifecycle:

```ts
type TreasureChestLifecycle =
  | 'spawning'
  | 'closed'
  | 'opening'
  | 'revealing'
  | 'open'
  | 'despawning';

interface TreasureChestState {
  id: number;
  source: 'mapStart' | 'mapPeriodic' | 'enemyDrop' | 'waveClear';
  x: number;
  y: number;
  z: number;
  lifecycle: TreasureChestLifecycle;

  spawnStartedAtGameTime: number;
  claimableAtGameTime: number;

  openingStartedAtWallMs?: number;
  fullyOpenAtWallMs?: number;

  rewardOfferId?: string;
  rewardResolved?: boolean;

  despawnStartedAtGameTime?: number;

  // temporary migration compatibility only
  opened?: boolean;
}
```

Binding transition:
```text
spawning → closed → opening → revealing → open → despawning → removed
```

Authority changes lifecycle. Client presentation never grants gameplay permission.

Claim is atomic: one chest can produce one authoritative reward only.

---

# 5. Content-driven chest policy

Add a validated content definition such as:
```text
content/relic-chest-spawn-policies/mainStage.json
```

Initial tuning:

```json
{
  "id": "relicChestSpawn.mainStage",
  "initialMapChestCount": 10,
  "initialDiscoveryChest": {
    "enabled": true,
    "minimumDistanceFromTankSpawn": 25,
    "maximumDistanceFromTankSpawn": 55
  },
  "initialMinimumChestSpacing": 28,
  "periodic": {
    "enabled": true,
    "intervalSeconds": 20,
    "intervalJitterSeconds": 4,
    "minimumDistanceFromCurrentTank": 35,
    "maximumActiveMapChests": 14,
    "maximumMapChestsSpawnedPerMatch": 20
  },
  "spawnAnimationSeconds": 0.5,
  "claimRadius": 2.6,
  "openAnimationSeconds": 0.65,
  "relicRevealSeconds": 2.0,
  "relicRevealMinimumSkipSeconds": 0.35,
  "minimumFullyOpenLifetimeSeconds": 2.0,
  "despawnAnimationSeconds": 0.45
}
```

User-settled values are 10 initial, periodic spawning, proximity opening, and spawn completion before claim. Other numbers are provisional and must remain data-driven.

Use the existing content-generation pipeline; no second JSON loader.

---

# 6. Map chest spawn director

Create a focused authoritative spawn director, not logic inside `urbanLayout.ts`.

At match start:
```text
generate exactly 10 valid map-start chest positions
```

Reserve one pass for the discovery chest in the configured annulus.

Valid placement:
- finite/in bounds
- valid grounded driveable/reachable surface
- not inside building/wall collision
- not embedded in props
- not overlapping another chest
- respects configured spacing
- avoids invalid cliff/wall surfaces

Urban street/plaza space is preferred, but the system must be map-independent.

Use dedicated deterministic RNG streams, never `Math.random()`.

---

# 7. Periodic spawning

Periodic spawn time advances only while gameplay simulation is active.

Do not advance/queue periodic spawns during upgrade/relic selection, clear, results, or game-over.

Initial:
```text
20 s nominal interval
±4 s deterministic jitter
```

Periodic spawn should be unobtrusive:
- initial minimum 35 m from current tank
- prefer occluded/non-immediate candidates where inexpensive
- never depend on local camera state for authority
- if no valid stealth candidate exists, defer rather than pop beside the tank
- do not accumulate missed timers and burst multiple chests after pause

---

# 8. Universal spawn animation

All sources:
```text
mapStart
mapPeriodic
enemyDrop
waveClear
```
use the same spawn state/presentation.

Initial:
```text
duration 0.50 s
scale 0.001 → 1.0
```

Recommended ease may have a very small overshoot (~1.04) and settle to 1.0, but no wobble/pop/negative scale.

A chest in `spawning` cannot be claimed.

If the tank remains within claim radius throughout spawn, the first authoritative step after lifecycle becomes `closed` may claim it.

Do not tint/desaturate/darken/re-material the chest.

---

# 9. Repair modern enemy reward routing

Refactor modern and legacy kill rewards into one normalized path:

```text
entity killed
→ normalize reward class
→ award XP exactly once
→ identify leader/boss
→ resolve chest reward exactly once
→ emit reward telemetry
→ dispatch relic trigger
```

Modern monsters already expose:
```ts
monster.rewardClass: 'ambient' | 'wave' | 'elite' | 'boss'
```

Use this as default class authority.

Legacy population/ownership classes map into the same normalized class.

Do not hardcode monster IDs.

Add explicit reward/chest idempotence so duplicate kill signals cannot duplicate drops.

---

# 10. Class-aware drop table

Replace the single global production chance with content-driven rates.

Initial balance:

```text
ambient/common: 1.0%
wave enemy:     2.0%
elite/special:  8.0%
boss:           0% in current single-stage mode
wave leader:    exactly 100% guaranteed
purged enemy:   0%
```

Leader gets the guarantee **instead of** a second random roll.

Optional future enemy content may supply a generic drop multiplier; do not require per-ID overrides.

Because 10 starting + periodic chests already create abundance, ordinary rates should add excitement without flooding every kill.

---

# 11. Enemy-drop safe placement

Begin from enemy death X/Z, then resolve to valid ground.

If invalid:
```text
search deterministic nearby offsets/rings
→ choose first valid grounded location
```

Never spawn inside walls/buildings/invalid terrain/NaN.

Leader chest uses the same helper.

Then lifecycle starts at `spawning`.

---

# 12. Proximity opening

Authority checks `closed` chests near the tank.

Initial claim radius:
```text
2.6 m
```

Rules:
```text
spawning in radius → no claim
closed in radius → claim
multiple candidates → nearest, then lowest ID
```

No interact button.

Only authority claims. Multiplayer clients can never independently award.

---

# 13. Future-proof reward offer shape

Do not permanently encode one scalar relic result.

Recommended wrapper:

```ts
type RelicOfferMode = 'automaticSingle' | 'chooseOne';

interface RelicCandidateResult {
  relicId: string;
  rarity: UpgradeRarity;
}

interface RelicRewardOffer {
  offerId: string;
  chestId: number;
  candidates: RelicCandidateResult[];
  selectionMode: RelicOfferMode;
  selectedIndex: number | null;
  resolved: boolean;
}
```

Current production:
```text
candidates.length = 1
selectionMode = automaticSingle
selectedIndex = 0
```

Future:
```text
candidates.length = 3
selectionMode = chooseOne
```

Do not enable triple selection now.

Keep a compatibility `RelicRollResult` (or equivalent) for the actually acquired relic.

Do not decide future 3-choice rarity strategy yet; each candidate carries its own rarity so future shared/per-candidate rarity is possible.

---

# 14. Claim/open/reveal/acquire timing

Recommended sequence:

```text
T0 proximity claim
→ offer fixed
→ chest = opening
→ gameplay pauses

T0 + 0.65 s
→ lid/rays fully open
→ chest = revealing
→ current one-candidate relic acquired/applied exactly once
→ reveal overlay begins

~T0 + 2.65 s
→ normal reveal completes
→ gameplay resumes
→ chest remains open until minimum open lifetime
→ despawn begins
```

Gameplay pause means applying at visible reveal start gives no hidden combat advantage.

Repeated snapshots/reconnect never reroll/reapply.

---

# 15. Dedicated relic reveal timing

Do not reuse the 10 s level-selection timeout.

Add:
```text
relicRevealSeconds = 2.0
relicRevealMinimumSkipSeconds = 0.35
```

Either multiplayer player may skip after the minimum anticipation.

Skip does not reroll, reapply, or cancel chest cleanup.

---

# 16. Production chest world renderer

Create e.g.:
```text
src/client/relics/relicChestWorldRenderer.ts
```

Own:
```text
Map<chestId, visual instance>
```

Responsibilities:
- instantiate/remove by authoritative state
- position chest
- derive spawn scale from authoritative timing
- call existing `RelicChestPresentation` for opening/rays
- hold open state
- drive despawn
- reconstruct lifecycle on reconnect
- dispose per-instance resources

Do not put gameplay logic in renderer.

Reuse one cached GLB; no reload per chest.

---

# 17. Material fidelity

Hard requirement.

Do not:
```text
tint
desaturate
globally darken
replace source materials
add blanket chest emissive
mutate shared cached materials
```

Use the source-faithful finished GLB.

If opacity is used during despawn, clone per-instance materials and preserve exact color/metalness/roughness while changing opacity only.

Gold VFX remains separate.

---

# 18. Despawn animation

Chest remains open through reveal.

Initial:
```text
minimum fully-open lifetime: 2.0 s
despawn: 0.45 s
```

Then:
```text
gold rays/aura fade
chest opacity/scale decreases
scale approaches 0.001
visual removed
authority removes consumed chest
```

No full-size pop-out and no hue/saturation change.

---

# 19. Right-side relic HUD rail

Follow the binding Recoil Crew UI documents.

Visual grammar:
```text
industrial arcade military
high contrast
angular hardware language
clean survival HUD
casino-energy progression
```

Avoid glassmorphism, rounded mobile inventory pills, generic neon dashboards.

## Placement
Right side:
```text
below current top-right score/run cluster
above bottom-right role/action HUD
safe-frame aware
vertical
```

Initial desktop proposal:
```text
right safe margin ~22 px
top ~112 px
cell ~42×42
gap ~6 px
```

Codex must inspect actual production computed geometry and adapt to avoid overlap.

Use ~36×36 cells at smaller viewports where needed.

## Cell
One cell per owned relic:
```text
icon/fallback
rarity frame/semantic edge
stack count
```

Recommended:
```text
stack 1 → no numeric badge
stack 2+ → ×N
```

Stable acquisition order:
```text
first acquired at top
new relic appended
stack increase updates same cell
```

If `relicStacks` cannot preserve order, add replicated:
```ts
relicAcquisitionOrder: string[]
```

## Icons
Use `RelicDefinition.iconId`.

If missing:
```text
intentional neutral relic silhouette/glyph
```

Never broken image, raw ID, or emoji.

Real icon art later must require no layout change.

## Motion
- new relic: short scale/slide impact
- stack increment: short pulse
- respect reduced motion
- no full DOM rebuild every frame

---

# 20. Relic reveal UI

The UI design docs define relic acquisition as a high-value progression reveal and recommend a reusable RewardRevealDirector.

The world chest is the physical chest. Do not render a conflicting second fake chest overlay.

Overlay focuses on:
```text
rarity
icon/fallback
relic name
description
stack result
duplicate → XP
skip/auto-complete
```

No raw internal IDs/stat IDs.

Rarity:
```text
Common neutral
Rare blue/cyan
Epic purple
Legendary gold
```

Respect reduced-flash/reduced-motion.

---

# 21. Discoverability

No minimap or chest-arrow system required now.

Discovery comes from:
```text
10 starting chests
one guaranteed discovery-annulus chest
closed golden aura
periodic replenishment
```

Future world chest markers remain compatible.

---

# 22. Networking/reconnect

Server remains authority in multiplayer.

Replicate lifecycle/timing required to reconstruct:
```text
spawning
closed
opening
revealing
open
despawning
```

Reconnect:
- spawning → correct current scale
- closed → full closed
- opening → correct progress or safely open if elapsed
- revealing → open chest + authoritative reveal
- open → open state
- despawning → correct progress

Repeated snapshots never restart acquisition.

Both players share the same relic stacks/HUD rail.

---

# 23. Single Player parity

Same logic/policies/presentation.

Only authority transport differs:
```text
Single Player local Match
Multiplayer server Match
```

No second relic implementation.

---

# 24. Telemetry

Add:
```text
initialMapChestsSpawned
periodicMapChestsSpawned
enemyDropChestsSpawned
leaderChestsSpawned
chestsClaimed
unopenedChestsAtEnd
timeToFirstChestClaim
enemyChestRollsByClass
enemyChestDropsByClass
relicsAcquired
rarityDistribution
relicDistribution
duplicateConversions
activeChestPeak
mapSpawnAttempts
mapSpawnCandidateFailures
```

Use telemetry for later tuning.

---

# 25. Required tests

## Reward routing
- modern ambient can roll chest
- modern wave uses wave rate
- modern elite/special uses elite rate
- leader gets exactly one guaranteed chest
- leader does not also random-roll
- boss policy
- purge no chest
- one kill resolves once
- legacy path still valid

Use deterministic RNG injection, not flaky probability tests.

## Initial map
- exactly 10
- at least one in discovery annulus
- valid finite placements
- no overlap/spacing violation
- deterministic same seed

## Periodic
- spawns occur
- progression pause does not accumulate burst spawns
- active/total caps
- invalid placement defers
- stealth distance

## Lifecycle/proximity
- spawn starts tiny
- spawning never claimable
- closed after authoritative completion
- tank already in radius claims after completion
- outside radius no claim
- multiple chest tie-break deterministic
- one reward only

## Reward future-proofing
- current offer has one candidate
- automatic candidate 0
- test-only 3-candidate state/network roundtrip
- triple mode disabled
- current rarity rules unchanged

## Opening/reveal/despawn
- claim pauses
- physical 0.65 s open before reveal
- apply exactly once
- skip minimum delay
- safe timeout
- minimum open life
- continuous despawn
- resource cleanup

## HUD
- one cell per relic
- stack updates same cell
- acquisition order stable
- missing icon fallback
- no raw IDs
- no overlap at 1280×720/1920×1080/800×720/560×720/390×844
- reduced motion

---

# 26. Browser qualification

Single Player:
```text
verify 10 starting chests
find discovery chest
watch spawn finish before claim
proximity open
watch physical lid/rays
see reveal
see right HUD icon
force stack and see ×N
watch despawn
observe periodic chest
force ambient/wave/elite/leader drops
```

Multiplayer:
```text
both clients see same chest
one shared opening/relic
same HUD stacks
simultaneous proximity cannot duplicate
reconnect during every lifecycle
```

Temporal animation needs video/trace/manual review; screenshots alone are insufficient.

Human-review source chest colors in production lighting.

---

# 27. Recommended implementation phases

1. Reward-routing repair and class-aware drops.
2. Chest policy schema + deterministic 10-start/periodic spawner.
3. Authoritative lifecycle + proximity claim.
4. Future-proof candidate-array reward offer.
5. Production chest renderer + tiny spawn/open/despawn.
6. Short relic reveal integration.
7. Right-side persistent relic HUD rail.
8. Multiplayer/reconnect qualification.
9. Telemetry/balance report.

---

# 28. Forbidden changes

Do not:
- rewrite relic effects or ProgressionSystem
- change E70/L30 or C55/R30/E13/L2
- let purge drop
- use Math.random authority
- let client animation decide claimability
- allow claim while spawning
- add interact key
- force periodic spawn beside tank
- grant leader guaranteed + random duplicate
- reroll/reapply on reconnect
- hardcode monster IDs for drop class
- enable triple choice now
- duplicate fake overlay chest
- alter chest color/material identity
- show raw relic/icon IDs
- invent new UI language
- bundle unrelated camera/map/monster changes

---

# 29. Definition of done

```text
[ ] production modern monsters really drop chests
[ ] class-aware rates active
[ ] elite/special higher
[ ] leader exactly one guaranteed
[ ] purge none

[ ] 10 initial deterministic map chests
[ ] discovery chest in configured annulus
[ ] periodic map spawning
[ ] valid safe placement

[ ] all chest sources tiny→full
[ ] spawn completion required before claim
[ ] automatic proximity opening
[ ] atomic one reward

[ ] real chest opens 0.65 s
[ ] rays synchronized
[ ] gameplay pause opening/reveal
[ ] one relic now
[ ] future 3-candidate contract works
[ ] short skippable reveal
[ ] authored fade/shrink despawn
[ ] source materials preserved

[ ] right-side vertical relic rail
[ ] stack counts
[ ] stable order
[ ] missing icon fallback
[ ] responsive UI-system compliance

[ ] SP pass
[ ] two-client MP pass
[ ] reconnect all lifecycle states
[ ] no duplicate acquisition
[ ] no resource leak
[ ] telemetry ready
```
