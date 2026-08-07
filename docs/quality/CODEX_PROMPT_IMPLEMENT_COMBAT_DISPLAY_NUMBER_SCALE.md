# Codex Prompt — Implement ×10 Combat Display Units Without Changing Gameplay

Repository:

```text
https://github.com/mwl313/RecoilCrewDS
```

Target:

```text
current origin/main
```

Binding design:

```text
docs/quality/COMBAT_DISPLAY_NUMBER_SCALE_DESIGN.md
```

Also read the current UI design system and current gameplay-readability/tactical design if present.

## Mission

Implement a presentation-only combat-number scale:

```text
COMBAT_DISPLAY_SCALE = 10
```

Examples:

```text
internal damage 7  -> display -70
internal damage 10 -> display -100

internal boss HP 850
-> display 8,500
```

Gameplay values remain unchanged.

This is an arcade presentation change, not a balance change.

---

## 1. Audit current main

Before editing:

```bash
git fetch --all --prune
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
```

Inspect at minimum:
- current damage-number implementation or planned `EnemyWorldUiLayer`;
- boss/elite health UI;
- progression reward-card formatting;
- tactical level-up status implementation if already merged;
- relic description formatting;
- `DamageSystem`;
- `EnemyState`;
- progression stat ids/modifier formatting;
- HUD projectors/components;
- tests for damage and boss health.

Do not assume filenames from an older branch if current main moved them.

Record starting SHA.

---

## 2. Create one central display-unit helper

Create one canonical helper in a client-safe/shared presentation location.

Recommended API:

```ts
export const COMBAT_DISPLAY_SCALE = 10;

export function toCombatDisplayValue(value: number): number {
  return Math.round(value * COMBAT_DISPLAY_SCALE);
}

export function formatCombatDisplayValue(value: number): string {
  return formatNumber(toCombatDisplayValue(value));
}

export function formatCombatDamage(value: number): string {
  return `-${formatCombatDisplayValue(Math.abs(value))}`;
}
```

Reuse existing locale/number formatting helpers if present.

Do not scatter `* 10` through multiple components.

---

## 3. Keep all authoritative/internal values unchanged

Do not alter:
- weapon damage;
- cannon/charge damage;
- MG damage;
- enemy HP/maxHP;
- elite/boss HP;
- tank integrity;
- upgrade values;
- relic parameters;
- projectile payload;
- damage falloff;
- splash;
- knockback;
- difficulty;
- enemy scaling;
- XP;
- score.

Snapshots and gameplay events remain in internal units.

Only the final presentation layer converts.

---

## 4. Floating enemy damage numbers

Take the authoritative **actual final enemy HP loss** in internal units and format it through the display helper.

Example:

```text
actualHpLoss = 19
→ "-190"
```

Do not scale a pre-defense/intermediate value.

Do not send `190` from the server if gameplay amount is `19`.

Server/network stays internal:
```text
19
```

Client presentation:
```text
19 -> 190
```

---

## 5. Boss and elite HP

Any raw boss/elite HP number shown to the player uses the scale.

Examples:

```text
623 / 850
→
6,230 / 8,500
```

If the UI shows only total/max:
```text
850 -> 8,500
```

Health-bar fill must still use:

```ts
hp / maxHp
```

from internal authoritative values.

Do not store scaled HP in view models unless the field is explicitly named as display-only.

---

## 6. Absolute upgrade/reward copy

Audit the current upgrade-card formatter.

Absolute raw HP/damage stat additions must use display combat units.

Example:

```text
weapon.cannonDamage add +5
→ "CANNON DAMAGE +50"
```

Percent/multiply remains:

```text
×1.15
→ +15%
```

Do not multiply percentages.

Prefer a stat presentation metadata map:

```ts
statId -> {
  label,
  presentationUnit
}
```

Possible unit types:

```text
combatDamage
combatHp
percent
seconds
meters
speed
plain
```

Do not infer semantics by fragile substring checks in many locations.

---

## 7. Tactical level-up status

If the Tab tactical status overlay is already implemented, use the same stat-presentation mapping.

Example:

```text
internal additive integrity +40
→ display +400
```

Multiplier:

```text
×1.18
→ unchanged
```

If both:
```text
+400 · ×1.18
```

The status display must agree with the original upgrade card.

---

## 8. Relic descriptions

