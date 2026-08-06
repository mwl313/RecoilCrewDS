# Recoil Crew — UI Design and Implementation Workflow

## Status

```text
Status: Recommended production workflow
Execution environment: Codex Desktop or Codex CLI
Primary design, implementation, and review model: GPT-5.6 Sol
Optional plan-only handoff target: DeepSeek Flash v4, only when explicitly requested by the user
Visual tools: image generation, Figma, Canva, browser screenshots
```

This document defines how to create, implement, inspect, and refine the professional Recoil Crew interface.

Binding visual-format rules live in `docs/ui/UI_DESIGN_SYSTEM.md`. Every agent changing UI must read that document before editing and use it as the visual acceptance contract.

Core principle:

```text
Use GPT-5.6 Sol for visual judgment and implementation by default.
Prepare a plan-only handoff for DeepSeek only when the user explicitly requests it.
```

---

# 1. Model Responsibilities

## GPT-5.6 Sol

Use Sol for:

- Interpreting mockups and screenshots
- Choosing visual direction
- Defining tokens and component language
- HUD hierarchy
- Animation choreography
- Screenshot comparison
- Detecting alignment, hierarchy, contrast, and visual-noise problems
- Final cross-resolution visual approval
- High-impact frontend architecture decisions
- Implementing approved UI phases
- Running builds, tests, browser checks, and screenshot qualification
- Applying visual-review corrections and mechanical refactors

Sol owns the complete design-to-implementation loop unless the user explicitly requests a plan-only handoff.

## DeepSeek Flash v4 (explicit plan-only handoff)

Use DeepSeek only when the user explicitly tells Sol to produce a plan for DeepSeek to execute. In that case, the handoff may cover:

- Implementing approved specifications
- Moving inline styles into CSS classes
- Creating repeated components
- Updating scene JSON/content
- Adding tests
- Fixing type errors
- Applying exact token and spacing values
- Mechanical refactors
- Implementing bounded animation state machines
- Applying a precise visual correction checklist

Do not delegate implementation to DeepSeek by default, and do not ask DeepSeek to independently decide what “looks professional.”

## Codex environment

Use Codex Desktop or Codex CLI to:

- Inspect repository state
- Apply phased prompts
- Run the game
- Capture screenshots
- Run tests and builds
- Review diffs
- Create commits
- Maintain phase handoffs

## Image generation

Use for:

- Moodboards
- Main-menu concepts
- HUD concepts
- Level-up roulette concepts
- Relic chest concepts
- Boss presentation
- Victory/defeat composition

Generated images are references, not final frontend assets.

## Figma or Canva

Use for:

- Stable screen composition
- Alignment and spacing
- Component states
- Measurement
- Multi-resolution layouts
- Clean reference exports

Figma is preferred for exact measurements and reusable components. Canva is acceptable for fast art direction.

---

# 2. Full Workflow

```text
1. Define visual identity
2. Create focused reference images
3. Have Sol formalize the design system
4. Map the design to current architecture
5. Break work into bounded implementation phases
6. Have Sol implement by default, or prepare a DeepSeek handoff only when explicitly requested
7. Run browser and capture screenshots
8. Use Sol for visual review
9. Convert review into exact fixes
10. Repeat until acceptance criteria pass
11. Lock and document the visual system
```

Do not redesign every screen in one pass.

---

# 3. Step 1 — Visual Brief

Define before coding:

- Tone
- Colors
- Typography
- Panel/material language
- Motion language
- Rarity language
- Driver/Gunner language
- Damage/warning language
- Victory/defeat language

Recommended brief:

```text
Industrial arcade military
Bright cooperative role accents
High-energy casino progression
Clean survival HUD
Rugged post-apocalyptic hardware
Deliberately authored for Recoil Crew, never generic AI-app styling
```

Create a one-page visual brief and approve it before screen work.

The brief must also name the project's distinctive motifs and its anti-patterns. Reviewers should be able to explain why the interface belongs to Recoil Crew without relying on the logo, tank artwork, or screen copy.

---

# 4. Step 2 — Focused References

