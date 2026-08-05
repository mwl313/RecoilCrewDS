# Codex Implementation Prompt
# Import and Integrate the Horde-Ready Ultimate Monster Pack into Recoil Crew

## Project

Recoil Crew local project root:

```text
The current working directory from which Codex is launched.
It must contain package.json, src/, content/, public/, and docs/.
```

Input ZIP location inside the Recoil Crew project:

```text
local-imports/monsterpack09/Ultimate monster pack - Horde Ready.zip
```

This ZIP is a local import artifact only.

It is not a runtime asset and must not be copied into `public/`, bundled into the game, or committed as project source.

---

# 0. User goal

Perform the complete native Recoil Crew integration of the finished standalone horde-ready model library.

The user does not want to manually:

```text
extract the ZIP
sort 90 GLBs
copy files into runtime folders
register model assets
convert standalone manifests
create Animation 07 animation profiles
create presentation profiles
connect near/far/aggregate variants
build stage-selective asset rosters
write import scripts
validate hashes
run previews
benchmark rendering
clean temporary files
```

Codex must do this work end to end.

The output must leave Recoil Crew with:

```text
45 normalized hero models available to content
15 common-near skinned models
15 common-far rigid models
15 aggregate rigid models
native project asset registrations
native Animation 07 animation profiles
native Animation 07 presentation profiles
source/license documentation
stage-selective loading
preview and validation tooling
browser performance measurements
a reproducible re-import command
```

Do not merely copy files.

Do not merely write documentation.

Do not stop after producing a conversion plan.

---

# 1. ZIP placement contract

The user will place the ZIP at exactly:

```text
<RecoilCrewRoot>/
└── local-imports/
    └── monsterpack09/
        └── Ultimate monster pack - Horde Ready.zip
```

Resolve it from the current project root:

```ts
const projectRoot = process.cwd();
const zipPath = path.join(
  projectRoot,
  "local-imports",
  "monsterpack09",
  "Ultimate monster pack - Horde Ready.zip",
);
```

Before doing anything:

```text
confirm package.json exists
confirm src/ exists
confirm content/ exists
confirm public/ exists
confirm ZIP exists
confirm ZIP is readable
```

When the ZIP is absent, fail with the exact expected path.

Do not scan the Desktop.

Do not search arbitrary parent folders.

Do not use a previously extracted external folder.

The ZIP inside `local-imports/monsterpack09/` is the canonical import input for this task.

---

# 2. Import staging and ignore policy

Add or preserve these ignore rules:

```gitignore
# Local heavyweight import packages
local-imports/

# Generated monster-pack import staging
build/monsterpack10-import/
```

Do not ignore final runtime GLBs or native content files.

Extract only into:

```text
build/monsterpack10-import/
```

Expected extraction structure:

```text
build/monsterpack10-import/
└── Ultimate monster pack - Horde Ready/
    ├── exports/
    ├── manifests/
    ├── reports/
    ├── previews/
    ├── scripts/
    ├── config/
    ├── temporary/
    ├── README.md
    └── LICENSE_AND_SOURCE.md
```

The importer must tolerate the single wrapper directory shown above.

Do not extract into:

```text
project root
public/
content/
docs/
src/
local-imports/
```

Staging must be disposable.

Final validation must work after deleting `build/monsterpack10-import/`, except for the explicit re-import command that requires the local ZIP.

---

# 3. Binding project architecture

Use the actual current local project as source of truth.

At minimum, preserve and use:

```text
content/assets/project.json
public/assets/
src/shared/assetCatalog.ts
AssetService
LoadedModelAsset
AssetService.modelAsset()
AssetService.createModelInstance()
SkeletonUtils.clone
content/enemy-animation-profiles/
content/enemy-presentation-profiles/
animation LOD policies
animation shadow policies
EnemyAnimationController
existing horde rendering
existing instanced fodder rendering
existing far-horde aggregation
existing content generation
existing preview tools
procedural asset fallbacks
```

Current project rules that must remain true:

```text
gameplay code uses semantic asset IDs
GLB files live under public/assets/models/
project assets are registered through content/assets/project.json
missing custom models use explicit fallbacks
skinned models retain embedded clips
skinned instances use safe skeleton cloning
animation profiles map semantic roles to exact clip names
root motion remains false
presentation profiles choose near/far assets and animation policies
```

