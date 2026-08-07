# Recoil Crew — Gameplay Readability, Tactical Drawer & Environment Illusion Design
## Enemy combat feedback, sky, world-boundary illusion, minimap, and level-up status

**Status:** Binding feature/design specification  
**Repository:** `mwl313/RecoilCrewDS`  
**Base:** current `origin/main` at implementation time  
**Primary surfaces:** gameplay HUD/world UI, Three.js environment, map generation, progression replication

---

# 0. Authority and visual intent

Use this alongside:

- `docs/ui/UI_DESIGN_SYSTEM.md`
- `docs/ui/RECOIL_CREW_UI_VISUAL_REWORK_DESIGN.md`

The existing design system remains Recoil Crew's visual grammar, not a prison. Keep its Barlow typography, matte near-black materials, angular cuts, amber construction accents, role colors, thin structural lines, and mechanical motion. Do not blindly copy menu/modal geometry into gameplay surfaces when that produces an ugly or obstructive result.

Priority for this milestone:

1. Direct requirements in this document.
2. Combat readability and truthful information.
3. Visual quality in the actual game.
4. Existing Recoil Crew design grammar.
5. Exact reuse of existing component templates.

If strict template reuse produces a worse result, art-direct the new element specifically for gameplay while keeping recognizable Recoil Crew DNA.

The goal is that every new surface feels authored for its job rather than mechanically assembled from generic panels.

---

# 1. Milestone scope

Implement five connected improvements:

A. Damaged monsters receive red world-anchored health bars.  
B. Enemy damage is shown as red world-anchored negative numbers.  
C. The 400×400 urban arena appears to continue into a much larger world.  
D. The flat gray-blue sky is replaced by an authored sky-image presentation.  
E. `Tab` toggles a partial left-side tactical drawer containing:
- minimap
- cumulative level-up upgrade status

These improve combat readability, navigation, build comprehension, environmental polish, and perceived world scale.

---

# 2. Non-goals

Do not:

- enlarge the authoritative 400×400 gameplay bounds;
- place enemies/chests/objectives in the fake outer city;
- pause gameplay when the tactical drawer is open;
- release pointer lock for the drawer;
- use a second Three.js minimap camera;
- show health bars over full-health ordinary monsters;
- add enemy names or numeric HP to ordinary monsters;
- invent critical-hit rules;
- mix relic/difficulty/temporary modifiers into the requested level-up status;
- use camera heading or turret heading for the minimap player triangle;
- show the fake visual apron as playable minimap space.

---

# 3. Architecture summary

Recommended client modules:

```text
src/client/worldUi/
├── enemyWorldUiLayer.ts
└── enemyWorldUiProjector.ts

src/client/tactical/
├── tacticalDrawer.ts
├── miniMapRenderer.ts
├── miniMapProjection.ts
├── upgradeStatusProjector.ts
└── tactical-drawer.css

src/client/environment/
├── skyEnvironment.ts
└── visualWorldApron.ts
```

Recommended shared additions:

```text
src/shared/progression/levelUpgradeSummary.ts
src/shared/mapgen/boundaryPresentation.ts   // if needed
```

Integrate with existing `GameClient`, `ArenaView`, `InputManager`, `MatchState`, and progression authority. Do not introduce a new app-level UI framework.

---

# 4. EnemyWorldUiLayer

Create one shared screen-space combat-feedback system.

Preferred implementation:

```text
one transparent Canvas 2D overlay
over the Three.js gameplay renderer
below the fixed HUD
pointer-events: none
```

Canvas is preferred because the game already has an instanced fodder path. Avoid one DOM node or one Three.js health-bar object per enemy.

The layer receives:
- current presented `MatchState`;
- active render camera;
- viewport dimensions;
- normalized monster dimensions;
- authoritative enemy hit events.

---

# 5. Monster health bars

## 5.1 Visibility

Show a bar only when:

```text
enemy.alive
enemy.hp > 0
enemy.hp < enemy.maxHp
```

Exactly 100% HP: no bar.  
Dead: no bar.

