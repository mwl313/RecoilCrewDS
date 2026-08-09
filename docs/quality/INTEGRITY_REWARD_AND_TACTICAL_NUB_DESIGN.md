# Recoil Crew — Integrity Reward Consistency & Tactical Drawer Discoverability
## Max-integrity repair, ×10 integrity copy, elite/boss minimap threats, and an attached TAB pull-nub

**Status:** Binding design and implementation specification  
**Repository:** `mwl313/RecoilCrewDS`  
**Target:** current `origin/main` at implementation time  
**Scope:** progression reward correctness and tactical-drawer/minimap presentation  
**Explicitly excluded:** in-match chat, Enter-key chat input, chat protocol, chat HUD, chat history

---

# 0. Design authority and visual direction

Use this document alongside the current Recoil Crew UI system:

```text
docs/ui/UI_DESIGN_SYSTEM.md
docs/ui/RECOIL_CREW_UI_VISUAL_REWORK_DESIGN.md
```

The existing design system is the visual grammar:
- Barlow / Barlow Condensed;
- matte near-black surfaces;
- angular cuts;
- thin structural borders;
- construction accents;
- Driver/Gunner semantic colors;
- restrained mechanical movement;
- readable hierarchy.

Do not treat the design system as a collection of shapes to copy mechanically.

The tactical nub in particular must look like a physical extension of the existing tactical drawer—not a browser tab, generic floating button, rounded mobile handle, or neon gamepad prompt.

Priority:

```text
1. Functional correctness
2. Readability and truthful presentation
3. Visual integration with the real gameplay HUD
4. Existing design-system grammar
5. Exact reuse of any one component recipe
```

---

# 1. Milestone goals

Implement four connected changes:

```text
A. Any newly acquired max-integrity upgrade repairs current integrity
   by exactly the amount of maximum integrity gained.

B. Any newly acquired max-integrity relic stack does the same.

C. Every player-facing absolute integrity/healing value uses the existing
   ×10 combat-display unit system.

D. Improve tactical discoverability:
   - explicit larger elite/boss minimap threat markers;
   - a persistent attached TAB nub that reveals the hidden drawer and moves
     with it when the drawer opens.
```

---

# 2. Non-goals

This milestone does **not**:

- add in-match chat;
- bind Enter;
- add a new input context;
- change protocol for chat;
- alter actual tank HP balance;
- multiply internal integrity values by 10;
- full-heal the tank after every reward;
- preserve current integrity percentage;
- make relic re-projection repeatedly heal;
- turn the tactical nub into a mouse button;
- release pointer lock;
- replace the current tactical drawer;
- add labels or health bars to minimap enemies;
- use the fake visual world apron as playable minimap space.

---

# 3. Current-state observations

Current `main` already has:

```text
COMBAT_DISPLAY_SCALE = 10
```

and classifies:

```text
tank.maxIntegrity → combatHp
```

Structured upgrade effects and tactical status rows can therefore already format flat max-integrity additions in display units.

The remaining integrity-copy gap is primarily static or directly-authored relic text such as:

```text
Max integrity +20.
Wave clear restores 15 integrity.
Cannon kills restore 5 integrity.
```

Current progression application also changes the stat resolver but does not repair current integrity after `tank.maxIntegrity` increases.

The current minimap renders enemies primarily from `enemy.ownership?.priority`. It already has different sizes for priority values, but priority is not a reliable semantic definition of elite/boss class.

The current tactical drawer:
- is translated fully offscreen;
- sets the whole drawer opacity to zero;
- uses `overflow: hidden`;
- clips the drawer root itself.

That prevents an attached child nub from remaining visible while the panel is closed.

---

# 4. Max-integrity reward behavior

## 4.1 Binding player-facing rule

Whenever a successfully acquired reward increases resolved maximum integrity, repair the tank by exactly that resolved increase.

Example:

```text
before:
50 / 100 internal
500 / 1,000 displayed

reward:
+20 internal max integrity
+200 displayed max integrity

after:
70 / 120 internal
700 / 1,200 displayed
```

This deliberately fills the newly created capacity.

It is not:

```text
full heal
percentage preservation
temporary shield
overheal
revive
```

---

# 5. Use resolved before/after values

Do not assume the reward's authored raw number equals the final capacity increase.

Required calculation:

```ts
const maxBefore = rules.resolver.resolve('tank.maxIntegrity');

applyRewardTransaction();

const maxAfter = rules.resolver.resolve('tank.maxIntegrity');
const gained = Math.max(0, maxAfter - maxBefore);
```

Then:

```ts
if (tank.deadT <= 0 && gained > 0) {
  tank.integrity = Math.min(maxAfter, tank.integrity + gained);
}
```

Always ensure:

```ts
tank.integrity = Math.min(tank.integrity, maxAfter);
```

if maximum integrity ever decreases.

Using the resolved difference supports:
- additive max-integrity upgrades;
- stackable relics;
- future multiplicative max-integrity effects;
- multiple rewards resolving in one transaction;
- modifier ordering;
- balance changes without presentation logic changes.

---

# 6. Shared authoritative helper

Create one helper in a shared progression/stat location.

Recommended:

```text
src/shared/progression/maxIntegrityRewardRepair.ts
```

Suggested contract:

```ts
export interface MaxIntegrityRepairResult {
  maxBefore: number;
  maxAfter: number;
  gained: number;
  repaired: number;
}

export function repairForMaxIntegrityGain(
  tank: TankState,
  maxBefore: number,
  maxAfter: number,
): MaxIntegrityRepairResult;
```

Recommended behavior:

```ts
const gained = Math.max(0, maxAfter - maxBefore);

if (maxAfter < tank.integrity) {
  tank.integrity = maxAfter;
}

if (gained <= 0 || tank.deadT > 0) {
  return {
    maxBefore,
    maxAfter,
    gained,
    repaired: 0,
  };
}

const beforeIntegrity = tank.integrity;
tank.integrity = Math.min(maxAfter, tank.integrity + gained);

return {
  maxBefore,
  maxAfter,
  gained,
  repaired: tank.integrity - beforeIntegrity,
};
```

This helper is authoritative gameplay state mutation, even though it is reward behavior.

Do not put it in a client UI module.

---

# 7. Level-up transaction integration

Current level-up resolution can apply one or more selected cards in a single completed selection.

The repair must wrap the complete accepted selection transaction.

Required order:

```text
resolve selected cards
→ maxBefore
→ apply every accepted card
→ update level-up summary
→ maxAfter
→ repair once by maxAfter - maxBefore
→ continue existing progression resolution
```

Do not repair independently after each effect.

Why:
- role-separated Multiplayer may resolve more than one card;
- one card can contain multiple effects;
- one transaction should produce one exact capacity delta;
- it avoids multiple presentation events for one selection.

Example:

```text
card A: max integrity +12
card B: max integrity +20

transaction delta:
+32 max
+32 repair
```

If no selected card changes max integrity:

```text
gained = 0
repair = 0
```

No side effects.

---

# 8. Relic acquisition integration

Relic max-integrity repair belongs in the actual successful acquisition path.

Required order:

```text
maxBefore
→ inventory.add(relic)
→ update stack/capability
→ reproject relic stat modifiers
→ maxAfter
→ repair by maxAfter - maxBefore
→ emit normal relic events
→ begin reveal
```

This correctly handles:
- first `HEARTY TANK`;
- every additional legal stack;
- any future max-integrity relic;
- modifier composition.

---

# 9. Never heal inside `RelicStatProjector.reproject()`

This is a binding safety rule.

The relic projector is called for:
- acquisition;
- damage modifier lookup;
- debug state;
- explicit projection refresh;
- other future stat reads.

Healing inside it could produce repeated free repair without a new reward.

The projector remains pure with respect to current tank integrity.

Only the successful relic-acquisition transaction calls the repair helper.

---

# 10. Duplicate and unique behavior

If a relic duplicate is converted into XP and max integrity does not change:

```text
maxAfter == maxBefore
→ no repair
```

A unique relic that cannot stack must never repair again through duplicate handling.

A stackable max-integrity relic repairs once per newly accepted stack.

Reconnect, snapshot load, or projection refresh must not be treated as acquisition.

---

# 11. Do not revive through this feature

If:

```text
tank.deadT > 0
```

the max-integrity reward can still alter maximum capacity, but it must not resurrect the tank.

Repair amount:

```text
0
```

Revival remains owned by the actual revive system/relic.

Ordinary live tanks, including critically damaged tanks, receive the full gained-capacity repair.

---

# 12. Optional reward feedback

No new full-screen feedback is required.

The reward card/relic reveal already communicates the effect.

If an existing or newly-added compact HUD line is used, prefer one message:

```text
ARMOR EXPANDED +200
```

rather than two competing messages:

```text
MAX +200
HEAL +200
```

Any displayed amount must use the existing combat-display formatter.

Do not add a large new overlay in this milestone.

---

# 13. Integrity display-unit rule

Every player-facing **absolute raw integrity value** uses:

```text
internal value × 10
```

through the existing central helper.

Examples:

```text
20 internal max integrity
→ 200 displayed

15 internal repair
→ 150 displayed

5 internal repair
→ 50 displayed
```

Internal authority remains unchanged.

---

# 14. Integrity text that must be scaled

Audit and format all player-facing text for:

```text
current integrity
maximum integrity
flat max-integrity additions
direct integrity repair
kill-triggered repair
wave-clear repair
reward repair
repair popups
upgrade-card copy
relic reveal copy
relic inventory/tooltips
tactical status rows
future integrity tooltips
```

Known examples:

```text
HEARTY TANK
Max integrity +20.
→
Max integrity +200.

SAFE HAVEN
Wave clear restores 15 integrity.
→
Wave clear restores 150 integrity.

VAMPIRE ROUNDS
Cannon kills restore 5 integrity.
→
Cannon kills restore 50 integrity.
```

---

# 15. Text that must not be scaled

Do not multiply:

```text
integrity percentages
incoming-damage percentages
revive percentages
threshold percentages
stack counts
seconds
meters
cooldowns
probabilities
XP
score
levels
```

Examples:

```text
Revive at 50% integrity
→ remains 50%

Incoming damage -20% while below 50% integrity
→ remains unchanged
```

---

# 16. Structured integrity-description presentation

Do not regex-replace arbitrary numbers inside authored descriptions.

Preferred implementation:

```text
src/shared/presentation/relicDescriptionPresentation.ts
```

Add a presentation function that receives:
- relic definition;
- effect templates/parameters;
- optional current stack count.

It safely recognizes integrity-specific structured effects.

Minimum supported mappings:

## `statFlat` targeting `tank.maxIntegrity`

```text
flatPerStack: 20
→ Max integrity +200.
```

Optional stack-aware inventory wording:

```text
Max integrity +200 per stack.
```

## `cannonKillHeal`

```text
amountPerStack: 5
→ Cannon kills restore 50 integrity.
```

## `waveClearHeal`

```text
amountPerStack: 15
→ Wave clear restores 150 integrity.
```

## generic `heal`

If the template clearly targets tank integrity and has a structured absolute amount:
- format with combat HP units.

## `revive`

`integrityPercent` remains a percentage.

Fallback:

```text
return relic.description
```

for unrelated relics.

Do not attempt to regenerate every relic description in this patch.

---

# 17. Use one description presenter on every relic surface

The same resulting text must be used by:
- relic roulette/reveal;
- relic inventory rail;
- relic detail/tooltip if present;
- any future relic summary.

Do not fix only the reveal while leaving the inventory in internal units.

Do not alter effect parameter authority.

---

# 18. Existing structured upgrade/status presentation

Preserve and reuse:

```text
combatDisplayUnits.ts
statPresentation.ts
```

Do not add a second `×10` helper.

`formatStatAdditive('tank.maxIntegrity', value)` should remain the canonical upgrade/tactical path.

Add tests preventing:

```text
20 internal
→ 2,000 displayed
```

through accidental double scaling.

---

# 19. Minimap threat classification

Replace ownership-priority-first marker selection with semantic threat classification.

Recommended helper:

```ts
export type MiniMapEnemyThreatClass =
  | 'ordinary'
  | 'elite'
  | 'boss';

export function miniMapEnemyThreatClass(
  enemy: EnemyState,
): MiniMapEnemyThreatClass;
```

Primary source:

```text
normalizedEnemyClass(enemy)
```

Recommended:

```text
boss   → boss
elite  → elite
wave leader that is not classified as boss → elite
other  → ordinary
```

Legacy compatibility fallback may use:
- legacy enemy type;
- ownership priority.

But fallback must not override a known semantic class.

---

# 20. Minimap marker visual hierarchy

Use redundant encoding:

```text
size
shape
color
outline/ring
```

Do not rely on color alone.

## Ordinary monster

```text
shape: circle
radius: 2.25–2.75px
fill: muted hostile red
suggested #d55347
outline: none or minimal dark edge
```

## Elite monster

