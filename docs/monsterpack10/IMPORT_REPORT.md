# Monster Pack 10 — Import Report

Imported at 2026-08-05T01:13:16.591Z (elapsed 0.33s).

## ZIP

- Path: `local-imports\monsterpack09\Ultimate monster pack - Horde Ready.zip`
- SHA-256: `cd7d01bae2f6f7177570dbbc8960e7bfe59b0bce5d09ca9fb5f98ac7688132f8`
- Bytes: 163448290

## Validation

- Runtime variants: {"hero":45,"commonNear":15,"commonFar":15,"aggregate":15}
- Output hashes valid: 90
- Output hashes invalid: 0
- GLB introspections: 90
- Issues: 0



## Writes

- Runtime GLB copies/replacements: 0
- Stale managed removals: 0
- Source evidence archived: 1 README + 1 license + 7 manifests + 8 reports
- Native content: 90 asset entries, 45 hero + 15 common animation profiles, 45 hero + 15 common presentation profiles, 1 art roster
- Generated docs: IMPORT_OWNERSHIP.json, IMPORT_SUMMARY.json, NATIVE_CONTENT_INDEX.json, SCALE_MAPPING.json, SOCKET_MAPPING.json

## Commands

```bash
npm run import:monsterpack -- --dry-run
npm run import:monsterpack
npm run validate:monsterpack-import
```

## Final verification (2026-08-05)

- `npm run validate:monsterpack-import` — PASS (90/90 hashes, 90/90 GLB
  introspections, 90 byte-identical destination files, 0 stale).
- `npm run test:monsterpack-import` — 10 files / 37 tests PASS.
- `npm run validate:enemy-animations` — PASS, 0 errors / 0 warnings,
  102 info (all 60 Quaternius profiles validated against all 90 GLBs).
- `npm run test:monsterpack-rendering` — PASS; 7 scenarios recorded in
  `build/monsterpack10-import/BENCHMARK_RESULTS.json`; summary in
  `PERFORMANCE_REPORT.md`.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
