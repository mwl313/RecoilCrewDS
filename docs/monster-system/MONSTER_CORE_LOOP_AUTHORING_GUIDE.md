# Monster Core-Loop Authoring Guide

This guide explains how to tune the production monster loop from content
JSON. Simulation never hardcodes the 39 ordinary IDs or the six featured
identities; every change below is data-only unless noted.

## Phase weights (later difficulty)

File: `content/enemy-gameplay-rosters/quaternius.mainStage.json`
(`ordinaryCandidates`).

Each candidate has `phaseWeights: [phase1, phase2, phase3]`. `0` removes
the candidate from that phase; higher values make it more likely. Phase 1
identities may return in Phase 3; consecutive phases never share a slot
identity. Later-phase difficulty comes from these weights plus the level
curve — there is no separate difficulty formula.

## Adding an ordinary candidate

1. Add the enemy definition under `content/enemies/` (validated by
   `enemySchema`).
2. Register the ID in the gameplay roster's `ordinaryCandidates` with a
   slot (`closeFodder` / `rangedFodder` / `specialist`) and phase weights.
3. Ensure a presentation profile and animation profile exist under
   `content/enemy-presentation-profiles/` and
   `content/enemy-animation-profiles/`.
4. Run `npm run generate:content-pack` and
   `npm run generate:presentation-content`.

Validation rejects unknown enemy IDs, duplicate candidates, missing
phase/slot coverage, zero-weight-everywhere candidates, and invalid
weights.

## Wave ratios

`ordinaryMix` (`closeFodder` / `rangedFodder` / `specialist`) must sum to
1. It controls the farming-pack composition alongside the phase weights.

## Setting elite count to 2

In the same roster file, change `featuredWaves[0].eliteCount` (and/or
`featuredWaves[1].eliteCount`) to `2`. The pool has six identities; the
schema requires `featuredIdentities.length >= totalElites + 1` (for the
boss). The HUD automatically shows two stacked elite bars when two elites
are selected — no code change.

## Adding a featured identity

1. Add an `identityId` (e.g. `featuredMonster.dragon`) with
   `eliteEnemyId`, `bossEnemyId`, `label`, and `selectionWeight` to
   `featuredIdentities`.
2. Add (or generate) the two role definitions:
   - Elite role: tier `elite`, tierScale 3, one melee or ranged attack,
     `levelScaling: { health: true, damage: true }`, `rewardClass: elite`.
   - Boss role: tier `boss`, tierScale 5, `attack.type: mixed` with ≥2
     patterns and ≥1 ranged pattern, `levelScaling: { health: true,
     damage: false }`, `rewardClass: boss`.
3. Both IDs must be valid enemy definitions. Cross-role stats are
   centralized in `scripts/generate-monster-roster.ts` for generated
   roles; hand-authored roles live in `content/enemies/`.

## XP visual policy

`content/enemy-xp-rewards/mainStage.json` owns reward classes. On death,
the spawn-locked value is awarded once; visible shard bundles split the
total deterministically (ambient 1 shard, wave 1–2, elite 3–5, boss
6–10). Visual count and XP value are separate — do not spawn one shard
per XP point.

## Encounter bars

The HUD (`content/hud/gameplay.json`) binds two fixed elite rows and one
boss row. The server sends the authoritative `stage.monster.encounters`
list; the projector fills `elite1`/`elite2`/`boss`. `eliteCount: 2` shows
two stacked bars; a dead encounter hides its bar; rematch clears them.
There are no fodder overhead bars.

## Tuning notes

- Farming clock: `pauseCountdownDuringWave: false` in
  `content/horde/stageSequenceProduction.json` keeps 60/120/180 tied to
  simulation time. Demo keeps `true`.
- Boss intro: 4 seconds (constant in `monsterStageView.ts`); the boss
  spawns at bossWave start.
- Preload: `src/shared/monsters/monsterPreload.ts` resolves only the
  selected run's assets. New enemies must have presentation profiles with
  `nearModelAssetId` (and optionally `farModelAssetId` /
  `aggregateModelAssetId`) or they are rejected at preload.
- Preload gate: production rooms wait for client `assetReady` before the
  countdown (protocol 9); the server selects `GAME_MODE` at startup
  (`mode.mainStage` default, `mode.demoScoreAttack` for fixtures).
- The config laboratory is out of scope; these content files are designed
  to remain compatible with a future one.
