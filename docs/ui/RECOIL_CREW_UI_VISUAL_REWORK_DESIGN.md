# Recoil Crew — UI Visual Rework Design

## Status

```text
Status: Binding design direction
Scope: Non-gameplay scenes, overlays, progression reveals, gameplay HUD
Technology: HTML DOM + CSS + TypeScript over Three.js
```

This document converts the current functional interface into a coherent, professional game UI while preserving the existing content-driven scene and HUD architecture.

---

# 1. Goals

The rework must:

- Give menus, HUD, overlays, and results one visual identity.
- Keep combat information readable during fast movement and dense enemy encounters.
- Separate base scenes, gameplay HUD, modal overlays, and cinematic effects.
- Make level-up and relic acquisition feel valuable and exciting.
- Support Driver, Gunner, Single Player, multiplayer, elites, bosses, victory, defeat, and reconnect states.
- Remain responsive across common browser resolutions.
- Support keyboard focus, reduced motion, and reduced flash.
- Avoid replacing the current interface with React, Vue, Canvas-only UI, or a new game UI framework.

Core direction:

```text
Preserve the DOM/content architecture
+ create a real design system
+ centralize flow and overlays
+ add cinematic timeline animation
```

---

# 2. Complete UI Scope

## 2.1 Application scenes

Required full-screen scenes:

- Boot/title
- Main menu
- Settings
- Create room
- Join room
- Lobby
- How to play
- Loading/preloading
- Match countdown
- Victory
- Defeat
- Results/rematch
- Reconnecting
- Connection error
- Asset-loading error

Victory and defeat must be distinct presentations before detailed results.

Lower-priority later additions:

- Credits
- Licenses
- First-launch onboarding

## 2.2 Modal overlays

Required overlays:

- Pause
- In-game settings
- Confirm return to menu
- Confirm abandon run
- Reconnecting
- Level-up selection
- Relic chest/reveal
- Wave announcement
- Elite encounter announcement
- Boss intro
- Temporary tutorial prompt
- Input rebinding capture

## 2.3 Gameplay HUD

The HUD must support:

- Multiplayer Driver
- Multiplayer Gunner
- Single Player combined controls
- Progression
- Wave timing
- Elite encounters
- Boss encounters
- Temporary warnings
- Connection recovery

## 2.4 World-space UI

Separate from the fixed HUD:

- Future fodder health bars
- Future elite model health bars
- Damage numbers
- XP values
- Chest markers
- Objective markers
- Offscreen threat indicators
- Partner marker where useful

Ordinary/fodder overhead health bars are not part of this rework phase.

## 2.5 Shared UI infrastructure

The rework also includes:

- Design tokens
- Typography hierarchy
- Shared components
- Layout primitives
- Transition coordinator
- Overlay stack
- Focus and input ownership
- Responsive scaling
- Safe-area support
- Reduced-motion mode
- Reduced-flash mode
- UI audio vocabulary
- Animation cleanup
- Screenshot regression tests

---

# 3. External UI Pack or Custom CSS

## 3.1 Decision

Use:

```text
Custom CSS component/layout system
+ selected external visual assets
+ a timeline animation library
```

Do not adopt a complete premade UI unchanged.

Do not continue adding isolated one-off CSS for every screen.

## 3.2 Why CSS remains the base

DOM and CSS are already appropriate for:

- Responsive layouts
- Text and forms
- Focus states
- Browser deployment
- Dynamic multiplayer data
- Fast iteration
- Accessibility

A framework migration would consume time without guaranteeing better visuals.

## 3.3 Suitable external assets

External packs may supply:

- Icons
- Input glyphs
- Decorative corners
- Dividers
- Cursors
- Rarity borders
- Upgrade/relic icons
- UI sounds
- Particle sprites
- Light streaks and noise textures

Treat these as ingredients. Recoil Crew still owns layout, type, color, animation, and interaction.

## 3.4 Avoiding the asset-pack look

Avoid:

- Fixed-resolution full-screen raster frames
- Multiple unrelated icon styles
- More than two primary font families
- Decoration around every control
- Poorly scalable nine-slice panels
- Generic sci-fi styling unrelated to the game

---

# 4. Design System

Recommended structure:

```text
src/client/ui/
├── tokens.css
├── reset.css
├── typography.css
├── components.css
├── layouts.css
├── hud.css
├── overlays.css
├── effects.css
├── responsive.css
└── accessibility.css
```

The existing stylesheet may import these files during migration.

## 4.1 Visual identity

Recommended direction:

```text
Industrial arcade military
+ bright Driver/Gunner accents
+ casino-energy progression
+ clean survival HUD
+ rugged post-apocalyptic hardware
```

Keywords:

- Mechanical
- Fast
- Cooperative
- High contrast
- Exaggerated but readable
- Arcade rather than simulation-heavy
- Energetic rather than grim

### 4.1.1 Authored visual identity

The interface must look deliberately art-directed for Recoil Crew, not like a generic AI-generated app or game mockup. Every prominent visual decision should have a reason tied to the game's cooperative tank combat, role split, industrial machinery, recoil, survival pressure, or progression spectacle.

Avoid common synthetic-looking patterns:

- Generic glassmorphism, floating translucent cards, and excessive backdrop blur
- Default cyan-purple neon gradients or rainbow glow without a gameplay meaning
- Rounded pill controls and uniformly rounded dashboard cards
- A grid of interchangeable panels with identical visual weight
- Decorative micro-labels, fake telemetry, invented currencies, or meaningless technical text
- Excessive borders, glows, particles, bevels, and shadows applied to every element
- Perfectly centered or mechanically symmetrical layouts when purposeful asymmetry would better support hierarchy
- Stock icon mixtures, inconsistent illustration styles, or imagery that does not belong to the game world
- Oversized headings and empty cinematic space that reduce usable information without improving drama
- Visual complexity that hides weak information hierarchy

Prefer:

- A small, disciplined set of angular shapes derived from armor plates, road markings, targeting equipment, and vehicle instrumentation
- Repeated proportions, cuts, line weights, and corner treatments that form a recognizable Recoil Crew signature
- Purposeful asymmetry and composition built around the current screen's primary action
- Restrained materials and effects, with intensity reserved for warnings, encounters, rarity, and major outcomes
- Real game terminology, real state, and real player actions only
- Hand-tuned spacing and typography per component role rather than one universal card recipe
- A few memorable motifs used consistently instead of many unrelated decorative ideas

Polish must come from hierarchy, proportion, typography, responsiveness, and interaction quality—not from piling effects onto generic layouts.

## 4.2 Core color roles

```css
:root {
  --ui-bg-0: #07090d;
  --ui-bg-1: #0d1218;
  --ui-panel: rgba(11, 16, 22, 0.92);
  --ui-panel-soft: rgba(15, 22, 29, 0.80);

  --ui-cyan: #3de6ff;
  --ui-orange: #ff9d36;
  --ui-gold: #ffd64a;
  --ui-red: #ff4d59;
  --ui-green: #53e58a;
  --ui-purple: #bd67ff;

  --ui-text: #f1f5f8;
  --ui-text-dim: #91a0ad;
  --ui-line: rgba(255, 255, 255, 0.14);
}
```

## 4.3 Spacing and timing

```css
:root {
  --ui-space-1: 4px;
  --ui-space-2: 8px;
  --ui-space-3: 12px;
  --ui-space-4: 16px;
  --ui-space-5: 24px;
  --ui-space-6: 32px;
  --ui-space-7: 48px;

  --ui-duration-instant: 70ms;
  --ui-duration-fast: 110ms;
  --ui-duration-normal: 180ms;
  --ui-duration-slow: 320ms;
  --ui-duration-dramatic: 700ms;
}
```

## 4.4 Typography

Define five roles:

```text
Display — title, boss reveal, victory
Heading — screen and section title
Label — HUD labels, rarity, actions
Body — descriptions and help
Numeric — timers, HP, XP, speed, damage
```

Rules:

- Maximum two main font families.
- Use tabular numerals for timers and counters.
- Uppercase is reserved for short impact labels.
- Body text must avoid excessive tracking.
- Define Korean/English fallback fonts.

## 4.5 Shared components

Required reusable components:

```text
UiButton
UiIconButton
UiPanel
UiModal
UiCard
UiBadge
UiProgressBar
UiEncounterBar
UiTabs
UiToggle
UiSlider
UiTextInput
UiKeyGlyph
UiTooltip
UiToast
UiConfirmDialog
UiCountdown
UiSpinner
UiRarityFrame
```

Each component needs:

- Default
- Hover
- Active
- Focus-visible
- Disabled
- Loading
- Error where relevant

No major screen should depend on inline `style.cssText` strings after migration.

---

# 5. Central Flow, Overlay, and Transition Architecture

## 5.1 Ownership

```text
AppFlowController
├── owns application state
├── validates transitions
├── coordinates network/loading/input
└── commands presentation

SceneFlowPresenter
├── renders base scenes
├── caches scene runtimes
└── delegates animation

OverlayDirector
├── owns modal stack
├── resolves priority
├── traps focus
└── coordinates pause/input

TransitionDirector
├── owns transition timelines
├── owns cinematic effect layer
├── handles cancellation
└── provides reduced-motion fallback
```

## 5.2 Application states

```ts
type AppFlowState =
  | 'boot'
  | 'mainMenu'
  | 'settings'
  | 'createRoom'
  | 'joinRoom'
  | 'lobby'
  | 'loading'
  | 'countdown'
  | 'gameplay'
  | 'victory'
  | 'defeat'
  | 'results'
  | 'reconnecting'
  | 'error';
```

The controller validates allowed transitions and reports invalid transitions in development.

## 5.3 Layer model

```text
Layer 0 — Three.js world
Layer 1 — Base scene
Layer 2 — Gameplay HUD
Layer 3 — Modal overlay stack
Layer 4 — Cinematic effects
Layer 5 — Debug
```

## 5.4 Overlay priority

```text
Critical connection/error
> confirmation dialog
> progression/relic selection
> pause
> informational toast
```

The overlay director owns pointer events, keyboard focus, Escape behavior, pointer lock, pause state, and screen-reader visibility.

## 5.5 Transition types

```ts
type UiTransitionType =
  | 'fade'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'zoom'
  | 'radialWipe'
  | 'glitch'
  | 'hardCut';
```

Transition lifecycle:

```text
request
→ validate
→ block duplicate input
→ exit old scene
→ swap state at midpoint
→ enter new scene
→ restore permitted input
→ complete
```

Must support interruption, disconnect, repeated clicks, back navigation, reduced motion, and rematch cleanup.

## 5.6 Animation technology

Use CSS for:

- Hover
- Focus
- Small panel entrances
- Button presses
- Progress bars
- Subtle loops

Use GSAP Timeline for:

- Scene choreography
- Level-up roulette
- Relic opening
- Boss intro
- Victory sequence
- Coordinated audio and hit-stop

---

# 6. Reward Reveal Director

Create one reusable presentation system:

```text
RewardRevealDirector
```

It owns:

- Level-up offer presentation
- Relic reveal
- Rarity effects
- Skip logic
- Sequence deduplication
- Reduced motion/flash
- Cancellation
- Audio cues
- Cleanup

The authoritative result is chosen before presentation begins.

```text
simulation/server chooses
→ client receives result
→ reveal director presents it
```

State machine:

```ts
type RewardRevealState =
  | 'hidden'
  | 'intro'
  | 'spinning'
  | 'decelerating'
  | 'revealing'
  | 'selectable'
  | 'confirmed'
  | 'exiting';
```

Repeated snapshots must not restart a reveal.

---

