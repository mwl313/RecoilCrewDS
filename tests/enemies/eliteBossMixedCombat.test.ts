import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { EnemyRuntimeState } from '../../src/shared/enemies/enemyRuntimeState';
import { selectCyclicUsablePattern } from '../../src/shared/monsters/monsterAttack';
import { MatchRuntime } from '../../src/shared/sim/matchRuntime';

const pack = loadContentPackFromFilesystem('content');

const FEATURED = [
  { identity: 'Alien', elite: 'enemy.quaternius.alien-high-detail', boss: 'enemy.quaternius.alien-high-detail.boss', eliteSpeed: 7.2, bossSpeed: 10.2, melee: 'punch', ranged: 'spit', projectile: 'projectile.enemySpitShot', primary: { id: 'punch', damage: 10 / 1.8, rate: 1.8 } },
  { identity: 'Cactoro', elite: 'enemy.quaternius.cactoro-high-detail', boss: 'enemy.quaternius.cactoro-high-detail.boss', eliteSpeed: 5.2, bossSpeed: 8.4, melee: 'slam', ranged: 'needle', projectile: 'projectile.enemySpitShot', primary: { id: 'needle', damage: 16, rate: 0.45 } },
  { identity: 'Fish', elite: 'enemy.quaternius.fish-high-detail', boss: 'enemy.quaternius.fish-high-detail.boss', eliteSpeed: 7.6, bossSpeed: 11.4, melee: 'bite', ranged: 'bubble', projectile: 'projectile.enemyBoneShot', primary: { id: 'bite', damage: 6, rate: 2 } },
  { identity: 'Ninja', elite: 'enemy.quaternius.ninja-high-detail', boss: 'enemy.quaternius.ninja-high-detail.boss', eliteSpeed: 9.2, bossSpeed: 14.4, melee: 'slash', ranged: 'shuriken', projectile: 'projectile.enemyBoneShot', primary: { id: 'slash', damage: 5, rate: 2.2 } },
  { identity: 'Demon', elite: 'enemy.quaternius.demon-high-detail.elite', boss: 'enemy.quaternius.demon-high-detail', eliteSpeed: 6.4, bossSpeed: 9.6, melee: 'punch', ranged: 'fireball', projectile: 'projectile.enemyFireball', primary: { id: 'punch', damage: 11 / 1.9, rate: 1.9 } },
  { identity: 'Yeti', elite: 'enemy.quaternius.yeti-high-detail.elite', boss: 'enemy.quaternius.yeti-high-detail', eliteSpeed: 5.2, bossSpeed: 8.4, melee: 'heavyStrike', ranged: 'iceBolt', projectile: 'projectile.enemyIceBolt', primary: { id: 'iceBolt', damage: 15, rate: 0.5 } },
] as const;

