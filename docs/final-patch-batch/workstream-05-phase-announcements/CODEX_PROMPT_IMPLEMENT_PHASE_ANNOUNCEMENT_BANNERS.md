# Codex Prompt — Optional Phase Announcement Banners

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/final-phase-announcements
```

Binding design:

```text
docs/final-patch-batch/workstream-05-phase-announcements/PHASE_ANNOUNCEMENT_BANNERS_DESIGN.md
```

Merge last, after localization and audio/VFX work.

## Mission

Create a bold, centered, short phase announcement for farming, Elite waves, and the final Boss wave.

Use the user-provided screenshots only as impact/composition reference.

Do not copy their exact art or sound.

---

## 1. Audit

Read:
```text
src/shared/stage/
src/shared/horde/
src/client/hud*
src/client/app/presentationEventRouter.ts
src/client/ui/
src/client/audio/procedural/
src/client/audio.ts
content/horde/stageSequenceProduction.json
current localization catalogs
```

Record SHA.

---

## 2. Semantic trigger

Use authoritative phase sequence.

One banner per genuine transition.

No reconnect replay.

---

## 3. Presenter

Prefer isolated:
```text
src/client/presentation/phaseAnnouncementLayer.ts
```

Pointer-events none.

Responsive and reduced-motion safe.

---

## 4. Sound

Add original `phaseAnnouncementImpact` procedural recipe.

Do not use or bundle the vine-boom sample.

Preserve user SFX/BGM gains.

Use short soundtrack duck, no track switch.

---

## 5. Localization

Use:
```text
phase.farming
phase.elite
phase.final
```

Add missing EN/KO entries only through current localization conventions.

---

## 6. Tests

Implement full matrix.

Run:
```bash
npx tsc --noEmit
npm run build
npm test
```

plus stage/presentation/audio/browser suites.

---

## 7. Report

Create:
```text
docs/final-patch-batch/workstream-05-phase-announcements/PHASE_ANNOUNCEMENT_IMPLEMENTATION_REPORT.md
```

Include SHA, trigger logic, timings, typography, sound recipe, screenshots, tests, and exclusions.
