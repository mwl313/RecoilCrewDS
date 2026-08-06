# Recoil Crew — Visual Design System and Agent Guidelines

## Status and authority

```text
Status: Binding visual-format contract
Applies to: Menus, lobby, HUD, overlays, progression, results, and future UI
Primary implementation: HTML DOM + content JSON + CSS + TypeScript
Default design and implementation model: GPT-5.6 Sol
```

This is the first document a future AI agent must use when changing Recoil Crew's interface. It defines the visual grammar that makes a screen belong to this game. The workflow document defines how to organize the work; the visual rework document defines the overall product scope; this document defines what the result must look and feel like.

Priority when sources disagree:

1. Direct user instruction for the current task.
2. Actual game features, state, and usability requirements.
3. This visual-format contract.
4. `RECOIL_CREW_UI_VISUAL_REWORK_DESIGN.md`.
5. Existing production implementation and approved screenshots.
6. Reference images and the HTML/CSS prototype.

Reference images are evidence and inspiration, not product requirements. Never add a feature merely because a mockup contains it.

Agents without image understanding must use section 0 as their primary execution contract. They must not guess what a screenshot contains or claim to have visually inspected one.

---

# 0. Text-only implementation contract

This section makes the system executable by agents that cannot see images. It is normative, not illustrative. Qualitative sections later in this document explain intent; the values below define the current approved implementation. When direct user instructions change a value, update both the CSS/content and this section in the same task.

## 0.1 Operating rules for non-visual agents

1. Treat `1280×720` as the canonical desktop measurement viewport and `1920×1080` as the large-desktop verification viewport.
2. Test `800×720` and `560×720` at the named responsive boundaries. Also test one narrow device viewport, normally `390×844`.
3. Use the semantic template nearest to the requested screen. Do not invent a new card, radius, font, gradient, or spacing scale when a listed template fits.
4. If a necessary value is not listed here, read the relevant file in `src/client/ui/` and use its computed value. Do not estimate from a reference image.
5. If an image and this contract appear to disagree, follow the source priority above. An agent that cannot inspect the image should state that limitation and follow this numeric contract.
6. Use browser DOM measurements, computed styles, text-content checks, and interaction tests for acceptance. Record subjective visual review as pending; never report it as completed.
7. Numeric tolerances are `±1px` for width/height, `±2px` for position, `±0.5px` for computed font size, and `±0.01` for opacity. Colors must match their computed RGB/RGBA value exactly.

## 0.2 Global frame and surface constants

| Property | Exact standard |
|---|---|
| Full-screen scene | `position: fixed; inset: 0; z-index: 30` |
| UI screen background | `#0d1113` family with the gradients defined in `foundations.css`; do not substitute pure black |
| Safe frame | `inset: 20px 24px` minimum; `1px solid rgba(255,173,34,.16)`; `z-index: 20`; no pointer events |
| Safe-frame upper tick | `68×2px`, `left: 20px`, `top: -1px`, amber |
| Safe-frame lower tick | `34×2px`, `right: 20px`, `bottom: -1px`, amber |
| Topbar | `height: 64px`; horizontal padding `safe-x + 14px`; bottom border `1px --ui-line`; background `rgba(7,9,10,.78)`; `z-index: 12` |
| Perspective grid | `48×48px`; `perspective(700px) rotateX(58deg) scale(1.4) translateY(21%)` |
| Scanline interval | transparent `0–3px`, paper-white `.016` from `3–4px` |
| Default structural line | `1px` |
| Active/semantic edge | `2–4px` |
| Default radius | `0` |
| Focus ring | `2px solid --ui-paper`; `3px` offset |

Global cut polygons must remain exactly:

```css
--ui-cut-sm: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
--ui-cut-md: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
--ui-cut-lg: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
```

## 0.3 Exact type recipes

| Use | Family/style/weight | Size / line height | Tracking |
|---|---|---|---|
| Utility kicker | Barlow normal `800` | `10px / normal` | `0.20em` |
| General utility label | Barlow normal `700–800` | `7–10px` | `0.11–0.20em` |
| Body/help copy | Barlow normal `400–700` | `11–14px / 1.4–1.55` | normal |
| Standard action | Barlow Condensed italic `800` | `20px / 1` | `0.035em` |
| Hero action | Barlow Condensed italic `800` | `24px / 1` | `0.035em` |
| Overlay heading | Barlow Condensed italic `900` | `clamp(42px,5vw,68px) / .86` | `-0.025em` |
| Form heading | Barlow Condensed italic `900` | `clamp(38px,5vw,60px) / .9` | `-0.02em` |
| Wordmark | Barlow Condensed italic `900` | screen-specific below, line height `.76` | `-0.055em` |

Use uppercase for utility labels and actions. Do not apply italic styling to body paragraphs. Use `font-variant-numeric: tabular-nums` for clocks and changing counters.

## 0.4 Exact action-control template

Standard `.ui-action`:

```text
width: 100%
min-height: 48px
padding: 0 44px 0 48px
background: rgba(24,30,32,.94)
text: #c5cbca
clip: --ui-cut-sm
label: 20px Barlow Condensed, italic 800, left aligned
lead marker: left 14px, vertically centered, 10px, opacity .38
chevron: right 16px, vertically centered, 30px
hover: background #293033 and translateX(4px)
active: translateX(4px) translateY(1px)
disabled opacity: .48
```

Hero/action variant changes only these values unless a screen-specific uniform-row rule overrides them:

```text
min-height: 58px
background: --ui-amber
text: --ui-ink-0
font-size: 24px
hover background: --ui-amber-hot
```

Compact action: minimum height `32px`, padding `7px 13px`, `1px --ui-line-strong` border, `10px` type, `0.10em` tracking. Text action: padding `7px 0`, `13px` condensed italic `700`, `0.10em` tracking, transparent background.

