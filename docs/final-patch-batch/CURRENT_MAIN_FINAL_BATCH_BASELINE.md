# Recoil Crew — Final Patch Batch Baseline
## Current-main audit and binding scope

**Repository:** `mwl313/RecoilCrewDS`  
**Observed latest `main` SHA while this package was prepared:** `dd7f10fcba6ea581cfa1aaebd058adf64cc4ee59`  
**Observed latest commit:** `Polish progression and combat feedback`

Every Codex agent must still run `git fetch origin --prune` and record the exact `origin/main` SHA at execution time. Do not assume this observed SHA remains the latest.

---

# 1. Current-main work that is already merged

The previous parallel enemy-pressure package has been integrated into `main`.

Current main already contains, or is expected to contain:

- larger ordinary monster bodies and matching physical dimensions;
- ground-presence rendering for enemies;
- advanced tactical threat-map work;
- mixed Elite/Boss combat and increased featured-threat speed;
- survivor-style pressure-director changes;
- authoritative positive world feedback and stronger tank-damage feedback;
- max-integrity gained-capacity repair;
- integrity fraction presentation;
- tactical TAB/MAP nub;
- dynamic soundtrack and procedural combat audio.

This final batch must **audit and preserve** those systems rather than rebuilding them.

---

# 2. Final-batch workstreams

This package contains five workstreams:

1. **Copy, Korean localization, and Settings V2**
2. **Machine Gun power and presentation overhaul**
3. **Landing and Ground Pound overhaul**
4. **400×400 arena boundary cleanup**
5. **Optional phase announcement banners**

---

# 3. Explicitly excluded

Do not add these unless another user request supersedes this package:

- in-match chat;
- fullscreen settings;
- chest-beacon work;
- another enemy-size or pressure rewrite;
- another Elite/Boss combat rewrite;
- external generic SFX libraries;
- fall damage;
- a decorative world outside the authoritative 400×400 area.

---

# 4. User-provided announcement references

The package includes two user-provided Plants vs. Zombies screenshots under:

```text
docs/final-patch-batch/reference/
```

They are references for:
- impact;
- scale;
- centered composition;
- short dramatic phase messaging.

Do **not** reproduce the original game's exact typography, effects, sounds, wording, or graphic treatment. Translate the principle into Recoil Crew's angular industrial UI grammar.

---

# 5. Font-file rule

This package intentionally contains **no font binaries**.

The localization workstream must add a properly licensed Korean webfont through the repository's normal dependency/asset process and include its license/attribution. Preferred art direction:

```text
Korean:
Pretendard Variable

Fallback:
Noto Sans KR
system sans-serif
```

The agent must source the font legitimately. It must not invent a binary or copy an unlicensed file.

---

# 6. Current Machine Gun baseline to verify

Observed current authored values:

```text
damage:       2
rate:         11 rounds/sec
range:        45m
spread:       0.018
recoil:       0.15
recoil spin:  0.05
```

Observed level-up categories:

```text
MG DAMAGE
MG PRECISION
MG RANGE
```

The final design:
- buffs base MG damage and reliability;
- removes MG PRECISION from the active offer pool;
- replaces Precision with MACHINE GUN FIRE RATE;
- uses exactly MG POWER, MG RANGE, and MG FIRE RATE;
- substantially increases all three rarity bands;
- preserves the Machine Gun as authoritative hitscan;
- adds no Machine Gun velocity stat or projectile;
- adds no new Cannon upgrade category.

---

# 7. Current landing/Ground Pound baseline to verify

Observed current behavior:

- authoritative landing captures downward speed;
- `tankLanding` already exists;
- current client plays light/heavy procedural landing audio;
- Ground Pound uses fixed radius/damage/knockback;
- the Ground Pound trigger does not currently receive fall distance.

The final design adds a true fall-distance tracker, proportional Ground Pound scaling, radius-correct shockwave VFX, and capped landing feedback.

---

# 8. Current world-boundary baseline to verify

Observed current rendering:

```text
RenderWorld
→ SkyEnvironment
→ authoritative ArenaView
→ VisualWorldApron
```

The apron currently generates decorative buildings, props, roads, and skyline geometry outside authoritative bounds.

The final design disables/removes that gameplay apron and uses existing:

```text
prop.barrier
```

along the four authoritative edges.

---

# 9. Current settings baseline to verify

Observed settings storage is V1:

```ts
{
  version: 1,
  nickname: string
}
```

Observed Settings screen contains only nickname editing.

The final Settings V2 adds:
- language;
- BGM volume;
- SFX volume.

Fullscreen is not part of this final batch.

---

# 10. Generated-content policy

Source JSON, schemas, localization catalogs, and generators are authoritative.

Agents may regenerate content for branch testing.

On the integration branch:

1. resolve source conflicts;
2. discard conflicting generated artifacts;
3. run the canonical generation command once;
4. review the regenerated diff;
5. run the complete qualification matrix.

Never manually merge generated hashes or generated content packs.