```text
shape: diamond
half-size: 5.5–6.5px
fill: electric violet
suggested #b56cff
outline: dark 1.5–2px
```

## Boss monster

```text
shape: large diamond, angular hex, or threat glyph
half-size/radius: 8–10px
fill: bright crimson
suggested #ff304d
outline: dark 2px
outer ring: paper-white / pale warning line
ring radius: 11–13px
```

The boss marker must be visibly larger than the elite marker.

---

# 21. Avoid chest-marker confusion

Relic chests already use amber diamonds.

Therefore:
- elite must not use amber;
- boss must not look like a larger chest;
- elite/boss threat markers need distinct color and outline grammar.

Recommended:

```text
chest    = amber diamond
elite    = violet diamond
boss     = crimson angular marker + pale ring
```

---

# 22. Marker animation

No animation is required.

A very restrained boss ring pulse is optional only if:
- it remains readable without motion;
- reduced-motion mode disables it;
- it does not add distracting flashing.

A fixed high-contrast ring is sufficient and preferred for V1.

---

# 23. Minimap performance

Classification and drawing must remain cheap.

Do not:
- allocate marker objects per frame;
- add DOM markers;
- add labels;
- add health bars;
- add a second rendering pass.

Use direct Canvas 2D drawing in the existing loop.

---

# 24. Attached tactical pull-nub concept

When the tactical drawer is closed, a narrow attached nub remains visible at the left screen edge.

The nub communicates:

```text
TAB opens the tactical map/status drawer
```

When the drawer opens, that same nub moves with it and sits on the exposed right edge of the drawer.

It is one physical UI assembly:

```text
drawer shell
├── clipped tactical panel
└── attached TAB nub
```

It is not:
- a separate floating HUD badge;
- a tooltip;
- a clickable mobile handle;
- a generic rounded button.

---

# 25. Closed/open spatial behavior

## Closed

```text
tactical panel: fully left of viewport
nub: visible at left screen edge
chevron: points right
```

Concept:

```text
│[ TAB / MAP  › ]
```

## Open

```text
tactical panel: fully visible
nub: attached to panel's outer-right edge
chevron: points left
```

Concept:

```text
│  ┌────────────────────────────┐[ ‹ TAB ]
│  │ MINIMAP                    │
│  │ LEVEL-UP MODIFIERS         │
│  └────────────────────────────┘
```

The nub must remain attached throughout the transition.

---

# 26. Required DOM restructuring

The current root clips and hides itself.

Move panel visuals into a child.

Recommended structure:

```html
<aside
  id="tactical-drawer"
  class="tactical-drawer"
  aria-hidden="true"
>
  <div class="tactical-drawer__panel">
    <div class="tactical-drawer__accent"></div>
    <!-- existing header/map/modifier content -->
  </div>

  <div class="tactical-drawer__nub" aria-hidden="true">
    <span class="tactical-drawer__nub-map">MAP</span>
    <kbd>TAB</kbd>
    <span class="tactical-drawer__nub-chevron"></span>
  </div>
</aside>
```

The exact content order may be tuned visually.

---

# 27. Shell geometry

Recommended CSS geometry:

```text
outer shell:
left: 0
top/bottom: existing drawer values
width: left gutter + drawer width
overflow: visible
opacity: 1 at all times

inner panel:
left: existing safe gutter
width: existing drawer width
height: 100%
overflow: hidden
owns background/border/clip-path/shadow

nub:
positioned at outer shell's right edge
```

Closed transform:

```text
translateX(-(left gutter + drawer width))
```

This leaves the nub exactly at screen X=0.

Open transform:

```text
translateX(0)
```

Do not separately animate panel and nub.

---

# 28. Nub size and placement

Desktop initial target:

```text
width: 32–36px
height: 82–94px
```

Place it approximately alongside the minimap section, not the full drawer's vertical center.

Suggested top offset from drawer:

```text
~120–155px
```

Tune after rendering at 1280×720.

The visual relationship should say:

> This tab belongs to the tactical map.

---

# 29. Nub visual philosophy

The nub uses the same industrial construction language as the tactical drawer.

Required characteristics:

```text
matte near-black body
1px structural border
hard angular silhouette
small clipped/beveled corners
Barlow Condensed uppercase typography
one restrained semantic accent
compact mechanical chevron
```