## 0.5 Boot/title screen geometry

The following values define the approved title composition:

```text
.boot-inner: top 43%, left 50%, width min(760px, viewport - 64px), translate(-50%,-50%)
desktop logo size: clamp(102px, 15vw, 207px)
desktop optical correction: translateX(clamp(39px, 5.7vw, 79px))
word slant: skewX(-6deg)
CREW offset: margin-left -0.78em; margin-top -0.02em
entry prompt: width min(360px, viewport - 48px), min-height 76px
entry prompt margin-top: 24px; padding: 18px 34px
entry prompt type: 28px / 1, italic 850, tracking .12em
entry pulse: 1.5s ease-in-out; midpoint amber-hot and translateY(-2px)
```

At `1280×720`, the entry prompt must measure `360×76px` and remain centered beneath the combined wordmark silhouette. The full `.boot-inner` remains `760px` wide. The button is deliberately larger than its label without reading as a second title block.

The wordmark content must use `RECOI\u2009L` with Unicode THIN SPACE `U+2009`. Do not replace it with an ordinary space, CSS-only letter spacing, or the fused string `RECOIL`. Center the visible two-line silhouette, not each word independently.

At `≤560px`: `.boot-inner top: 42%`; logo size `clamp(82px,26vw,112px)`; optical correction `clamp(31px,9.9vw,43px)`; prompt width `min(310px, viewport - 48px)`; min-height `66px`; margin-top `20px`; padding `15px 24px`; font size `23px`.

## 0.6 Main-menu geometry and motion

```text
menu rail: top 13%; left calc(safe-x + 2.5%); width min(430px,40vw); z-index 8
menu logo margin: 5px 0 22px
menu logo size: clamp(62px,7.6vw,112px)
each of five actions: same width, 48px height, 5px top margin, 20px label
action indices: 01 CREATE, 02 JOIN, 03 SINGLE PLAYER, 04 SETTINGS, 05 HOW TO PLAY
nickname: margin-top 12px; padding 8px 0 8px 12px; 3px amber left edge
nickname type: 14px, weight 800, tracking .11em, paper color
system status: 14px, weight 800, paper color; label exactly SYSTEM STATUS: READY
status lamp: 9×9px; 2.8s ease-in-out infinite
status low keyframe: opacity .28, glow 0 0 2px rgba(121,220,136,.18)
status peak keyframe: opacity 1, glow 0 0 16px rgba(121,220,136,.82)
hero caption: right calc(safe-x + 2%); bottom 11%; min-width 150px; padding 10px 16px; 4px amber right edge
```

At `1280×720`, the approved five action rectangles are `430×48px`, left `56px`, with top positions `291.5`, `344.5`, `397.5`, `450.5`, and `503.5px` (`±2px`). All five widths and heights must be equal. Create Crew stays amber but must not be taller or use a larger label.

Main-menu background grid:

```text
grid size: 48px
overall pseudo-element opacity: .44
horizontal line: rgba(255,173,34,.085), 1px
vertical line: rgba(241,238,227,.06), 1px
animation: 2.2s linear infinite
movement: first layer background-position-y 0 → 48px; second layer remains 0
```

Presentation tank content values:

```text
camera position: [0, .75, 6.3]
tank position: [1.35, -1.35, 0]
tank initial rotation: [0, -.42, 0]
tank scale: [1.05, 1.05, 1.05]
automatic yaw: .055 radians/second
float amplitude: .08 world units
float speed: .65
drag region: right side beginning at 46% of menu width
drag sensitivity: .009 radians per horizontal CSS pixel
```

Pointer-down in the drag region pauses automatic yaw. Horizontal movement changes yaw. Pointer-up/cancel resumes automatic yaw from the dragged orientation. Buttons, inputs, links, and elements with `role="button"` must never begin tank drag.

## 0.7 Menu-overlay template

Settings, How To, and Join Crew must leave `#screen-main` visible and preserve exactly one `#presentation-canvas` while open.

```text
overlay root: z-index 60; fixed full screen inherited from .screen; transparent background
scrim: absolute inset 0; rgba/gradient from components.css; blur 4px; saturation .72
base panel: centered at 50%/50%; z-index 2
base panel width: min(680px, viewport - 56px)
How To width: min(960px, viewport - 56px)
max height: viewport height - 56px
padding: 32px 36px 30px; gap 13px; overflow auto
border: 1px --ui-line-strong; left edge 4px amber; radius 0
clip: --ui-cut-lg
shadow: 0 34px 90px rgba(0,0,0,.68)
lower terminal: 110×4px amber at bottom-right
heading: clamp(42px,5vw,68px), line-height .86
rule: 1px high; first 92px amber; remainder --ui-line
```

Settings-specific values: nickname input min-height `70px`, padding `10px 18px`, `30px` condensed italic `800`, `1px` border; actions use three equal columns with `8px` gap. How-To-specific values: two equal role columns with `12px` gap; role-card padding `22px 24px 20px`; top semantic edge `84×3px`; role title `32px`; control copy `13px/1.7`; role note `12px/1.5`.

At `≤800px`, panel padding becomes `28px` and the How To columns become one column. At `≤560px`, panel width/max-height use `viewport - 28px`, padding becomes `24px 20px 22px`, and three-button action groups become one column.

## 0.8 Lobby and HUD placement invariants

Lobby desktop:

```text
room-code strip top 78px, width min(620px, viewport - 48px), centered, skewX(-5deg)
room code 38px condensed italic 900, tracking .18em
lobby body inset 22% 4% 23%
role panel width min(28%,360px), min-height 270px, padding 24px
player name 25px condensed italic 800
vehicle stage left 34%, top 10%, width 32%, height 78%
bottom actions left/right 4%, bottom 9%, columns 1fr auto minmax(260px,30%), gap 22px
chat left 4%, bottom 0, z-index 18
```

