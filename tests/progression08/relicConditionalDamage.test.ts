import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy } from './helpers';

function own(m: ReturnType<typeof makeMatch>, relicId: string, stacks = 1): void {
  m.state.teamProgression.relicStacks[relicId] = stacks;
  m.systems.progression.projectionRefresh();
}

describe('relic conditional damage contracts', () => {
  it('FRIENDLY SHIELD reduces real cannon splash and reaches zero at two stacks', () => {
    const m = makeMatch();
    own(m, 'relic.friendly_shield', 1);
    expect(m.systems.progression.modifyTankDamage(10, 'splash')).toBeCloseTo(5);
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBeCloseTo(10);
    own(m, 'relic.friendly_shield', 2);
    expect(m.systems.progression.modifyTankDamage(10, 'splash')).toBe(0);
  });

  it('MOMENTUM SHIELD and IRON WILL reduce instead of increasing damage', () => {
    const momentum = makeMatch();
    own(momentum, 'relic.momentum_shield');
    momentum.state.tank.vx = momentum.rules.resolver.resolve('tank.forwardSpeed');
    expect(momentum.systems.progression.modifyTankDamage(10, 'enemy')).toBeCloseTo(8);

    const iron = makeMatch();
    own(iron, 'relic.iron_will');
    iron.state.tank.integrity = 50;
    expect(iron.systems.progression.modifyTankDamage(10, 'enemy')).toBeCloseTo(8);
    iron.state.tank.integrity = 50.01;
    expect(iron.systems.progression.modifyTankDamage(10, 'enemy')).toBeCloseTo(10);
  });

  it('GLASS CANNON increases both outgoing and incoming damage', () => {
    const m = makeMatch();
    own(m, 'relic.glass_cannon');
    const enemy = spawnEnemy(m);
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBeCloseTo(12);
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBeCloseTo(11.5);
  });

  it('AERIAL MASTER keys off the tank and only buffs gunner weapon sources', () => {
    const m = makeMatch();
    own(m, 'relic.aerial_master');
    const enemy = spawnEnemy(m);
    enemy.impulseGrounded = false;
    m.state.tank.grounded = true;
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBeCloseTo(10);
    m.state.tank.grounded = false;
    enemy.impulseGrounded = true;
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBeCloseTo(13);
    expect(m.systems.progression.modifyEnemyDamage(10, 'cannon', { enemy })).toBeCloseTo(13);
    expect(m.systems.progression.modifyEnemyDamage(10, 'dash', { enemy })).toBeCloseTo(10);
    expect(m.systems.progression.modifyEnemyDamage(10, 'roadkill', { enemy })).toBeCloseTo(10);
    expect(m.systems.progression.modifyEnemyDamage(10, 'relic', { enemy })).toBeCloseTo(10);
  });

  it('APEX PREDATOR recognizes modern elites/bosses and legacy special enemies', () => {
    const m = makeMatch();
    own(m, 'relic.apex_predator');
    const enemy = spawnEnemy(m);
    enemy.monster = {
      spawnLevel: 1, healthMultiplierAtSpawn: 1, damageMultiplierAtSpawn: 1,
      maxHpAtSpawn: enemy.maxHp, resolvedRewardXp: 1, scaledContactDps: 1,
      scaledProjectileDamage: 1, rewardClass: 'elite',
    };
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBeCloseTo(14);
    enemy.monster.rewardClass = 'boss';
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBeCloseTo(14);
    enemy.monster = undefined;
    enemy.ownership = { populationClass: 'special', waveId: null, leaderId: null, packInstanceId: 1, spawnAnchorId: null, purgeOnLeaderDeath: false };
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBeCloseTo(14);
    enemy.ownership.populationClass = 'ambient';
    expect(m.systems.progression.modifyEnemyDamage(10, 'mg', { enemy })).toBeCloseTo(10);
  });

  it('PHASE DASH follows the authoritative dash state, not presentation time', () => {
    const m = makeMatch();
    own(m, 'relic.phase_dash');
    m.state.tank.dashPresentationT = 0;
    m.state.tank.dashState = 'burst';
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(0);
    m.state.tank.dashState = 'recovery';
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(0);
    m.state.tank.dashPresentationT = 10;
    m.state.tank.dashState = 'inactive';
    expect(m.systems.progression.modifyTankDamage(10, 'enemy')).toBe(10);
  });
});
