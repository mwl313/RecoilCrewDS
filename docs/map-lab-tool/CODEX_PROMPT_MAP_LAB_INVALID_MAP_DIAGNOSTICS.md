# Codex Prompt — Make Map Lab Show Invalid Maps Instead of Silently Replacing Them with Fallback

Repository:

```text
mwl313/RecoilCrewDS
branch: map-lab
```

Treat this prompt as the binding implementation contract.

Inspect the current repository before editing, especially:

```text
tools/maplab/src/generatorAdapter.ts
tools/maplab/src/main.ts
tools/maplab/src/panels/ui.ts
tools/maplab/src/mapLabState.ts
tools/maplab/src/io/export.ts
tools/maplab/src/workerClient.ts
tools/maplab/src/worker/mapGeneration.worker.ts

src/shared/mapgen/retry.ts
src/shared/mapgen/arenaSession.ts
src/shared/mapgen/validation.ts
src/shared/mapgen/validation2.ts
src/shared/mapgen/validationIssues.ts
src/shared/mapgen/generator.ts
src/shared/mapgen/arenaSession.ts

docs/maplab/MAP_LAB_USER_GUIDE.md
docs/maplab/MAP_LAB_ARCHITECTURE.md

tests/maplab/
tests/mapgen.test.ts
e2e/maplab.spec.ts
```

Adapt paths to the actual repository if they changed.

---

# Problem

The current Map Lab Production mode uses the same retry/fallback flow as the game.

When every generated candidate fails validation:

```text
candidate 0 fails
candidate 1 fails
...
candidate 7 fails
→ Map Lab renders the safe fallback map
```

This is correct for the real game, but wrong for an authoring and debugging tool.

The user sees a flat or legacy-looking fallback map instead of the invalid dramatic map they were trying to tune. The tool may show `PASS` because the fallback itself is valid, which hides the fact that the edited profile failed.

The current Exact Candidate path also conflates:

```text
generation succeeded
validation passed
```

If validation fails, the Map Lab may refuse to render the candidate even though a complete arena payload exists.

---

# Mission

Change Map Lab so it never silently replaces an invalid generated candidate with fallback during editing.

New governing rules:

> Map Lab must display the generated candidate even when validation fails.

> Fallback must be shown only when the user explicitly asks to preview the production fallback result.

> Every validation failure must explain exactly what failed, where it failed when possible, which attempt failed, and which parameters are relevant.

Do not change the real game’s runtime failsafe behavior. The production server must still use fallback when all candidates fail.

---

# Required behavior

## Default Map Lab behavior

When the user edits a profile and regenerates:

1. Generate the requested candidate.
2. Render it even if validation fails.
3. Show a prominent `INVALID MAP` status.
4. Show all validation errors and warnings.
5. Disable `Apply to Game`.
6. Keep the current candidate visible for inspection.
7. Do not replace it with fallback automatically.

## Production diagnostics behavior

Production mode should still simulate the real retry process, but Map Lab should display diagnostics rather than silently switching views.

Required output:

```text
Attempt 0 — FAIL
Attempt 1 — FAIL
Attempt 2 — PASS
Production result: Attempt 2
```

or:

```text
Attempt 0 — FAIL
...
Attempt 7 — FAIL
Production result: FALLBACK WOULD BE USED
```

When all attempts fail:

- Keep one failed generated candidate visible.
- Prefer showing the last attempted candidate by default, or preserve the currently selected attempt.
- Show a large banner:

```text
INVALID PROFILE
All procedural attempts failed.
The game would use the fallback map.
```

- Do not render fallback unless the user clicks `Preview Fallback`.

## Exact Candidate behavior

Exact Candidate must always render when candidate generation completes, regardless of validation result.

Separate these states:

```ts
generationSucceeded: boolean;
validationPassed: boolean;
```

A failed validator must not be treated as a generator crash.

---

# Non-negotiable constraints

Preserve:

- Real game retry/fallback behavior
- Server authority
- Client reconstruction
- Checksum gate
- Existing safe fallback map
- Deterministic seeds
- Existing validation algorithms
- Map Lab exports
- Current content/profile system
- Existing online, Practice, and Demo behavior

Do not:

- Disable validation
- Make invalid maps applicable to the game
- Change the game server to continue with invalid terrain
- Duplicate generation algorithms
- Swallow validation errors
- Show only generic `FAIL`
- Replace the current candidate with fallback without explicit user action
- Treat validation failure as a thrown exception
- Break worker/main-thread parity

---

# 1. Diagnostic result model

Replace the current ambiguous `ok` result with explicit fields.

Recommended shape:

```ts
export interface MapLabAttemptReport {
  attempt: number;
  baseSeed: number;
  candidateSeed: number;

  generationSucceeded: boolean;
  validationPassed: boolean;
  acceptedByProduction: boolean;

  generationMs: number;

  arena?: SerializedArena;

  phase1: {
    ok: boolean;
    errors: string[];
    warnings: string[];
    metrics: unknown;
  };

  phase2: {
    ok: boolean;
    errors: string[];
    warnings?: string[];
    metrics: unknown;
  };

  issues: MapValidationIssue[];
}

export interface MapLabGenerateResult {
  requestId: number;

  generationSucceeded: boolean;
  validationPassed: boolean;

  displayedArena?: SerializedArena;

  attempts: MapLabAttemptReport[];

  selectedAttempt: number;

  productionOutcome: {
    kind: "generated" | "fallback";
    acceptedAttempt?: number;
    fallbackWouldBeUsed: boolean;
    fallbackArena?: SerializedArena;
  };

  error?: string;
}
```

Names may be adapted, but the semantic distinction is required.

---

# 2. Reuse production generation logic without hiding failures

Do not duplicate the generator.

Refactor or extend the retry API so Map Lab can receive per-attempt diagnostics.

Preferred direction:

```ts
generateArenaWithDiagnostics(...)
```

or:

```ts
generateArenaWithRetry({
  ...
  collectReports: true,
  onAttempt(report) {},
})
```

Each attempt report must retain:

- Attempt number
- Candidate seed
- Generated arena payload when generation succeeded
- Phase 1 validation report
- Phase 2 validation report
- Normalized issues
- Acceptance result

The real game may continue using the simpler final result.

Map Lab uses the diagnostic result.

Do not run a different generation algorithm in Map Lab.

---

# 3. Candidate selection UI

Add a visible attempt selector.

Example:

```text
Attempts
[0 FAIL] [1 FAIL] [2 FAIL] [3 PASS]
```

or a dropdown:

```text
Attempt: 2
Status: FAIL
Seed: 123456789
```

Required behavior:

- Clicking an attempt renders that exact candidate.
- Invalid candidates remain fully inspectable.
- Validation panel updates for the selected attempt.
- Seeds and metrics update.
- Selected attempt remains selected across layer toggles.
- Regeneration resets selection sensibly.
- When one attempt passes, select the accepted attempt by default.
- When all fail, select the last attempt by default unless the user had explicitly selected another.

---

# 4. Explicit fallback preview

Add:

```text
[Preview Fallback]
```

Only show or enable it when fallback would be used.

When clicked:

- Render fallback.
- Show banner `FALLBACK PREVIEW`.
- Keep failed attempt reports available.
- Provide `Return to Failed Candidate`.
- Do not change the working profile.
- Do not mark the working profile valid.
- Do not enable Apply to Game.

Fallback preview is a diagnostic comparison tool, not the default result.

---

# 5. Validation failure explanations

The right panel must show concrete causes.

Group issues by category:

```text
Terrain
Routes
Spawns
Gates
Recovery
Ramps
Furniture
Budgets
Determinism
Performance
```

Each issue must show:

- Severity
- Human-readable message
- Validation code
- Attempt number
- Candidate seed
- Measured value
- Allowed value
- Location when available
- Related entity ID
- Related layer
- Relevant parameter paths when known

Example:

```text
ROUTES — ERROR
Required route slope is too steep.

Measured: 0.57
Allowed: 0.35
Route: route.4
Attempt: 3
Candidate seed: 184928331

Relevant settings:
- furnitureSet.maxRouteSlope
- terrainProfile.slopeRules.driveableMax
```

Another example:

```text
SPAWN — ERROR
Spawn candidate has fewer than two route exits.

Spawn: spawn.1
Exits: 1
Required: 2
Position: x=42.0, z=181.5
```