Gameplay HUD desktop:

```text
topline: top 18px minimum; left/right 22px minimum
role chip: min-width 120px; padding 10px 16px 10px 36px; 3px role edge; 18px label
wave cluster: centered in three-column topline; timer 32px tabular
encounters: top 16%; centered; keep below 650px width
bottomline: left/right/bottom 24px minimum
survival cluster: width min(360px,34vw); gap 10px
role actions: 8px gap
ability plate: min-width 118px; min-height 74px; padding 10px 12px; 3px role bottom edge
crosshair: 54×54px; center dot 6×6px; cross lines 70×1px
crosshair charge meter: 5×50px; 9px to the right of reticle
```

The crosshair receives viewport CSS coordinates directly. Its base transform is exactly `translate(-50%,-50%)`. It must not be a child of `.hud-center` or any other translated prompt group.

## 0.9 Responsive boundary table

| Boundary | Required changes |
|---|---|
| `≤1100px` | Menu rail `min(400px,47vw)`; menu logo `clamp(58px,9vw,94px)`; lobby role panel `31%`; vehicle stage `left 32%, width 36%, opacity .58`; encounters `min(62vw,620px)` |
| `≤800px` | Safe minimum `14px x / 12px y`; topbar `54px`; menu rail `top 12%, left 6%, width min(430px,72vw)`; presentation canvas opacity `.5`, translateX `18%`; How To one column |
| `≤560px` | System status and hero caption hidden; menu rail `88vw`; menu logo `clamp(62px,18vw,92px)`; overlay actions one column; lobby players vertical; vehicle stage hidden; HUD bottomline vertical |
| `≥20:9` | Menu rail and hero caption use `8%` side offsets; lobby body/actions use `8%`; HUD top/bottom side offsets use `5vw` |

No target viewport may produce horizontal document scrolling. Interactive targets remain at least `44px` high unless explicitly classified as compact controls.

## 0.10 Mechanical acceptance checks

A non-visual agent must collect and report these checks for every affected screen:

```text
document.documentElement.scrollWidth <= window.innerWidth
all required text exists exactly once
all visible interactive elements have non-zero bounding rectangles
all four root-menu actions have equal computed width; all three multiplayer-menu actions have equal computed width
boot prompt is 360×76px at 1280×720
Settings/How To: main visible, overlay visible, presentation canvas count = 1
overlay close: overlay hidden, main visible, presentation canvas count = 1
tank drag: ready cursor/state on hero side, active during drag, ready after release
focus-visible rule exists and keyboard traversal reaches every action
prefers-reduced-motion reduces animations to approximately 1ms
no retired flavor string appears in generated scene content
```

Example browser-side measurement pattern:

```js
const rect = (selector) => {
  const r = document.querySelector(selector).getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
};

const buttons = [...document.querySelectorAll('#screen-main .ui-action')].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.id, width: r.width, height: r.height, top: r.top };
});

const audit = {
  viewport: [innerWidth, innerHeight],
  noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
  bootPrompt: document.querySelector('#boot-hint') ? rect('#boot-hint') : null,
  menuButtons: buttons,
  mainVisible: !document.querySelector('#screen-main')?.classList.contains('hidden'),
  canvasCount: document.querySelectorAll('#presentation-canvas').length,
};
```

Passing these checks establishes structural conformance. It does not establish subjective polish. A non-visual agent's handoff must say `Mechanical UI conformance: PASS` and `Multimodal visual review: PENDING` until a visual reviewer completes that step.

---

# 1. The visual thesis

Recoil Crew is an industrial arcade game about two people operating one battered machine. Its interface should resemble a purpose-built field console crossed with rally graphics and a screen-printed technical manual—not a software dashboard and not a pristine science-fiction cockpit.

The short visual brief is:

```text
Dark field hardware
+ warm safety amber
+ role-coded crew signals
+ condensed racing typography
+ hard, clipped construction
+ sparse tactical telemetry
+ asymmetric poster composition
```

The UI should feel:

- Fast, mechanical, blunt, and slightly improvised.
- Authored for one specific tank game.
- Legible during violent camera movement.
- Energetic through scale, slant, contrast, and timing rather than decoration.
- Rugged without becoming visually dirty or hard to read.
- Cooperative: Driver and Gunner are distinct, but always part of one shared chassis.

It should not feel:

- Sleek, luxurious, corporate, glassy, or app-like.
- Like a generic cyberpunk HUD.
- Like a collection of interchangeable cards.
- Like an AI-generated game mockup filled with plausible but fake systems.

---

# 2. Non-negotiable signatures

Every major screen should use at least three of these signatures. A screen that could be transplanted unchanged into an unrelated sci-fi product has failed.

## 2.1 Shared-chassis framing

Use language and composition that reinforces one vehicle and two duties:

- `DRIVER`, `GUNNER`, `SHARED CHASSIS`, `CREW LINK`, `FIELD UNIT`, `RC–07`.
- Driver and Gunner panels may oppose one another spatially.
- A vehicle silhouette, real model, connecting line, or shared center axis may visually join both roles.
- Role separation must never imply separate inventories, characters, or vehicles unless the game actually gains those systems.

## 2.2 Industrial cut geometry

- Corners are square or clipped, never softly rounded by default.
- Use the shared cut polygons from `src/client/ui/tokens.css`.
- One clipped corner or a pair of opposed cuts is enough. Avoid turning every edge into a complex polygon.
- Thin structural lines and one heavier colored edge make a panel feel assembled.
- Circular geometry is reserved for physical or targeting concepts: reticles, status lamps, wheels, radar-like marks.

## 2.3 Amber command hierarchy