Create separate 1920×1080 references for:

1. Main menu
2. Lobby
3. Gameplay HUD
4. Level-up roulette
5. Relic chest reveal
6. Elite encounter
7. Boss encounter
8. Victory
9. Defeat
10. Pause/settings

Do not combine all screens into one oversized image.

Also produce layout checks for:

- 1280×720
- 2560×1440
- Ultrawide

Each reference should identify:

- Primary focus
- Persistent information
- Conditional information
- Safe margins
- Motion notes
- Elements that must not be covered

## Reference authority

Reference images are directional inputs, not a source of product truth or a checklist of required elements.

Use them to study visual principles such as hierarchy, composition, typography, shape language, contrast, color roles, and motion cues. The current game's real features and states, the Visual Rework Design Document, and direct user decisions determine scope. Do not introduce mock-only systems—such as currencies, player profiles, news, garages, loadouts, progression tracks, or extra navigation—unless they are independently required by the game or approved by the user.

The ChatGPT mock render is an exploratory example rather than a final target. Its composition and styling may be adapted, rejected, or combined with other references as the implementation develops.

## Anti-generic review

At each visual review, explicitly check for signs of the typical AI-generated app/game look:

- Interchangeable glass cards, dashboard grids, pill buttons, and excessive rounded corners
- Cyan-purple gradients, indiscriminate glow, or effects without semantic purpose
- Fake metrics, decorative labels, invented features, or plausible-looking filler content
- Uniform component treatment that erases hierarchy
- Mixed icon or illustration styles
- Excessive symmetry, oversized headings, and empty space used as substitutes for composition
- Too many simultaneous borders, shadows, highlights, textures, and particles
- Styling that could be transferred unchanged to an unrelated sci-fi product

Any screen that triggers these signals must be revised before approval. Corrections should strengthen Recoil Crew-specific motifs, reduce decoration, restore real information priority, and make spacing and typography feel hand-tuned.

Example annotation:

```text
Screen: Gunner HUD
Primary: reticle, cannon charge, boss bar
Persistent: integrity, XP, wave timer
Conditional: blocked shot, elite warning
Motion: charge rises vertically; boss bar enters heavily
```

---

# 5. Step 3 — Sol Design-System Pass

Provide Sol with:

- Reference images
- Repository
- Current scene/HUD architecture
- Visual Rework Design Document
- Target viewports
- Performance constraints
- Accessibility requirements

Required output:

```text
docs/ui/UI_DESIGN_SYSTEM.md
```

It should define:

- Color tokens
- Type tokens
- Spacing scale
- Radius/border system
- Shadows/glows
- Component inventory
- Component states
- Rarity presentation
- Driver/Gunner differentiation
- Scene transition language
- Reward-reveal timing
- HUD hierarchy
- Responsive behavior
- Reduced-motion variants

The first Sol pass should formalize the system, not rewrite the entire codebase.

---

# 6. Step 4 — Architecture Mapping

Use Sol to create:

```text
docs/ui/UI_ARCHITECTURE_PLAN.md
```

It must map the approved design onto:

- Existing scene runtime
- Existing HUD runtime
- Current presentation content
- App-flow ownership
- Overlay ownership
- Transition ownership
- Progression overlay replacement
- CSS module migration
- Test strategy
- Commit boundaries

Explicitly preserve:

- Content-driven scenes
- Content-driven HUD
- Authoritative progression outcomes
- Multiplayer state ownership
- Pointer-lock behavior

---

# 7. Step 5 — Bounded Implementation Phases

Every implementation phase receives:

- One design document
- Relevant mockups
- Exact files
- Acceptance criteria
- Tests
- Explicit non-goals

## Phase A — Foundations

Implement:

- Tokens
- Typography
- Shared components
- Layout primitives
- Accessibility states
- CSS migration skeleton

Do not redesign all screens.

## Phase B — Flow Infrastructure

Implement:

- AppFlowController
- OverlayDirector
- TransitionDirector
- Focus/input ownership
- Layer system
- Cancellation

Use simple visuals until architecture is verified.

## Phase C — Vertical Slice