This keeps undamaged hordes visually clean.

## 5.2 Anchor

Project a point slightly above the visible monster top.

Prefer normalized monster/presentation dimensions already used by monster rendering. Do not hardcode one universal `enemy.y + 1`.

Suggested:

```text
enemy base position
+ resolved visual height
+ 0.20–0.35m breathing room
```

Fallback only if dimensions are unavailable:

```text
enemy.y + 1.5m
```

## 5.3 Appearance

Desktop target:

```text
width: ~48px
height: 5px
backing: rgba(7,9,10,.84)
fill: Recoil danger red
hard contrast
```

No rounded MMORPG bar. No label. No percent text. Optional tiny clipped terminal at one corner is acceptable.

## 5.4 Fill and interpolation

```text
fillRatio = clamp(hp / maxHp, 0, 1)
```

A short 70–100ms visual interpolation may smooth snapshot stepping, but the value must remain truthful.

## 5.5 Distance behavior

Suggested:

```text
0–35m:   1.00 scale
35–70m:  0.90
70–100m: 0.78
100m+:   hide/cull based on presentation tier
```

Never shrink below readable size.

## 5.6 Culling

Do not draw bars for:
- behind-camera anchors;
- clearly offscreen anchors;
- far aggregate-only entities.

Suggested safety cap:

```text
nearest 96 individually represented damaged enemies
```

## 5.7 Occlusion

Health bars should not routinely reveal enemies through large buildings.

If performance permits:
- update static-world occlusion at ~8–12Hz;
- only nearest 32–48 damaged visible candidates;
- use existing spatialized static collider data;
- segment-vs-AABB is sufficient.

Do not run hundreds of Three.js raycasters every frame.

If safe occlusion cannot be delivered without regression, ship distance/frustum culling first and document the limitation.

---

# 6. Floating damage numbers

Every authoritative enemy hit displays a red negative number such as:

```text
-19
```

This replaces the placeholder damage presentation.

## 6.1 Exact displayed damage

Do not display an intermediate pre-defense amount.

In `DamageSystem.applyEnemy`:

```text
hpBefore = enemy.hp
apply current gameplay damage math unchanged
hpAfter = max(0, enemy.hp)
actualHpLoss = max(0, hpBefore - hpAfter)
```

Use `actualHpLoss` for the hit presentation event.

A lethal overkill hit displays at most the remaining HP actually removed.

Do not change combat damage math.

## 6.2 Formatting

- negative sign;
- rounded integer;
- no decimal noise.

Example:

```text
19.3 actual HP loss -> -19
```

## 6.3 Animation

Target lifetime: 650–800ms.

Suggested:

```text
0ms:   opacity 0, scale 1.35, y 0
60ms:  opacity 1, scale .96, y -5px
140ms: scale 1, y -10px
700ms: opacity 0, y -34px
```

Visual:
- Barlow Condensed italic 900;
- danger red;
- hard 1–2px dark outline/shadow;
- ~18–23px depending on distance;
- no soft glow.

## 6.4 MG coalescing

Rapid same-enemy hits within about 60ms merge into one active popup:

```text
same enemy + merge window
=> add damage
=> refresh the punch slightly
```

Cannon/Dash/large isolated hits remain individually satisfying.

Different enemies never merge.

## 6.5 Motion model

Spawn from the current enemy upper-body/head anchor. After spawn, treat the number as a screen-space particle drifting upward rather than forcing it to stay perfectly attached to a moving enemy for its entire lifetime.

---

# 7. Sky image

Replace the flat combat background with an authored panoramic sky.

Preferred asset:

```text
2048×1024
2:1 equirectangular
WebP
sRGB
```

Suggested path:

```text
public/assets/environment/sky/recoil-day-01.webp
```

Use actual repository asset conventions if different.

## 7.1 Art direction

Target:

```text
stylized late afternoon
rich blue overhead
pale warm-blue / cream horizon
large soft wispy clouds
bright arcade readability
slightly dramatic
```

