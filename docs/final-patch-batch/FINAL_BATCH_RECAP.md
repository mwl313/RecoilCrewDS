# Recoil Crew — Final Parallel Patch Batch Recap
## Final accepted scope after all corrections

**Repository:** `mwl313/RecoilCrewDS`  
**Execution model:** five independent feature branches/worktrees, reviewed and merged later  
**Integration authority:** the Director/integration branch, not the individual Codex agents  
**Baseline rule:** every agent must fetch and branch from the same exact current `origin/main` SHA

---

# 1. What is already on `main`

The earlier enemy/pressure batch is already merged or expected to be merged into current `main`, including:

- enlarged/readable ordinary monsters and matching hit geometry;
- stronger Elite/Boss combat and pursuit;
- advanced tactical threat markers;
- survivor-style horde pressure;
- positive integrity/XP feedback;
- stronger damage feedback;
- integrity fraction and gained-capacity repair;
- tactical TAB/MAP nub;
- procedural combat audio and soundtrack systems.

The final batch must audit and preserve these systems. It must not rebuild them.

---

# 2. Final accepted workstreams

| # | Workstream | Branch | Priority |
|---|---|---|---|
| 1 | Copy, Korean localization, Settings V2 | `feature/final-localization-settings-copy` | Required |
| 2 | Machine Gun power, upgrades, VFX, and audio | `feature/final-machine-gun-pass` | Required |
| 3 | Landing and Ground Pound overhaul | `feature/final-landing-ground-pound` | Required |
| 4 | 400×400 arena boundary cleanup | `feature/final-arena-boundary` | Required |
| 5 | Phase announcement banners | `feature/final-phase-announcements` | Optional/time-boxed |

Each workstream folder contains:
- one binding design document;
- one Codex implementation prompt;
- required implementation-report path;
- tests, exclusions, and browser qualification.

---

# 3. Workstream 1 — Copy, Korean Localization, and Settings V2

## User-facing copy cleanup

Clean and standardize:

```text
relic names and descriptions
upgrade names and effect copy
ordinary/Elite/Boss names
menus
lobby
HUD
warnings
pause/results
errors
tactical UI
objectives/modifiers
```

Remove player-facing technical language such as:

```text
High Detail
.hero
.common
internal stat IDs
clamp 0
two stacks: 0
```

Use `repair` for tank integrity and keep structured numeric formatting truthful.

## Korean localization

Implement:
- English and Korean catalogs;
- stable localization keys;
- runtime language switching;
- English fallback;
- local client language independence in Multiplayer;
- Korean-aware line breaking and typography;
- complete translation validation.

Preferred Korean font direction:

```text
Pretendard Variable
Noto Sans KR fallback
```

No font binary is included in this package. Codex must integrate a legitimately licensed webfont and its attribution through the repository's normal asset/dependency process.

## Settings V2

Migrate nickname-only V1 settings to:

```ts
{
  version: 2,
  nickname: string,
  locale: 'en' | 'ko',
  bgmVolume: number,
  sfxVolume: number
}
```

Add:
- English / 한국어 selector;
- BGM slider;
- SFX slider;
- live preview;
- Save persistence;
- Cancel rollback;
- dedicated user gain nodes that do not fight soundtrack context filtering or reward ducking.

Final accepted scope does not include fullscreen or in-match chat.

---

# 4. Workstream 2 — Machine Gun overhaul

## Hitscan rule

The Machine Gun remains authoritative hitscan:

```text
accepted shot
→ immediate ray/segment query
→ immediate authoritative damage
→ cosmetic tracer afterward
```

Do not add:
- MG bullet velocity;
- MG projectile speed;
- networked MG bullets;
- a new Cannon upgrade category.

## Base MG changes

```text
Damage:  2 → 3
Spread:  0.018 → 0.012
Recoil:  0.15 → 0.18

Base fire rate:
stays 11 rounds/sec

Base range:
stays 45m
```

## Final MG upgrade pool

Exactly:

```text
MACHINE GUN POWER
MACHINE GUN RANGE
MACHINE GUN FIRE RATE
```

Remove:

```text
MG PRECISION
```

Precision is replaced directly by Fire Rate. It is not replaced by a Cannon upgrade.

## Final large rarity bands

| Rarity | Power | Range | Fire Rate |
|---|---:|---:|---:|
| Common | **+30–40%** | **+25–35%** | **+20–25%** |
| Rare | **+55–70%** | **+45–60%** | **+35–45%** |
| Epic | **+90–110%** | **+75–90%** | **+55–70%** |
| Legendary | **+150–180%** | **+120–150%** | **+85–100%** |

Central safety caps:

```text
MG damage:    maximum 5.0× base
MG range:     maximum 3.0× base
MG fire rate: maximum 2.25× base / 24.75 rounds/sec
```

## Presentation