# 7. Level-Up Roulette

## 7.1 Experience target

The sequence should feel:

- Fast
- Loud
- Valuable
- Casino-like
- Readable
- Deterministic underneath the spectacle

## 7.2 Sequence

### Intro impact — 0.10–0.18 s

- Brief progression freeze
- Dark vignette
- Radial pulse
- Large `LEVEL UP`
- Bass hit
- Small shake
- Background audio duck

### Rapid reel — 0.55–0.85 s

- Icons/categories cycle rapidly
- Rarity spectrum flashes
- Tick pitch rises
- Cards appear as blurred reels
- Light streaks frame the action

### Deceleration — 0.40–0.65 s

- Reel slows visibly
- Cards lock one by one
- Micro hit-stop on each lock
- Heavier lock sounds
- Final content becomes readable

### Rarity reveal

Each card reveals:

- Rarity color/frame
- Icon
- Upgrade name
- Short effect summary
- Rolled value
- Optional before/after value

Rarity language:

```text
Common — clean metal impact
Rare — blue energy sweep
Epic — purple pulse and particle ring
Legendary — gold flash, longer hit-stop, large stinger
```

### Choice

- Hover tilt
- Cursor light
- Selected card enlarges
- Other cards dim
- Confirmation impact
- Unselected cards fly/dissolve outward

### Multiplayer waiting

After local selection:

```text
DRIVER LOCKED IN
GUNNER CHOOSING…
```

The selected card remains visible but inactive.

## 7.3 Card information

Show:

- Name
- Icon
- Rarity
- Category
- Primary effect
- Rolled value
- Stack/resulting value where useful
- Role relevance where applicable

Never show raw internal stat IDs to players.

---

# 8. Relic Chest Reveal

## 8.1 Sequence

```text
Chest enters
→ lands
→ shakes
→ locks break
→ light leaks through seams
→ rarity colors cycle
→ deceleration
→ audio dropout
→ chest bursts open
→ relic silhouette rises
→ name/rarity impact
→ description appears
→ particles settle
```

## 8.2 Rarity treatment

```text
Common — short neutral reveal
Rare — blue rays and stronger hit
Epic — purple volumetric glow and spiral particles
Legendary — gold/prismatic beam, white-flash alternative, audio dropout, bass impact
```

Reduced-flash mode replaces bright flashes with strong fades and outline bursts.

## 8.3 Duplicate conversion

```text
normal relic reveal
→ DUPLICATE stamp
→ relic fractures/dissolves
→ particles convert to XP
→ replacement XP counts upward
```

## 8.4 Skip and cleanup

- Skip becomes available after a minimum anticipation window.
- Reduced-motion mode uses fade/scale only.
- E2E mode may accelerate timelines.
- Disconnect safely cancels interaction while preserving the authoritative result.
- Rematch removes all reveal state and DOM artifacts.

---

# 9. Gameplay HUD Information

## 9.1 Priority

The HUD prioritizes:

```text
survival
progression
encounter state
role-specific action state
```

Score and technical data are secondary.

## 9.2 Shared always visible

- `TIME UNTIL NEW WAVE`
- Current monster level
- Tank integrity
- Team level
- Team XP
- Active elite/boss health
- Current wave or phase warning

## 9.3 Shared conditional

- Partner disconnected/reconnecting
- Low integrity
- Wave incoming
- Elite incoming
- Boss incoming
- Upgrade available
- Relic acquired
- Chest prompt
- Damage direction
- Temporary relic/upgrade activation
- Connection-quality warning

## 9.4 Driver HUD

Primary:

- Integrity
- Dash readiness/cooldown
- Jump state
- Extra jumps
- Air dash charges
- Collision/danger warning
- Boss/objective direction

Secondary:

- Speed
- Grounded/airborne state
- Drift
- Air-control status

## 9.5 Gunner HUD

Primary:

- Reticle
- Predicted impact
- Blocked-shot feedback
- Cannon cooldown
- Cannon charge
- Machine-gun state
- Hit confirmation
- Elite/boss health

