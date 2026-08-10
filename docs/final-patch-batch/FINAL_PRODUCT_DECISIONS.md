# Final Patch Batch — Recommended Product Decisions

## Machine Gun

Selected base decision:

```text
Damage: 2 → 3
Spread: 0.018 → 0.012
Recoil: 0.15 → 0.18
Rate: stays 11 rounds/sec
Range: stays 45m
```

Final Machine Gun level-up categories:

```text
MACHINE GUN POWER
MACHINE GUN RANGE
MACHINE GUN FIRE RATE
```

Remove:

```text
MG PRECISION
```

Do not add a new Cannon upgrade.

Do not add Machine Gun velocity or projectile travel. The Machine Gun remains hitscan.

Binding upgrade bands:

| Rarity | Power | Range | Fire Rate |
|---|---:|---:|---:|
| Common | +30–40% | +25–35% | +20–25% |
| Rare | +55–70% | +45–60% | +35–45% |
| Epic | +90–110% | +75–90% | +55–70% |
| Legendary | +150–180% | +120–150% | +85–100% |

Safety caps:

```text
Damage:    5.0× base
Range:     3.0× base
Fire Rate: 2.25× base / 24.75 rounds/sec
```

The values are intentionally much larger than the previous incremental bands so one card is immediately noticeable.
## Ground Pound

Selected formula:

```text
effectiveFall = max(0, fallDistance - 1.5)
damage = 10 * stacks + min(50, effectiveFall * 5)
radius = min(12, 5 + effectiveFall * 0.65)
knockback = min(12, 4 + effectiveFall * 0.75)
```

No fall damage.

## Boundary

Selected direction:

```text
remove gameplay VisualWorldApron
use prop.barrier around authoritative bounds
keep sky/fog
no decorative exterior world
```

## Localization

Selected scope:

```text
English + Korean
language/BGM/SFX settings
Pretendard Variable preferred
no fullscreen in this batch
```

## Phase announcements

Time-boxed optional branch.

It should be merged only if:
- required branches pass;
- localization is complete;
- it does not destabilize final qualification.
