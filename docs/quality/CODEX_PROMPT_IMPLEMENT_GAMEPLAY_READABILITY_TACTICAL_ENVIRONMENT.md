# Codex Prompt — Implement Gameplay Readability, Tactical Drawer & Environment Illusion

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
docs/quality/GAMEPLAY_READABILITY_TACTICAL_ENVIRONMENT_DESIGN.md
```

Also read before editing:

```text
docs/ui/UI_DESIGN_SYSTEM.md
docs/ui/RECOIL_CREW_UI_VISUAL_REWORK_DESIGN.md
```

## Mission

Implement the next gameplay-presentation milestone:

1. damaged-monster health bars;
2. enemy damage numbers;
3. believable visual world beyond the real barrier;
4. authored sky-image support and coherent atmosphere;
5. `Tab` tactical drawer containing:
   - minimap;
   - cumulative level-up upgrade status.

Preserve all recent `main` work including roulette/pointer-lock behavior, relics, progression authority, TPS camera, netcode, urban generation, and existing HUD.

This is not permission for a broad rewrite.

---

# 1. Visual-system instruction

Use the existing Recoil Crew UI design system as the visual baseline:
- Barlow fonts;
- matte dark surfaces;
- angular cuts;
- amber construction accents;
- semantic role colors;
- thin structural rules;
- mechanical translation motion.

But **do not get tunnel-visioned by the guideline**.

The tactical drawer is a gameplay instrument, not a menu modal. If copying an existing template literally makes it ugly, oversized, or obstructive, art-direct it for gameplay while retaining recognizable Recoil Crew DNA.

Priority:

```text
direct task requirements
> readability/truth
> visual quality in game
> design-system grammar
> exact template reuse
```

Do not create a second unrelated visual language, but do not sacrifice prettiness just to satisfy a numeric component recipe.

---

# 2. Audit first

Before editing:

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
src/shared/types.ts
src/shared/damage/damageSystem.ts
src/client/app/presentationEventRouter.ts
src/client/app/entityViewRegistry.ts
src/client/app/gameClient.ts
src/client/input.ts
src/client/hud.ts
src/client/presentation/
src/client/ui/
src/client/arenaView.ts
src/client/app/renderWorld.ts
src/client/cameraCollision.ts
src/shared/mapgen/urbanLayout.ts
src/shared/mapgen/compat.ts
src/shared/sim/arenaWorld.ts
src/shared/progression/progressionTypes.ts
src/shared/progression/progressionSystem.ts
src/shared/progression/upgradeEffectApplier.ts
src/shared/rules/matchRules.ts
src/shared/stats/statResolver.ts
src/shared/net/protocol.ts
```

Inspect current tests/E2E before choosing filenames.

---

# 3. Enemy world UI

Create one pooled screen-space enemy UI layer.

Preferred:

```text
one transparent Canvas 2D overlay
above Three.js canvas
below fixed gameplay HUD
pointer-events: none
```

Do not add one DOM node or one Three.js health-bar sprite per monster.

It must work with:
- instanced fodder;
- unique rigs;
- elite/special/boss monsters.

## Health bars

Show only:

```text
alive
hp > 0
hp < maxHp
```

Full HP -> no bar.  
Dead -> no bar.

Visual target:
- about 48×5px desktop;
- dark backing;
- danger-red fill;
- hard contrast;
- minimal angular treatment;
- no name;
- no numeric HP.

Anchor above the visible model using normalized monster/presentation dimensions. Avoid a universal hardcoded head height.

Cull behind-camera/offscreen/far aggregate-only entities. Keep a sensible nearest-candidate cap.

If static-world occlusion can be implemented cheaply, use the existing spatialized collider data at reduced frequency for nearest damaged candidates. Do not fire hundreds of raycasters every frame.

## Damage numbers

Every authoritative enemy hit displays a red negative number such as:

```text
-19
```

Use Barlow Condensed heavy italic with a hard dark outline/shadow.

Animation:
- quick oversize punch;
- settle;
- rise about 30px;
- fade over roughly 650–800ms.

### Display exact actual HP loss

Current event value may be intermediate.

In `DamageSystem.applyEnemy`:

```text
hpBefore
→ current damage math unchanged
→ hpAfter
→ actualHpLoss = hpBefore - max(0,hpAfter)
```

Emit/display that exact HP loss.

Do not alter gameplay balance.

Lethal overkill should not show more damage than remaining HP actually removed.

### MG coalescing

Same enemy hit repeatedly within about 60ms:
- add values into current popup;
- refresh its punch slightly.

Different enemies never merge.

---

# 4. Sky-image environment

Replace the flat gray-blue background with authored equirectangular sky support.

Target asset:

```text
2048×1024
2:1
WebP
sRGB
```

Suggested path:

```text
public/assets/environment/sky/recoil-day-01.webp
```

Use actual project asset conventions if different.

Art direction:
- rich blue zenith;
- warm pale horizon;
- soft wispy clouds;
- late-afternoon stylized arcade mood;
- attractive and clean;
- not gray overcast;
- not photoreal HDRI mismatch.

Do not download arbitrary runtime web assets.

If no final authored sky file is present:
1. implement the asset slot/loader;
2. implement a polished procedural blue-to-warm fallback;
3. state clearly in the implementation report that the final authored sky asset remains to be supplied.

Align directional light/fill/fog with the sky. Fog should blend into the sky horizon color.

Tune atmosphere with the fake-world budget. Good initial targets are:
- full gameplay clarity through roughly 120m;
- gentle haze from ~120–170m;
- strong silhouette separation by ~280m;
- far fake skyline mostly dissolved by ~380–420m.

Do not blindly preserve the old short fog range if it makes the fake city invisible too early.

Remove daytime stars.

---

# 5. Visual world apron — implement the performance-budgeted version

Keep authoritative urban400 bounds at 400×400m.

Do **not** generate another full-density city around it.

Create:

```text
VisualWorldApron
```

as presentation only.

## Default density/settings

### Near apron

First approximately `0–80m` beyond each true boundary:

```text
~100–160 existing low-poly building instances TOTAL
~20–30 trees / vehicles / props TOTAL
only enough road strips to continue visible perimeter streets
```

These totals are for the entire urban400 apron, not per side.

Requirements:
- reuse existing building families;
- group by geometry/material using `InstancedMesh`;
- sparse density;
- no animation;
- no collision;
- no network/gameplay data;
- `castShadow = false`;
- avoid material clones.

### Far skyline

Approximately `80–220m+` beyond the boundary:

```text
~50–100 simple silhouette/box building instances TOTAL
```

Use:
- very cheap box/low-poly geometry;
- a few height/width families;
- 1–3 shared materials;
- few instanced groups;
- no texture detail required;
- no shadows;
- no animation;
- no collision.

Do not reuse full detailed building models for the far skyline unless profiling proves they are equivalently cheap.

## Simple two-tier LOD

```text
0–80m beyond boundary:
sparse existing low-poly urban assets

80m+:
simple silhouette/box representation
```

Do not build a complex universal LOD framework solely for this feature.

## Atmosphere target

Tune sky/fog/apron together approximately toward:

```text
0–120m:   normal gameplay clarity
120–170m: haze begins
170–280m: atmospheric separation
280–380m: skyline reads mainly as silhouette
380–420m: far fake geometry mostly dissolved into horizon
```

These are visual targets, not immutable constants. Preserve normal combat readability.

Do not leave the old `115–190m` fog unchanged if it prevents the fake city from doing its job.

## Shadow rule

Binding:

```text
fake apron does not cast shadows
far apron does not receive shadows
do not enlarge directional shadow coverage for fake scenery
```

Preserve real-city shadow quality.

## Quality scaling

Recommended:

```text
high:
100% target near + far apron

medium:
~70% near instances
~60% far skyline instances

low:
minimal continuation roads
sparse skyline only
```

Same authoritative map in all modes.

## Render-cost acceptance budget

Use existing `RenderWorld` diagnostics to measure the same urban400 scene:

```text
baseline without apron
vs
apron enabled
```

Capture:
- render-submit p50/p95;
- frame interval p50/p95;
- estimated draw calls;
- triangles;
- geometries;
- textures;
- FPS.

Binding threshold:

```text
≤10% added render cost = excellent
10–20% = acceptable
>20% = optimize before completion
>30% = fail
```

If over budget, reduce:
1. far skyline count;
2. near props/trees/vehicles;
3. near building density;
4. material variety;
5. far geometry complexity.

Do not lower real playable-city quality first.

The fake world should look several times larger than the cost actually paid.



# 6. Real boundary blocking

The fake city does not stop the tank.

At real perimeter road/traversable crossings, add believable **authoritative** blockers inside the playable area:
- concrete barriers;
- wrecked vehicles;
- collapsed roadway;
- construction barriers;
- blocked tunnel/overpass.

Use current urban visual vocabulary where possible.

Roads/buildings must visually continue behind these blockers into the fake apron.

Client-only blockers are forbidden if the tank collides with them.

Retain a continuous fallback bounds layer and improve current clamp behavior:

```text
cross edge
→ stable inward normal
→ stay inside
→ remove outward velocity
→ preserve tangential velocity
→ no jitter
```

Do not enlarge the actual gameplay map.

---

# 7. Tactical drawer

Create one combined left drawer toggled by `Tab`.

It contains:
- minimap;
- level-up modifiers.

Do not create two separate Tab overlays.

## Input

During active gameplay:

```text
Tab keydown
→ preventDefault
→ one latched toggle
→ ignore repeat
→ keyup rearms
```

While drawer is open:
- game does not pause;
- pointer lock remains active;
- camera continues;
- Driver movement continues;
- Gunner aiming/weapons continue;
- no cursor required.

Do not add this to Driver/Gunner network input frames. It is client-local presentation state.

Auto-close on:
- upgrade roulette;
- relic roulette;
- pause;
- results;
- error/terminal flow;
- lobby/menu.

Do not auto-reopen.

Do not steal normal Tab navigation in menus/forms.

---

# 8. Drawer visual design

At 1280×720 target roughly:

```text
left: 24px
top: 76px
bottom: 24px
width: ~400px
```

General:

```css
width: clamp(360px,31vw,420px)
```

No fullscreen scrim.

Most of the gameplay view stays visible.

Art direction:

```text
armored field tactical computer
```

Use:
- matte near-black;
- clipped corners;
- 1px structure;
- one deliberate amber construction accent;
- Barlow typography.

Avoid:
- rounded dashboard cards;
- glassmorphism;
- giant modal heading;
- fake telemetry;
- gradient-heavy generic sci-fi UI.

Motion:

```text
offscreen left -> 0
~240–280ms
cubic-bezier(.65,0,.35,1)
```

Close slightly faster. No scale/bounce.

Compact header:

```text
TACTICAL
LEVEL <N>
TAB // CLOSE
```

---

# 9. Minimap

Use Canvas 2D.

Do not render a second Three.js camera.

Cache static map base per arena.

## Base

Urban:
- real map bounds;
- roads;
- building footprints;
- useful major solid props.

Non-urban fallback:
- real bounds;
- coarse driveable terrain;
- cliffs/major obstacles.

Map remains:

```text
NORTH-UP
```

Add a restrained `N`.

Do not draw the visual fake city as traversable space.

## Dynamic markers

Minimum:
- tank/player;
- active relic chests;
- elite/special enemies;
- boss/wave leader.

Recommended:
- nearby ordinary monsters as tiny muted red dots;
- far horde using aggregate-sector pips rather than hundreds of dots.

## CRITICAL PLAYER MARKER RULE

The tank marker must be an **isosceles triangle**.

It points in:

```text
VEHICLE / CHASSIS FACING DIRECTION
```

It does **not** represent camera direction.

Use the smooth rendered/predicted/interpolated tank yaw, e.g. the pose from `GameClient.getRenderTank()` or the current actual equivalent.

Do not use:
- CameraManager yaw;
- TPS orbit yaw;
- turret yaw.

Derive triangle orientation using the exact chassis-forward convention already used by tank movement/rendering, then convert that world forward vector into minimap coordinates.

Suggested:
- 15–18px tall;
- 11–14px wide;
- tip = vehicle forward;
- role color or Single Player amber;
- hard contrasting outline.

### Required focused acceptance test

```text
tank stationary
camera orbits 360°
=> triangle remains fixed

chassis turns 90°
=> triangle turns 90°

turret turns
=> triangle remains unchanged
```

Driver and Gunner clients viewing the shared tank must show the same chassis heading.

---

# 10. Authoritative level-up summary

Do not reconstruct completed upgrade multipliers from local UI history.

Add replicated authoritative state.

Recommended:

```ts
interface LevelUpgradeStatSummary {
  statId: string;
  additiveTotal: number;
  multiplierProduct: number;
  effectCount: number;
}
```

Add to `TeamProgressionState`.

Defaults:

```text
additiveTotal = 0
multiplierProduct = 1
effectCount = 0
```

When an upgrade effect successfully applies:

Add:
```text
additiveTotal += effect.value
```

Multiply:
```text
multiplierProduct *= effect.value
```

Update in the same authoritative flow as the real modifier application.

It must:
- reset per match;
- serialize in snapshots;
- survive reconnect;
- be identical in SP/MP authoritative state.

This summary is LEVEL-UP UPGRADES ONLY.

Exclude:
- relics;
- difficulty;
- temporary effects;
- base stats.

Do not change current StatResolver math.

---

# 11. Status UI

Below minimap show only modified level-up stats.

Example:

```text
LEVEL-UP MODIFIERS                  7

CREW
CANNON DAMAGE                   ×1.36
                                +36%
MAX INTEGRITY                     +40

DRIVER
TOP SPEED                       ×1.18
                                +18%

GUNNER
CANNON COOLDOWN                 ×0.76
                                24% FASTER
```

Never show raw stat ids.

Create/extend a human presentation mapping.

Lower-is-better stats such as cooldown should receive human secondary wording.

If both add and multiply exist:

```text
+12 · ×1.18
```

Do not falsely collapse them without base context.

Group CREW/DRIVER/GUNNER only when truthful and hide empty groups.