Amber is the game's brand and action color. It identifies the thing the player should do, not every thing the player can see.

- One primary action per decision area may be a solid amber block.
- Amber may mark titles, active meters, safe-frame ticks, and important progression.
- Secondary controls stay dark, paper-white, or muted.
- If half the screen is amber, hierarchy has collapsed.

## 2.4 Condensed italic impact type

Large names, numbers, buttons, and role labels use the condensed italic display face. Body copy and utility labels use the regular body face.

- Display: Barlow Condensed, italic, weight 700–900.
- Body: Barlow, weight 400–700.
- Avoid introducing another display family for a single screen.
- Use italics to imply forward motion; do not italicize paragraphs.

## 2.5 Technical microcopy

Small labels use uppercase, wide tracking, and terse real information.

Good:

```text
CREW LINK // HOST
TIME UNTIL NEW WAVE
TARGETING // RECOIL // DESTRUCTION
ROOM CODE
GROUND CONTACT
```

Bad:

```text
Advanced Combat Intelligence
Neural Sync Optimized
Tactical Efficiency 94%
```

Do not invent telemetry to make a layout look occupied.

### Retired flavor copy

Do not reintroduce these removed lines on any screen, footer, mockup, or future variant:

```text
ONE TANK // TWO BRAINS // ZERO BRAKES
DRIVER STEERS. GUNNER SHOOTS.
WASD DRIVE // MOUSE AIM // RMB CANNON (under the title-screen entry prompt)
```

The logo and primary action should carry the title screen without these supporting slogans.

---

# 3. Canonical tokens

The source of truth is `src/client/ui/tokens.css`. Use variables rather than copying hex values. If a new recurring visual value is genuinely needed, add a named token first.

## 3.1 Color roles

| Token | Value | Required meaning |
|---|---:|---|
| `--ui-ink-0` | `#07090a` | Deep background and dark text on amber |
| `--ui-ink-1` | `#0d1113` | Primary surface background |
| `--ui-ink-2` | `#161c1f` | Raised dark surface |
| `--ui-ink-3` | `#222a2d` | Interactive secondary surface |
| `--ui-steel` | `#394347` | Structural neutral |
| `--ui-paper` | `#f1eee3` | Primary readable text; deliberately warmer than white |
| `--ui-muted` | `#929c9d` | Secondary text and passive telemetry |
| `--ui-amber` | `#ffad22` | Brand, primary action, progression, important timing |
| `--ui-amber-hot` | `#ffc04a` | Amber hover/peak state |
| `--ui-driver` | `#24d2d7` | Driver identity and Driver-owned state |
| `--ui-gunner` | `#ff5a2e` | Gunner identity and Gunner-owned state |
| `--ui-danger` | `#f14232` | Damage, blocked shots, urgent failure |
| `--ui-success` | `#79dc88` | Connected, ready, completed |

Rules:

- `--role` and `--role-soft` are contextual. Theme them at the app root.
- Driver cyan and Gunner orange-red are semantic ownership colors, not a two-color gradient recipe.
- Danger red must not be substituted for Gunner orange-red.
- Success green is a lamp/state color, not a large decorative fill.
- Use transparent paper-white for structure. Avoid bright blue borders on every panel.
- Gradients should communicate material, depth, health, or transition. Never use the fashionable cyan-purple product gradient.

## 3.2 Typography scale

Use the existing font imports in `src/client/main.ts`.

| Role | Typical treatment |
|---|---|
| Wordmark | Barlow Condensed 900 italic, `68–138px`, tight negative tracking |
| Scene title | Barlow Condensed 900 italic, `38–60px` |
| Primary action | Barlow Condensed 800 italic, `20–24px` |
| Role/player name | Barlow Condensed 800–850 italic, `18–25px` |
| Major HUD number | Barlow Condensed 900 italic, `25–32px`, tabular numerals when timed |
| Utility label | Barlow 700–800, `7–10px`, `0.11–0.20em` tracking, uppercase |
| Body/help copy | Barlow 400–700, `11–14px`, normal tracking, `1.4–1.55` line height |

Rules:

- Build hierarchy with meaningful jumps in size, not six nearly identical text sizes.
- Keep uppercase utility strings short. Long instructions use sentence case.
- Use tabular numerals for clocks, room codes where appropriate, HP, and changing counters.
- Text shadow is for legibility over the 3D world, not for general decoration.
- Never fake weight with multiple glow layers.

## 3.3 Spacing and density

Use a practical 4px base rhythm:

```text
4  8  12  16  24  32  48  64
```

- Inside compact controls: 8–12px.
- Standard panel padding: 14–24px.
- Modal/form panel padding: 28–38px.
- Between a label and its value: 4–8px.
- Between independent groups: 16–32px.
- Full-screen safe inset: `--ui-safe-x` and `--ui-safe-y`, currently 24px/20px minimum.
- Dense does not mean cramped. Every group needs a visible edge, gap, or typographic boundary.

## 3.4 Shape and line weights

- Use `--ui-cut-sm`, `--ui-cut-md`, and `--ui-cut-lg`.
- Standard structural border: 1px using `--ui-line`.
- Important/active edge: 2–4px in the semantic color.
- Meters may use a restrained `-12deg` skew.
- Wordmarks and major numbers may use approximately `-5deg` to `-6deg` visual slant.
- Default border radius is zero. A radius needs a physical reason.
- Do not mix clipped panels, pills, rounded cards, and glass panes on one screen.

## 3.5 Shadow, glow, and texture

- Panel shadow: broad, dark, and low-detail, e.g. `0 28px 70px rgba(0,0,0,.5)`.
- Glow is reserved for lamps, the reticle dot, pending progression, or a critical state.
- A role-colored border does not also need a large role-colored glow.
- Background texture may combine a faint 48px grid, restrained scanlines, vignette, and a directional gradient.
- Keep background texture below roughly 25% visual opacity.
- Never stack blur, glow, border, bevel, noise, and reflection on the same component.