Secondary:

- Range
- Recoil contribution
- Current weapon modifier
- Target debuff/vulnerability

## 9.6 Single Player HUD

```text
Top center — wave and monster state
Below top — elite/boss encounter
Bottom left — integrity and progression
Center — reticle and aim feedback
Bottom right — movement and weapon abilities
```

Do not show two full role HUDs simultaneously.

## 9.7 Information to demote

- Score and combo remain smaller than integrity, XP, wave timer, and boss HP.
- Ping appears only on degradation, debug, or user-enabled network stats.
- FPS is debug only.
- Role label is compact.

---

# 10. Encounter Health Bars

## Elite

- Large screen-space bar
- Elite name
- Current/max HP
- Default one bar
- Data-driven two-elite mode uses two stacked bars

## Boss

- One primary large bar
- Ceremonial name treatment
- Strong entrance and defeat animation
- Must not cover the reticle or core combat area

## Ordinary monsters

No ordinary overhead health bars in this phase.

---

# 11. Responsive and Accessibility Requirements

Target viewports:

- 1280×720
- 1920×1080
- 2560×1440
- Common ultrawide layouts

Use:

- `clamp()`
- Max-width constraints
- Viewport-relative spacing
- Safe-area insets
- Readable minimum sizes

Accessibility:

- Keyboard navigation
- Visible focus
- Reduced motion
- Reduced flash
- Color plus shape/state
- Strong text contrast
- UI sound volume control
- No information conveyed only through glow

---

# 12. Testing

## Functional

- Valid scene transitions
- Overlay priority
- Focus trap
- Escape/back behavior
- Pointer-lock restore
- Disconnect interruption
- Rematch cleanup
- Reward/relic sequence deduplication

## Screenshot states

- Main menu
- Lobby
- Pause
- Driver HUD
- Gunner HUD
- Single Player HUD
- Common and legendary level-up
- Common and legendary relic
- Elite
- Two elites
- Boss
- Victory
- Defeat
- Error/reconnect

Capture at 1280×720, 1920×1080, 2560×1440, and ultrawide where relevant.

## Performance

Measure:

- Layout thrashing
- Active DOM nodes
- Animation frame cost
- Filter/backdrop-filter cost
- Particle count
- Repeated reveal cleanup
- Rematch memory stability

---

# 13. Implementation Order

```text
Phase 1 — Tokens, typography, components, accessibility
Phase 2 — AppFlowController, OverlayDirector, TransitionDirector
Phase 3 — Main menu → lobby → loading → countdown → HUD vertical slice
Phase 4 — Level-up and relic reveal director
Phase 5 — Pause, settings, victory, defeat, results, errors
Phase 6 — Responsive, audio, performance, screenshot polish
```

---

# 14. Acceptance Criteria

```text
[ ] Current content-driven scenes preserved
[ ] Current content-driven HUD preserved
[ ] UI has a recognizable Recoil Crew identity and avoids generic AI-generated app/game styling
[ ] No mock-only features, fake telemetry, or decorative filler were introduced
[ ] Design tokens and shared components exist
[ ] Major inline style strings removed
[ ] One authoritative application-flow controller
[ ] One authoritative overlay director
[ ] One authoritative transition director
[ ] Pointer lock and focus restore correctly
[ ] Level-up roulette is cinematic and deterministic
[ ] Relic reveal is cinematic and deterministic
[ ] Skip/reduced-motion/reduced-flash supported
[ ] HUD prioritizes wave, survival, progression, encounter state
[ ] Driver and Gunner HUDs are distinct
[ ] Single Player HUD is combined
[ ] One- and two-elite bars work
[ ] Boss bar works
[ ] Ordinary overhead health bars remain deferred
[ ] Victory and defeat are visually distinct
[ ] Responsive screenshots pass
[ ] Rematch cleanup passes
[ ] UI performance remains stable
```
