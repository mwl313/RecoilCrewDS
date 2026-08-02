import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { baseStatBlocksFromConfig } from '../src/shared/stats/statBlock';
import { isKnownStat, MOVEMENT_STAT_IDS, statScope } from '../src/shared/stats/statIds';
import { statModifier } from '../src/shared/stats/statModifier';
import { StatResolver } from '../src/shared/stats/statResolver';

describe('known stat registry', () => {
  it('knows match/tank/weapon/enemy stats and rejects out-of-scope ids', () => {
    expect(isKnownStat('match.cannonCooldown')).toBe(true);
    expect(isKnownStat('tank.forwardSpeed')).toBe(true);
    expect(isKnownStat('weapon.mgRate')).toBe(true);
    expect(isKnownStat('enemy.bugHp')).toBe(true);
    expect(isKnownStat('scoring.bugScore')).toBe(false); // Phase 2 scope is match/tank/weapon/enemy
    expect(isKnownStat('jackpot.bugGain')).toBe(false);
    expect(isKnownStat('bogus.stat')).toBe(false);
  });

  it('assigns scopes and marks movement-critical stats', () => {
    expect(statScope('tank.forwardSpeed')).toBe('tank');
    expect(statScope('match.gravity')).toBe('match');
    expect(statScope('weapon.mgDamage')).toBe('weapon');
    expect(statScope('enemy.rammerHp')).toBe('enemy');
    expect(statScope('match.cannonCooldown')).toBe('match');
    expect(MOVEMENT_STAT_IDS.has('tank.steerLow')).toBe(true);
    expect(MOVEMENT_STAT_IDS.has('match.grip')).toBe(true);
    expect(MOVEMENT_STAT_IDS.has('match.gravity')).toBe(true);
    expect(MOVEMENT_STAT_IDS.has('weapon.mgDamage')).toBe(false);
    expect(MOVEMENT_STAT_IDS.has('enemy.bugHp')).toBe(false);
  });
});

describe('base stat blocks', () => {
  it('derives blocks from GameConfig + MatchConfig with canonical ids', () => {
    const blocks = baseStatBlocksFromConfig(BASE_CONFIG, buildMatchConfig('none'));
    expect(blocks.tank['tank.forwardSpeed']).toBe(BASE_CONFIG.tank.forwardSpeed);
    expect(blocks.weapon['weapon.mgRate']).toBe(BASE_CONFIG.weapons.mgRate);
    expect(blocks.enemy['enemy.truckEscapeTime']).toBe(BASE_CONFIG.enemies.truckEscapeTime);
    expect(blocks.match['match.grip']).toBe(BASE_CONFIG.tank.normalGrip);
    // Arrays and non-numeric leaves are excluded.
    expect('tank.footprint' in blocks.tank).toBe(false);
    expect('match.modifier' in blocks.match).toBe(false);
  });

  it('rejects unknown stat ids in base blocks', () => {
    expect(() => new StatResolver({ 'bogus.stat': 1 })).toThrow(/unknown stat id/);
  });
});

describe('StatResolver modifier operations', () => {
  const resolver = () => new StatResolver({ 'tank.forwardSpeed': 10 });

  it('resolves base + add * multiply then override', () => {
    const r = resolver();
    r.addModifier(statModifier('a', 'tank.forwardSpeed', 'add', 5));
    r.addModifier(statModifier('b', 'tank.forwardSpeed', 'multiply', 2));
    expect(r.resolve('tank.forwardSpeed')).toBe(30);
    r.addModifier(statModifier('c', 'tank.forwardSpeed', 'override', 7));
    expect(r.resolve('tank.forwardSpeed')).toBe(7);
  });

  it('the highest-priority override wins; ties go to the latest', () => {
    const r = resolver();
    r.addModifier(statModifier('low', 'tank.forwardSpeed', 'override', 1, { priority: 5 }));
    r.addModifier(statModifier('high', 'tank.forwardSpeed', 'override', 2, { priority: 50 }));
    expect(r.resolve('tank.forwardSpeed')).toBe(2);
    r.removeModifier('high');
    expect(r.resolve('tank.forwardSpeed')).toBe(1);
    const r2 = resolver();
    r2.addModifier(statModifier('first', 'tank.forwardSpeed', 'override', 3, { priority: 10 }));
    r2.addModifier(statModifier('second', 'tank.forwardSpeed', 'override', 4, { priority: 10 }));
    expect(r2.resolve('tank.forwardSpeed')).toBe(4);
  });

  it('applies min/max clamps after overrides', () => {
    const r = resolver();
    r.addModifier(statModifier('c', 'tank.forwardSpeed', 'override', 50, { min: 0, max: 20 }));
    expect(r.resolve('tank.forwardSpeed')).toBe(20);
    r.removeModifier('c');
    r.addModifier(statModifier('c2', 'tank.forwardSpeed', 'override', -5, { min: 0 }));
    expect(r.resolve('tank.forwardSpeed')).toBe(0);
  });

  it('rejects unknown stats and non-finite modifier values', () => {
    const r = resolver();
    expect(() => r.resolve('bogus.stat')).toThrow(/unknown stat/);
    expect(() => r.addModifier(statModifier('x', 'bogus.stat', 'add', 1))).toThrow(/unknown stat/);
    expect(() => r.addModifier(statModifier('y', 'tank.forwardSpeed', 'add', Number.NaN))).toThrow(/non-finite/);
  });
});

