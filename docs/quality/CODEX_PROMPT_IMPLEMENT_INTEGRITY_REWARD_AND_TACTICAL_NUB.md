# Codex Prompt — Implement Integrity Reward Consistency & Tactical Drawer Discoverability

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
docs/quality/INTEGRITY_REWARD_AND_TACTICAL_NUB_DESIGN.md
```

Also read:

```text
docs/ui/UI_DESIGN_SYSTEM.md
docs/ui/RECOIL_CREW_UI_VISUAL_REWORK_DESIGN.md
docs/quality/COMBAT_DISPLAY_NUMBER_SCALE_DESIGN.md
```

if present.

## Mission

Implement this focused non-chat patch:

```text
1. max-integrity upgrades repair the exact max gained;
2. max-integrity relic stacks repair the exact max gained;
3. every absolute integrity/heal/repair text uses ×10 display units;
4. elites and bosses receive explicit larger/different minimap threat markers;
5. the tactical drawer gains a persistent attached TAB/MAP nub that moves
   with the drawer and follows Recoil Crew's visual design philosophy.
```

Do not implement chat.

---

# 1. Audit current main first

Run:

```bash
git fetch --all --prune
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
git log --oneline --decorate -20
```

Record starting SHA.

Inspect at minimum:

```text
src/shared/progression/progressionSystem.ts
src/shared/progression/upgradeEffectApplier.ts
src/shared/progression/relicInventory.ts
src/shared/progression/relicStatProjector.ts
src/shared/progression/relicEffectRegistry.ts
src/shared/progression/progressionTypes.ts

src/shared/presentation/combatDisplayUnits.ts
src/shared/presentation/statPresentation.ts

src/client/presentation/
src/client/progression/
src/client/relic*
src/client/tactical/tacticalDrawer.ts
src/client/tactical/miniMapRenderer.ts
src/client/ui/tactical.css
src/client/ui/accessibility.css
src/client/ui/responsive.css

src/shared/enemies/enemyClassification.ts
src/shared/types.ts

content/upgrades/
content/relics/hearty_tank.json
content/relics/safe_haven.json
content/relics/vampire_rounds.json
content/relic-effect-templates/

tests/progression08/
tests/gameplayReadability/
tests/quality/
```

Search the entire repo for player-facing uses of:

```text
integrity
maxIntegrity
heal
heals
restore
restores
repair
repairs
relic.description
```

Do not assume only the three known relics are relevant.

---

# 2. Keep chat completely out of scope

Do not:
- add Enter handling;
- add `gameplayChat`;
- add chat UI;
- add `crewChatSend`;
- bump protocol for chat;
- touch lobby chat except if an unrelated build import requires no-op formatting reuse.

This patch must remain independently reviewable.

---

# 3. Add one authoritative max-integrity repair helper

Recommended file:

```text
src/shared/progression/maxIntegrityRewardRepair.ts
```

Implement a pure, focused state helper:

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
): MaxIntegrityRepairResult
```

Required semantics:

```text
gained = max(0, maxAfter - maxBefore)

live tank:
integrity += gained
clamped to maxAfter

dead tank:
no repair / no revive

max decrease:
clamp integrity to new max
```

Do not apply percentages or full-heal behavior.

---

# 4. Integrate level-up repair around the whole selection transaction

In the authoritative level-up resolution:

```text
selected cards resolved
→ maxBefore
→ apply all cards
→ maxAfter
→ repair once
```

Do not repair inside every individual effect.

Required:

```ts
const maxBefore = rules.resolver.resolve('tank.maxIntegrity');

for (const card of cards) {
  applyUpgradeCard(...);
}

const maxAfter = rules.resolver.resolve('tank.maxIntegrity');
repairForMaxIntegrityGain(state.tank, maxBefore, maxAfter);
```

Use actual current symbols/ownership.

Preserve:
- summary recording;
- telemetry;
- Multiplayer role-separated resolution;
- Single Player;
- progression flow serialization.

---

# 5. Integrate relic repair only at successful acquisition

In the actual relic acquisition path:

```text
maxBefore
→ inventory.add(relic)
→ projector.reproject(...)
→ maxAfter
→ repair
```

Do this before or alongside normal acquisition events/reveal, while keeping the reward result deterministic.

Do not put repair in:

```text
RelicStatProjector.reproject()
```

because that method is called repeatedly for damage/debug/projection refresh.

Duplicate converted to XP:

```text
no max delta
→ no repair
```

Stackable HEARTY TANK:

```text
each successful new stack
→ one new delta
→ one repair
```

---

# 6. Dead/reconnect safety

Tests must prove:

```text
deadT > 0
→ max can change
→ no revive

projectionRefresh
→ no repair

damage modifier lookup/reproject
→ no repair

reconnect/state recreation
→ no repair
```

