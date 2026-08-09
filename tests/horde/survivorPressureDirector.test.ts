import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { isOrdinaryPressure, isPersistentThreat } from '../../src/shared/enemies/enemyClassification';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { Match } from '../../src/shared/sim/match';

const content = loadContentPackFromFilesystem('content');
const DT = 1 / 30;

function makeMatch(id: string): Match {
  const bundle = resolveMapBundle(content, 'map.arena400Primary');
  const fallback = bundle.map.fallbackMapId ? resolveMapBundle(content, bundle.map.fallbackMapId) : bundle;
  const session = selectArenaSession({ roomCode: id.toUpperCase().slice(0, 8), matchIndex: 0, bundle, fallbackBundle: fallback });
  return new Match(id, 'none', content, session.world, 'mode.mainStage');
}

function step(match: Match, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    match.state.tank.integrity = match.runtime.cfg.tank.maxIntegrity;
    match.state.tank.deadT = 0;
    match.step(DT);
    match.state.tank.integrity = match.runtime.cfg.tank.maxIntegrity;
    match.state.tank.deadT = 0;
  }
}

function activeWave(match: Match) {
  const id = match.runtime.systems.horde!.currentWaveId;
  if (id === null) throw new Error('expected active wave');
  const runtime = match.runtime.systems.waves.waves.get(id);
  if (!runtime) throw new Error('missing wave runtime');
  return runtime;
}

function killLeader(match: Match): void {
  const runtime = activeWave(match);
  const leader = match.state.enemies.find((enemy) => enemy.id === runtime.leaderId && enemy.alive);
  if (!leader) throw new Error('missing leader');
  match.runtime.systems.damage.applyEnemy(leader, 99_999_999, 'test');
  match.step(DT);
}

function maintenanceCount(match: Match, waveId: number): number {
  const live = match.state.enemies.filter(
    (enemy) => enemy.alive && enemy.ownership?.waveId === waveId && enemy.ownership.maintenanceSummon,
  ).length;
  return live + [...match.runtime.systems.hordeSectors.sectors.values()].reduce(
    (sum, sector) => sum + (sector.waveId === waveId && sector.maintenanceSummon ? sector.count : 0),
    0,
  );
}