Strengthen:
- every-shot muzzle flash;
- sparks;
- thick pooled tracer core/glow;
- hit sparks and impact flash;
- procedural firing and impact sound;
- tiny coalesced camera vibration;
- high-rate pool/audio/network qualification;
- first-shot prediction and duplicate suppression.

---

# 5. Workstream 3 — Landing and Ground Pound

## Fall measurement

Track true fall distance:

```text
highest authoritative Y while airborne
-
landing Y
=
fallDistance
```

Use it for presentation and Ground Pound. Do not add fall damage.

## Landing feedback thresholds

```text
below 2.5m:
no dedicated heavy response

2.5–5.5m:
light landing

5.5–10m:
heavy landing

10m+:
massive landing presentation
```

Add:
- proportional landing shake;
- landing sound;
- capped visual feedback;
- reduced-motion behavior.

## Ground Pound formula

```text
effectiveFall = max(0, fallDistance - 1.5)

damage =
  10 * stacks
  + min(50, effectiveFall * 5)

radius =
  min(12, 5 + effectiveFall * 0.65)

knockback =
  min(12, 4 + effectiveFall * 0.75)
```

The effect:
- gains damage from fall distance;
- gains radius from fall distance;
- gains knockback from fall distance;
- has caps;
- creates a radius-accurate ground shockwave;
- does not merely scale to the tank's body size;
- coordinates landing and Ground Pound feedback without double-playing two full impacts.

---

# 6. Workstream 4 — Arena boundary cleanup

The authoritative playable world remains:

```text
400 × 400
```

Remove or disable the decorative `VisualWorldApron` and its non-authoritative exterior:

```text
outside buildings
outside roads
outside props
outside skyline boxes
```

Keep:
- sky;
- fog;
- authoritative map.

Use the existing barricade/barrier asset to line all four map edges.

Requirements:
- model-AABB-based segment spacing;
- small overlap to prevent gaps;
- corner coverage;
- terrain alignment;
- instanced rendering;
- visual/collider parity;
- no spawn/recovery positions beyond the perimeter;
- no substitute decorative exterior world.

---

# 7. Workstream 5 — Optional phase announcements

Use the supplied Plants vs. Zombies screenshots only as composition/impact references.

Announcements:

```text
SLAY MONSTERS TO PREPARE FOR THE WAVE

ELITE MONSTER WAVE INCOMING

THE FINAL WAVE IS INCOMING
```

Recommended Korean:

```text
몬스터를 처치해 웨이브에 대비하라!

정예 몬스터 웨이브 접근 중!

최종 웨이브 접근 중!
```

Presentation:
- very large centered text;
- strong dark outline;
- warning-red/crimson treatment;
- angular Recoil Crew brackets/construction accents;
- slam/zoom entrance;
- short hold;
- quick exit;
- no gameplay pause;
- no pointer/input interception;
- localized responsive layout;
- reduced-motion support.

Sound:
- original procedural THUMP/CRACK/RUMBLE/AIR impact;
- no copied or bundled vine-boom sample;
- short BGM duck;
- no track restart or transition.

This branch is optional and merges only if all required workstreams are stable.

---

# 8. Explicit exclusions

This final pack does not include:

```text
in-match chat
fullscreen setting
chest-beacon work
new Cannon upgrades
MG velocity/projectile upgrades
another monster-size/Elite/Boss/pressure rewrite
external generic SFX libraries
fall damage
a new decorative world outside 400×400
```

---

# 9. Parallel workflow

Use separate worktrees. Never run two agents in one checkout.

```bash
git fetch origin --prune
BASE_SHA="$(git rev-parse origin/main)"
git status --short
echo "$BASE_SHA"
```

Create the five branches using the commands in:

```text
FINAL_PARALLEL_BRANCH_AND_MERGE_GUIDE.md
```

Every agent:
1. records the same starting SHA;
2. changes only its owned scope;
3. writes its implementation report;
4. runs focused and full tests;
5. does not merge itself into `main`.

---

# 10. Recommended merge order

```text
1. Localization / Settings
2. Arena Boundary
3. Machine Gun
4. Landing / Ground Pound
5. Phase Announcements (optional)
```

Before each later merge:
- rebase onto the integration branch;
- resolve source conflicts;
- preserve earlier workstream authority;
- run tests in the feature branch;
- merge with `--no-ff`.

After source merges:
- regenerate generated content once;
- review the regenerated diff;
- run complete Single Player and two-client qualification.

---

# 11. Final acceptance flow

```text
English launch
→ Settings
→ Korean switch
→ BGM/SFX preview, Save, Cancel
→ Single Player
→ base MG
→ Power/Range/Fire Rate upgrades
→ high-rate MG soak
→ light/heavy/massive landing
→ Ground Pound at several fall distances
→ inspect all four barricaded edges
→ phase announcements if optional branch is merged
→ results/reload/settings persistence
```

Repeat the core combat flow with:
- Driver client;
- Gunner client;
- independent client languages;
- dense Phase 3 / Wave 2.
