# Progression08 — Content Authoring Guide

## Adding an upgrade category

1. Add `content/upgrade-categories/<id>.json` with `role`, `effects`
   (statId + multiply/add), and `rarityRanges` (percent or flat, never
   both).
2. Register it in `content/manifest.json`.
3. Run `npm run generate:content-pack`.

## Adding a relic

1. Add a `content/relic-effect-templates/<id>.json` only when the effect
   type is new; otherwise reuse an existing template.
2. Add `content/relics/<id>.json` referencing templates with parameters.
3. Add it to the pool in `content/relic-pools/main.json` and the manifest.
4. Unique relics must include `duplicateReplacement`.

## Balance knobs

- XP: `progression-definitions/mainStage.json` `enemyXpRewards`.
- Level curve: `level-curves/mainStagePrototype.json`.
- Rarities: `upgrade-rarity-tables/` and `treasure-rarity-tables/`.
- Magnet: `xp-pickup-definitions/default.json`.
- Mode execution: `progression-mode-policies/`.

All values are provisional; never treat them as final balance.