describe('Survivor-style pressure director V1', () => {
  it('keeps ordinary and persistent layers semantic during aggregation', { timeout: 20_000 }, () => {
    const match = makeMatch('layering');
    const systems = match.runtime.systems;
    const tank = match.state.tank;
    const ordinaryDef = systems.enemies.defById(systems.monsterSlots!['selected.phase.closeFodder'])!;
    const eliteDef = systems.enemies.defById(systems.monsterSlots!['selected.wave1.elite0'])!;
    const bossDef = systems.enemies.defById(systems.monsterSlots!['selected.boss'])!;
    const ordinary = systems.enemies.spawnEnemyDef(ordinaryDef, tank.x + 200, tank.z)!;
    const elite = systems.enemies.spawnEnemyDef(eliteDef, tank.x + 202, tank.z, {
      populationClass: 'special', waveId: 1, leaderId: null, packInstanceId: 1,
      spawnAnchorId: null, purgeOnLeaderDeath: false, priority: 1,
    })!;
    elite.ownership!.leaderId = elite.id;
    const boss = systems.enemies.spawnEnemyDef(bossDef, tank.x + 204, tank.z, {
      populationClass: 'boss', waveId: 2, leaderId: null, packInstanceId: 2,
      spawnAnchorId: null, purgeOnLeaderDeath: false, priority: 2,
    })!;
    boss.ownership!.leaderId = boss.id;

    expect(isOrdinaryPressure(ordinary)).toBe(true);
    expect(isPersistentThreat(elite)).toBe(true);
    expect(isPersistentThreat(boss)).toBe(true);
    systems.hordeSectors.update(1, tank.x, tank.z);
    expect(match.state.enemies.some((enemy) => enemy.id === ordinary.id)).toBe(false);
    expect(match.state.enemies.some((enemy) => enemy.id === elite.id)).toBe(true);
    expect(match.state.enemies.some((enemy) => enemy.id === boss.id)).toBe(true);
    expect([...systems.hordeSectors.sectors.values()].reduce((sum, sector) => sum + sector.count, 0)).toBe(1);
  });

  it('moves aggregate sectors and recycles only bounded far/offscreen ordinary pressure without rewards', { timeout: 20_000 }, () => {
    const match = makeMatch('recycle');
    const systems = match.runtime.systems;
    const tank = match.state.tank;
    const def = systems.enemies.defById(systems.monsterSlots!['selected.phase.closeFodder'])!;
    systems.flowField!.forceRefresh(tank.x, tank.z);
    let farPoint: { x: number; z: number } | undefined;
    for (const distance of [175, 185, 195, 205, 220]) {
      for (let sector = 0; sector < 16; sector++) {
        const angle = (sector / 16) * Math.PI * 2;
        const x = tank.x + Math.sin(angle) * distance;
        const z = tank.z + Math.cos(angle) * distance;
        if (!Number.isFinite(systems.flowField!.costAt(x, z))) continue;
        if (systems.world.obstacleAt(x, z, systems.world.groundHeightAt(x, z))) continue;
        farPoint = { x, z };
        break;
      }
      if (farPoint) break;
    }
    expect(farPoint).toBeDefined();
    tank.yaw = Math.atan2(farPoint!.x - tank.x, farPoint!.z - tank.z) + Math.PI;
    expect(systems.spawnPlanner.isOffCamera(farPoint!.x, farPoint!.z)).toBe(true);
    for (let i = 0; i < 32; i++) {
      systems.enemies.spawnEnemyDef(def, farPoint!.x + (i % 4) * 0.4, farPoint!.z + Math.floor(i / 4) * 0.4);
    }
    const score = match.state.stats.score;
    const kills = match.state.stats.kills;
    const xp = match.state.xpShards.length;
    systems.hordeSectors.update(1, tank.x, tank.z);
    const sector = [...systems.hordeSectors.sectors.values()][0];
    const before = { x: sector.centerX, z: sector.centerZ };
    systems.hordeSectors.update(0.7, tank.x, tank.z);
    expect(Math.hypot(sector.centerX - before.x, sector.centerZ - before.z)).toBeGreaterThan(0);
    expect(systems.hordeSectors.movementTelemetry().updateHz).toBeGreaterThanOrEqual(1.5);

    step(match, 3);
    const near = match.state.enemies.filter(
      (enemy) => enemy.alive && isOrdinaryPressure(enemy) && Math.hypot(enemy.x - tank.x, enemy.z - tank.z) <= 70,
    );
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(24);
    expect(match.state.stats.score).toBe(score);
    expect(match.state.stats.kills).toBe(kills);
    expect(match.state.xpShards.length).toBe(xp);
    expect(systems.horde!.densityTelemetry().recycleReason).toMatch(/global_full|no_far/);
  });

  it('plans separated atomic subgroups and refunds only an unspawned reservation slice', { timeout: 20_000 }, () => {
    const match = makeMatch('atomic');
    const systems = match.runtime.systems;
    systems.flowField!.forceRefresh(match.state.tank.x, match.state.tank.z);
    const pack = systems.horde!.resolved.packs.get('pack.production.waveCohort')!;
    const plan = systems.spawnPlanner.planMulti(pack, 'wave', { forceOffCamera: true });
    expect(plan).not.toBeNull();
    expect(plan!.subgroups.map((subgroup) => subgroup.count)).toEqual([3, 3, 2]);
    expect(plan!.subgroups[0].delaySeconds).toBe(0);
    expect(plan!.subgroups[1].delaySeconds).toBeGreaterThanOrEqual(0.12);
    expect(plan!.subgroups[1].delaySeconds).toBeLessThanOrEqual(0.22);
    expect(plan!.subgroups[2].delaySeconds).toBeGreaterThanOrEqual(0.24);
    expect(plan!.subgroups[2].delaySeconds).toBeLessThanOrEqual(0.38);
    for (let i = 0; i < plan!.subgroups.length; i++) {
      for (let j = i + 1; j < plan!.subgroups.length; j++) {
        const delta = Math.abs(plan!.subgroups[i].angularSector - plan!.subgroups[j].angularSector);
        expect(Math.min(delta, 8 - delta)).toBeGreaterThanOrEqual(2);
      }
    }

    const closeId = systems.monsterSlots!['selected.phase.closeFodder'];
    const runtime = systems.waves.openWave({
      definitionId: 'wave.test.atomic', leaderEnemyId: systems.monsterSlots!['selected.wave1.elite0'],
      openingThreat: 1, reinforcementThreat: 12, reinforcementThreatPerSecond: 0,
      maximumActiveWaveThreat: 100, maximumActiveWaveEntities: 40,
    });
    const reservation = systems.waves.reserveCohortPack(runtime.waveId, [{ enemyId: closeId, count: 6 }], 6);
    expect(reservation).not.toBeNull();
    expect(runtime.reservedWaveEntities).toBe(6);
    const first = systems.spawnPlanner.pressurePoint(3, { minDistance: 42, maxDistance: 62, forceOffCamera: true })!;
    expect(systems.waves.spawnReservedCohortSubgroup(
      reservation!, [{ enemyId: closeId, count: 3 }], first.positions, {}, 3,
    )).toBe(true);
    expect(systems.waves.refundReservedCohortSubgroup(reservation!, [{ enemyId: closeId, count: 3 }], 3)).toBe(true);
    expect(runtime.reservedWaveEntities).toBe(0);
    expect(runtime.reinforcementThreatRemaining).toBe(9);
    expect(runtime.activeWaveEntities).toBe(4);
  });

  it('rotates through every configured wave-2 reinforcement pack', { timeout: 30_000 }, () => {
    const match = makeMatch('rotation');
    step(match, 61);
    killLeader(match);
    step(match, 61);
    const horde = match.runtime.systems.horde!;
    expect(match.runtime.systems.stage.state.phase).toBe('wave2');
    horde.reinforcementPackHistory.length = 0;
    step(match, 9);
    expect(new Set(horde.reinforcementPackHistory)).toEqual(new Set([
      'pack.production.mixedFarming',
      'pack.production.waveCohort',
    ]));
  });

  it('recovers a persistent threat as the same fully stateful entity', { timeout: 30_000 }, () => {
    const match = makeMatch('reentry');
    step(match, 61);
    const runtime = activeWave(match);
    const leader = match.state.enemies.find((enemy) => enemy.id === runtime.leaderId)!;
    const tank = match.state.tank;
    leader.x = tank.x + 170;
    leader.z = tank.z;
    leader.hp = leader.maxHp * 0.4;
    leader.state = 'telegraph';
    leader.actionCue = { sequence: 77, actionId: 'enemy.semantic.attack', startedAtTick: 5, durationTicks: 30 };
    leader.rewardResolved = true;
    if (leader.monster) {
      leader.monster.xpAwarded = true;
      leader.monster.chestRewardResolved = true;
    }
    match.runtime.systems.progression.registry.markSpeedDebuff(leader.id, 20, 30, match.state.time);
    const identity = leader.id;
    const hp = leader.hp;
    const maxHp = leader.maxHp;
    const action = structuredClone(leader.actionCue);
    const ownership = structuredClone(leader.ownership);
    const monster = structuredClone(leader.monster);
    const attackSequence = match.runtime.systems.enemies.attackSequenceFor(identity);
    for (let i = 0; i < 9; i++) {
      match.state.time += 1;
      match.runtime.systems.horde!.step(1);
    }
    const recovered = match.state.enemies.find((enemy) => enemy.id === identity);
    expect(recovered).toBe(leader);
    expect(Math.hypot(recovered!.x - tank.x, recovered!.z - tank.z)).toBeLessThanOrEqual(70);
    expect(recovered).toMatchObject({ id: identity, hp, maxHp, state: 'telegraph', rewardResolved: true });
    expect(recovered!.actionCue).toEqual(action);
    expect(recovered!.ownership).toEqual(ownership);
    expect(recovered!.monster).toEqual(monster);
    expect(match.runtime.systems.enemies.attackSequenceFor(identity)).toBe(attackSequence);
    expect(match.runtime.systems.progression.registry.debuffFor(identity, match.state.time).speedPercent).toBe(20);
    expect(match.runtime.systems.horde!.persistentReentries).toBe(1);
  });

  it('maintains bounded leader summons, suppresses every reward route, and purges on leader death', { timeout: 30_000 }, () => {
    const match = makeMatch('summons');
    step(match, 61);
    const runtime = activeWave(match);
    expect(match.runtime.systems.horde!.densityTelemetry()).toMatchObject({
      nearbyTargetMinimum: 35,
      nearbyTargetMaximum: 48,
    });
    step(match, 5);
    expect(maintenanceCount(match, runtime.waveId)).toBe(0);
    step(match, 4);
    expect(maintenanceCount(match, runtime.waveId)).toBeGreaterThanOrEqual(3);
    expect(maintenanceCount(match, runtime.waveId)).toBeLessThanOrEqual(16);
    const summon = match.state.enemies.find(
      (enemy) => enemy.alive && enemy.ownership?.waveId === runtime.waveId && enemy.ownership.maintenanceSummon,
    )!;
    expect(summon.ownership).toMatchObject({
      summonedByLeaderId: runtime.leaderId,
      maintenanceSummon: true,
      rewardSuppressed: true,
      purgeOnLeaderDeath: true,
    });
    const before = {
      score: match.state.stats.score,
      kills: match.state.stats.kills,
      xp: match.state.xpShards.length,
      chests: match.state.chests.length,
    };
    let objectiveKills = 0;
    match.runtime.systems.objective.onObjectiveEvent = (event) => {
      if (event.type === 'kill') objectiveKills++;
    };
    match.runtime.systems.damage.applyEnemy(summon, 99_999_999, 'test');
    expect(match.state.stats.score).toBe(before.score);
    expect(match.state.stats.kills).toBe(before.kills);
    expect(match.state.xpShards.length).toBe(before.xp);
    expect(match.state.chests.length).toBe(before.chests);
    expect(objectiveKills).toBe(0);
    expect(match.runtime.systems.horde!.rewardSuppressedKills).toBeGreaterThan(0);
    expect(match.runtime.systems.progression.telemetry.rewardSuppressedKills).toBeGreaterThan(0);
    killLeader(match);
    expect(maintenanceCount(match, runtime.waveId)).toBe(0);
  });

  it('uses the boss maintenance floor/batch/cap without consuming reward-bearing reserve', { timeout: 20_000 }, () => {
    const match = makeMatch('bosssumm');
    const systems = match.runtime.systems;
    const horde = systems.horde!;
    const boss = horde.resolved.bossWave;
    const runtime = systems.waves.openWave({
      definitionId: boss.id,
      leaderEnemyId: systems.monsterSlots!['selected.boss'],
      openingThreat: boss.openingThreat,
      reinforcementThreat: 0,
      reinforcementThreatPerSecond: 0,
      maximumActiveWaveThreat: boss.maximumActiveWaveThreat,
      maximumActiveWaveEntities: boss.maximumActiveWaveEntities,
      boss: true,
    });
    horde.currentWaveId = runtime.waveId;
    systems.stage.state.phase = 'bossWave';
    systems.flowField!.forceRefresh(match.state.tank.x, match.state.tank.z);
    for (let i = 0; i < 8; i++) {
      match.state.time += 1;
      horde.step(1);
    }
    expect(maintenanceCount(match, runtime.waveId)).toBeGreaterThanOrEqual(5);
    expect(maintenanceCount(match, runtime.waveId)).toBeLessThanOrEqual(24);
    expect(match.state.enemies.filter((enemy) => enemy.ownership?.maintenanceSummon).every(
      (enemy) => enemy.ownership?.rewardSuppressed === true && enemy.ownership.summonedByLeaderId === runtime.leaderId,
    )).toBe(true);
  });

  it('bounds clear-speed replacement income without changing the hard cap', { timeout: 20_000 }, () => {
    const match = makeMatch('clearrate');
    const systems = match.runtime.systems;
    const def = systems.enemies.defById(systems.monsterSlots!['selected.phase.closeFodder'])!;
    const tank = match.state.tank;
    for (let i = 0; i < 25; i++) {
      const enemy = systems.enemies.spawnEnemyDef(def, tank.x + 30 + (i % 5), tank.z + Math.floor(i / 5))!;
      systems.damage.applyEnemy(enemy, 99_999_999, 'test');
    }
    match.state.time += 0.1;
    systems.horde!.step(0.1);
    expect(systems.horde!.clearRateIncomeMultiplier).toBeGreaterThan(1);
    expect(systems.horde!.clearRateIncomeMultiplier).toBeLessThanOrEqual(1.3);
    expect(systems.horde!.resolved.limits.hardEntityCap).toBe(300);

    const slow = makeMatch('slowrate');
    slow.state.time += 0.1;
    slow.runtime.systems.horde!.step(0.1);
    expect(slow.runtime.systems.horde!.clearRateIncomeMultiplier).toBe(0.85);
  });

  it('starts rematch state with no stale sectors, queues, summons, or recovery state', { timeout: 20_000 }, () => {
    const first = makeMatch('reset-a');
    step(first, 61);
    step(first, 9);
    expect(first.runtime.systems.horde!.densityTelemetry().maintenanceSummonCount).toBeGreaterThan(0);
    const rematch = makeMatch('reset-b');
    rematch.step(DT);
    expect(rematch.runtime.systems.horde!.densityTelemetry()).toMatchObject({
      sectorCount: 0,
      pendingSubgroups: 0,
      maintenanceSummonCount: 0,
      rewardSuppressedKills: 0,
      persistentRecoveryStage: {},
      nearbyTargetMinimum: 14,
      nearbyTargetMaximum: 20,
    });
  });
});
