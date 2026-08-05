# Monster Pack 10 — Quaternius Horde-Ready Import

This directory documents the native Recoil Crew import of the standalone
**Ultimate monster pack - Horde Ready** (90 processed GLBs: 45 hero, 15
common-near, 15 common-far, 15 aggregate).

## Where the ZIP belongs

```text
<RecoilCrewRoot>/local-imports/monsterpack09/Ultimate monster pack - Horde Ready.zip
```

`local-imports/` and the disposable staging directory
`build/monsterpack10-import/` are git-ignored.

## Re-import

```bash
npm run import:monsterpack -- --dry-run
npm run import:monsterpack
npm run validate:monsterpack-import
```

The importer:

- verifies the ZIP and all 90 recorded SHA-256 hashes;
- extracts only into ignored staging;
- copies accepted GLBs into `public/assets/models/enemies/quaternius/`;
- archives source manifests/reports/license under `docs/monsterpack10/`;
- regenerates native content (asset catalog, animation/presentation
  profiles, art roster, scale/socket mappings, native index);
- maintains `generated/IMPORT_OWNERSHIP.json` for stale-file cleanup.

## What is generated vs runtime

- **Generated native content**: `content/assets/project.json` entries,
  `content/enemy-animation-profiles/quaternius/*`,
  `content/enemy-presentation-profiles/quaternius/*`,
  `content/enemy-art-rosters/*`.
- **Runtime**: GLBs under `public/assets/models/enemies/quaternius/`.
- **Source evidence (immutable)**: `docs/monsterpack10/source-manifests/`
  and `docs/monsterpack10/source-reports/`.
- **Generated docs**: `docs/monsterpack10/generated/*.json`.

## Validation

```bash
npm run validate:monsterpack-import
npm run test:monsterpack-import
npm run validate:enemy-animations
```

See `IMPORT_REPORT.md` for the latest run and `PERFORMANCE_REPORT.md` for
browser benchmark results.
