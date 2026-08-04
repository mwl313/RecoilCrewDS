# Progression08 — Content Contract

## Categories (validated through the existing ContentPack pipeline)

```text
progressionDefinitions   progression.*
levelCurves              levelCurve.*
xpPickupDefinitions      xpPickup.*
upgradeRarityTables      rarity.upgrade.*
upgradeCategories        upgrade.*
upgradeFirstExperiences  firstExperience.levelUp.*
treasureRarityTables     rarity.treasure.*
firstTreasureRules       firstExperience.treasure.*
relics                   relic.*
relicPools               relicPool.*
relicEffectTemplates     relicEffect.*
progressionModePolicies  progressionMode.*
```

## Progression definition

Both gameplay modes reference one shared `progression.mainStage`; mode
policies (`progressionMode.multiplayer` / `.singlePlayer`) differ only in
selection execution and the provisional XP multiplier.

## Upgrade categories

18 categories (10 driver + 8 gunner) with exact rarity ranges from
`03-업그레이드-시스템.md`. Stats map to existing stat ids
(`tank.forwardSpeed`, `weapon.cannonCooldown`, etc.).

## Relics

All 28 relics from `05-유물-테이블.md` (Common 7 / Rare 9 / Epic 7 /
Legendary 5) with rarity, role, trigger, effect, numeric values, stack
policy, and duplicate conversion preserved. No Jackpot, truck, Crew Link,
score, currency, or synergy content.

## Provisional tuning

XP values, level thresholds, rarity probabilities, and numeric ranges are
prototype data, documented as such, and fully content-driven.
