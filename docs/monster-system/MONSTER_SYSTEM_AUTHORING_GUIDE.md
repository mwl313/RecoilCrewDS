# Monster System Authoring Guide

## Add or tune a monster

1. Edit the row in `scripts/generate-monster-roster.ts` (or edit the emitted
   `content/enemies/enemy.quaternius.<slug>.json` directly and keep the
   script in sync).
2. Required fields: `type: "monster"`, `tier`, `sizeClass`, `tierScale`,
   `presentationProfileId`, `animationProfileId`, `stats.hp/speed/threat`,
   `rewardClass`, `levelScaling`, `attack`, `behaviors`, `spawnTags`.
3. Ordinary/elite: exactly one `melee` (contactDps) or `ranged` (shotCount 1)
   attack. Boss: `mixed` with ≥2 patterns and ≥1 ranged pattern; boss damage
   is fixed.
4. Regenerate: `npx tsx scripts/generate-monster-roster.ts` then
   `npm run generate:content-pack`.

## Attacks and behavior vocabulary

- Melee: `movement.trackTank`, `movement.densitySteering`,
  `movement.meleeEngagement`, `movement.integrate`, `attack.meleeCue`.
- Ranged: `movement.trackTank` (preferredRange), `movement.densitySteering`,
  `movement.integrate`, `attack.projectileCue`.
- Boss: `movement.trackTank`, `movement.densitySteering`,
  `movement.integrate`, `attack.bossCue`.

No monster-specific AI; variation is data (HP, speed, threat, DPS/damage,
rate, range, projectile, model, size, tier).

## Curves, XP, engagement

- `content/enemy-level-curves/main_stage.json`: interval, level bounds,
  multipliers, boss phase level.
- `content/enemy-xp-rewards/main_stage.json`: per-class base + perLevel.
- `content/melee-engagement-profiles/default.json`: arc spacing and release.

## Presentation

Reference existing `enemyPresentation.quaternius.<slug>.<common|hero>` and
`enemyAnimation.quaternius.<slug>.<common|hero>` profiles; semantic roles
`idle/walk/attackPrimary/death` must resolve. Common families use
near/far/aggregate variants; specialists/elites/bosses use hero. Preload
through `enemyArtRoster.quaternius.mainStage.preloadAssetIds`.