Do not add reward-history state unless needed; transaction-bound repair should make idempotency natural.

---

# 7. Preserve internal units

Do not change:
- base tank integrity;
- tank max integrity;
- upgrade ranges;
- relic effect parameters;
- snapshots;
- rules resolver values;
- damage;
- healing mechanics.

Only presentation text uses ×10.

---

# 8. Reuse the existing combat-display helper

Use:

```text
COMBAT_DISPLAY_SCALE
formatCombatDisplayValue()
formatStatAdditive()
```

Do not create another multiplier constant.

`tank.maxIntegrity` must remain `combatHp`.

Prevent double scaling.

---

# 9. Add safe integrity-aware relic description presentation

Do not regex-replace arbitrary numbers.

Preferred file:

```text
src/shared/presentation/relicDescriptionPresentation.ts
```

or the closest existing presentation module.

Implement a safe formatter that:
- receives structured relic effects/templates;
- recognizes known integrity-specific effect types;
- formats absolute values through `formatCombatDisplayValue`;
- leaves percentages unchanged;
- falls back to authored description for unrelated relics.

Required mappings:

```text
statFlat + tank.maxIntegrity
cannonKillHeal
waveClearHeal
generic absolute tank-integrity heal if structured
```

`revive.integrityPercent` remains percentage copy.

---

# 10. Route every relic text surface through the same presenter

Audit and update:
- relic roulette/reveal;
- relic inventory rail;
- relic tooltip/detail;
- any current summary.

Known expected text:

```text
HEARTY TANK:
Max integrity +200.

SAFE HAVEN:
Wave clear restores 150 integrity.

VAMPIRE ROUNDS:
Cannon kills restore 50 integrity.
```

Internal params stay:

```text
20
15
5
```

If current stack-aware inventory already supports effective values, preserve that behavior but still use display units.

Do not leave one UI surface showing 20 while another shows 200.

---

# 11. Audit all absolute integrity copy

Verify:

```text
HUD current/max
upgrade cards
tactical drawer
relic reveal
relic inventory
repair popup if any
```

Percent text stays unscaled.

Add focused tests.

---

# 12. Add semantic minimap threat classification

In or near `miniMapRenderer.ts`, introduce a testable helper.

Recommended:

```ts
type MiniMapEnemyThreatClass = 'ordinary' | 'elite' | 'boss';

function miniMapEnemyThreatClass(enemy: EnemyState): MiniMapEnemyThreatClass;
```

Use current browser-safe enemy classification helpers.

Primary:

```text
normalizedEnemyClass(enemy)
```

Rules:

```text
boss → boss
elite → elite
wave leader that is not boss → elite
otherwise → ordinary
```

Legacy `ownership.priority` may be a fallback only.

Do not use ownership priority as the primary meaning.

---

# 13. Draw explicit marker hierarchy

Required starting style:

## Ordinary

```text
small circle
radius ~2.25–2.75
muted red #d55347
```

## Elite

```text
diamond
half-size ~5.5–6.5
violet #b56cff
dark 1.5–2px outline
```

## Boss

```text
largest angular marker
half-size/radius ~8–10
crimson #ff304d
dark 2px outline
paper-white/pale ring radius ~11–13
```

Chest stays amber.

Do not make elite amber.

Do not add labels/HP.

A fixed boss ring is preferred. If adding pulse:
- make it restrained;
- disable under reduced motion.

---

# 14. Add marker tests

Required:

```text
ordinary -> small circle
elite -> violet diamond
boss -> largest crimson + ring
wave leader fallback -> elite
chest remains amber/distinct
```

Use a pure style/classification helper where possible so tests do not depend entirely on pixel screenshots.

---

# 15. Refactor tactical drawer into shell + panel + nub

Current root owns:
- background;
- clipping;
- hidden overflow;
- opacity fade.

Move visual panel properties to:

```text
.tactical-drawer__panel
```

Keep:

```text
.tactical-drawer
```

as the transform shell.

Recommended DOM:

```html
<aside id="tactical-drawer" class="tactical-drawer">
  <div class="tactical-drawer__panel">
    <!-- all existing drawer content -->
  </div>

  <div class="tactical-drawer__nub" aria-hidden="true">
    <span class="tactical-drawer__nub-map">MAP</span>
    <kbd>TAB</kbd>
    <span class="tactical-drawer__nub-chevron"></span>
  </div>
</aside>
```

The exact nested spans may change if equivalent.

---

# 16. Closed/open shell math

Use shared CSS variables:

```css
--drawer-width
--drawer-gutter
--drawer-nub-width
```

Suggested shell:

```text
left: 0
width: drawer-gutter + drawer-width
overflow: visible
opacity: 1
```

Panel:

```text
left: drawer-gutter
width: drawer-width
```

Nub:

```text
left: 100%
```

Closed transform:

```text
translateX(-(drawer-gutter + drawer-width))
```

Open:

```text
translateX(0)
```

This must leave the nub at the screen edge while closed.

Do not use root opacity zero.

---

# 17. Nub art direction — binding

The nub must use Recoil Crew's tactical/industrial grammar.

Required:

```text
matte near-black
thin structural outline
angular clipped silhouette
compact Barlow Condensed typography
small role-aware construction accent
mechanical chevron
```

Forbidden:

```text
rounded pill
glassmorphism
generic mobile drawer handle
floating detached card
large glow
continuous bounce
emoji/icon-font hand
```

The nub should feel like a physical latch/control plate on an armored field computer.

---

# 18. Nub content and states

Recommended:

```text
MAP
TAB
chevron
```

Closed:
- chevron points right.

Open:
- chevron points left.

`TAB` remains primary.

`MAP` is a small discoverability label.

Do not remove existing header `TAB // CLOSE`.

---

# 19. Nub role accents

Inherit the tactical drawer accent:

```text
Driver → cyan
Gunner → red/orange
Single/neutral → amber
```

Use only a thin slit/edge.

The nub body remains dark.

---

# 20. Nub placement and sizing

Desktop initial:

```text
32–36px wide
82–94px high
top approximately 120–155px inside drawer shell
```

Tune so it aligns visually with the minimap section.

Do not center it randomly against the whole screen.

---

# 21. Nub is visual-only

Required:

```css
pointer-events: none;
```

and:

```html
aria-hidden="true"
```

Do not make it clickable.

Do not release pointer lock.

Existing Tab input remains the only interaction.

---

# 22. Nub movement

Use one parent transform for panel + nub.

Retain approximately:

```text
240–280ms
mechanical cubic-bezier
```

No scale/bounce.

Remove whole-root opacity hiding.

One-time restrained introduction is optional; no looping pulse.

---

# 23. Responsive/reduced motion

Preserve existing breakpoints.

Use shared gutter variable:
- desktop ~24px;
- compact ~14px.

The closed transform must remain mathematically correct at every breakpoint.

Nub remains visible at:
- 1280×720;
- 1920×1080;
- 800×720;
- 560×720.

Reduced motion:
- immediate/1ms translation;
- no attention pulse;
- no boss marker pulse.

---

# 24. Tests

Implement the full binding test matrix from the design.

At minimum:

```text
max-integrity level-up repair
multi-card repair
max-integrity relic stack repair
no reproject/reconnect repair
dead tank no revive
×10 integrity descriptions
percent text unchanged
no double scaling
elite/boss semantic minimap classification
marker style hierarchy
nub closed/open DOM and class behavior
```

Where CSS geometry cannot be fully unit-tested, add:
- deterministic DOM assertions;
- browser screenshots/visual qualification.

---

# 25. Manual browser qualification

Test:

```text
Single Player
Multiplayer Driver
Multiplayer Gunner
```

Integrity:
- damage tank;
- acquire ARMOR;
- acquire HEARTY TANK twice;
- verify exact new-capacity repair.

Copy:
- inspect upgrade/relic/tactical/HUD surfaces.

Minimap:
- ordinary;
- elite;
- boss;
- chest.

Nub:
- visible on first gameplay frame;
- closed drawer panel hidden;
- Tab opens;
- nub travels with panel;
- Tab closes;
- pointer lock remains;
- no reticle obstruction.

---

# 26. Run qualification

Use actual scripts after inspecting `package.json`.

At minimum:

```bash
npx tsc --noEmit
npm run build
npm test
npm run test:progression
```

Plus:
- tactical/minimap tests;
- current E2E/browser suite;
- content generation/validation if content/schema changes.

If content JSON changes, run the normal generation command.

Do not edit generated content manually.

---

# 27. Implementation report

Create:

```text
docs/quality/INTEGRITY_REWARD_AND_TACTICAL_NUB_IMPLEMENTATION_REPORT.md
```

Include:
- starting/ending SHA;
- files changed;
- repair helper semantics;
- upgrade/relic integration points;
- idempotency proof;
- integrity-copy surfaces;
- description presenter behavior;
- minimap classification source;
- marker colors/shapes/sizes;
- nub DOM/CSS architecture;
- responsive screenshots;
- test results;
- confirmation chat was not added.

---

# 28. Forbidden shortcuts

Do not:
- full-heal;
- percentage-preserve;
- heal inside relic projector;
- revive dead tank;
- multiply internal integrity;
- regex arbitrary descriptions;
- scale percentages;
- use priority alone for bosses/elites;
- make elite marker amber;
- make nub a floating rounded tab;
- animate nub separately;
- set root opacity zero when closed;
- make nub clickable;
- release pointer lock;
- implement chat;
- bump protocol for chat.

Definition of done is the complete checklist in the binding design document.