Do not use:
- pill shape;
- rounded mobile drawer handle;
- glass blur;
- floating drop-shadow card;
- generic blue gradient;
- large neon glow;
- bouncing animation;
- hand/cursor icon.

---

# 30. Nub accent semantics

The nub should inherit the tactical drawer's current role accent.

Recommended:

```text
Driver: cyan construction slit
Gunner: red/orange construction slit
Single Player/neutral: amber
```

Keep the nub body dark and quiet.

The accent should be:
- a 2–4px edge/slit;
- not the whole background.

This makes it belong to the current HUD without becoming loud.

---

# 31. Nub typography and iconography

Recommended content:

```text
MAP
TAB
›
```

Closed:
- chevron points toward opening direction.

Open:
- chevron reverses.

`TAB` is primary.

`MAP` is a smaller micro-label so the player knows what the key reveals.

Possible layout:
- vertical `TAB`;
- tiny horizontal `MAP`;
- angular chevron.

Use real text, not a bitmap.

---

# 32. Nub interaction

The nub is visual-only in V1.

```css
pointer-events: none;
```

Reasons:
- gameplay uses pointer lock;
- clicking would create firing/input ambiguity;
- the requested behavior is keyboard discoverability;
- `Tab` already owns the action.

Do not release pointer lock.

Do not add a cursor.

---

# 33. Nub motion

Use the existing mechanical drawer motion:

```text
~240–280ms
cubic-bezier(.2,.75,.2,1)
```

The entire shell translates.

No scale.
No bounce.
No spring.

The current whole-root opacity fade must be removed or moved only to panel detail if necessary, because the nub must remain visible while closed.

Preferred:

```text
root opacity always 1
panel and nub move together
```

---

# 34. Nub idle behavior

Do not continuously blink or pulse.

A one-time restrained introduction after gameplay begins is optional:

```text
1–2 subtle accent luminance pulses
then permanently calm
```

No looping attention animation.

The nub must remain readable through shape and text alone.

---

# 35. Open-state behavior

When open:
- nub remains on the panel's right edge;
- chevron reverses;
- existing header `TAB // CLOSE` remains;
- no duplicated large instruction is needed.

The nub should not cover:
- minimap content;
- modifier scroll;
- reticle;
- top-center encounter UI.

---

# 36. Responsive behavior

Preserve current drawer responsive width logic.

The shell calculation must use the same CSS variables as the panel.

Example:

```text
desktop gutter: 24px
tablet gutter: 14px
```

Closed transform must update with those variables.

At narrow viewport:
- nub may shrink to ~30px wide;
- label remains legible;
- drawer remains partial-screen according to existing rules.

Do not let the nub disappear at mobile breakpoints.

---

# 37. Accessibility

Nub:

```text
aria-hidden="true"
```

because it is noninteractive and duplicates keyboard instruction.

Drawer open state continues to set meaningful `aria-hidden`.

Reduced motion:

```text
1ms or effectively immediate shell translation
```

No pulsing marker/nub in reduced-motion mode.

Color is not the only minimap threat cue:
- elite and boss use distinct size and shape.

---

# 38. Tests — max-integrity reward

Required:

## Level-up

```text
50/100
+20 max
→ 70/120
```

## Full tank

```text
100/100
+20 max
→ 120/120
```

## Critical tank

```text
5/100
+20 max
→ 25/120
```

## Multiple cards

```text
+12 and +20 in one resolution
→ +32 max
→ +32 current
```

## No max effect

```text
damage upgrade only
→ no repair
```

## Dead tank

```text
deadT > 0
+20 max
→ max changes
→ current integrity not revived
```

---

# 39. Tests — relic acquisition

Required:

```text
first HEARTY TANK
→ correct max delta and repair

second stack
→ repairs only second stack delta

projectionRefresh()
→ no additional repair

damage lookup calling reproject()
→ no repair

unique duplicate converted to XP
→ no repair

reconnect/state reconstruction
→ no repair
```

---

# 40. Tests — integrity display

Required:

```text
20 max integrity
→ +200

15 repair
→ 150 integrity

5 repair
→ 50 integrity
```

Verify:
- upgrade card;
- tactical summary;
- relic reveal;
- inventory/tooltip.

Percentages:

```text
50% revive
→ remains 50%
```

No double scaling:

```text
20
→ 200
not 2,000
```

---

# 41. Tests — minimap threats

Required:

```text
ordinary enemy
→ small muted-red circle

elite
→ larger violet diamond

boss
→ largest crimson threat marker + pale ring

wave leader fallback
→ elite threat treatment

chest
→ remains amber and visually distinct
```

Classification must not rely solely on ownership priority.

---

# 42. Tests — tactical nub

DOM:

```text
panel child exists
nub child exists
nub is aria-hidden
nub is pointer-events none
```

Closed:

```text
panel fully offscreen
nub remains visible at screen edge
root opacity is not zero
chevron points right
```

Open:

```text
panel visible
nub attached to right edge
chevron points left
```

Transition:
- one parent transform moves both;
- no separate drifting animations.

Responsive:
- 1280×720;
- 1920×1080;
- 800×720;
- 560×720.

Reduced motion:
- immediate transition;
- no looping attention effect.

---

# 43. Manual qualification

## Integrity

Damage tank, then acquire:
- ARMOR level-up;
- HEARTY TANK first stack;
- HEARTY TANK additional stack.

Confirm the bar:
- extends;
- fills by the exact extension;
- does not full-heal unrelated missing capacity.

## Copy

Inspect:
- upgrade card;
- relic reveal;
- relic inventory;
- tactical drawer;
- HUD.

All absolute integrity values must use ×10.

## Minimap

Spawn:
- ordinary;
- elite;
- boss;
- chest.

Confirm each is instantly distinguishable at a glance.

## Nub

Start match without opening tactical drawer.

Confirm:
- small nub is visible;
- design belongs to the drawer;
- `Tab` opens it;
- nub travels with panel;
- `Tab` closes it;
- pointer lock and combat remain unaffected.

---

# 44. Implementation order

Recommended:

```text
Phase A
authoritative max-integrity repair helper
+ upgrade integration
+ relic integration
+ tests

Phase B
integrity text presenter
+ audit all player-facing surfaces
+ tests

Phase C
semantic minimap threat markers
+ tests

Phase D
tactical shell/panel/nub DOM/CSS refactor
+ responsive visual qualification
```

---

# 45. Forbidden implementations

Do not:

- multiply internal integrity by 10;
- full-heal on max-integrity gain;
- preserve health percentage instead of adding the gained amount;
- heal from inside relic projection;
- heal again on reconnect;
- heal a dead tank into a revive;
- regex-replace arbitrary description numbers;
- scale percentages;
- use ownership priority as the only elite/boss definition;
- use amber for elites and confuse them with chests;
- make elite and boss the same marker size;
- create a separate floating nub animation;
- make the nub rounded/glassy;
- make the nub clickable in V1;
- release pointer lock;
- add chat or Enter behavior;
- add a chat protocol message;
- regress the existing Tab toggle/tactical status/minimap orientation.

---

# 46. Definition of done

- [ ] Level-up max-integrity gain repairs the same resolved amount.
- [ ] Relic max-integrity gain repairs the same resolved amount.
- [ ] Stackable max-integrity relics repair once per new stack.
- [ ] Reprojection/reconnect cannot repeat the repair.
- [ ] Dead tanks are not revived by this mechanic.
- [ ] Internal integrity values remain unchanged.
- [ ] All absolute integrity/heal/repair text uses ×10 display units.
- [ ] Percentage-based integrity text remains unchanged.
- [ ] Upgrade, tactical, reveal, and inventory surfaces agree.
- [ ] No double scaling occurs.
- [ ] Minimap classification is semantic.
- [ ] Ordinary marker remains small and muted.
- [ ] Elite marker is larger and violet.
- [ ] Boss marker is largest, crimson, and ringed.
- [ ] Chest marker remains distinct.
- [ ] Tactical drawer has a persistent attached TAB/MAP nub.
- [ ] Nub shares the drawer shell's transform.
- [ ] Nub remains visible while drawer is closed.
- [ ] Nub moves to the open drawer's right edge.
- [ ] Nub follows Recoil Crew's matte angular construction grammar.
- [ ] Nub is not a floating, rounded, glassy, or clickable control.
- [ ] Pointer lock and existing Tab input remain unchanged.
- [ ] Responsive/reduced-motion qualification passes.
- [ ] No chat functionality is included.

Final invariant:

> A max-integrity reward immediately feels complete instead of giving an empty capacity extension, integrity numbers always use Recoil Crew's exaggerated display units, dangerous enemies are unmistakable on the map, and the tactical drawer advertises itself through a small mechanical TAB nub that visibly belongs to the same armored HUD assembly.