Audit the actual local implementation before choosing exact schemas or filenames.

Do not rely solely on examples in this prompt when the local schema differs.

Do not create a competing asset loader.

Do not use `public/assets/manifest.json` as the primary registration path unless the actual local architecture has changed and the audit proves that it is now required.

---

# 4. Source-package facts to verify

The completed ZIP is expected to contain:

```text
45 hero GLBs
15 common-near GLBs
15 common-far GLBs
15 aggregate GLBs
90 total runtime GLBs
```

Expected folders:

```text
exports/hero/
exports/common-near/
exports/common-far/
exports/aggregate/
```

Expected important manifests:

```text
manifests/monster_catalog.json
manifests/runtime_variants.json
manifests/animation_profiles.json
manifests/rig_families.json
manifests/scale_profiles.json
manifests/socket_profiles.json
manifests/source_inventory.json
```

Expected important reports:

```text
reports/FINAL_DELIVERY_REPORT.md
reports/VALIDATION_REPORT.md
reports/PERFORMANCE_GUIDANCE.md
reports/ROLE_CLASSIFICATION.md
reports/RIG_FAMILY_REPORT.md
reports/ANIMATION_MAPPING_REPORT.md
reports/SCALE_AND_BOUNDS_REPORT.md
reports/KNOWN_LIMITATIONS.md
```

Expected properties:

```text
all runtime GLBs have recorded SHA-256 hashes
hero and common-near models are skinned and animated
common-far and aggregate models are rigid
common-near/common-far/aggregate models use one material
root-level gameplay animation is absent
semantic animation mappings are supplied
scale and socket suggestions are supplied
```

Codex must verify these claims from the ZIP.

Do not trust only the completion report.

---

# 5. Required initial audit

Before modifying project files, create:

```text
docs/monsterpack10/MONSTERPACK10_PROJECT_AUDIT.md
docs/monsterpack10/MONSTERPACK10_IMPORT_PLAN.md
docs/monsterpack10/MONSTERPACK10_BASELINE_REPORT.md
docs/monsterpack10/MONSTERPACK10_SCHEMA_MAPPING.md
```

Audit:

```text
package.json scripts
current asset-catalog schema
current project asset registrations
model preload behavior
whether all registered project models preload at startup
asset fallback resolution
Animation 07 implementation status
animation-profile schema
presentation-profile schema
LOD-policy schema
shadow-policy schema
aggregate-renderer contract
instanced-fodder renderer contract
enemy-definition presentation references
current content manifest/generator
current preview tools
current horde benchmark
current test gates
```

Important:

The repository may have Animation 07 documentation without the complete code, or may contain local implementation newer than remote history.

Use the actual local files.

When Animation 07 is incomplete, complete the minimum missing pieces required by its binding design before integrating the pack.

Do not silently bypass Animation 07 with model-name conditionals.

---

# 6. Baseline validation

Run all applicable existing commands before importing.

Inspect `package.json`, then run the real equivalents of:

```bash
npx tsc --noEmit

npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run build
npm test

npm run test:animation
npm run validate:enemy-animations
npm run test:presentation
npm run test:coreloop
npm run test:horde
npm run test:horde:benchmark
npm run test:netcode
npm run test:demo
npm run test:maplab
```

Run preview builds when available.

Record exact outputs.

Do not regenerate unrelated golden files merely to hide failures.

---

# 7. Build a reproducible importer

Create a project script, using existing project language and conventions.

Recommended:

```text
scripts/import-monsterpack10.ts
```

Add commands:

```json
{
  "scripts": {
    "import:monsterpack": "...",
    "validate:monsterpack-import": "...",
    "test:monsterpack-import": "...",
    "test:monsterpack-rendering": "..."
  }
}
```

The importer must:

1. Locate the exact ZIP.
2. Verify ZIP hash and file readability.
3. Clean and recreate staging safely.
4. Extract the wrapper directory.
5. Validate expected files.
6. Parse all required JSON manifests.
7. Validate every recorded output hash.
8. Validate runtime GLB counts.
9. Copy only accepted runtime GLBs.
10. Copy selected source documentation.
11. Generate native project content.
12. Produce an import report.
13. Be safe to rerun.
14. Avoid duplicate catalog entries.
15. Detect stale files from earlier imports.
16. Support `--dry-run`.
17. Support `--validate-only`.
18. Support `--clean-staging`.
19. Return nonzero on failure.

Recommended usage:

```bash
npm run import:monsterpack -- --dry-run
npm run import:monsterpack
npm run validate:monsterpack-import
```

Do not require Blender for this integration task.

The models are already processed.

---

# 8. Runtime GLB destination

Copy accepted GLBs to:

```text
public/
└── assets/
    └── models/
        └── enemies/
            └── quaternius/
                ├── hero/
                ├── common-near/
                ├── common-far/
                └── aggregate/
```

Exact mapping:

```text
exports/hero/*.glb
→ public/assets/models/enemies/quaternius/hero/

exports/common-near/*.glb
→ public/assets/models/enemies/quaternius/common-near/

exports/common-far/*.glb
→ public/assets/models/enemies/quaternius/common-far/

exports/aggregate/*.glb
→ public/assets/models/enemies/quaternius/aggregate/
```

Expected counts:

```text
hero: 45
common-near: 15
common-far: 15
aggregate: 15
total: 90
```

The importer must:

```text
preserve filenames
compare destination hashes
skip byte-identical files
replace only when source hash differs
remove stale generated files no longer present in the accepted manifest
never delete unrelated files
```

Maintain an ownership manifest:

```text
docs/monsterpack10/generated/IMPORT_OWNERSHIP.json
```

This records exactly which project files are managed by the importer.

---

# 9. Do not import processing bulk

Do not copy these into runtime or primary project source:

```text
config/
scripts/ from the standalone asset-processing pack
temporary/
previews/
360 turntables
Blender overview
processing logs
source_measurements/
processing_state.json
processing_failures.json
review_decisions.json
```

They remain inside the local ZIP.

Only preserve selected evidence and source metadata under project documentation.

Do not place PNG contact sheets in `public/`.

They are not runtime assets.

---

# 10. Project documentation destination

Create:

```text
docs/
└── monsterpack10/
    ├── README.md
    ├── QUATERNIUS_LICENSE_AND_SOURCE.md
    ├── IMPORT_REPORT.md
    ├── CONTENT_MAPPING_GUIDE.md
    ├── STAGE_ROSTER_GUIDE.md
    ├── PERFORMANCE_REPORT.md
    ├── MANUAL_TEST_REPORT.md
    │
    ├── source-manifests/
    │   ├── monster_catalog.json
    │   ├── runtime_variants.json
    │   ├── animation_profiles.json
    │   ├── rig_families.json
    │   ├── scale_profiles.json
    │   ├── socket_profiles.json
    │   └── source_inventory.json
    │
    ├── source-reports/
    │   ├── FINAL_DELIVERY_REPORT.md
    │   ├── VALIDATION_REPORT.md
    │   ├── PERFORMANCE_GUIDANCE.md
    │   ├── ROLE_CLASSIFICATION.md
    │   ├── RIG_FAMILY_REPORT.md
    │   ├── ANIMATION_MAPPING_REPORT.md
    │   ├── SCALE_AND_BOUNDS_REPORT.md
    │   └── KNOWN_LIMITATIONS.md
    │
    └── generated/
        ├── IMPORT_OWNERSHIP.json
        ├── IMPORT_SUMMARY.json
        └── NATIVE_CONTENT_INDEX.json
```

Copy:

```text
README.md
→ docs/monsterpack10/README.md

LICENSE_AND_SOURCE.md
→ docs/monsterpack10/QUATERNIUS_LICENSE_AND_SOURCE.md
```

Do not edit copied source manifests to masquerade as native project schemas.

Keep them as immutable import evidence.

Native content is generated separately.

---

# 11. Semantic asset IDs

Use project-supported custom namespaces.

Recommended IDs:

```text
custom.enemy.quaternius.<slug>.hero
custom.enemy.quaternius.<slug>.commonNear
custom.enemy.quaternius.<slug>.commonFar
custom.enemy.quaternius.<slug>.aggregate
```

