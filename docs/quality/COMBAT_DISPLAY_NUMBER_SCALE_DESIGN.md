# Recoil Crew — Combat Display Number Scale Design
## Exaggerated player-facing HP and damage numbers without changing gameplay balance

**Status:** Binding presentation specification  
**Repository:** `mwl313/RecoilCrewDS`  
**Target:** current `origin/main` at implementation time  
**Scope:** player-facing raw combat-number presentation only  
**Gameplay authority:** unchanged

---

# 0. Core decision

Recoil Crew should display raw HP and damage values at:

```text
COMBAT_DISPLAY_SCALE = 10
```

while preserving the existing internal simulation values exactly.

Example:

```text
Internal cannon damage: 10
Displayed damage:       -100

Internal boss HP:       850
Displayed boss HP:      8,500
```

This is a **presentation scale**, not a balance multiplier.

No gameplay system should ever receive the scaled number back.

---

# 1. Why this change exists

Current low starting damage values such as:

```text
-7
-10
```

read like debug/prototype numbers and under-sell the physical force of:
- a tank cannon;
- machine-gun fire;
- charged cannon shots;
- elite/boss encounters.

The same gameplay values shown as:

```text
-70
-100
```

feel substantially more energetic without introducing balance inflation.

This matches Recoil Crew's increasingly exaggerated arcade presentation:
- large reward roulette;
- strong recoil;
- dramatic impact effects;
- visible build growth.

The purpose is psychological scale and combat readability.

---

# 2. Binding invariant

The simulation always operates in **internal combat units**.

The UI converts to **display combat units** only at the final presentation boundary.

```text
simulation / balance / network authority
                |
                | internal value = 10
                v
         presentation helper
                |
                | ×10
                v
             "100"
```

Never store display-scaled values in:
- `EnemyState.hp`;
- `EnemyState.maxHp`;
- tank integrity;
- weapon damage stats;
- progression modifiers;
- relic parameters;
- projectile payloads;
- snapshots;
- damage events used for gameplay;
- save/reconnect state.

---

# 3. Central helper

Create one shared client-safe presentation helper.

Recommended location:

```text
src/shared/presentation/combatDisplayUnits.ts
```

or the project's nearest existing presentation-utility directory.

Recommended contract:

```ts
export const COMBAT_DISPLAY_SCALE = 10;

export function toCombatDisplayValue(value: number): number {
  return Math.round(value * COMBAT_DISPLAY_SCALE);
}

export function formatCombatDisplayValue(value: number): string {
  return toCombatDisplayValue(value).toLocaleString('en-US');
}

export function formatCombatDamage(value: number): string {
  return `-${formatCombatDisplayValue(Math.abs(value))}`;
}
```

If locale policy already exists, reuse it rather than hardcoding locale behavior.

The important rule is:

```text
one scale constant
one conversion path
no scattered `* 10`
```

---

# 4. What MUST use ×10

Apply the display scale to any player-facing **raw HP/damage number** representing the combat-health economy.

Binding current surfaces:

## 4.1 Floating enemy damage numbers

Internal:
```text
7
10
19
42
```

Displayed:
```text
-70
-100
-190
-420
```

Use the **actual final HP loss** determined by authority, then scale only for display.

Do not scale an intermediate/pre-defense damage request.

---

## 4.2 Boss HP display

If boss UI shows:

```text
current HP
max HP
total HP
```

every raw HP number uses ×10.

Example:

```text
internal:
623 / 850

display:
6,230 / 8,500
```

If the visual only shows max/total HP:

```text
850
→
8,500
```

The actual health bar fill remains:

```text
623 / 850
```

not:

```text
6230 / 8500
```

Both ratios are mathematically equal, but the UI should continue deriving bar fill from authoritative internal values.

---

## 4.3 Elite HP display

Same rule as bosses.

Example:

```text
internal elite:
180 / 240

display:
1,800 / 2,400
```

---

## 4.4 Any future numeric player/enemy HP readout

If the game later numerically displays:
- player integrity;
- ordinary enemy HP;
- summoned unit HP;
- destructible-object HP;

route raw HP through the same helper.

Do not invent these surfaces in this milestone if they do not already exist.

---

## 4.5 Raw healing numbers

If healing numbers are shown now or later:

```text
internal +15 HP
→ display +150
```

This keeps damage and healing in the same displayed unit system.

Do not add healing popups solely because this document mentions them.

---

## 4.6 Absolute damage/HP values in upgrade/relic descriptions

This is necessary for consistency.

If an upgrade says:

```text
CANNON DAMAGE +5
```

but displayed hits increase by:

```text
+50
```

the player sees contradictory units.

Therefore absolute combat-value copy must use display units.

Example:

```text
internal modifier:
weapon.cannonDamage +5

display copy:
CANNON DAMAGE +50
```

Similarly:

```text
internal:
MAX INTEGRITY +20

display:
MAX INTEGRITY +200
```

Only apply this to stats that are semantically raw combat HP/damage values.

Do not multiply percentages.

---