Avoid:
- gray overcast blob;
- neon fantasy;
- apocalyptic orange;
- city/mountains baked into sky;
- visible ground in panorama;
- extremely photoreal HDRI mismatch.

## 7.2 Lighting coherence

The visible sky and world lighting must agree.

If the sky has an obvious warm bright region, align the directional sun approximately to it. Keep warm key light + cooler hemisphere/fill.

Do not let the apparent sun and shadows disagree.

## 7.3 Fog

Fog/haze must blend toward the sky's horizon color rather than arbitrary gray.

Final transition:

```text
real city
→ sparse near apron
→ silhouette skyline
→ atmospheric haze
→ sky horizon
```

Tune fog together with the visual-apron performance design. A good default target is gentle haze beginning around `120–170m`, strong silhouette separation by roughly `280m`, and far apron mostly dissolved by about `380–420m`. Preserve clear combat readability inside normal encounter range.

## 7.4 Daytime stars

Disable/remove daytime stars for this environment.

## 7.5 Fallback

If the authored sky fails to load:

```text
procedural blue-to-warm-horizon fallback
```

Never leave a black scene and never download an arbitrary internet asset at runtime.

---

# 8. Beyond the barrier — visual world apron

The authoritative urban400 map remains:

```text
400×400m
```

Do **not** render another full-detail 400×400 city around it.

Create a client presentation-only `VisualWorldApron` using deliberately sparse, cheap visual tiers.

No:
- collision;
- network state;
- enemies;
- spawns;
- chests;
- XP;
- objectives;
- damage targets;
- gameplay queries;
- animation.

## 8.1 Performance principle

The fake world exists only to defeat the visual edge.

Its job is:

```text
suggest a much larger city
```

not:

```text
render another playable city
```

The physical size of the fake apron is less important than:
- draw calls;
- material count;
- triangles;
- shadow participation;
- animation;
- update logic.

A large number of static instances sharing a few geometries/materials is acceptable. A smaller number of unique shadow-casting detailed objects is not.

## 8.2 Recommended urban400 density budget

Use these as default implementation targets, not invitations to exceed them:

### Near visual apron

First approximately `0–80m` beyond each real boundary:

```text
~100–160 total existing low-poly building instances
~20–30 total trees / vehicles / props
a small number of continuation road strips
```

These counts are for the entire outer apron around urban400, not per side.

Characteristics:
- reuse current urban building asset families;
- group by asset/material with `InstancedMesh`;
- significantly lower density than the playable city;
- no gameplay logic;
- no animation;
- no collision;
- `castShadow = false`;
- preferably `receiveShadow = false`;
- no per-instance material cloning.

This tier should imply recognizable nearby city blocks without reproducing the real-map building density.

### Far skyline apron

Approximately `80–220m+` beyond the true boundary:

```text
~50–100 simple building/silhouette instances total
```

Use:
- box/very-low-poly skyline geometry;
- a few height/width families;
- occasional taller tower silhouettes;
- 1–3 shared materials;
- a handful of `InstancedMesh` groups.

Absolutely:
- no shadows;
- no animation;
- no collision;
- no individual textures required.

The far skyline should be dramatically cheaper than the near apron.

## 8.3 Simple two-tier visual LOD

Use a deliberately simple two-tier approach.

Measured from the true playable boundary:

```text
0–80m beyond:
existing low-poly urban building models at sparse density

80m+ beyond:
simple silhouette/box replacements
```

Do not build a complex general-purpose LOD framework solely for the fake city.

If an existing project LOD seam can be reused cheaply, that is acceptable, but this milestone does not require a new universal LOD architecture.

## 8.4 Road continuation

Only enough road geometry is needed to make visible streets appear to continue past authoritative blockers.

Do not reconstruct the entire urban road graph outside the map.

Prefer:
- short continuation strips;
- a few intersections visible from perimeter approaches;
- fog hiding the end.

Roads in the fake apron:
- have no collision;
- are not included in minimap navigation;
- do not create routes for enemies/trucks.

## 8.5 Atmosphere does the rest