Rows should be compact with thin separators, not separate cards.

Before upgrades:

```text
NO LEVEL-UP MODIFIERS YET
```

---

# 12. HUD coexistence

Drawer must not block:
- reticle;
- top-center wave/boss state;
- bottom-right role actions.

If it collides with existing left-side HUD, create a deliberate drawer-open HUD composition:
- shift or condense redundant left instrumentation;
- preserve critical integrity information.

Do not simply stack opaque panels.

This is an explicit visual-judgment requirement.

---

# 13. Responsive

Check at minimum:
- 1280×720;
- 1920×1080;
- 800×720;
- 560×720.

Suggested widths:
- >1100: 360–420px;
- 800–1100: min(390px,42vw);
- 560–800: min(370px,62vw);
- ≤560: max ~78vw, still not fullscreen.

Keep the triangle readable.

---

# 14. Tests

Add focused tests for all binding invariants.

Enemy UI:
- full HP no bar;
- damaged red bar;
- dead no bar;
- correct fill;
- actual final HP-loss number;
- MG coalescing;
- offscreen culling.

Minimap:
- real bounds;
- roads/buildings;
- triangle exists;
- north-up;
- camera yaw changes do not rotate triangle;
- turret yaw does not rotate triangle;
- chassis yaw does rotate triangle;
- fake apron does not expand map bounds.

Tab:
- opens/closes once;
- no key-repeat spam;
- pointer lock preserved;
- gameplay not paused;
- higher-priority overlay closes it;
- menu/form Tab unaffected.

Upgrade summary:
- ×1.10 then ×1.20 => ×1.32;
- +20 then +20 => +40;
- snapshot/reconnect;
- MP parity;
- relic/difficulty excluded.

Environment/boundary:
- sky load/fallback;
- no daytime stars;
- apron cleanup/rebuild;
- apron has no gameplay collision;
- apron is excluded from camera/gameplay spatial queries;
- fake apron casts no shadows;
- configured near/far counts stay within budget;
- low-quality mode reduces apron density;
- tank cannot exit;
- outward velocity removed;
- tangent preserved;
- no edge jitter.

Performance:
- capture baseline urban400 diagnostics;
- capture apron-enabled diagnostics under identical conditions;
- calculate added render cost;
- `≤20%` added render cost required;
- if `>20%`, optimize fake scenery and rerun before completion.

---

# 15. Qualification

Use actual package scripts after inspection.

At minimum:
```bash
npx tsc --noEmit
npm run build
npm test
npm run test:progression
npm run test:netcode
npm run test:horde
```

Run relevant E2E suites.

Mandatory manual QA:

1. Stop tank, open Tab, orbit camera 360°: triangle must not rotate.
2. Turn chassis 90°: triangle must rotate 90°.
3. Test health bars/damage numbers with MG/cannon/charge and several monster sizes.
4. Open drawer while actively driving/aiming.
5. Trigger progression while drawer is open; drawer closes and roulette remains correct.
6. Drive multiple urban400 boundary roads.
7. Confirm fake city + sky + haze hide the real world edge.
8. Compare urban400 baseline vs apron render diagnostics and verify added render cost is `≤20%`.

---

# 16. Implementation report

Create:

```text
docs/quality/GAMEPLAY_READABILITY_TACTICAL_ENVIRONMENT_IMPLEMENTATION_REPORT.md
```

Include:
- start/end SHA;
- files changed;
- protocol/state changes;
- world-UI performance design;
- minimap coordinate convention;
- explicit proof marker uses chassis heading;
- sky asset path or fallback status;
- apron/boundary strategy;
- exact near/far apron instance counts by quality tier;
- baseline vs apron draw-call/triangle/render-submit/frame-interval metrics;
- calculated percentage render-cost increase;
- test results;
- viewport evidence;
- limitations.

---

# 17. Forbidden shortcuts

Do not:
- use hundreds of enemy DOM nodes;
- render a second Three.js minimap camera;
- use camera or turret yaw for triangle;
- pause on Tab;
- release pointer lock;
- show fake apron as playable minimap space;
- use client-only collision blockers;
- enlarge real map to solve visuals;
- render a full-density second city around urban400;
- let fake apron cast shadows;
- expand shadow-camera coverage for fake skyline;
- exceed the ~20% render-cost budget and call the feature done;
- display intermediate/pre-defense damage;
- store upgrade summary client-only;
- scrape selected cards from DOM;
- mix relic/difficulty/temp modifiers into level-up summary;
- show raw stat ids;
- make tactical drawer fullscreen;
- mechanically clone menu modal styling;
- replace Recoil Crew's visual identity;
- sacrifice visual quality just to obey a template;
- regress roulette/progression/netcode/TPS behavior.

Definition of done is the full checklist in the binding design.