# 5. What MUST NOT use ×10

Do not scale:

```text
HP bar fill ratio
percent damage upgrades
percent HP upgrades
cooldowns
fire rate
movement speed
dash speed
jump force
gravity
recoil
knockback
splash radius
range
charge percentage
XP
level
score
combo
relic stacks
currency
timer values
wave number
enemy count
probabilities
rarity odds
```

Examples:

```text
+15% DAMAGE
stays
+15% DAMAGE
```

```text
2.4s cooldown
stays
2.4s
```

```text
LEVEL 12
stays
LEVEL 12
```

---

# 6. Do not multiply already-derived percentages

If the status overlay says:

```text
CANNON DAMAGE ×1.36
+36%
```

it remains exactly:

```text
×1.36
+36%
```

The ×10 display scale applies to raw combat units, not multiplicative ratios.

---

# 7. Number formatting

Raw displayed combat values should use thousands separators.

Examples:

```text
8500   -> 8,500
12400  -> 12,400
120000 -> 120,000
```

For boss/elite primary HP display, prefer the full number.

Do not abbreviate by default:

```text
8.5K
12.4K
```

unless a specific responsive layout cannot fit the full value.

Seeing the full number contributes to perceived scale.

---

# 8. Floating damage-number visual treatment

The ×10 change should be paired with magnitude-responsive presentation.

The number should not only become numerically larger; physically larger hits should look heavier.

Use the **internal actual HP loss** to choose presentation intensity.

Do not use the already-scaled displayed number as gameplay logic.

Recommended presentation tiers:

```text
LIGHT
STANDARD
HEAVY
MASSIVE
```

Codex should inspect current cannon/MG/charge damage ranges and choose sensible thresholds centrally.

Initial visual targets:

## LIGHT
Typical small MG hit.

```text
font size ~18px
start scale 1.15
rise ~24px
lifetime ~550–650ms
minimal impact
```

## STANDARD
Normal meaningful hit.

```text
font size ~22px
start scale 1.30
rise ~30px
lifetime ~650–750ms
```

## HEAVY
Cannon / strong upgraded hit.

```text
font size ~27px
start scale 1.45
rise ~36px
lifetime ~700–800ms
stronger punch
```

## MASSIVE
Large charged/relic-amplified hit.

```text
font size ~32–36px
start scale 1.60
rise ~42px
lifetime ~800–900ms
brief impact accent
```

Do not make every starting cannon hit gigantic.

The system should leave room for the build to become more impressive.

---

# 9. Magnitude logic

Keep magnitude classification centralized and configurable.

Recommended concept:

```ts
damagePresentationTier(actualInternalHpLoss, damageSource, targetContext)
```

Do not scatter thresholds throughout CSS/DOM code.

The tier is presentation-only.

It must not affect:
- damage;
- stun;
- knockback;
- score;
- crit;
- audio authority.

A reasonable first pass may primarily classify from internal damage amount, with source/context used only to avoid obviously wrong results.

Do not invent a "critical hit" state just because the number is large.

---

# 10. Color semantics

Normal enemy damage remains:

```text
danger red
```

Do not introduce rainbow damage colors merely because the values are larger.

If future gameplay adds real semantic types such as:
- critical;
- armor break;
- elemental damage;

those can receive distinct treatment later.

This milestone should not fabricate semantic categories.

---

# 11. Boss and elite HP presentation

Boss/elite HP should feel substantial but remain readable.

Example:

```text
BOSS
IRON BEHEMOTH

8,500 / 8,500
████████████████████████████
```

or if the UI style uses total only:

```text
HP 8,500
████████████████████████████
```

Use current Recoil Crew HUD typography/grammar.

Do not create a new boss-health style solely for the ×10 conversion if one already exists or is being built in the gameplay-readability milestone.

The conversion should integrate into that component.

---

# 12. Health-bar math remains internal

All bar widths/fills should use internal values directly:

```ts
ratio = hp / maxHp;
```

Never compute:

```ts
displayHp / displayMaxHp
```

unless using it purely for presentation testing.

This avoids unnecessary conversions and makes the architecture explicit.

---

# 13. Damage event contract

The existing gameplay-readability design requires the floating number to use actual final enemy HP loss.

Preserve that.

Recommended:

```text
DamageSystem:
internal actualHpLoss
→ authoritative hit event / presentation payload
→ client receives internal actualHpLoss
→ UI helper ×10
→ rendered number
```

Do not change the network event to send display-scaled damage.

Network/gameplay messages should remain in internal units.

---

# 14. Upgrade card formatting

Audit current reward-card effect formatting.

Any effect whose `statId` is an absolute raw HP/damage stat should display in combat display units.

Example:

```text
operation = add
statId = weapon.cannonDamage
value = 5

display:
CANNON DAMAGE +50
```

For:

```text
operation = multiply
value = 1.15

display:
CANNON DAMAGE +15%
```

unchanged.

Create a stat presentation metadata/helper such as:

```ts
{
  label: 'CANNON DAMAGE',
  unit: 'combatDamage'
}
```