The player does not need crystal-clear city detail hundreds of meters away.

Recommended camera-distance atmosphere target:

```text
0–120m:
normal gameplay clarity

120–170m:
haze begins gently

170–280m:
noticeable atmospheric separation

280–380m:
buildings read mainly as silhouettes

~380–420m:
far geometry is heavily faded into the sky horizon
```

Exact values may be tuned visually, but preserve:
- full combat readability inside normal encounter range;
- visible enough near apron to imply continuation;
- aggressive hiding of far geometry before its detail limitations become obvious.

If using linear `THREE.Fog`, tune start/end around these goals rather than copying the old `115–190m` pair unchanged.

Do not extend visibility so far that the fake apron needs full detail.

## 8.6 Stable generation

Seed the presentation apron from stable map information such as:

```text
map id
+ arena seed/checksum
```

Stable output helps reconnect, QA, screenshots, and reproducibility.

Presentation determinism must never become gameplay authority.

## 8.7 Rendering implementation rules

Use:
- `InstancedMesh`;
- shared geometry;
- shared materials;
- frustum culling;
- very low material variety;
- static transforms built once on arena creation.

Do not:
- clone unique materials per fake building;
- add update/tick logic to each fake object;
- include fake objects in camera collision;
- include fake objects in spatial gameplay queries;
- cast apron shadows;
- enlarge the directional shadow camera to cover the apron.

The real playable city keeps normal shadow quality. The fake city does not participate in the shadow budget.

## 8.8 Render-cost budget

Measure urban400 before and after this feature using the existing render diagnostics.

Track at minimum:
- estimated draw calls;
- estimated triangle count;
- render-submit p50/p95;
- geometry count;
- texture count;
- FPS/frame-interval p50/p95.

Binding target:

```text
VisualWorldApron should add no more than roughly 10–20% render/GPU cost
relative to the same urban400 scene without the apron.
```

Interpretation:
- `≤10%` added cost: excellent;
- `10–20%`: acceptable;
- `>20%`: optimize before calling the feature done;
- `>30%`: implementation is too detailed for a purely visual illusion.

Use render-submit/frame-time evidence rather than assuming instance count equals cost.

If the first implementation exceeds the budget, reduce in this order:

```text
1. far skyline instance count
2. near-apron prop/tree/vehicle count
3. near-apron building density
4. material variety
5. far skyline triangle complexity
```

Do not solve performance by reducing real playable-city quality first.

## 8.9 Quality scaling

If the project has low-quality/performance modes, the apron is an ideal scalable feature.

Recommended:

```text
high:
full near-apron target + far skyline

medium:
~70% near-apron instances + ~60% far skyline

low:
minimal road continuation + sparse skyline only
```

The authoritative map is identical in every quality mode.

The illusion should degrade gracefully rather than disappear into a visible void.



# 9. Believable boundary blocking

Do not let a visually continuing street end at a naked invisible wall.

## 9.1 Perimeter approaches

Detect roads/traversable approaches reaching the real gameplay perimeter.

Place believable blockers just inside the authoritative playable area:

- concrete barricades;
- wrecked vehicles;
- collapsed road;
- construction barriers;
- blocked tunnel/overpass.

Prefer existing urban assets.

Behind them, roads/buildings/skyline visually continue into the fake apron.

The message becomes:

> This route is blocked.

not:

> The game world ends here.

## 9.2 Authority

Anything physically stopping the tank must exist in authoritative/shared map data. Client-only apron geometry must never be relied on for collision.

## 9.3 Continuous fallback boundary

Keep a continuous real-bounds invisible safety layer.

Improve the current clamp so crossing the bounds creates stable inward contact behavior:

- clamp position;
- derive inward boundary normal;
- remove only outward velocity;
- preserve tangential movement;
- avoid repeated snapping/jitter.

Use actual project coordinate conventions.

---

# 10. Tactical drawer

`Tab` toggles one combined left-side gameplay drawer:

```text
MINIMAP
+
LEVEL-UP MODIFIERS
```