Only scale structured raw HP/damage values.

Do not regex-replace arbitrary numbers in authored strings.

Examples:

```text
structured heal 20 HP
→ display 200 HP
```

```text
25% damage
→ unchanged
```

```text
0.5s cooldown
→ unchanged
```

If current relic descriptions are static strings and cannot safely distinguish units, leave them unchanged in this pass and document the limitation rather than corrupting unrelated numbers.

---

## 9. Damage-number exaggeration by magnitude

In addition to ×10 display units, make larger real hits visually heavier.

Use **internal actual HP loss**, not scaled displayed value, to determine presentation tier.

Centralize classification.

Suggested tiers:

```text
LIGHT
STANDARD
HEAVY
MASSIVE
```

Codex should inspect current MG / cannon / charge damage ranges and choose sensible centralized thresholds.

Suggested visual behavior:

LIGHT:
```text
~18px
start scale ~1.15
rise ~24px
~550–650ms
```

STANDARD:
```text
~22px
start scale ~1.30
rise ~30px
~650–750ms
```

HEAVY:
```text
~27px
start scale ~1.45
rise ~36px
~700–800ms
```

MASSIVE:
```text
~32–36px
start scale ~1.60
rise ~42px
~800–900ms
brief hard impact accent
```

Keep normal enemy damage red.

Do not invent critical-hit mechanics or colors.

The scale should leave visual headroom for upgraded/charged attacks.

---

## 10. Number formatting

Use thousands separators:

```text
8500 -> 8,500
12400 -> 12,400
```

Prefer full boss/elite numbers over `8.5K` when space allows.

Do not format floating damage as decimals.

---

## 11. Surfaces that must NOT scale

Do not apply ×10 to:

- percentages;
- cooldown seconds;
- fire rate;
- movement speed;
- recoil;
- knockback;
- splash radius;
- range;
- XP;
- level;
- score;
- combo;
- timers;
- wave number;
- enemy count;
- rarity odds;
- relic stack count.

Health-bar ratios remain unchanged.

---

## 12. SP/MP parity

Same internal combat value must display the same in:
- Single Player;
- Multiplayer Driver;
- Multiplayer Gunner.

No role-specific display scaling.

---

## 13. Tests

Add focused tests.

Required:

### helper
```text
7 -> 70
10 -> 100
850 -> 8,500 formatted
```

### damage
```text
internal actual loss 19
→ "-190"
```

### boss
```text
623/850 internal
→ 6,230/8,500 displayed
→ bar ratio still 623/850
```

### elite
Same.

### absolute upgrade
```text
+5 internal cannon damage
→ +50 displayed
```

### percentage
```text
×1.15
→ +15%
not +150%
```

### tactical status
```text
+40 internal integrity
→ +400
```

### network
Snapshot/event internal values remain unchanged.

### no double scale
```text
internal 10
→ 100
never 1,000
```

### parity
SP/MP same internal value -> same display.

Existing balance/damage tests should not require new expected gameplay values.

---

## 14. Manual qualification

Verify:
- starting MG hits feel more substantial;
- starting cannon values no longer look like debug numbers;
- charged/upgraded hits animate larger;
- boss/elite HP feels threatening;
- upgrade card absolute numbers match later floating damage units;
- tactical status matches upgrade cards;
- percentages/cooldowns remain correct;
- no value is scaled twice.

---

## 15. Implementation report

Create:

```text
docs/quality/COMBAT_DISPLAY_NUMBER_SCALE_IMPLEMENTATION_REPORT.md
```

Include:
- starting/ending SHA;
- helper location/API;
- surfaces migrated;
- stat-unit metadata added;
- any structured relic-copy limitation;
- magnitude-tier thresholds chosen;
- tests;
- screenshots/browser validation;
- confirmation that gameplay values/network payloads did not change.

---

## 16. Forbidden shortcuts

Do not:
- multiply real damage by 10;
- multiply real HP by 10;
- edit balance/content JSON to fake the display;
- send scaled values through gameplay protocol;
- scatter raw `*10` expressions everywhere;
- scale percentages/cooldowns/XP/score;
- double-scale already formatted values;
- regex-replace arbitrary numbers in descriptions;
- add fake critical-hit behavior;
- change existing difficulty/balance tests to expect ×10 gameplay values.

Definition of done is the full checklist in the binding design document.