describe('Elite/Boss mixed combat content', () => {
  it.each(FEATURED)('$identity has exact speeds, identity patterns, and preserved Elite primary power', (row) => {
    const elite = pack.getEnemy(row.elite);
    const boss = pack.getEnemy(row.boss);
    if (elite.type !== 'monster' || boss.type !== 'monster') throw new Error('expected monsters');
    expect(elite.tier).toBe('elite');
    expect(boss.tier).toBe('boss');
    expect(elite.stats.speed).toBe(row.eliteSpeed);
    expect(boss.stats.speed).toBe(row.bossSpeed);
    for (const def of [elite, boss]) {
      expect(def.attack.type).toBe('mixed');
      if (def.attack.type !== 'mixed') continue;
      expect(def.attack.patterns.map((pattern) => pattern.id)).toEqual([row.melee, row.ranged]);
      const ranged = def.attack.patterns.find((pattern) => pattern.type === 'ranged');
      expect(ranged?.projectileId).toBe(row.projectile);
    }
    if (elite.attack.type !== 'mixed') throw new Error('expected mixed Elite');
    const primary = elite.attack.patterns.find((pattern) => pattern.id === row.primary.id);
    expect(primary?.damage).toBeCloseTo(row.primary.damage, 10);
    expect(primary?.rate).toBe(row.primary.rate);
  });

  it('selects cyclic preference and scans forward without rewriting order', () => {
    const patterns = ['melee', 'ranged', 'summon'];
    expect(selectCyclicUsablePattern(patterns, 0, (pattern) => pattern === 'ranged')).toBe('ranged');
    expect(selectCyclicUsablePattern(patterns, 2, (pattern) => pattern !== 'summon')).toBe('melee');
    expect(selectCyclicUsablePattern(patterns, 4, () => false)).toBeUndefined();
    expect(patterns).toEqual(['melee', 'ranged', 'summon']);
  });

  it.each(FEATURED.flatMap((row) => [
    { identity: row.identity, tier: 'elite' as const, defId: row.elite },
    { identity: row.identity, tier: 'boss' as const, defId: row.boss },
  ]))('$identity $tier uses ranged fallback with tier-correct events and 3D aim', ({ tier, defId }) => {
    const runtime = MatchRuntime.fromContentPack(pack, `mixed-${defId}`, 'none', 'mode.mainStage');
    runtime.state.tank.y += 4;
    const def = pack.getEnemy(defId);
    if (def.type !== 'monster' || def.attack.type !== 'mixed') throw new Error('expected mixed monster');
    const enemy = runtime.systems.enemies.spawnEnemyDef(
      def,
      runtime.state.tank.x,
      runtime.state.tank.z + 30,
    )!;
    const state = new EnemyRuntimeState();
    state.speed = def.stats.speed;
    state.distToTank = 30;
    const behavior = runtime.systems.enemies.behaviors.require('attack.mixedCue');
    behavior.update(runtime.systems, enemy, state, 1 / 30);
    expect(state.attackRuntime?.patternId).toBe(def.attack.patterns.find((pattern) => pattern.type === 'ranged')?.id);
    runtime.state.time += 10;
    behavior.update(runtime.systems, enemy, state, 1 / 30);
    const events = runtime.takeEvents();
    expect(events.some((event) => event.type === (tier === 'boss' ? 'bossTelegraph' : 'enemyTelegraph'))).toBe(true);
    expect(events.some((event) => event.type === (tier === 'boss' ? 'bossFire' : 'enemyFire'))).toBe(true);
    expect(events.some((event) => event.type === (tier === 'boss' ? 'enemyFire' : 'bossFire'))).toBe(false);
    const shell = runtime.state.shells.find((candidate) => candidate.ownerEnemyId === enemy.id);
    expect(shell).toBeDefined();
    expect(Math.abs(shell?.vy ?? 0)).toBeGreaterThan(0.01);
  });

  it('pursues at full authored speed outside every range without starting a cycle', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'mixed-outside-range', 'none', 'mode.mainStage');
    const def = pack.getEnemy('enemy.quaternius.ninja-high-detail.boss');
    if (def.type !== 'monster') throw new Error('expected monster');
    const enemy = runtime.systems.enemies.spawnEnemyDef(def, runtime.state.tank.x, runtime.state.tank.z + 80)!;
    const state = new EnemyRuntimeState();
    state.speed = def.stats.speed;
    state.distToTank = 80;
    runtime.systems.enemies.behaviors.require('attack.mixedCue').update(runtime.systems, enemy, state, 1 / 30);
    expect(state.speed).toBe(14.4);
    expect(state.attackRuntime).toBeUndefined();
    expect(state.attackSequence).toBe(0);
  });

  it('rejects vertically invalid melee preference and falls back to ranged', () => {
    const runtime = MatchRuntime.fromContentPack(pack, 'mixed-vertical-fallback', 'none', 'mode.mainStage');
    runtime.state.tank.y += 20;
    const def = pack.getEnemy('enemy.quaternius.alien-high-detail');
    if (def.type !== 'monster' || def.attack.type !== 'mixed') throw new Error('expected mixed monster');
    const enemy = runtime.systems.enemies.spawnEnemyDef(def, runtime.state.tank.x + 1, runtime.state.tank.z)!;
    const state = new EnemyRuntimeState();
    state.speed = def.stats.speed;
    state.distToTank = 1;
    runtime.systems.enemies.behaviors.require('attack.mixedCue').update(runtime.systems, enemy, state, 1 / 30);
    expect(state.attackRuntime?.patternId).toBe('spit');
    expect(state.speed).toBe(def.stats.speed);
  });

  it.each([
    { session: 'singlePlayer' as const, modeId: 'mode.singlePlayerScoreAttack' },
    { session: 'multiplayer' as const, modeId: 'mode.mainStage' },
  ])('keeps $session server-authoritative mixed selection', ({ session, modeId }) => {
    const runtime = MatchRuntime.fromContentPack(pack, `authority-${session}`, 'none', modeId);
    expect(runtime.systems.sessionKind).toBe(session);
    const def = pack.getEnemy('enemy.quaternius.yeti-high-detail.elite');
    if (def.type !== 'monster') throw new Error('expected monster');
    const enemy = runtime.systems.enemies.spawnEnemyDef(def, runtime.state.tank.x, runtime.state.tank.z + 30)!;
    const state = new EnemyRuntimeState();
    state.speed = def.stats.speed;
    state.distToTank = 30;
    runtime.systems.enemies.behaviors.require('attack.mixedCue').update(runtime.systems, enemy, state, 1 / 30);
    expect(state.attackRuntime?.patternId).toBe('iceBolt');
    expect(runtime.state.shells).toHaveLength(0);
  });
});