Do not create two unrelated Tab overlays.

## 10.1 Input

During active gameplay:

```text
Tab press -> open
next Tab press -> close
```

Toggle, not hold.

While open:
- simulation continues;
- Driver movement continues;
- Gunner aiming/weapons continue;
- camera continues;
- pointer lock remains;
- no cursor required.

Prevent browser Tab focus traversal only while active gameplay owns this input. Do not break Tab navigation in menus/forms.

Ignore key repeat; rearm on keyup.

## 10.2 Overlay priority

Auto-close for:
- level-up roulette;
- relic roulette;
- pause;
- results;
- connection error;
- lobby/menu transitions.

Do not auto-reopen after the higher-priority UI disappears.

---

# 11. Tactical drawer visual design

This is not a menu modal.

Art direction:

> An armored field-computer / tactical slate sliding from the left HUD rail.

Use Recoil Crew DNA, but optimize for dense gameplay information.

## 11.1 Desktop geometry

At 1280×720:

```text
left: ~24px
top: ~76px
bottom: ~24px
width: ~400px
```

General:

```css
width: clamp(360px,31vw,420px)
```

The right ~68–70% of gameplay stays unobstructed.

No fullscreen scrim.

## 11.2 Surface

Use:
- matte near-black ~90–94% opacity;
- 1px structural border;
- one 3–4px amber construction accent;
- large clipped corner family;
- restrained internal rules.

Do not use:
- glassmorphism;
- rounded dashboard cards;
- giant floating shadow;
- cyan-purple gradient;
- fake telemetry.

A subtle grid/noise texture inside the map viewport is acceptable.

## 11.3 Motion

Open:

```text
translateX(calc(-100% - 32px)) -> 0
240–280ms
cubic-bezier(.65,0,.35,1)
```

Close:

```text
0 -> offscreen left
200–240ms
```

No scale bounce.

## 11.4 Header

Compact:

```text
TACTICAL
LEVEL 12
TAB // CLOSE
```

Only real information.

`TACTICAL` should be a compact 22–26px display label, not a giant modal title.

---

# 12. Minimap

Use Canvas 2D. Do not render another Three.js camera.

`MiniMapRenderer` keeps:
- cached static map base;
- dynamic marker pass.

## 12.1 Size

Desktop square:

```text
~300–330px
```

inside the drawer.

## 12.2 Orientation

The map is permanently:

```text
NORTH-UP
```

It does not rotate with vehicle, turret, or camera. Add a restrained `N` at the top.

## 12.3 Player marker — binding requirement

The player/shared tank marker is an **isosceles triangle**.

The triangle indicates:

```text
VEHICLE / CHASSIS FACING
```

It must **not** indicate camera direction.

Use the smooth rendered/predicted/interpolated tank pose where possible, e.g. the same pose exposed by `GameClient.getRenderTank()`.

Use:
- tank/chassis yaw;
- the same forward-vector convention used by vehicle movement/rendering.

Do not use:
- camera yaw;
- pointer-lock orbit;
- turret yaw.

Suggested geometry:

```text
height: 15–18px
width: 11–14px
tip = vehicle forward
fill = local role color / single-player amber
hard contrasting outline
```

### Hard acceptance test

```text
tank stationary
orbit TPS camera 360°
=> minimap triangle DOES NOT ROTATE

rotate chassis 90°
=> triangle rotates 90°
```

Driver and Gunner clients viewing the same shared tank show the same chassis heading.

## 12.4 Urban static base

Draw from the real urban layout:

- near-black map field;
- roads in muted gray;
- building footprints in darker gray;
- optional major solid props;
- extremely subtle real map edge.

Do not over-detail.

## 12.5 Non-urban fallback

For generated terrain:
- real bounds;
- coarse driveable area;
- cliffs/major obstacles.

For legacy:
- arena outline;
- obstacles;
- major ramps.

Do not make the minimap urban-only if generic support is cheap.

## 12.6 Dynamic markers

Binding minimum:
- tank triangle;
- active relic chests;
- elite/special enemies;
- boss/wave leader.