## 3.6 Motion tokens

```text
--ui-fast:   110ms  hover/press/small response
--ui-normal: 180ms  screen/component transition
--ui-slow:   320ms  meaningful panel or state entrance
```

Reusable authored choreography uses a separate, exact timing contract:

```text
title split exit
  RECOIL -> right: 500ms, translateX +115vw
  CREW -> left: 500ms, translateX -115vw
  primary prompt -> bottom: 520ms, translateY +72vh, scale .96
  field-unit kicker -> up/zoom: 520ms, translateY -58vh, scale 1.75
  state handoff: animationend on the primary prompt; 600ms safety fallback

menu split entrance
  left-side roles: 520ms from translateX -72vw
  right-side roles: 540ms from translateX +72vw
  field backdrop: stationary; 220ms opacity .24 -> 1
  transparent tank canvas: 540ms from translateX +72vw
  instrument delays: unit 60ms, status 80ms, hero caption 40ms
  safe frame: stationary and continuously visible across boot -> menu
  choreography cleanup: 680ms

menu -> crew
  menu rail: 520ms to translateX -72vw
  transparent tank canvas + hero caption: 520ms to translateX +72vw
  field backdrop: stationary 320ms fade to opacity 0
  top-left unit mark: 520ms to translateY -42vh
  top-right SYSTEM STATUS: READY: stationary
  safe frame: stationary

crew -> multiplayer menu
  crew backdrop: stationary 320ms fade to opacity 0
  crew unit mark + room-code strip: 520ms to translateY -34vh
  top-right SYSTEM STATUS: READY: stationary
  Driver plate: 520ms to translateX -72vw
  Gunner plate: 520ms to translateX +72vw
  command line + chat: 520ms to translateY +42vh
  after dismissal, replay the standard menu split entrance on Multiplayer

multiplayer menu -> crew
  first run menu -> crew above, then reverse every crew direction for entrance
  crew backdrop: stationary; 220ms opacity .22 -> 1

menu-page swap
  outgoing command page: 520ms to translateX -72vw
  incoming command page: starts only after outgoing completion
  incoming direction: left-to-right, 520ms from translateX calc(-100% - 64px)
  opacity throughout both phases: exactly 1.0
  exit fallback: 560ms; entrance fallback: 560ms
  shared scene chrome and 3D presentation: no movement or rebuild

overlay summon
  open: 460ms from bottom, translateY +78vh
  close: 380ms to bottom, translateY +78vh
  scale throughout: exactly 1.0 (no size interpolation)
  panel opacity throughout: exactly 1.0 (no fade)
  overlay-root opacity throughout: exactly 1.0 (no scrim fade)

authored movement easing: cubic-bezier(.65, 0, .35, 1)
```

Reusable class contract:

```text
root trigger: ui-choreography--title-exit
child roles: ui-exit-to-right | ui-exit-to-left | ui-exit-to-bottom | ui-exit-zoom-up

root trigger: ui-choreography--split-enter
child roles: ui-enter-from-left | ui-enter-from-right | ui-enter-fade

overlay root: ui-overlay-screen + scene-enter/scene-exit lifecycle classes
overlay card: ui-overlay-panel

menu stack: ui-menu-stack
menu page: ui-menu-page
active swap states: is-leaving | is-entering
```

Do not permanently hide an animated scene at the start of its exit. The scene
runtime keeps it mounted for the declared exit duration, disables overlay
pointer input during dismissal, then adds `hidden`. Full-screen handoffs fire
only after the outgoing sentinel completes, and repeated input is ignored while
that handoff is pending. Under `prefers-reduced-motion`, JavaScript choreography
is skipped and CSS animation durations collapse to approximately 1ms.

Motion principles:

- Use short translations of 3–8px, opacity, fill, and color.
- Buttons move horizontally like a mechanical selection rail.
- Avoid soft floating cards and perpetual idle bobbing in functional UI.
- Repetition should be calm; ceremonial progression or boss events may be heavier.
- Every animation needs an authoritative state trigger and a cleanup path.
- Respect `prefers-reduced-motion` and future reduced-flash settings.

---

# 4. Composition rules

## 4.1 General full-screen composition

Use three layers:

1. Environment or 3D presentation layer.
2. Information/action composition.
3. Thin safe-frame/topbar/footer instrumentation.

Do not put the entire screen inside one centered card. Favor deliberate imbalance: a left command rail against a right-side vehicle, two role panels around a shared chassis, or a centered timer supported by corner telemetry.

The safe frame is a framing device, not a container. It must not intercept input.

## 4.2 Boot/title

- One dominant wordmark, optically centered from the combined silhouette of both staggered words.
- `RECOIL` in paper, `CREW` in amber, visibly staggered.
- The title-screen lockup is intentionally about 50% larger than the original rework version.
- Preserve the offset between the two words; do not align their left or right edges.
- Preserve a deliberate narrow gap between the `I` and `L` in every use of the logo.
- One amber entry prompt sized as a clear action: larger than its label, but subordinate to the wordmark.
- Shift the complete title/prompt composition slightly above geometric center so the enlarged prompt does not make the lockup feel bottom-heavy.
- No tagline, control legend, or footer slogan beneath the entry prompt.
- Background remains restrained enough that the wordmark is unmistakable.
- Do not add account prompts, news, version cards, or social links without a real requirement.

## 4.3 Main menu