Examples:

```text
custom.enemy.quaternius.mushnub.hero
custom.enemy.quaternius.mushnub.commonNear
custom.enemy.quaternius.mushnub.commonFar
custom.enemy.quaternius.mushnub.aggregate

custom.enemy.quaternius.dragonEvolved.hero
```

Do not use source filenames as runtime identifiers.

Do not include source suffix hashes in semantic IDs.

Use the standalone catalog slug as canonical input, with deterministic camel-case conversion that preserves uniqueness.

Generate and validate a slug-to-ID map.

---

# 12. Register model assets natively

Update:

```text
content/assets/project.json
```

Register:

```text
45 hero assets
15 common-near assets
15 common-far assets
15 aggregate assets
```

Each entry must include:

```text
id
kind: model
namespace: custom
file
fallbackAssetId
tags
optional
defaultTransform when required by actual schema
sockets when supported
lodRefs when supported
```

Example concept:

```json
{
  "id": "custom.enemy.quaternius.mushnub.commonNear",
  "kind": "model",
  "namespace": "custom",
  "file": "/assets/models/enemies/quaternius/common-near/mushnub.common-near.glb",
  "fallbackAssetId": "enemy.scrapBug",
  "tags": [
    "enemy",
    "quaternius",
    "mushnub",
    "common",
    "skinned",
    "near"
  ],
  "optional": false
}
```

Fallback selection:

```text
small ground/common
→ enemy.scrapBug

bruiser/charger
→ enemy.rammer

ranged/static
→ enemy.gunTower

large special/boss
→ closest safe built-in fallback
```

Fallback choice must not determine gameplay.

It only handles asset failure.

---

# 13. Avoid loading all 45 heroes at startup

Audit how `content/assets/project.json` is preloaded.

If all registered models currently preload indiscriminately, implement stage-selective or requested-asset preloading before registering all 90 as immediately required.

Required outcome:

```text
all 90 assets are registered and resolvable
only assets used by the active roster and required fallbacks are preloaded
unused hero models are not downloaded during initial stage startup
```

Acceptable approaches:

```text
content-derived preload set
stage roster preload list
lazy model load with promise cache
optional asset registration plus explicit preload
```

Preserve synchronous instance creation after the required preload completes.

Do not introduce rendering stalls when an enemy first appears.

Add telemetry:

```text
registered model count
requested preload count
loaded model count
loaded GLB bytes
load duration
cache hits
```

---

# 14. Convert standalone animation manifests

Source:

```text
docs/monsterpack10/source-manifests/animation_profiles.json
```

Generate native files under:

```text
content/enemy-animation-profiles/quaternius/
```

Do not copy the standalone JSON directly into the native folder.

For all 45 hero models:

```text
create one native semantic animation profile
or
reuse a generated family template with per-model exact clip mapping
```

The actual source manifest contains model-specific exact clip mappings.

Preserve them exactly.

Native semantic roles may include:

```text
idle
walk
run
hoverMove
fastHover
attackPrimary
attackSecondary
attackSpecial
hit
stagger
knockback
land
spawn
entrance
death
phaseTransition
recovery
```

Requirements:

```text
rootMotion: false
loop modes correct
one-shots correct
fallback chains valid
no fallback cycles
every mapped clip exists in the corresponding hero/common-near GLB
gameplay never references raw clip names
```

For common-near profiles, validate the reduced clip set.

When a common-near model omits a clip available in hero, use a semantic fallback rather than pointing to a missing clip.

---

# 15. Rig-family reuse

Source:

```text
rig_families.json
```

Use it to reduce duplicated authoring, but do not assume skeleton interchangeability unless the exact compatibility fingerprint confirms it.

Allow:

```text
shared semantic defaults by broad family
per-model exact clip overrides
shared transition defaults
shared locomotion playback defaults
```

Do not attempt runtime animation retargeting in this import task.

Every model uses its own embedded clips.

---

# 16. Native presentation profiles

Generate under:

```text
content/enemy-presentation-profiles/quaternius/
```

## Common profiles

For all 15 common-ready models:

```text
nearModelAssetId
→ commonNear

farModelAssetId
→ commonFar

aggregateModelAssetId
→ aggregate when the local schema supports it

animationProfileId
→ native common animation profile

LOD policy
→ horde/common policy

shadow policy
→ common policy

transform/scale
→ derived from scale profile

sockets
→ derived from socket profile where supported
```

Recommended ID:

```text
enemyPresentation.quaternius.<slug>.common
```

## Hero profiles

For all 45 accepted hero models:

```text
nearModelAssetId
→ hero

animationProfileId
→ native hero animation profile

LOD policy
→ hero/elite default

shadow policy
→ hero/elite default
```

Recommended generic ID:

```text
enemyPresentation.quaternius.<slug>.hero
```

Do not label every hero model as a boss.

The hero profile means full-quality presentation.

Gameplay content later decides:

```text
elite
boss
specialist
```

## Optional role aliases

When useful, generate profile aliases or documented examples:

```text
enemyPresentation.quaternius.dragonEvolved.boss
enemyPresentation.quaternius.blueDemon.elite
```

Avoid duplicating identical definitions unless the project content model benefits from explicit role policies.

---

# 17. Aggregate-model integration

The standalone pack supplies 15 rigid aggregate GLBs.

Audit Coreloop 06 far-sector rendering.

When the existing aggregate renderer can consume a model asset:

```text
add aggregateModelAssetId to presentation content
or
map aggregate asset IDs through the existing sector-archetype contract
```

When the existing aggregate renderer uses only procedural icons/geometry:

```text
extend it backward-compatibly to accept an optional aggregate model asset
preserve the procedural fallback
group sectors by aggregate asset ID
share geometry/material
avoid one mesh per represented enemy
```

Do not instantiate aggregate GLBs as normal individual enemy entities.

Aggregate models represent distant density.

They must not use AnimationMixer.

---

# 18. Common-far integration

Common-far GLBs are rigid and instancing-ready.

Connect them to the existing instanced/pool renderer.

Requirements:

```text
shared geometry per asset ID
shared material per asset ID
one InstancedMesh or bounded group per archetype/material
per-instance transform
deterministic phase
per-instance hit indication when supported
safe pool growth
safe removal
no material clone per enemy
no GLB hierarchy clone per far enemy
```

When the current instanced renderer only consumes procedural geometry, add a generic asset-to-instanced-geometry adapter.

Preserve procedural fallback behavior.

---

# 19. Common-near integration

Common-near models use Animation 07.

Requirements:

```text
safe SkeletonUtils cloning
independent skeletons
independent animation mixers
owned materials for hit flash
semantic state resolution
cross-fades
death lock
one-shot actions
cleanup on demotion/removal/purge
mixer caps
distance hysteresis
boss/elite priority
```

Five or more models may contain multiple primitives despite one material.

Do not reject them solely for that reason.

Measure their real draw cost.

---

# 20. Scale mapping

Source:

```text
scale_profiles.json
```

Use:

```text
normalizedHeight
groundOffset
hoverOffset
recommendedCommonHeight
recommendedEliteHeight
recommendedBossHeight
suggestedCollisionRadius
suggestedCollisionHeight
```

Presentation scale:

```text
belongs in presentation profile or asset transform
```

Gameplay collision:

```text
belongs in enemy gameplay definition
```

Do not automatically change gameplay collision for existing enemy definitions merely because a visual model is larger.

Generate:

```text
docs/monsterpack10/generated/SCALE_MAPPING.json
```

It must record:

```text
source model ID
native asset IDs
presentation transform
recommended collision only
whether flying offset is applied
```

---

# 21. Socket mapping

Source:

```text
socket_profiles.json
```

Use supported project asset or presentation fields for:

```text
center
head
weapon
projectile
hitVfx
deathVfx
shadow
```

Validate that every referenced node exists in every applicable exported GLB.

When the native schema cannot express socket aliases:

```text
add a backward-compatible optional socket mapping field
or
keep the mapping in generated project content consumed by presentation code
```

Do not hardcode per-monster bone names in gameplay systems.

---

# 22. Do not invent 45 monster game designs

This task integrates presentation assets.

It must not invent complete gameplay behavior for all 45 models.

Do not arbitrarily assign:

```text
HP
damage
speed
attack cooldown
AI
XP
drop tables
boss mechanics
wave composition
```