Recommended:
- nearby ordinary enemies as tiny muted red dots;
- far horde represented using aggregate-sector information instead of hundreds of dots.

Suggested hierarchy:

```text
tank:            15–18px triangle
chest:            7–9px amber diamond
ordinary enemy:   2–3px muted red dot
elite/special:    ~6px danger diamond
boss/leader:      9–11px danger marker + thin ring
```

## 12.7 Truthful area

The minimap represents only the real playable operation zone. Do not include the fake visual apron as traversable map space.

---

# 13. Authoritative level-up modifier summary

Completed level-up effects currently become stat-resolver modifiers. A Multiplayer/reconnected client cannot reliably reconstruct every level-up-only multiplier from UI history.

Add authoritative replicated summary state.

Recommended:

```ts
export interface LevelUpgradeStatSummary {
  statId: string;
  additiveTotal: number;
  multiplierProduct: number;
  effectCount: number;
}
```

and:

```ts
TeamProgressionState.levelUpgradeSummary
```

Defaults:

```text
additiveTotal = 0
multiplierProduct = 1
effectCount = 0
```

When an upgrade effect is successfully applied:

For add:
```text
additiveTotal += effect.value
```

For multiply:
```text
multiplierProduct *= effect.value
```

Update in the same authoritative transaction as the actual upgrade application.

The summary:
- serializes in snapshots;
- survives reconnect;
- is shared by SP/MP authority;
- resets per match.

It represents **level-up upgrades only**.

Exclude:
- relic modifiers;
- difficulty modifiers;
- temporary buffs/debuffs;
- base stats.

---

# 14. Status presentation

Below the minimap show only modified stats.

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

No raw stat ids.

Create/extend a stat-id -> human display-label helper.

For lower-is-better stats such as cooldown, show human wording like `24% FASTER`.

If both add and multiply affect a stat:

```text
+12 · ×1.18
```

Do not collapse into a misleading single percentage without base context.

Group into CREW / DRIVER / GUNNER only where truthful. Hide empty groups.

Rows should be dense:
- ~36–42px;
- label left;
- cumulative value right;
- optional small secondary line;
- thin divider;
- no boxed card per stat.

This is an instrument, not a reward reveal. Do not use rarity fireworks here.

Empty state:

```text
NO LEVEL-UP MODIFIERS YET
```

---

# 15. Tactical drawer composition

Conceptual layout:

```text
┌──────────────────────────────────────┐
│ TACTICAL                  TAB // CLOSE
│ LEVEL 12                             │
│ ───────── amber rule ─────────────── │
│                                      │
│             MINIMAP                  │
│        ┌────────────────────┐        │
│        │                    │        │
│        │   roads/buildings  │        │
│        │         ▲          │        │
│        │                    │        │
│        └────────────────────┘        │
│                                      │
│ LEVEL-UP MODIFIERS            7      │
│ ──────────────────────────────────── │
│ CREW                                 │
│ CANNON DAMAGE                 ×1.36  │
│ MAX INTEGRITY                   +40  │
│ DRIVER                               │
│ TOP SPEED                      ×1.18  │
│ GUNNER                               │
│ CANNON COOLDOWN                ×0.76 │
└──────────────────────────────────────┘
```

This is hierarchy guidance, not permission to invent fake labels.

---

# 16. HUD coexistence

The drawer must never obstruct:
- center reticle;
- top-center wave/boss state;
- bottom-right role actions.

If it conflicts with existing left-side HUD:
- shift/condense redundant left instrumentation while open;
- or let the drawer temporarily replace non-critical left-side elements.

Critical integrity information must remain accessible.

Do not stack opaque panels on top of each other just because both already exist.

This is explicitly an area where visual judgment outranks literal template reuse.

---

# 17. Responsive behavior

## >1100px
```text
drawer 360–420px
map 300–330px
```

## 800–1100px
```text
drawer min(390px,42vw)
map 270–300px
```

## 560–800px
```text
drawer min(370px,62vw)
map 230–270px
```