Implement and polish:

```text
Main menu
→ lobby
→ loading
→ countdown
→ gameplay HUD
```

Do not proceed until visually approved.

## Phase D — Progression

Implement:

- RewardRevealDirector
- Level-up roulette
- Relic reveal
- Rarity effects
- Skip
- Reduced motion
- Reduced flash
- E2E fast mode

## Phase E — Remaining Scenes

Implement:

- Pause
- Settings
- Victory
- Defeat
- Results
- Error
- Reconnecting
- How to play

## Phase F — Final Polish

Implement:

- Responsive fixes
- Audio timing
- Performance optimization
- Cleanup
- Screenshot regression
- Token consistency

---

# 8. Codex Prompt Template

Each phase prompt must include:

## Repository state

- Branch
- Starting SHA
- Required documents
- Expected local work

## Objective

One bounded result.

## Preserve

Existing systems that must remain compatible.

## Deliverables

Exact code, content, tests, screenshots, and reports.

## Non-goals

Features not included.

## Visual references

File names, resolution, and intended interpretation.

## Acceptance criteria

Concrete, testable completion list.

## Commands

Typecheck, tests, build, browser run, screenshots.

## Commit strategy

Focused commits only.

## Handoff

Exact next phase and unresolved issues.

---

# 9. Screenshot Review Loop

After every visual phase:

```text
run browser
→ open deterministic UI state
→ capture screenshots
→ compare with references
→ create exact correction list
→ implement corrections
→ capture again
```

Required viewports:

- 1280×720
- 1920×1080
- 2560×1440
- Ultrawide where relevant

Required HUD states:

- Driver
- Gunner
- Single Player
- Low integrity
- Elite
- Two elites
- Boss
- Upgrade
- Relic
- Reconnecting

## Sol review package

Provide:

```text
/ui-review/
├── reference.png
├── current-1920x1080.png
├── current-1280x720.png
├── intent.md
├── constraints.md
└── relevant-files.txt
```

Ask Sol to identify:

- Hierarchy
- Alignment
- Spacing
- Type mismatch
- Contrast
- Visual noise
- Missing states
- Responsive problems
- Motion problems
- Accessibility issues

Require measurable fixes.

Good feedback:

```text
Increase boss name from 22px to 28px.
Reduce encounter-bar width from 72vw to 62vw.
Move wave timer 18px upward.
Reduce panel blur from 18px to 10px.
```

Bad feedback:

```text
Make it look more professional.
```

---

# 10. Visual Review Rubric

Score 1–5:

- Hierarchy
- Readability
- Consistency
- Recoil Crew specificity and authored character
- Spacing
- Interaction states
- Motion
- Responsiveness
- Accessibility
- Performance

A phase is visually approved when:

```text
No category below 4
and
no blocking functional issue remains
```

---

# 11. Multimodal Input Package

For every Sol implementation/review request, include:

- Reference image
- Current screenshot
- Relevant source files
- Intended resolution
- Screen purpose
- Information priority
- Performance constraints
- Accessibility constraints
- Explicit non-goals

Example intent:

```text
Primary objective:
Make the boss encounter ceremonial and threatening.

Priority:
1. Boss name and HP
2. Wave state
3. Tank integrity
4. Weapon state

Do not:
Hide the reticle
Cover central combat
Use rapid white flashes
```

---

# 12. Image Generation Process

When appearance is uncertain:

1. Generate three distinct directions.
2. Select one.
3. Generate focused screen variants.
4. Combine the best ideas.
5. Annotate the final reference.
6. Give it to Sol for system interpretation.
7. Have Sol implement the approved specification unless the user explicitly requested a plan-only DeepSeek handoff.
8. Return screenshots to Sol for review.

Do not ask a coding model to invent the visual direction from a vague sentence.

---

# 13. Animation Workflow

For complex sequences:

1. Storyboard frames.
2. Define timing table.
3. Define authoritative trigger.
4. Define presentation state machine.
5. Define audio cues.
6. Implement timeline.
7. Add skip/accessibility.
8. Test interruption and cleanup.
9. Record sequence.
10. Review visually.