rather than testing arbitrary string fragments everywhere.

---

# 15. Tactical level-up status compatibility

The planned Tab tactical status overlay also shows cumulative level-up modifiers.

It must use the same display-unit mapping.

Examples:

```text
internal additive HP:
+40

display:
MAX INTEGRITY +400
```

But multiplicative:

```text
×1.18
+18%
```

remains unchanged.

If both add and multiply are present:

```text
+400 · ×1.18
```

not:

```text
+40 · ×1.18
```

This keeps reward choice and later status readout consistent.

---

# 16. Relic descriptions

Do not blindly multiply every number found in relic text.

Only multiply values that represent raw combat HP/damage units.

Examples:

Raw healing:
```text
HEAL 20 HP
→
HEAL 200 HP
```

Percent:
```text
+25% DAMAGE
→ unchanged
```

Cooldown:
```text
0.5s
→ unchanged
```

If relic descriptions are authored static strings rather than structured values, do not perform unsafe regex replacement.

Prefer structured content/presentation helpers where available.

---

# 17. Single Player / Multiplayer parity

The display scale is universal.

Same internal value must show the same display number in:
- Single Player;
- Multiplayer Driver;
- Multiplayer Gunner.

No network-specific scaling.

No role-specific scaling.

---

# 18. Balance invariants

The following must remain byte-for-byte/effectively identical where applicable:

```text
weapon internal damage
enemy internal HP
boss internal HP
elite internal HP
tank internal integrity
relic effect values
upgrade modifier values
damage falloff
splash damage
knockback
enemy scaling
difficulty scaling
XP
score
```

Do not rebalance content to compensate for the display scale.

---

# 19. Testing

## Core helper

```text
0 -> 0
7 -> 70
10 -> 100
19.4 -> 194 or rounded according to helper policy
850 -> 8,500 formatted
```

Use one documented rounding rule.

Recommended:
```text
round only after ×10
```

For current mostly integer combat values this should be straightforward.

## Floating damage

```text
internal actual loss 7
→ text "-70"

internal actual loss 19
→ text "-190"
```

## Boss HP

```text
internal 623 / 850
→ displayed 6,230 / 8,500
→ bar ratio remains 623/850
```

## Elite HP

Same parity test.

## Percentage effects

```text
×1.15
→ +15%
```

not:
```text
+150%
```

## Absolute upgrade

```text
internal +5 cannon damage
→ card shows +50
```

## Tactical summary

```text
internal +40 integrity
→ drawer shows +400
```

## Network authority

Snapshot/event internal values remain unscaled.

## SP/MP parity

Same internal state yields same displayed value.

---

# 20. Manual qualification

Verify at minimum:

- MG starting hits no longer read like tiny debug numbers;
- normal cannon starting hit feels substantial;
- Charge Shot creates visibly larger/more impactful damage-number animation;
- boss total HP feels appropriately large;
- elite total HP uses the same scale;
- upgrade cards do not contradict floating damage;
- Tab status overlay does not contradict upgrade cards;
- percentages/cooldowns remain correct;
- no duplicated ×10 scaling occurs.

Especially check for accidental double scaling:

```text
internal 10
should display 100
NOT 1,000
```

---

# 21. Forbidden implementations

Do not:

- multiply actual gameplay damage by 10;
- multiply actual enemy HP by 10;
- modify balance JSON solely for presentation;
- store scaled HP in snapshots;
- send scaled damage events over gameplay protocol;
- sprinkle `* 10` throughout unrelated UI files;
- scale percentages;
- scale cooldowns;
- scale XP;
- scale score;
- abbreviate boss HP by default when full values fit;
- classify large display numbers as critical hits;
- double-scale values that already went through the helper;
- parse arbitrary human description strings with unsafe number replacement.

---

# 22. Definition of done

- [ ] One central `COMBAT_DISPLAY_SCALE = 10` exists.
- [ ] Raw combat HP/damage display routes through the central helper.
- [ ] Internal gameplay values remain unchanged.
- [ ] Floating enemy damage uses ×10.
- [ ] Boss current/max/total HP numeric display uses ×10.
- [ ] Elite current/max/total HP numeric display uses ×10.
- [ ] Health-bar fill ratios remain internal.
- [ ] Absolute HP/damage upgrade copy uses ×10.
- [ ] Percent upgrade copy remains unchanged.
- [ ] Tactical level-up status uses the same unit mapping.
- [ ] Raw healing display uses the same mapping if/when present.
- [ ] Number formatting uses separators.
- [ ] Damage-number animation responds to real internal hit magnitude.
- [ ] Large hits look larger without inventing crit mechanics.
- [ ] SP/MP show identical units.
- [ ] Network/snapshot authority stays in internal values.
- [ ] Tests prevent double scaling.
- [ ] Existing combat balance tests remain unchanged and pass.

Final invariant:

> Recoil Crew still calculates damage and health with the exact same numbers as before, but the player experiences those values in a deliberately larger arcade-facing combat unit system: 10 internal HP/damage units read as 100 on screen.