Do not rely on parsing free-form strings in the UI when structured data can be produced by validators.

---

# 6. Improve MapValidationIssue

Extend the shared issue model as needed.

Recommended:

```ts
export interface MapValidationIssue {
  id: string;
  code: string;
  severity: "error" | "warning";
  category: string;
  message: string;

  attempt?: number;
  candidateSeed?: number;

  position?: {
    x: number;
    y: number;
    z: number;
  };

  entityId?: string;
  layerId?: string;

  measured?: number | string;
  allowed?: number | string;

  parameterPaths?: string[];

  fatal?: boolean;
}
```

Update `issuesFromValidationReports()` so it emits structured values for all existing validation categories.

Preserve stable deterministic issue ordering.

---

# 7. Validation focus

Clicking an issue must:

1. Select the correct attempt.
2. Render that candidate if another attempt is visible.
3. Enable the relevant layer.
4. Focus the camera on `position` when present.
5. Highlight the related entity when supported.
6. Highlight or scroll to related parameter controls when `parameterPaths` exists.

If there is no position, retain the current camera and highlight the corresponding layer/category.

---

# 8. Status banners

Add unambiguous top-level states.

## Valid generated candidate

```text
VALID GENERATED MAP
Attempt 2 passed.
```

## Invalid candidate

```text
INVALID MAP
This candidate was generated successfully but failed validation.
```

## All attempts failed

```text
INVALID PROFILE
All 8 procedural attempts failed.
The game would use fallback.
```

## Fallback preview

```text
FALLBACK PREVIEW
This is not the edited procedural result.
```

## Generator crash

```text
GENERATION ERROR
No candidate arena was produced.
```

Do not show plain `PASS` while a fallback preview hides failed edited candidates.

---

# 9. Apply and export behavior

## Apply to Game

Enable only when:

```text
selected candidate validationPassed
AND
selected candidate is the production-accepted generated candidate
AND
fallback is not being previewed
```

If all procedural attempts fail:

```text
Apply to Game = disabled
```

Show the reason.

## Save as New Profile

Same validation requirements as Apply to Game.

## Export Profile

Profile export may remain available even when invalid, but show a warning:

```text
This profile currently fails validation.
```

Include diagnostic metadata in the export if appropriate.

## Export Arena

Export the currently selected attempt, including invalid candidates.

The export must clearly include:

```text
validationPassed: false
attempt
candidateSeed
issues
```

## Export Validation

Export all attempt reports, not only the selected attempt.

---

# 10. Production and Exact mode semantics

## Production Diagnostics mode

This mode simulates all retries and reports what the game would choose.

It must not automatically change the displayed arena to fallback.

## Exact Candidate mode

This mode builds one requested candidate and always renders it if generation succeeds.

Recommended visible mode labels:

```text
Production Diagnostics
Exact Candidate
```

This makes the tool’s behavior clearer than the current generic `Production`.

---

# 11. Map Lab metrics

Add:

```text
selected attempt
attempt count
passed attempts
failed attempts
production accepted attempt
fallback would be used
candidate generation time
phase 1 error count
phase 2 error count
height range
max slope
route slope
route loops
spawn count
recovery count
ramp failures
furniture warnings
```

When fallback preview is visible, continue showing the failed-profile summary separately.

---

# 12. Retry reports in shared generator

The current retry flow should preserve why each attempt failed.

Add a shared report structure conceptually equivalent to:

```ts
export interface ArenaAttemptDiagnostic {
  attempt: number;
  candidateSeed: number;
  arena?: GeneratedArena;
  phase1: ValidationReport;
  phase2: Phase2ValidationResult;
  accepted: boolean;
}
```

Avoid retaining duplicate heavy heightfields in the real game server when diagnostics are not requested.

Possible API:

```ts
generateArenaWithRetry({
  diagnostics: false
})
```

Map Lab:

```ts
generateArenaWithRetry({
  diagnostics: true
})
```

Or provide a Map Lab-only orchestration wrapper that calls the same candidate builder and validators while preserving exact production ordering.

The ordering, seed composition, retry limit, and acceptance rules must remain identical.

---

# 13. Worker serialization