- Left: wordmark, one-line premise, vertical action rail.
- Right: a restrained tank/world presentation with a small technical caption and enough negative space to read as a hero object.
- Primary action is solid amber; remaining actions are dark.
- Root page actions are Multiplayer, Single Player, Settings, and How To. Multiplayer replaces separate Create/Join root actions.
- The Multiplayer page uses Create Crew, Join Crew, and Go Back in the same rail format and dimensions as the root page.
- Use numbered actions within each page. Numbering restarts at `01` when a replacement page is summoned.
- Display `CURRENT NICKNAME` beneath the root-page rail at utility-heading scale, not as near-invisible flavor copy. It belongs to the root command page and exits with that page; do not repeat it on submenus.
- A menu is one persistent environment with replaceable `.ui-menu-page` command groups. Keep the wordmark, kicker, safe frame, topbar, grid, tank, and hero caption mounted during page swaps.
- Every menu-page swap sends the outgoing page completely offscreen to the left. Only after that exit finishes, reveal the replacement at `translateX(calc(-100% - 64px))`: one complete rail width plus the menu inset, so the rail begins outside the viewport but enters view immediately instead of spending time crossing invisible offscreen space. Move it right into place over the full 520ms tempo. Keep both pages at full opacity. Do not overlap the phases, cross-fade the screen, or reconstruct the presentation world.
- `LEAVE CREW` returns to the persistent menu scene with the Multiplayer command page selected, not the root command page.
- The top-right `SYSTEM STATUS: READY` label uses a slow breathing green lamp. Do not flash the text itself.
- The menu and crew lobby use the exact same top-right status geometry, type, label, and breathing lamp. It does not animate during menu/crew handoffs.
- The menu tank may rotate slowly on its own. Horizontal pointer drag over the hero side pauses that rotation and directly spins the chassis; normal motion resumes on release.
- The presentation canvas behind the menu tank must have an alpha-transparent clear. Never put the environment color on a canvas that translates: full-viewport background layers remain stationary and transition only through opacity.
- Preserve open negative space around the tank. Do not fill it with feature tiles.

## 4.4 Menu overlays

- Settings, How To Play, and Join Crew are overlays over the live main menu, never replacement backgrounds that imitate it.
- Preserve the exact menu DOM and presentation world beneath the dimmed scrim; do not rebuild the tank when the overlay closes.
- Use the shared field-console shell: dark cut plate, left amber construction edge, one lower amber terminal, kicker, large display heading, rule, content modules, and action row.
- Overlay summon/dismissal is translation-only. The card and scrim remain fully opaque and the card remains exactly the same size throughout both directions.
- Scrim blur is permitted here only to protect legibility over the moving tank. Keep the original menu clearly recognizable.
- Interior modules may vary: Settings uses one large hardware input; How To uses paired Driver/Gunner role plates; Join Crew uses the room-code field and a two-action row.
- Avoid modal-card conventions such as rounded corners, floating close circles, glassmorphism, and centered app-style icon headings.

## 4.5 Forms and room-code screens

- One centered panel, normally no wider than 540px.
- Left amber construction edge and one small lower accent.
- Clear title, short explanation, code/input, status, primary action, back action.
- Inputs are large, clipped, high-contrast hardware fields—not rounded web form controls.
- Validation errors occupy reserved space to avoid layout jumps.

## 4.6 Crew lobby

- Driver panel left, Gunner panel right, shared chassis/connection axis in the center.
- The two role panels share structure but use their own semantic edge color.
- The room code and Copy action occupy one narrow top strip. Do not repeat run type, crew format, or channel metadata there.
- Connected players always own exactly one role. Never expose an unseated/null role action.
- A lone player may atomically switch to the open role. With two players, the occupied role exposes `REQUEST ROLE SWAP`; only the requested player sees Accept/Decline.
- Accepting a swap exchanges both authoritative seats in one server transaction and clears both Ready states. Declining preserves both roles. Directly selecting an occupied role is invalid.
- Current-role controls read `YOUR ROLE`. Pending requests read `SWAP REQUESTED`; do not present two independent Driver/Gunner toggles.
- Player name and readiness are more prominent than flavor description.
- The solid `#090c0d` chat module is labeled exactly `CHAT`; both its minimized tab and expanded panel remain fully solid, and it may expand on focus/hover.
- The ready action belongs to the bottom command line and may be amber only when actionable.
- Empty seats must look intentionally open, not like loading skeletons.

## 4.7 Countdown

- One enormous changing number.
- One short state line.
- All other information recedes.
- Scale impact is acceptable here; elaborate particle clutter is not.

## 4.8 Results and progression

- Present outcome before detail.
- Use one dominant grade, reward, relic, or selection focus.
- Statistics should be real, few, and ranked by relevance.
- Rarity changes color, timing, border treatment, and audio in a coordinated way; it must not merely add more glow.
- Victory and defeat require distinct emotional compositions before shared result details.

---

# 5. Gameplay HUD contract

Combat visibility has priority over decorative fidelity.

## 5.1 Screen zones

```text
Top left:    role and connection
Top center:  wave/phase/monster level
Top right:   run time, score, combo, pause
Upper center: elite/boss encounter bars
Center:      world and ballistic reticle only
Bottom left: chassis integrity and progression
Bottom right: role-owned abilities and weapon states
```

Do not create a full-width top navigation bar or a bottom MMORPG action bar.

## 5.2 Priority order

During ordinary combat:

1. Ballistic reticle and immediate warnings.
2. Chassis integrity.
3. Wave/boss state.
4. Weapon or movement readiness.
5. Progression.
6. Score and connection detail.

Conditional information should disappear when irrelevant. The HUD must not reserve giant empty cards for absent bosses or elites.

## 5.3 Role variants

- Driver theme: `--ui-driver`; emphasize speed, ground contact, and dash.
- Gunner theme: `--ui-gunner`; emphasize cannon, charge, aim state, and connection to the Driver.
- Single Player theme: amber; show both Driver and Gunner actions without pretending a peer exists.
- Keep structure consistent between modes so learned eye movement transfers.
- Multiplayer Gunner and Single Player aiming must receive equal visual treatment and truthful ballistic feedback.