Example timing:

```text
0.00 Overlay enters
0.08 Vignette reaches target
0.12 LEVEL UP impact
0.20 Reel starts
0.82 Deceleration begins
1.08 Card 1 locks
1.20 Card 2 locks
1.32 Card 3 locks
1.48 Rarity reveal
1.72 Cards selectable
```

Keep timing centralized rather than scattered across unrelated callbacks.

---

# 14. Testing Workflow

## Unit

- State machines
- Transition validation
- Overlay priority
- Deduplication
- Skip
- Reduced motion
- Cleanup

## Browser

- Keyboard navigation
- Pointer lock
- Pause/resume
- Upgrade selection
- Relic reveal
- Reconnect
- Victory/defeat
- Rematch

## Screenshots

Use:

- Fixed viewport
- Fixed content
- Fast-animation test mode
- Stable fonts/assets
- Deterministic particles or disabled random particles

## Performance

Record:

- DOM count
- Layout time
- Style recalculation
- Animation frame duration
- Compositing pressure
- Memory after repeated transitions
- Memory after repeated reward reveals

---

# 15. Branch and Commit Strategy

Recommended branch:

```text
ui-visual-rework
```

Suggested commits:

```text
ui: add design tokens and shared components
ui: centralize app flow overlays and transitions
ui: redesign menu lobby loading and countdown
ui: redesign gameplay hud
ui: add cinematic level-up reveal
ui: add cinematic relic reveal
ui: redesign pause settings victory and defeat
ui: add responsive and accessibility polish
ui: add screenshot qualification
```

Every commit must build and pass relevant tests.

Avoid unrelated gameplay changes.

---

# 16. Phase Handoff

At every phase boundary update:

```text
docs/ui/UI_REWORK_HANDOFF.md
```

Include:

- Starting/final SHA
- Files changed
- Screens completed
- Components created
- Tests run
- Screenshots captured
- Known visual mismatches
- Functional issues
- Next phase
- Reference files
- Remaining decisions

A different model must be able to continue without reconstructing chat history.

---

# 17. Cost-Efficient Model Loop

Recommended cycle:

```text
Sol visual review
→ one precise issue list
→ Sol implementation by default
→ Codex screenshot batch
→ Sol visual review
```

Use Sol for:

- First design-system pass
- First vertical-slice review
- Progression/relic review
- Final cross-resolution review

Sol performs the repeated implementation rounds between reviews by default. DeepSeek is used only for an explicitly requested plan-only handoff.

---

# 18. Final Workflow

```text
Visual brief approved
↓
Focused references created
↓
Sol defines UI design system
↓
Architecture plan approved
↓
Sol implements foundations by default
↓
Codex runs and captures screenshots
↓
Sol reviews vertical slice
↓
Sol applies exact fixes by default
↓
Progression/relic sequences implemented
↓
Sol reviews motion and hierarchy
↓
Remaining scenes implemented
↓
Cross-resolution qualification
↓
Accessibility/performance pass
↓
Final visual system locked
```

---

# 19. Workflow Acceptance Criteria

```text
[ ] Visual brief exists
[ ] Visual brief defines distinctive Recoil Crew motifs and explicit anti-patterns
[ ] Focused reference images exist
[ ] UI design-system document exists
[ ] Architecture plan exists
[ ] Work is divided into bounded phases
[ ] Every phase has non-goals
[ ] Sol implements each phase unless the user explicitly requests a plan-only DeepSeek handoff
[ ] Any requested DeepSeek handoff receives exact specifications
[ ] Sol receives screenshots and references
[ ] Screenshot review follows every visual phase
[ ] Corrections are measurable
[ ] Viewports match between reference and implementation
[ ] Reduced-motion and reduced-flash reviewed
[ ] Browser interaction tests exist
[ ] Screenshot tests exist
[ ] Performance checks exist
[ ] Phase handoffs exist
[ ] Commits remain focused
[ ] Final rubric has no category below 4/5
[ ] Final screens do not resemble interchangeable AI-generated app/game mockups
```