## ≤560px

Stay partial-screen:

```text
drawer max ~78vw
map ~200–225px
```

Hide low-priority secondary explanations before hiding real modifier values.

The triangle remains readable and directional.

---

# 18. Motion/accessibility

Tactical drawer:
- mechanical slide only;
- no scaling;
- no bouncing.

Reduced motion:
- ~1ms or very short translation.

Damage numbers under reduced motion:
- 250–350ms fade;
- minimal vertical travel.

Health bars:
- no looping animation.

---

# 19. Performance constraints

## Enemy world UI

- one Canvas 2D;
- no per-enemy DOM;
- pooled damage records;
- max active popup safety cap ~64–96;
- cache font/style setup;
- avoid expensive world-occlusion work every frame.

## Minimap

- static base redraw only on arena rebuild;
- dynamic markers redraw only while drawer is open;
- no second Three.js camera;
- no hidden-map redraw cost while drawer is closed beyond a cheap state check.

## Tactical DOM

- build once per gameplay session;
- update values/open state;
- no full DOM rebuild every RAF.

## Visual world apron

Default urban400 targets:

```text
near apron:
~100–160 instanced existing-building placements total
~20–30 trees/vehicles/props total
0–80m beyond real boundary

far skyline:
~50–100 simple silhouette/box instances total
80–220m+ beyond real boundary
```

Rendering rules:

```text
near apron: castShadow=false
far apron:  castShadow=false
far apron:  receiveShadow=false
no apron animation
no apron collision
no apron gameplay updates
shared materials only
few InstancedMesh groups
```

Do not enlarge the directional shadow camera for fake scenery.

## Budget

Urban400 qualification must compare:

```text
baseline urban400
vs
urban400 + VisualWorldApron
```

Target added render cost:

```text
≤10% ideal
10–20% acceptable
>20% requires optimization
>30% fails this milestone
```

Use actual render-submit/frame-interval diagnostics and FPS, not just object counts.

If over budget, simplify fake scenery before touching real gameplay-city quality.

The fake world is successful when it looks much larger than it costs.



# 20. Recommended implementation phases

## Phase A — Combat readability
- EnemyWorldUiLayer
- damaged-only health bars
- exact damage numbers
- MG coalescing

## Phase B — Environment illusion
- sky asset/fallback
- coherent fog/light
- visual city apron
- authoritative perimeter blockers
- stable fallback boundary

## Phase C — Tactical drawer
- Tab input
- drawer
- minimap
- chassis-facing triangle
- replicated level-up summary
- status projector

Keep modules focused rather than building one giant controller.

---

# 21. Tests

## Health bars
- full HP -> no bar
- damaged -> red bar
- full again -> disappears
- dead -> disappears
- fill ratio correct
- offscreen -> not drawn

## Damage numbers
- event equals actual final HP loss
- formatting `-19`
- lethal overkill clamps to remaining HP
- same-enemy MG merge
- different enemies don't merge
- expiry

## Minimap
- bounds equal authoritative playable bounds
- urban roads/buildings visible
- triangle marker exists
- map north-up
- camera yaw changes -> triangle unchanged
- turret yaw changes -> triangle unchanged
- chassis yaw changes -> triangle changes
- fake apron does not change minimap bounds

## Tab
- one press opens
- one press closes
- no repeat toggle
- pointer lock preserved
- gameplay not paused
- higher-priority UI closes drawer
- normal menu/form Tab behavior remains available

## Upgrade summary
- ×1.10 then ×1.20 -> ×1.32
- +20 then +20 -> +40
- snapshot/reconnect
- MP parity
- relic/difficulty excluded

## Boundary/environment
- sky loads + fallback
- daytime stars absent
- no duplicate sky/apron on rematch
- apron has no gameplay colliders
- apron objects do not enter gameplay/camera-collision queries
- near/far apron counts remain within configured budgets
- apron objects do not cast shadows
- low-quality mode reduces apron density without changing authority
- tank cannot exit
- outward velocity removed
- tangential movement preserved
- no jitter

