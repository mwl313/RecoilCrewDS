# Entry point

Read `FINAL_BATCH_RECAP.md` first, then assign each agent only its own workstream design and prompt.

---

# Recoil Crew — Final Patch Parallel Branch and Merge Guide

---

# 1. Branches

| Workstream | Branch | Suggested worktree |
|---|---|---|
| Copy, localization, Settings V2 | `feature/final-localization-settings-copy` | `../RecoilCrewDS-final-localization` |
| Machine Gun overhaul | `feature/final-machine-gun-pass` | `../RecoilCrewDS-final-mg` |
| Landing and Ground Pound | `feature/final-landing-ground-pound` | `../RecoilCrewDS-final-landing` |
| Arena boundary cleanup | `feature/final-arena-boundary` | `../RecoilCrewDS-final-boundary` |
| Optional phase announcements | `feature/final-phase-announcements` | `../RecoilCrewDS-final-announcements` |

All worktrees must begin from the same exact `origin/main` SHA.

---

# 2. Worktree creation

```bash
git fetch origin --prune
BASE_SHA="$(git rev-parse origin/main)"
git status --short
echo "$BASE_SHA"

git worktree add ../RecoilCrewDS-final-localization \
  -b feature/final-localization-settings-copy "$BASE_SHA"

git worktree add ../RecoilCrewDS-final-mg \
  -b feature/final-machine-gun-pass "$BASE_SHA"

git worktree add ../RecoilCrewDS-final-landing \
  -b feature/final-landing-ground-pound "$BASE_SHA"

git worktree add ../RecoilCrewDS-final-boundary \
  -b feature/final-arena-boundary "$BASE_SHA"

git worktree add ../RecoilCrewDS-final-announcements \
  -b feature/final-phase-announcements "$BASE_SHA"
```

Do not run multiple agents in one checkout.

---

# 3. Scope ownership

## Localization branch owns

- localization service and catalogs;
- English copy cleanup;
- Korean translations;
- Korean typography/font integration;
- Settings V2 migration;
- language control;
- BGM/SFX sliders;
- user audio gain nodes;
- localized scene/HUD/content presentation.

It does not own MG mechanics, Ground Pound mechanics, boundary geometry, or phase-banner animation.

## Machine Gun branch owns

- MG base balance;
- MG-specific upgrade-pool changes;
- MG Fire Rate category replacing MG Precision;
- high-impact MG Power/Range/Fire Rate rarity bands;
- explicit prohibition on new Cannon or MG-velocity upgrades;
- MG muzzle/tracer/hit VFX;
- MG fire/hit audio;
- MG camera micro-feedback.

It may add its new localization keys after rebasing onto the localization branch.

## Landing branch owns

- airborne peak/fall-distance tracking;
- landing feedback thresholds;
- Ground Pound damage/radius/knockback formulas;
- Ground Pound shockwave VFX;
- landing/Ground Pound audio and camera impulse.

It may add its Ground Pound copy/localization keys after rebasing.

## Boundary branch owns

- disabling/removing gameplay VisualWorldApron;
- barrier perimeter rendering;
- boundary visual/collider parity;
- fog/edge seam cleanup.

It does not own map generation beyond boundary presentation needs.

## Announcement branch owns

- semantic phase-announcement event/view model;
- centered phase banner;
- announcement procedural impact sound;
- short music duck/camera impulse;
- phase transition timing.

It depends on localization and merges last.

---

# 4. Known overlap

| Pair | Expected conflict | Rule |
|---|---|---|
| Localization ↔ MG | upgrade labels/catalog, AudioManager | Localization infrastructure/user gains win; MG adds domain keys and preserves user gain chain |
| Localization ↔ Landing | Ground Pound copy/catalog, AudioManager | Localization framework wins; Landing adds final mechanic-aware text and its recipe |
| Localization ↔ Announcements | phase strings/catalog | Announcement uses localization service and adds only its keys |
| MG ↔ Landing | `proceduralSoundRecipes`, VFX, event router | Merge MG first; Landing rebases and keeps MG-specific recipe/helpers intact |
| MG ↔ Announcements | audio recipes/router | Announcement merges last and adds isolated recipe/module |
| Landing ↔ Announcements | camera/audio/router | Announcement merges last and preserves landing behavior |
| Boundary ↔ Others | very low | Boundary remains isolated |
| All content branches | manifest/generated pack | regenerate once after source merge |

---

# 5. Recommended merge order

```text
1. feature/final-localization-settings-copy
2. feature/final-arena-boundary
3. feature/final-machine-gun-pass
4. feature/final-landing-ground-pound
5. feature/final-phase-announcements
```

Create:

```bash
git fetch origin --prune
git switch -c integration/final-patch-batch origin/main
```

Before merging each later branch, rebase it onto the integration branch:

```bash
git fetch origin --prune
git rebase integration/final-patch-batch
```

Test in that branch worktree, then merge:

```bash
git switch integration/final-patch-batch
git merge --no-ff feature/<branch>
```

---

# 6. Required integration checks

After all desired branches:

```text
content generation and stale-generated checks
TypeScript
full unit suite
client/server builds
progression tests
weapon tests
audio tests
landing/movement tests
map/boundary tests
localization completeness
Single Player browser flow
two-client Driver/Gunner flow
Korean layout at multiple resolutions
audio slider persistence/cancel
MG sustained-fire soak
high-fall Ground Pound
phase banner transitions
```

---

# 7. Final browser sequence

Verify:

```text
fresh English launch
→ settings
→ switch Korean
→ adjust BGM/SFX
→ save
→ start Single Player
→ MG fire/hits
→ ordinary and upgraded MG
→ jump/fall/landing
→ Ground Pound at several heights
→ map edge and barricades
→ farming/Elite/Boss announcements
→ results
→ reload and confirm settings persistence
```

Repeat core flow with Driver and Gunner clients independently selecting languages.

---

# 8. Reports

Every branch creates an implementation report under its own workstream folder, containing:

- starting and ending SHA;
- files changed;
- exact data values;
- migrations;
- tests and command output;
- screenshots/evidence;
- performance observations;
- known limitations;
- explicit confirmation that excluded work was not added.