Create only the minimum demonstration content needed to prove integration.

Recommended preview/demo roster:

```text
Common ground:
- Mushnub
- Wizard
- Orc Enemy

Common flying:
- Armabee
- Glub

Elite presentation:
- Blue Demon
- Mushroom King

Boss presentation:
- Dragon Evolved
```

Use existing gameplay enemy definitions or dedicated non-release preview fixtures.

Clearly mark preview fixtures as non-final.

---

# 23. Stage-selective art roster

Create a data-driven art roster category if one does not already exist.

Recommended:

```text
content/enemy-art-rosters/
```

Example:

```ts
interface EnemyArtRosterDefinition {
  id: string;
  commonPresentationProfileIds: string[];
  elitePresentationProfileIds: string[];
  bossPresentationProfileIds: string[];
  preloadAssetIds: string[];
}
```

Create:

```text
enemyArtRoster.quaternius.integrationPreview
```

It should use the recommended preview roster.

Do not activate it in the release mode automatically unless the user’s current local design already calls for these monsters.

Provide one explicit opt-in preview mode/tool.

---

# 24. Preview tool

Extend the Animation 07 enemy animation preview or create a focused integration gallery using production loaders.

Required:

```text
list all 45 models
filter by common-ready
filter by hero-only
select hero/common-near/common-far/aggregate
play semantic animation roles
show exact raw clip mapping
show source and runtime metrics
show scale and sockets
show fallback asset
compare near/far/aggregate
spawn multiple near models
spawn 100/300 far instances
toggle shadows
toggle hit flash
force LOD transitions
show loaded asset count
show mixer count
show draw calls
show triangles
show frame time
```

Do not load all 45 hero models by default.

Load selected models on demand.

---

# 25. Native source index

Generate:

```text
docs/monsterpack10/generated/NATIVE_CONTENT_INDEX.json
```

For every source model:

```ts
interface NativeMonsterPackRecord {
  sourceModelId: string;
  slug: string;

  heroAssetId: string;
  commonNearAssetId?: string;
  commonFarAssetId?: string;
  aggregateAssetId?: string;

  heroAnimationProfileId: string;
  commonAnimationProfileId?: string;

  heroPresentationProfileId: string;
  commonPresentationProfileId?: string;

  scaleMappingId: string;
  socketMappingId: string;

  roleCandidates: string[];
  rigFamilyId: string;

  importedHashes: Record<string, string>;
}
```

This is the authoritative bridge between the standalone pack and native Recoil Crew content.

---

# 26. Validation

Create:

```bash
npm run validate:monsterpack-import
```

It must validate:

## ZIP and import evidence

```text
ZIP exists
wrapper root exists
required source manifests exist
90 runtime GLBs exist
recorded hashes match
```

## Runtime files

```text
all managed destination GLBs exist
destination hashes match
no stale managed GLBs
no accidental ZIP in public
no preview PNG in public
```

## Asset catalog

```text
all 90 semantic IDs are unique
all file paths resolve
all fallbacks resolve
all tags are valid
```

## Animation

```text
all native profile IDs are unique
every clip map resolves against its model
rootMotion is false
fallbacks resolve
no cycles
common-near profiles do not reference stripped clips
```

## Presentation

```text
all near/far/aggregate asset references resolve
animation profiles resolve
LOD policies resolve
shadow policies resolve
scale values are finite
socket nodes resolve
```

## Loading

```text
active roster preload set is sufficient
unused hero models are not required for startup
missing model falls back safely
```

Validation errors must identify:

```text
source model
native ID
path
expected value
actual value
suggested fix
```

---

# 27. Tests

Add focused tests:

```text
tests/monsterpack10/importer.test.ts
tests/monsterpack10/sourceManifestConversion.test.ts
tests/monsterpack10/projectAssetRegistration.test.ts
tests/monsterpack10/animationProfileConversion.test.ts
tests/monsterpack10/presentationProfileConversion.test.ts
tests/monsterpack10/preloadRoster.test.ts
tests/monsterpack10/nearFarAssetResolution.test.ts
tests/monsterpack10/aggregateAssetResolution.test.ts
tests/monsterpack10/missingAssetFallback.test.ts
tests/monsterpack10/cleanup.test.ts
```