## 5.4 Reticle rules

- The reticle represents the predicted shell path/impact, not the center of the camera.
- Its screen position must use actual viewport CSS pixels.
- Keep the reticle as a viewport-level HUD child. Never nest it inside a translated/scaled prompt group.
- Gravity, muzzle geometry, terrain, and near-cover obstruction must be reflected.
- Normal terrain impact is an intended target and should not appear blocked.
- Actual near-cover obstruction may switch the reticle to danger red.
- Reticle scale stays compact; do not cover the target with a large decorated scope.
- Charge may use the narrow adjacent vertical meter already established.

## 5.5 Meters and alerts

- Integrity uses amber normally and danger red when low.
- XP uses the current role color; a pending choice may switch to amber-hot.
- Elite bars use danger-to-amber; boss bars use amber-to-Gunner orange-red.
- Flashing must be slow enough to read and disabled/reduced under accessibility preferences.
- Use words only when shape/color alone cannot safely communicate the state.

## 5.6 World clearance

- Keep the middle 50% of the viewport visually light.
- Encounter bars should not obscure enemies or the reticle.
- Bottom clusters should hug safe edges and remain readable over both dark and bright terrain.
- Text over the world may use one hard shadow for legibility.
- Never add a large opaque center panel during active control unless gameplay is intentionally paused.

---

# 6. Component grammar

## 6.1 Primary action (`.ui-action` hero/action)

- Solid amber, ink text, 58px minimum height.
- Condensed italic label, left aligned.
- Mechanical `//` lead and chevron tail are allowed.
- One per decision group.
- Hover becomes amber-hot; press shifts by approximately 4px/1px.

## 6.2 Secondary action (`.ui-action` neutral)

- Dark raised surface with paper/muted label.
- Same basic geometry as the primary action so the family is obvious.
- Hover uses a small horizontal shift, not a scale bounce.

## 6.3 Compact action (`.ui-compact-action`)

- For copy, seat choice, send, chips, or small local actions.
- 32px minimum height, one border, clipped corner.
- Selected state uses the owning role color.
- Do not turn these into rounded pills.

## 6.4 Text action (`.ui-text-action`)

- For back, leave, and low-priority inline operations outside the main command rail.
- Transparent background with muted text.
- Must still have a clear focus-visible state and adequate hit area.

## 6.5 Panels

- Matte near-black, generally 82–94% opacity.
- One semantic heavy edge plus faint structure is preferred to a full bright border.
- Use clipped geometry from tokens.
- Avoid backdrop blur unless a measured world-legibility problem requires it.
- Avoid identical panel treatment for primary, secondary, and passive content.

## 6.6 Status lamps

- 7–11px square or circular marks.
- Green = ready/connected, red = failed/disconnected, amber = pending.
- A restrained glow is allowed because a lamp is a luminous object.
- Pair critical status with text; never rely on color alone.
- A ready lamp may breathe slowly by fading opacity and glow over roughly 2.5–3 seconds. Avoid fast blinking.

---

# 7. Responsive behavior

The existing breakpoints are 1100px, 800px, and 560px, plus an ultrawide rule at 20:9. Extend these rather than adding arbitrary per-screen breakpoints.

## Desktop (above 1100px)

- Preserve asymmetric widescreen compositions.
- Menu rail occupies about 40% maximum width.
- HUD encounter bars remain below roughly 650px.
- Bottom survival cluster stays around 340–360px.

## Compact landscape/tablet (800–1100px)

- Increase menu rail share while dimming or shifting the hero model.
- Reduce role-card width and center-stage prominence.
- Hide low-priority score detail before shrinking critical text.
- Keep the reticle and core HUD scale stable.

## Narrow/mobile (560–800px and below)

- Stack role cards and bottom HUD clusters.
- Remove decorative captions and nonessential system labels.
- Expand primary controls to the available width.
- Do not shrink utility text below readable limits to preserve a desktop layout.
- This is graceful support, not permission to redesign the game as a portrait mobile app.

## Ultrawide

- Pull primary content inward to roughly 5–8vw safe rails.
- Do not anchor essential HUD information at the extreme monitor edges.
- Keep center combat clear and avoid stretching panels merely to fill width.

Every visual change must be checked at minimum at 1280×720 and 1920×1080. Major layout work also requires 2560×1440 and an ultrawide viewport.

---

# 8. Accessibility and input

- Preserve semantic buttons, inputs, headings, regions, and live status text.
- Every interactive element needs a visible keyboard focus outline.
- Minimum practical pointer target: 32px compact, 44–48px primary.
- Maintain readable contrast over moving 3D backgrounds.
- Pair role/danger/success colors with labels or shapes.
- Honor `prefers-reduced-motion` by reducing animation duration to near-zero.
- Provide clip-path fallbacks and forced-colors behavior as established in `accessibility.css`.
- Do not let overlays silently steal pointer lock, keyboard focus, or gameplay input.
- Prompt text must reflect the current input state (`CLICK TO AIM`, control hint, pause ownership).

---

# 9. Anti-generic and anti-AI rules

Reject a design if it contains several of these signals:

- A centered glass card with a gradient border and large empty margins.
- Rows of rounded dashboard cards with an icon, number, and tiny caption.
- Cyan-purple gradients or blue glow applied without semantic meaning.
- Pill-shaped navigation or filters used as the default control language.
- Excessive blur, bloom, glass reflection, floating particles, or neon outlines.
- Perfectly symmetrical layouts where the gameplay relationship calls for tension or direction.
- Huge generic headings followed by filler copy.
- Fake currencies, ranks, missions, percentages, shops, news, profiles, or statistics.
- Random military jargon unrelated to current state.
- Different icon styles mixed on one screen.
- Every panel having the same prominence.
- Decoration covering central combat or competing with the reticle.
- A style that would still work if `RECOIL CREW` were replaced by any game logo.

