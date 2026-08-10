# Codex Prompt — Final Copy, Korean Localization, and Settings V2

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/final-localization-settings-copy
```

Binding design:

```text
docs/final-patch-batch/workstream-01-localization-settings/LOCALIZATION_COPY_AND_SETTINGS_V2_DESIGN.md
```

## Mission

Implement:
- English copy cleanup;
- complete selected Korean localization;
- licensed Korean webfont;
- runtime language switching;
- Settings V2 with language, BGM, and SFX volume.

Do not add fullscreen, chat, MG mechanics, Ground Pound mechanics, boundary changes, or phase-banner presentation.

---

## 1. Audit current main-derived branch

Record SHA.

Inspect:
```text
src/client/settings/
content/scenes/settings.json
src/client/ui/
src/client/app/sceneFlowPresenter.ts
src/client/hud*
src/client/progression/
src/client/tactical/
src/client/audio.ts
src/client/audio/soundtrack*
src/shared/presentation/
src/shared/content/schemas/
content/relics/
content/upgrade-categories/
content/enemies/
content/scenes/
content/hud/
server/client error routing
package.json
```

Build a machine-readable inventory of player-facing literals.

---

## 2. Create localization foundation

Implement typed `en`/`ko` catalogs, interpolation, fallback, subscriptions, and `html[lang]`.

Keep network language-neutral.

Add key-aware scene/UI props.

Replace cached hardcoded text safely.

---

## 3. Clean copy

Audit every relic, upgrade, and monster presentation.

Use structured effect presentation where possible.

Remove technical text such as:
```text
High Detail
clamp 0
two stacks: 0
internal stat IDs
```

Use the style rules and glossary in the design.

---

## 4. Korean font

Integrate a properly licensed Korean webfont through the repo's normal dependency/asset process.

Preferred Pretendard Variable, Noto Sans KR fallback.

Include license/attribution.

Do not fabricate or silently omit the font.

---

## 5. Settings migration

Implement V1→V2 migration and safe storage fallback.

Add accessible language segmented control and BGM/SFX sliders.

Live preview, Save persist, Cancel restore.

---

## 6. Audio gains

Add dedicated user gains after existing soundtrack context/duck stages and after authored SFX mix.

Use perceptual curve and click-free ramps.

Do not pause muted music.

---

## 7. Domain ownership

The later MG, Landing, and Announcement branches will add their own final catalog keys.

Create clean extension seams and document them.

Do not add their mechanics.

---

## 8. Tests

Required:
- complete catalogs;
- fallback;
- interpolation parity;
- V1 migration;
- corrupt storage;
- Save/Cancel;
- BGM/SFX isolation;
- muted BGM timeline;
- cached runtime refresh;
- bilingual SP/MP;
- responsive Korean layouts.

Run:
```bash
npx tsc --noEmit
npm run build
npm test
```
plus browser/localization/settings/audio suites.

---

## 9. Report

Create:
```text
docs/final-patch-batch/workstream-01-localization-settings/LOCALIZATION_SETTINGS_IMPLEMENTATION_REPORT.md
```

Include SHA, key counts, untranslated exceptions, font/license, migration, audio graph, tests, screenshots, and exclusions.