Update worker/main-thread result serialization for:

- Multiple attempt reports
- Selected arena payload
- Optional fallback preview payload
- Structured issues
- Phase metrics

Avoid transferring every full heightfield simultaneously if memory becomes excessive.

Acceptable optimization:

- Preserve full serialized arena only for selected/accepted/last attempts.
- Preserve reports and lightweight metrics for all attempts.
- Regenerate a selected failed attempt deterministically when clicked.

If using regeneration-on-selection:

- It must reproduce the exact candidate seed.
- It must not rerun the whole retry chain.
- UI must show a brief loading state.
- Result checksum must match the original attempt report.

---

# 14. Tests

## Generator adapter tests

Add tests proving:

- Invalid Exact Candidate returns an arena payload.
- `generationSucceeded=true` and `validationPassed=false` are distinct.
- All failed Production attempts report `fallbackWouldBeUsed=true`.
- Displayed arena remains a failed candidate by default.
- Fallback is not selected automatically.
- Accepted attempt is selected when one passes.
- Attempt order and seeds match production retry behavior.
- Fallback preview uses the correct fallback arena.

## UI tests

Test:

- `INVALID MAP` banner.
- `INVALID PROFILE` banner.
- `FALLBACK PREVIEW` banner.
- Attempt selector.
- Switching attempts.
- Failed attempt issues update.
- Preview fallback and return.
- Apply disabled for invalid/fallback.
- Export Arena works for invalid candidate.
- Export Validation contains all attempts.

## Validation issue tests

Test structured fields:

- Category
- Code
- Measured
- Allowed
- Entity
- Position
- Parameter paths
- Stable ordering

## E2E

Playwright scenario:

1. Open Map Lab.
2. Load primary profile.
3. Set parameters known to fail.
4. Regenerate.
5. Verify a non-fallback generated arena remains visible.
6. Verify `INVALID PROFILE` or `INVALID MAP`.
7. Verify failure causes are listed.
8. Select another failed attempt.
9. Click an issue and focus it.
10. Click Preview Fallback.
11. Verify `FALLBACK PREVIEW`.
12. Return to failed candidate.
13. Verify Apply is disabled.
14. Export invalid arena and validation report.
15. Reset profile.
16. Regenerate a valid map.
17. Verify Apply becomes enabled.

## Game regression

The real game must continue to use fallback automatically when required.

Run:

```bash
npm run generate:map-profiles
npm run build
npm test
npm run test:demo
npm run test:e2e
npm run test:loop
npm run test:maps
npm run test:maps:sweep
npm run build:maplab
npm run test:maplab
```

Report actual results.

---

# 15. Documentation

Update:

```text
docs/maplab/MAP_LAB_USER_GUIDE.md
docs/maplab/MAP_LAB_ARCHITECTURE.md
docs/maplab/MAP_LAB_IMPLEMENTATION_REPORT.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

Explain clearly:

- The game still uses fallback automatically.
- Map Lab does not hide invalid candidates.
- Production Diagnostics shows what the game would do.
- Fallback is an explicit preview.
- Exact Candidate can display invalid maps.
- How to read validation causes.
- How to select attempts.
- Why Apply is disabled.

---

# Completion criteria

This change is complete only when:

1. Map Lab never silently replaces an invalid procedural candidate with fallback.
2. Failed generated candidates remain visible and inspectable.
3. Exact Candidate renders invalid candidates.
4. Production Diagnostics lists every retry attempt.
5. All failed attempts show that the game would use fallback without switching the viewport automatically.
6. Fallback appears only through an explicit Preview Fallback action.
7. Every failure has a concrete category and message.
8. Structured issues include measured/allowed values when available.
9. Location/entity/layer/parameter links work when data exists.
10. Apply and Save as New Profile remain disabled for invalid candidates and fallback previews.
11. Invalid candidate Arena and full attempt Validation reports can be exported.
12. The real game’s automatic fallback behavior is unchanged.
13. Worker and main-thread fallback paths behave identically.
14. Existing game, map-generation, and Map Lab tests pass.

Final product rule:

> The game must protect players by falling back automatically. The Map Lab must protect developers from hidden failures by keeping invalid generated maps visible and explaining exactly why they failed.
