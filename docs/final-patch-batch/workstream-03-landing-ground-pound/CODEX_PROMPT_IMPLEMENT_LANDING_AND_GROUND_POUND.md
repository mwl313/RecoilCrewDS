# Codex Prompt — Landing & Ground Pound Overhaul

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/final-landing-ground-pound
```

Binding design:

```text
docs/final-patch-batch/workstream-03-landing-ground-pound/LANDING_AND_GROUND_POUND_DESIGN.md
```

Rebase after localization and MG before final merge.

## Mission

Add authoritative fall-distance tracking and implement the exact Ground Pound formulas in the design.

No fall damage.

---

## 1. Audit

Read:
```text
src/shared/sim/matchRuntime.ts
src/shared/sim/tankKinematics.ts
src/shared/types.ts
src/shared/progression/progressionSystem.ts
src/shared/progression/relicEffectRegistry.ts
src/shared/progression/relicEffectParameters.ts
content/relics/ground_pound.json
content/relic-effect-templates/groundPound.json
src/client/app/presentationEventRouter.ts
src/client/vfx.ts
src/client/audio/procedural/
src/client/app/cameraManager.ts
tests/movement
tests/progression08
tests/audio
```

Record SHA.

---

## 2. Track fall distance

Implement robust peak-Y lifecycle and reset semantics.

Add explicit event fields.

Pass metrics into relic trigger.

---

## 3. Implement formulas

Exact:
```text
effectiveFall = max(0, fallDistance - 1.5)
baseDamage = 10 * stacks
fallBonus = effectiveFall * 5
damage = baseDamage + fallBonus
radius = min(12, 5 + effectiveFall * 0.65)
knockback = min(12, 4 + effectiveFall * 0.75)
```

No tiny-contact activation.

---

## 4. Presentation

Prefer isolated modules:
```text
src/client/presentation/landingPresentation.ts
src/client/presentation/groundPoundPresentation.ts
```

Add pooled shockwave matching radius.

Coordinate sound/camera so Ground Pound does not double-trigger full landing feedback.

Preserve SFX user gain.

---

## 5. Copy/localization

Add final Ground Pound keys through the localization extension seam.

Do not hardcode fixed `3 m, 10 damage` copy.

---

## 6. Tests

Implement full matrix.

Run:
```bash
npx tsc --noEmit
npm run build
npm test
```

plus movement/progression/audio/netcode/browser suites.

Manual falls at:
```text
<2.5m
3m
6m
10m
15m
```

Test Single Player and both clients.

---

## 7. Report

Create:
```text
docs/final-patch-batch/workstream-03-landing-ground-pound/LANDING_GROUND_POUND_IMPLEMENTATION_REPORT.md
```

Include SHA, tracker, formulas, event contract, shockwave proof, audio/camera behavior, tests, screenshots, and exclusions.