Correction strategy:

1. Remove invented content.
2. Re-rank the real information.
3. Reduce the number of surfaces and effects.
4. Reintroduce role ownership and shared-chassis composition.
5. Use typography and hard geometry for energy.
6. Add only one game-specific motif where the composition still needs identity.

Do not fix a generic screen by adding more scratches, caution stripes, or pseudo-technical labels.

---

# 10. Implementation architecture

Future agents must preserve the content-driven presentation architecture.

```text
content/scenes/*.json or content/hud/gameplay.json
        ↓ generation
src/generated/presentationContent.generated.ts
        ↓ runtime
SceneRuntime / HudRuntime / LobbyView
        ↓ semantic classes
src/client/ui/*.css
```

Rules:

- Put reusable visual values in `tokens.css`.
- Put page-wide framing/type behavior in `foundations.css`.
- Put reusable controls and panels in `components.css`.
- Put scene composition in `scenes.css`.
- Put lobby-only composition in `lobby.css`.
- Put gameplay overlay styling in `hud.css`.
- Put breakpoints in `responsive.css`.
- Put reduced-motion, forced-color, and feature fallbacks in `accessibility.css`.
- Keep `ui/index.css` as the ordered entry point.
- Prefer semantic classes in content JSON over inline styles.
- Add component schema/runtime support when a repeated behavior is real; do not emulate behavior with fragile selectors.
- Do not hand-edit generated presentation files.
- `src/client/styles.css` contains legacy rules. New rework styling belongs under `src/client/ui`; migrate or neutralize conflicting legacy selectors deliberately rather than piling on specificity.
- Preserve actual gameplay state ownership. CSS and presentation code never invent authoritative outcomes.

---

# 11. Required agent workflow

## Before editing

1. Confirm the correct branch and worktree.
2. Read this file, the workflow document, and the relevant section of the visual rework document.
3. Inspect the current scene/HUD content, component runtime, and applicable CSS modules.
4. Run the game and capture the current state at the target viewport.
5. Inspect relevant references, but list which principles—not elements—you intend to borrow.
6. State the screen's real primary, persistent, and conditional information.
7. Declare non-goals so reference-only features do not leak into scope.

## While implementing

1. Reuse tokens and component grammar.
2. Keep content structure semantic and data-driven.
3. Implement the smallest complete visual slice.
4. Maintain role, pointer-lock, focus, multiplayer, and responsive behavior.
5. Check for legacy CSS collisions.
6. Test intermediate work in the real game, not only a static mockup.

## After implementing

Run:

```bash
npm run generate:presentation-content
npx tsc --noEmit
npm run test:presentation
npm run build
```

Run broader tests when shared runtime or gameplay-facing HUD contracts changed. If asset-import tests require a user-local ZIP unavailable in the worktree, report the exact environmental exception; do not weaken or delete the tests.

Then:

1. Capture 1280×720 and 1920×1080 screenshots. A non-visual agent also records the section 0.10 DOM/computed-style audit for both viewports.
2. Exercise default, hover, focus, disabled, loading, error, and role variants that exist for the changed components.
3. Check at least Driver, Gunner, and Single Player for HUD work.
4. Check low integrity, elite/boss, upgrade, reconnect, or other relevant conditional states.
5. Perform the anti-generic review from section 9. A non-visual agent checks the enumerated structural red flags and marks subjective visual review pending.
6. Compare against the intended hierarchy, not pixel-match a reference blindly.
7. Update the handoff document with changes, tests, screenshots, numeric audit results, modality limitations, and remaining mismatches.

---

# 12. Review rubric

Score every major screen from 1–5:

| Category | Passing definition |
|---|---|
| Hierarchy | The next action and critical state are obvious within two seconds |
| Readability | Core information survives motion and varied world brightness |
| Recoil Crew identity | At least three non-negotiable signatures are clear |
| Restraint | Effects and surfaces support meaning rather than fill space |
| Composition | Negative space and asymmetry feel intentional |
| Consistency | Tokens, type, cuts, and controls belong to one system |
| Interaction | Hover, focus, press, disabled, waiting, and error states are coherent |
| Responsiveness | Priority survives at required viewports |
| Accessibility | Focus, contrast, motion, and fallback behavior are preserved |
| Performance | UI avoids unnecessary layout churn and expensive full-screen effects |

Approval requires:

```text
No category below 4/5
No generic-AI red flag left unresolved
No functional or input regression
No invented feature or fake data
```

---

# 13. Fast acceptance checklist

```text
[ ] The screen has one unmistakable primary focus.
[ ] Amber is used for command/brand priority, not everywhere.
[ ] Driver/Gunner colors communicate real ownership.
[ ] Paper, muted, danger, and success colors keep their meanings.
[ ] Typography uses Barlow Condensed for impact and Barlow for utility/body.
[ ] Default controls are clipped/hard-edged, not rounded pills.
[ ] Panel hierarchy is varied and intentional.
[ ] All displayed systems and values are real.
[ ] The center combat area remains clear where applicable.
[ ] Reticle placement is viewport- and ballistics-correct.
[ ] Focus-visible, reduced-motion, and forced-color behavior remain valid.
[ ] 1280×720 and 1920×1080 have been visually inspected, or a non-visual agent has completed the numeric audit and explicitly marked multimodal review pending.
[ ] Content was regenerated; TypeScript, presentation tests, and build pass.
[ ] The screen does not resemble a generic AI-generated app or game UI.
```

When uncertain, remove a decorative layer, strengthen the real information hierarchy, and make the shared tank/crew relationship more visible.