## Performance qualification
- capture baseline urban400 render diagnostics
- capture apron-enabled diagnostics in the same viewport/quality mode
- calculate added render-submit/frame cost
- `≤20%` added render cost required
- `>20%` fails until optimized

---

# 22. Manual/browser qualification

Test at minimum:
- 1280×720
- 1920×1080
- 800×720
- 560×720

Mandatory visual checks:

### Triangle heading
```text
stop tank
open Tab
orbit camera 360° without steering
=> triangle stays fixed

turn chassis 90°
=> triangle turns 90°
```

### Combat feedback
Test mixed monster sizes with:
- MG
- cannon
- charge
- Dash/ROADKILL where applicable

Verify damaged-only bars remain legible without turning horde combat into UI clutter.

### Drawer
Open while driving and while aiming. Confirm center combat view remains usable. Trigger level-up while drawer is open and confirm the drawer closes before roulette.

### World edge
Drive to multiple perimeter streets:
- blockers feel intentional;
- city clearly continues behind them;
- no obvious void;
- no naked invisible stop;
- fog/sky hides the apron end.

---

# 23. Forbidden shortcuts

Do not:
- create hundreds of enemy DOM nodes;
- create second Three.js minimap camera;
- rotate triangle from camera yaw;
- rotate triangle from turret yaw;
- pause on Tab;
- release pointer lock;
- show fake city as playable minimap;
- rely on client-only blockers;
- enlarge the authoritative map to solve visuals;
- display intermediate damage;
- store upgrade summary client-only;
- scrape upgrade history from DOM;
- include relic/difficulty/temp buffs in level-up summary;
- show raw stat ids;
- build a fullscreen tactical modal;
- mindlessly clone the menu overlay template;
- replace the existing visual identity;
- sacrifice prettiness just to obey a numeric template;
- regress roulette/TPS/netcode/progression behavior.

---

# 24. Definition of done

- [ ] Damaged monsters show red health bars above visible heads.
- [ ] Full-health monsters show no health bar.
- [ ] Bars support instanced and special monster paths.
- [ ] Enemy hits show red negative damage numbers.
- [ ] Displayed damage equals actual final HP loss.
- [ ] MG numbers coalesce intelligently.
- [ ] Flat sky is replaced by coherent authored-sky presentation.
- [ ] Fog matches the sky horizon.
- [ ] Daytime stars are removed.
- [ ] Urban400 visually continues beyond real edges.
- [ ] Fake apron has no gameplay authority.
- [ ] Near apron uses sparse instanced existing assets rather than full city density.
- [ ] Far skyline uses simple shadowless silhouette geometry.
- [ ] No fake-apron object casts a shadow or enters collision/gameplay queries.
- [ ] Urban400 apron adds no more than ~20% measured render cost versus baseline.
- [ ] Perimeter road openings have believable authoritative blockers.
- [ ] Fallback boundary physics is stable.
- [ ] Tab toggles one left tactical drawer.
- [ ] Drawer covers only part of viewport and has no fullscreen scrim.
- [ ] Gameplay and pointer lock continue while drawer is open.
- [ ] Drawer follows Recoil Crew grammar without blindly copying a modal.
- [ ] Minimap is Canvas 2D.
- [ ] Minimap shows real playable map only.
- [ ] Player marker is a triangle.
- [ ] Triangle points in vehicle/chassis facing direction.
- [ ] Camera orbit does not rotate triangle.
- [ ] Chassis rotation does rotate triangle.
- [ ] Level-up summary is authoritative and reconnect-safe.
- [ ] Status excludes relic/difficulty/temp effects.
- [ ] Status uses human-readable cumulative values.
- [ ] Higher-priority flows close the drawer.
- [ ] Responsive and urban400 performance qualification passes.

Final invariant:

> Combat tells the player what they hurt and by how much, the city feels larger than the playable district, and Tab reveals a compact beautiful tactical instrument showing where the vehicle is actually facing and what the run's level-up build has become—without pulling the player out of TPS control.
