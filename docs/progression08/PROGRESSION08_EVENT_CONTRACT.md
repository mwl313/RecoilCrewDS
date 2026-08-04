# Progression08 — Event Contract

## Reward events (internal bus, typed)

```ts
EnemyKilledRewardEvent    { enemyId, enemyDefinitionId, populationClass,
                            waveId?, damageSource }
WaveLeaderKilledRewardEvent { waveId, leaderEnemyId, rewardProfileId }
BossKilledRewardEvent     { bossEnemyId, rewardProfileId }
EnemyPurgedEvent          { enemyId, waveId, reason: 'leaderDeath' }
```

Rules:

- Normal kills → XP shards (+ chest roll chance).
- Wave leader kill → elite XP + guaranteed chest.
- Boss kill → boss XP/clear rewards.
- Purge → no XP, no chest, no kill triggers (telemetry only).

## Progression events

```text
xpCollected, levelGained, upgradeOfferStarted, upgradeSelectionSubmitted,
upgradeOfferResolved, relicOfferStarted, relicOfferResolved,
relicAcquired, progressionCapabilityChanged
```

These are authoritative; clients never generate results.

## Wire contract

- Snapshots replicate `TeamProgressionState`, `MatchFlowState`, active
  selection, relic stacks, capabilities, chests, and XP shard pickups.
- Client selection request: `{ type: 'selectUpgrade', offerId, cardIndex }`.
- Protocol version bumps deliberately; existing action-time aim messages
  remain valid.