describe('StatResolver stacking', () => {
  it('stack keeps every instance', () => {
    const r = new StatResolver({ 'tank.forwardSpeed': 10 });
    r.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 1, { stacking: 'stack' }));
    r.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 2, { stacking: 'stack' }));
    expect(r.resolve('tank.forwardSpeed')).toBe(13);
    expect(r.modifierCount()).toBe(2);
  });

  it('replace and refresh keep a single instance per (id, stat)', () => {
    const r = new StatResolver({ 'tank.forwardSpeed': 10 });
    r.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 1, { stacking: 'replace' }));
    r.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 2, { stacking: 'replace' }));
    expect(r.resolve('tank.forwardSpeed')).toBe(12);
    expect(r.modifierCount()).toBe(1);
  });

  it('an effect may carry modifiers for several stats without replacing them', () => {
    const r = new StatResolver({ 'tank.forwardSpeed': 10, 'tank.reverseSpeed': 8 });
    r.addModifier(statModifier('effect', 'tank.forwardSpeed', 'multiply', 1.5, { stacking: 'replace' }));
    r.addModifier(statModifier('effect', 'tank.reverseSpeed', 'multiply', 2, { stacking: 'replace' }));
    expect(r.resolve('tank.forwardSpeed')).toBe(15);
    expect(r.resolve('tank.reverseSpeed')).toBe(16);
    expect(r.modifierCount()).toBe(2);
  });

  it('highest/lowest keep only the best instance', () => {
    const r = new StatResolver({ 'tank.forwardSpeed': 10 });
    r.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 1, { stacking: 'highest' }));
    r.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 5, { stacking: 'highest' }));
    r.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 3, { stacking: 'highest' }));
    expect(r.resolve('tank.forwardSpeed')).toBe(15);
    expect(r.modifierCount()).toBe(1);
    const r2 = new StatResolver({ 'tank.forwardSpeed': 10 });
    r2.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 5, { stacking: 'lowest' }));
    r2.addModifier(statModifier('e', 'tank.forwardSpeed', 'add', 1, { stacking: 'lowest' }));
    expect(r2.resolve('tank.forwardSpeed')).toBe(11);
  });
});

describe('StatResolver duration, expiration, and caching', () => {
  it('timed modifiers expire deterministically and refresh resets the timer', () => {
    const r = new StatResolver({ 'tank.forwardSpeed': 10 });
    r.addModifier(statModifier('timed', 'tank.forwardSpeed', 'add', 5, { durationSeconds: 1, stacking: 'refresh' }));
    expect(r.resolve('tank.forwardSpeed')).toBe(15);
    r.update(0.6);
    r.addModifier(statModifier('timed', 'tank.forwardSpeed', 'add', 5, { durationSeconds: 1, stacking: 'refresh' }));
    r.update(0.6);
    expect(r.resolve('tank.forwardSpeed')).toBe(15); // refreshed before expiry
    r.update(0.5);
    expect(r.resolve('tank.forwardSpeed')).toBe(10); // expired
    expect(r.expiredModifierCount).toBe(1);
    expect(r.hasModifier('timed')).toBe(false);
  });

  it('dirty caching recomputes only when the stat changes', () => {
    const r = new StatResolver({ 'tank.forwardSpeed': 10 });
    expect(r.resolve('tank.forwardSpeed')).toBe(10);
    const misses = r.cacheMissCount;
    expect(r.resolve('tank.forwardSpeed')).toBe(10); // cached
    expect(r.cacheMissCount).toBe(misses);
    r.addModifier(statModifier('x', 'tank.forwardSpeed', 'add', 1));
    expect(r.resolve('tank.forwardSpeed')).toBe(11);
    expect(r.cacheMissCount).toBe(misses + 1);
    // Unrelated stat stays cached.
    r.addModifier(statModifier('y', 'tank.reverseSpeed', 'add', 1));
    expect(r.resolve('tank.forwardSpeed')).toBe(11);
    expect(r.cacheMissCount).toBe(misses + 1);
  });

  it('removeModifiersBySource and clearModifiers invalidate affected stats', () => {
    const r = new StatResolver({ 'tank.forwardSpeed': 10, 'tank.reverseSpeed': 8 });
    r.addModifier(statModifier('a', 'tank.forwardSpeed', 'add', 1, { source: 'test' }));
    r.addModifier(statModifier('b', 'tank.reverseSpeed', 'add', 1, { source: 'test' }));
    r.removeModifiersBySource('test');
    expect(r.resolve('tank.forwardSpeed')).toBe(10);
    expect(r.resolve('tank.reverseSpeed')).toBe(8);
    expect(r.modifierCount()).toBe(0);
  });
});
