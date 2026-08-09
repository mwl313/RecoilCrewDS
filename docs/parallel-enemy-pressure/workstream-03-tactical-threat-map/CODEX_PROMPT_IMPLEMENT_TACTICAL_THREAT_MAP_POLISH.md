# Codex Prompt — Tactical Threat-Map Polish V1

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Branch:

```text
feature/tactical-threat-map
```

Binding design:

```text
docs/parallel-enemy-pressure/workstream-03-tactical-threat-map/TACTICAL_THREAT_MAP_POLISH_DESIGN.md
```

## Mission

Upgrade the current rudimentary minimap threat markers:

```text
ordinary = small muted-red circle
elite    = larger violet diamond
boss     = largest crimson angular glyph + pale ring
sector   = approximate hostile cluster marker
chest    = existing amber marker
```

Preserve the attached TAB/MAP nub and current drawer.

Do not touch chest beacons.

---

## 1. Audit

Read:

```text
src/client/tactical/tacticalDrawer.ts
src/client/tactical/miniMapRenderer.ts
src/client/app/gameClient.ts
src/shared/enemies/enemyClassification.ts
src/shared/horde/hordeSectors.ts
src/shared/net/horde/
src/client/ui/tactical.css
tests/quality
tests/horde
```

Record SHA.

---

## 2. Semantic classification

Use `normalizedEnemyClass()` or the current shared semantic equivalent.

Wave leader fallback -> Elite.

Do not rely on ownership priority as primary logic.

---

## 3. Draw advanced markers

Implement exact hierarchy from design.

Keep direct Canvas 2D.

No DOM markers, labels, or HP.

---

## 4. Pass aggregate sectors

Update the tactical/minimap view-model contract to receive current client aggregate sectors.

Draw honest cluster markers.

Avoid unnecessary per-frame allocation.

---

## 5. Preserve drawer/nub

No redesign, no pointer-lock change, no input change, no chest-beacon work.

---

## 6. Tests

Add focused unit tests for classification/style and integration tests for sector input.

Run:

```bash
npx tsc --noEmit
npm run build
npm test
```

plus tactical/horde/browser suites.

Capture screenshots:
- ordinary + Elite + Boss + chest;
- aggregate sector;
- drawer closed/open;
- Single Player and Multiplayer.

---

## 7. Report

Create:

```text
docs/parallel-enemy-pressure/workstream-03-tactical-threat-map/TACTICAL_THREAT_MAP_IMPLEMENTATION_REPORT.md
```

Include SHA, files, exact colors/sizes, sector contract, tests, screenshots, and exclusions.
