import { describe, expect, it } from 'vitest';
import type { ArenaWorld } from '../../src/shared/sim/arenaWorld';
import { RelicChestSpawnDirector } from '../../src/shared/progression/relicChestSpawnDirector';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { makeMatch, killEnemy } from './helpers';
import { selectArenaSessionFromPack } from '../../src/shared/mapgen/arenaSession';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';

const progression = CLIENT_CONTENT_PACK.getProgressionDefinition('progression.mainStage');
const policy = CLIENT_CONTENT_PACK.getRelicChestSpawnPolicy(progression.relicChestSpawnPolicyId);

function flatWorld(): ArenaWorld {
  return {
    metadata: {
      mapProfileId: 'map.urban400Prototype',
      arenaBaseSeed: 1,
      arenaCandidateSeed: 1,
      arenaAttempt: 0,
      arenaGeneratorVersion: 1,
      arenaChecksum: 1,
      arenaFallbackUsed: false,
    },
    half: 200,
    bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    groundHeightAt: () => 0,
    groundNormalAt: () => ({ nx: 0, ny: 1, nz: 0 }),
    obstacleAt: () => undefined,
    resolveCircleContacts: (x, z) => ({ x, z, contacts: [] }),
    resolveCircle: (x, z) => ({ x, z, hit: false }),
    nearestSpawn: () => ({ x: 0, z: 0 }),
    obstacles: [], barrels: [], ramps: [],
    spawnPoints: [{ x: 0, z: 0 }], bugSpawns: [{ x: -150, z: -150 }], towerSpots: [], truckRoute: [],
    isDriveableAt: () => true,
    isCliffWallAt: () => false,
  };
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function productionMatch(id: string, world = flatWorld()): MatchRuntime {
  return MatchRuntime.fromContentPackWithWorld(
    CLIENT_CONTENT_PACK, id, world, 'none', 'mode.singlePlayerMainStage',
  );
}

describe('relic chest world integration', () => {
  it('loads the settled content-driven drop table and lifecycle timing', () => {
    expect(policy.enemyDropRates).toMatchObject({ ambient: 0.01, wave: 0.02, elite: 0.08, boss: 0 });
    expect(policy.initialMapChestCount).toBe(10);
    expect(policy.spawnAnimationSeconds).toBe(0.5);
    expect(policy.openAnimationSeconds).toBe(0.65);
    expect(policy.relicRevealSeconds).toBe(2);
    expect(policy.despawnAnimationSeconds).toBe(0.45);
  });

  it('places exactly ten deterministic valid map chests with a discovery chest', () => {
    const make = (seed: number) => {
      const random = seeded(seed);
      const director = new RelicChestSpawnDirector(flatWorld(), policy, random, random, random, { attempt() {}, failure() {} });
      return director.initialPlacements({ x: 0, z: 0 });
    };
    const first = make(42);
    const second = make(42);
    expect(first).toEqual(second);
    expect(first).toHaveLength(10);
    expect(first.some((chest) => {
      const distance = Math.hypot(chest.x, chest.z);
      return distance >= 25 && distance <= 55;
    })).toBe(true);
    for (let i = 0; i < first.length; i++) {
      expect(Number.isFinite(first[i].x) && Number.isFinite(first[i].y) && Number.isFinite(first[i].z)).toBe(true);
      for (let j = i + 1; j < first.length; j++) {
        expect(Math.hypot(first[i].x - first[j].x, first[i].z - first[j].z)).toBeGreaterThanOrEqual(28);
      }
    }
  });

  it('starts a real generated production city with exactly ten authoritative growing chests', () => {
    const session = selectArenaSessionFromPack(CLIENT_CONTENT_PACK, {
      roomCode: 'RELIC-CITY', matchIndex: 0, modeId: 'mode.singlePlayerMainStage',
    });
    const match = MatchRuntime.fromContentPackWithWorld(
      CLIENT_CONTENT_PACK, 'relic-city-integration', session.world, 'none', 'mode.singlePlayerMainStage',
    );
    expect(match.state.chests).toHaveLength(10);
    expect(match.state.chests.every((chest) => chest.lifecycle === 'spawning')).toBe(true);
    expect(match.state.chests.some((chest) => {
      const distance = Math.hypot(chest.x - match.state.tank.x, chest.z - match.state.tank.z);
      return distance >= 25 && distance <= 55;
    })).toBe(true);
  });

  it.each([
    ['ambient', 'enemy.quaternius.alien', undefined],
    ['wave', 'enemy.quaternius.alien', 'wave'],
    ['elite', 'enemy.quaternius.demon-high-detail.elite', undefined],
  ] as const)('routes modern %s rewards through its class-aware chest roll', (rewardClass, defId, ownershipClass) => {
    const m = makeMatch('mode.singlePlayerScoreAttack', `modern-${rewardClass}`);
    m.systems.progression.setEnemyChestRandomForTest(() => 0);
    const def = m.systems.enemies.defById(defId)!;
    const enemy = m.systems.enemies.spawnEnemyDef(def, 18, 18, ownershipClass ? {
      populationClass: ownershipClass,
      waveId: 3,
      leaderId: null,
      packInstanceId: 1,
      spawnAnchorId: null,
      purgeOnLeaderDeath: false,
    } : undefined)!;
    killEnemy(m, enemy.id);
    expect(enemy.monster?.rewardClass).toBe(rewardClass);
    expect(m.state.chests.filter((chest) => chest.source === 'enemyDrop')).toHaveLength(1);
    expect(m.systems.progression.telemetry.enemyChestRollsByClass[rewardClass]).toBe(1);
  });

  it('gives a modern leader exactly one guaranteed chest without a random roll', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'modern-leader');
    let rolls = 0;
    m.systems.progression.setEnemyChestRandomForTest(() => { rolls++; return 0; });
    const def = m.systems.enemies.defById('enemy.quaternius.alien')!;
    const enemy = m.systems.enemies.spawnEnemyDef(def, 18, 18, {
      populationClass: 'wave', waveId: 2, leaderId: 1, packInstanceId: 1, spawnAnchorId: null, purgeOnLeaderDeath: true,
    })!;
    enemy.ownership!.leaderId = enemy.id;
    killEnemy(m, enemy.id);
    expect(m.state.chests.filter((chest) => chest.source === 'waveClear')).toHaveLength(1);
    expect(m.state.chests.filter((chest) => chest.source === 'enemyDrop')).toHaveLength(0);
    expect(rolls).toBe(0);
  });

  it('applies boss zero-rate, purge none, and award-once routing', () => {
    const bossMatch = makeMatch('mode.singlePlayerScoreAttack', 'modern-boss');
    bossMatch.systems.progression.setEnemyChestRandomForTest(() => 0);
    const boss = bossMatch.systems.enemies.spawnEnemyDef(
      bossMatch.systems.enemies.defById('enemy.quaternius.alien-high-detail.boss')!, 18, 18,
    )!;
    killEnemy(bossMatch, boss.id);
    expect(bossMatch.state.chests.filter((chest) => chest.source === 'enemyDrop')).toHaveLength(0);

    const purgeMatch = makeMatch('mode.singlePlayerScoreAttack', 'modern-purge');
    const purged = purgeMatch.systems.enemies.spawnEnemyDef(
      purgeMatch.systems.enemies.defById('enemy.quaternius.alien')!, 18, 18,
    )!;
    purgeMatch.systems.enemies.purge((enemy) => enemy.id === purged.id);
    expect(purgeMatch.state.chests.filter((chest) => chest.source === 'enemyDrop')).toHaveLength(0);

    const onceMatch = makeMatch('mode.singlePlayerScoreAttack', 'modern-once');
    onceMatch.systems.progression.setEnemyChestRandomForTest(() => 0);
    const once = onceMatch.systems.enemies.spawnEnemyDef(
      onceMatch.systems.enemies.defById('enemy.quaternius.alien')!, 18, 18,
    )!;
    killEnemy(onceMatch, once.id);
    onceMatch.eventBus.emit('entity.killed', { enemy: once, source: 'test' });
    onceMatch.eventBus.drain();
    expect(onceMatch.state.chests.filter((chest) => chest.source === 'enemyDrop')).toHaveLength(1);
  });

  it('does not advance periodic spawning while progression is paused or burst afterward', () => {
    const m = productionMatch('periodic-pause');
    const initialPeriodic = m.state.chests.filter((chest) => chest.source === 'mapPeriodic').length;
    m.state.matchFlow = 'upgradeSelection';
    m.systems.progression.step(60);
    expect(m.state.chests.filter((chest) => chest.source === 'mapPeriodic')).toHaveLength(initialPeriodic);
    m.state.matchFlow = 'playing';
    m.systems.progression.step(25);
    expect(m.state.chests.filter((chest) => chest.source === 'mapPeriodic').length - initialPeriodic).toBeLessThanOrEqual(1);
  });

  it('honors periodic stealth, active, and per-match caps', () => {
    const activeCap = productionMatch('periodic-active-cap');
    for (let i = 0; i < 12; i++) activeCap.systems.progression.step(25);
    const activeMap = activeCap.state.chests.filter((chest) => chest.source === 'mapStart' || chest.source === 'mapPeriodic');
    expect(activeMap).toHaveLength(14);
    expect(activeMap.filter((chest) => chest.source === 'mapPeriodic').every((chest) => (
      Math.hypot(chest.x - activeCap.state.tank.x, chest.z - activeCap.state.tank.z) >= 35
    ))).toBe(true);

    const totalCap = productionMatch('periodic-total-cap');
    for (let i = 0; i < 20; i++) {
      totalCap.state.chests = totalCap.state.chests.filter((chest) => chest.source === 'enemyDrop');
      totalCap.systems.progression.step(25);
    }
    expect(totalCap.systems.progression.telemetry.periodicMapChestsSpawned).toBe(10);
  });

  it('defers a periodic spawn when no placement is valid', () => {
    const world = flatWorld();
    world.isDriveableAt = () => false;
    const match = productionMatch('periodic-invalid', world);
    match.systems.progression.step(25);
    expect(match.systems.progression.telemetry.periodicMapChestsSpawned).toBe(0);
    expect(match.systems.progression.telemetry.mapSpawnCandidateFailures).toBeGreaterThan(0);
  });

  it('claims only closed nearby chests with nearest then lowest-id tie breaking', () => {
    const match = productionMatch('proximity-order');
    const [lower, higher] = match.state.chests;
    match.state.tank.x = 0;
    match.state.tank.z = 0;
    lower.x = 1;
    lower.z = 0;
    higher.x = -1;
    higher.z = 0;
    lower.lifecycle = 'spawning';
    higher.lifecycle = 'closed';
    match.systems.progression.step(0.01);
    expect(match.state.matchFlow).toBe('relicOpening');
    expect(higher.lifecycle).toBe('opening');
    expect(lower.rewardOffer).toBeUndefined();

    const tie = productionMatch('proximity-tie');
    const [first, second] = tie.state.chests;
    tie.state.tank.x = 0;
    tie.state.tank.z = 0;
    first.x = 1;
    first.z = 0;
    second.x = -1;
    second.z = 0;
    first.lifecycle = 'closed';
    second.lifecycle = 'closed';
    tie.systems.progression.step(0.01);
    expect(first.id).toBeLessThan(second.id);
    expect(first.lifecycle).toBe('opening');
    expect(second.lifecycle).toBe('closed');
  });

  it('claims on the first eligible step when the tank waits inside spawn radius', () => {
    const match = productionMatch('proximity-after-growth');
    const chest = match.state.chests[0];
    match.state.tank.x = chest.x;
    match.state.tank.z = chest.z;
    match.systems.progression.step(0.01);
    expect(chest.lifecycle).toBe('spawning');
    expect(chest.rewardOffer).toBeUndefined();
    match.state.time = chest.claimableAtGameTime;
    match.systems.progression.step(0.01);
    expect(chest.lifecycle).toBe('opening');
    expect(chest.rewardOffer?.candidates).toHaveLength(1);
  });

  it('captures first claim, active peak, and unopened terminal telemetry once', () => {
    const match = productionMatch('telemetry-terminal');
    expect(match.systems.progression.telemetry.initialMapChestsSpawned).toBe(10);
    expect(match.systems.progression.telemetry.activeChestPeak).toBe(10);
    const chest = match.state.chests[0];
    match.state.time = chest.claimableAtGameTime;
    chest.lifecycle = 'closed';
    match.state.tank.x = chest.x;
    match.state.tank.z = chest.z;
    match.systems.progression.step(0.01);
    expect(match.systems.progression.telemetry.chestsClaimed).toBe(1);
    expect(match.systems.progression.telemetry.timeToFirstChestClaim).toBe(chest.claimableAtGameTime);
    match.state.phase = 'results';
    match.systems.progression.step(0.01);
    expect(match.systems.progression.telemetry.unopenedChestsAtEnd).toBe(10);
    match.state.chests.length = 0;
    match.systems.progression.step(0.01);
    expect(match.systems.progression.telemetry.unopenedChestsAtEnd).toBe(10);
  });

  it('roundtrips a test-only three-candidate offer without enabling triple gameplay', () => {
    const offer = {
      offerId: 'test-three', chestId: 77,
      candidates: [
        { relicId: 'relic.magnet_core', rarity: 'common' },
        { relicId: 'relic.heat_sink', rarity: 'rare' },
        { relicId: 'relic.phase_dash', rarity: 'legendary' },
      ],
      selectionMode: 'chooseOne', selectedIndex: null, resolved: false,
    } as const;
    expect(JSON.parse(JSON.stringify(offer))).toEqual(offer);
    const m = makeMatch('mode.singlePlayerScoreAttack', 'single-production-offer');
    const chest = m.systems.progression.spawnChest('mapStart', 10, 10);
    chest.lifecycle = 'closed';
    const production = m.openProgressionChest(chest.id, 1_000)!;
    expect(production.candidates).toHaveLength(1);
    expect(production.selectionMode).toBe('automaticSingle');
  });
});