Test contracts:

```text
dry run writes nothing
rerun is idempotent
invalid ZIP hash record fails
missing model fails
destination hash matches
all expected counts match
asset IDs deterministic
source suffix names map uniquely
common profiles have near/far/aggregate
hero profiles have hero model
semantic clips resolve
root motion false
preload roster excludes unused heroes
fallback loads
stale managed files are removed safely
unmanaged files are untouched
```

---

# 28. Rendering benchmark

Add:

```bash
npm run test:monsterpack-rendering
```

Benchmark actual browser presentation:

```text
1 hero boss
5 hero elites
10 common-near
25 common-near
50 common-near
25 near + 100 common-far
25 near + 300 common-far
50 near + 300 common-far
500 common-far
aggregate stress
rapid promotion/demotion
rapid spawn/purge
roster unload/reload
```

Measure:

```text
frame p50/p95/p99
CPU presentation time
AnimationMixer time
draw calls
triangles
loaded model count
loaded bytes
live skeletons
live mixers
InstancedMesh groups
far instances
aggregate groups
JS heap trend
cleanup time
```

Do not automatically raise existing population caps.

Report evidence first.

---

# 29. Performance policies

After benchmark, write:

```text
docs/monsterpack10/PERFORMANCE_REPORT.md
```

Select:

```text
recommended near mixer cap
recommended elite/hero cap
recommended far rigid cap
recommended aggregate group cap
recommended preload budget
quality-tier differences
```

Graphics quality may change:

```text
near distance
mixer budget
shadow policy
far swap threshold
aggregate threshold
```

It must not change authoritative:

```text
enemy count
HP
damage
spawn timing
difficulty
```

---

# 30. Manual test

Verify at minimum:

```text
Mushnub common ground
Wizard common ranged appearance
Armabee common flying
Glub common flying
Orc Enemy common brute appearance
Blue Demon hero/elite
Mushroom King hero/elite
Dragon Evolved hero/boss
one high-detail humanoid outlier
one extended flying outlier
```

For each:

```text
load
idle
move
attack
hit
death
hit flash
shadow
near/far transition
far/aggregate transition when applicable
purge cleanup
rematch/reload
```

Verify both Single Player and Multiplayer presentation paths when available.

No bone data may be networked.

---

# 31. Documentation

Create or update:

```text
docs/monsterpack10/README.md
docs/monsterpack10/IMPORT_REPORT.md
docs/monsterpack10/CONTENT_MAPPING_GUIDE.md
docs/monsterpack10/STAGE_ROSTER_GUIDE.md
docs/monsterpack10/PERFORMANCE_REPORT.md
docs/monsterpack10/MANUAL_TEST_REPORT.md
docs/monsterpack10/KNOWN_LIMITATIONS.md

docs/animation07/ANIMATION07_CONTENT_AUTHORING_GUIDE.md
docs/guides/ASSET_GUIDE.md
docs/refractor02/PROJECT_ASSET_AUTHORING_GUIDE.md
docs/guides/SMOKE_TEST.md
docs/planning/BUILD_STATUS.md
```

Document:

```text
where the local ZIP belongs
how to re-import
which files are generated
which files are runtime
how to add a model to a stage roster
how to use hero/common profiles
how to update the ZIP safely
how to validate hashes
how selective preloading works
```

---

# 32. Required commands

Run all applicable commands after implementation:

```bash
npm run import:monsterpack -- --dry-run
npm run import:monsterpack
npm run validate:monsterpack-import

npx tsc --noEmit

npm run generate:presentation-content
npm run generate:content-pack
npm run generate:map-profiles

npm run build
npm test

npm run test:monsterpack-import
npm run test:monsterpack-rendering

npm run test:animation
npm run validate:enemy-animations
npm run test:presentation
npm run test:coreloop
npm run test:horde
npm run test:horde:benchmark
npm run test:netcode
npm run test:demo
npm run test:maplab
```

Run E2E and preview builds when available.

Record actual outputs in `IMPORT_REPORT.md`.

Do not hide failures.

---

# 33. Cleanup and final state

After successful import:

```text
keep local-imports/monsterpack09/ ZIP untouched
delete build/monsterpack10-import/ or leave it ignored and document cleanup
keep final GLBs under public/assets/models/enemies/quaternius/
keep native content under content/
keep source evidence under docs/monsterpack10/
```

The production bundle must not include:

```text
the ZIP
source reports
source manifests
processing scripts
previews
temporary files
Blender files
```

Only `public/` runtime assets are web-served.

---

# 34. Failure policy

Stop and report when:

```text
ZIP count is not 90 runtime GLBs
required manifest is missing
recorded hash does not match
native asset ID collision occurs
a semantic clip map cannot resolve
common-near model fails skeleton cloning
far model contains a skin unexpectedly
aggregate model contains animation unexpectedly
selective preloading cannot be made safe
existing tests regress
```

Do not silently skip a model.

Do not replace a failed model with the wrong GLB.

Fallbacks may keep the game running, but import validation must still report the source failure.

---

# 35. Recommended implementation sequence

```text
M0 — audit current project and baseline
M1 — add ignored local import/staging structure
M2 — build ZIP importer and hash validation
M3 — copy and own runtime GLBs
M4 — archive license/manifests/reports
M5 — generate semantic project asset IDs
M6 — register all runtime assets
M7 — implement/select stage-aware preloading
M8 — convert all hero animation profiles
M9 — convert 15 common animation profiles
M10 — generate hero presentation profiles
M11 — generate common near/far/aggregate profiles
M12 — integrate common-far instancing
M13 — integrate aggregate assets
M14 — add scale/socket mappings
M15 — create preview art roster and gallery
M16 — add validation and unit tests
M17 — run browser rendering benchmark
M18 — tune presentation caps
M19 — documentation and final report
```

Do not combine all tasks into one unreviewable rewrite.

---

# 36. Completion gate

Complete only when all are true:

1. The ZIP location is documented.
2. `local-imports/` is ignored.
3. ZIP extraction uses only ignored staging.
4. The importer is reproducible.
5. Dry run works.
6. Re-import is idempotent.
7. All required source manifests are parsed.
8. All 90 source output hashes validate.
9. Exactly 45 hero GLBs are imported.
10. Exactly 15 common-near GLBs are imported.
11. Exactly 15 common-far GLBs are imported.
12. Exactly 15 aggregate GLBs are imported.
13. No ZIP is inside `public/`.
14. No processing preview is inside `public/`.
15. All 90 native asset IDs resolve.
16. All asset file paths resolve.
17. All fallbacks resolve.
18. All 45 hero animation mappings are native.
19. All 15 common animation mappings are native.
20. Every mapped clip exists.
21. Root motion is false.
22. All 45 hero presentation profiles resolve.
23. All 15 common presentation profiles resolve.
24. Common profiles connect near, far, and aggregate tiers.
25. Common-far assets use the instanced path.
26. Aggregate assets use the far-sector/aggregate path.
27. Hero assets use safe skinned cloning.
28. Hit flash does not leak.
29. LOD transitions do not duplicate models.
30. Demotion cleans mixers.
31. Purge cleans all tiers.
32. Stage-selective preloading is implemented.
33. Unused hero GLBs do not load at startup.
34. Active roster assets preload before spawn.
35. Source manifests remain available under docs.
36. License/provenance is preserved.
37. Scale mappings are recorded.
38. Socket mappings are recorded.
39. Native content index exists.
40. Preview gallery can inspect every model.
41. Browser benchmarks run.
42. Recommended caps are documented.
43. Existing Coreloop 06 behavior remains intact.
44. Existing Animation 07 behavior remains intact.
45. Existing Progression work remains intact.
46. Existing gameplay definitions are not arbitrarily redesigned.
47. Missing custom art still falls back safely.
48. All applicable tests pass.
49. Import report contains actual command outputs.
50. The project is ready for later monster gameplay design without another manual asset-sorting pass.

Final invariant:

> The user only needs to place `Ultimate monster pack - Horde Ready.zip` in `local-imports/monsterpack09/` and run the Codex task. Codex performs the complete native Recoil Crew import, content conversion, selective loading integration, validation, preview, and benchmark work without requiring the user to manually sort or register the 90 processed GLBs.
