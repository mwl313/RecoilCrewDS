import { describe, expect, it } from 'vitest';
import { calculateGroundPound } from '../../src/shared/progression/groundPound';
import { makeMatch, spawnEnemy } from './helpers';

describe('binding Ground Pound formula', () => {
  it('rejects tiny contact and activates exactly at 1.5 m', () => {
    expect(calculateGroundPound(1.49, 1)).toBeNull();
    expect(calculateGroundPound(1.5, 1)).toEqual({
      effectiveFall: 0,
      damage: 10,
      radius: 5,
      knockback: 4,
      stacks: 1,
    });
  });

  it.each([
    { fall: 2.49, damage: 14.95, radius: 5.6435, knockback: 4.7425 },
    { fall: 3, damage: 17.5, radius: 5.975, knockback: 5.125 },
    { fall: 6, damage: 32.5, radius: 7.925, knockback: 7.375 },
    { fall: 10, damage: 52.5, radius: 10.525, knockback: 10.375 },
    { fall: 11.5, damage: 60, radius: 11.5, knockback: 11.5 },
    { fall: 15, damage: 60, radius: 12, knockback: 12 },
    { fall: 20, damage: 60, radius: 12, knockback: 12 },
  ])('maps a $fall m fall to exact damage/radius/knockback', ({ fall, damage, radius, knockback }) => {
    const result = calculateGroundPound(fall, 1)!;
    expect(result.damage).toBeCloseTo(damage, 10);
    expect(result.radius).toBeCloseTo(radius, 10);
    expect(result.knockback).toBeCloseTo(knockback, 10);
  });

  it('adds 10 reliable base damage per stack without multiplying the fall bonus', () => {
    expect(calculateGroundPound(3, 3)?.damage).toBe(37.5);
    expect(calculateGroundPound(20, 4)?.damage).toBe(90);
  });

  it('uses collision-radius-inclusive geometry for ordinary, elite, and boss bodies', () => {
    const m = makeMatch('mode.mainStage', 'ground-pound-geometry');
    m.state.teamProgression.relicStacks['relic.ground_pound'] = 1;
    const t = m.state.tank;
    const defs = [
      'enemy.scrapBug',
      'enemy.quaternius.demon-high-detail.elite',
      'enemy.quaternius.alien-high-detail.boss',
    ];
    const enemies = defs.map((id, index) => {
      const probe = spawnEnemy(m, id, t.x + index + 2, t.z);
      const radius = m.systems.enemies.radiusFor(probe);
      probe.x = t.x + 5 + radius - 0.01;
      return probe;
    });
    m.systems.enemySpatial.rebuild(m.state.enemies);
    const hp = enemies.map((enemy) => enemy.hp);
    m.systems.progression.notifyLanded({ fallDistance: 1.5, impactSpeed: 6, x: t.x, y: t.y, z: t.z });
    enemies.forEach((enemy, index) => expect(hp[index] - enemy.hp).toBe(10));
  });

  it('is authoritative and identical for single-player and multiplayer policies', () => {
    for (const mode of ['mode.singlePlayerMainStage', 'mode.mainStage']) {
      const m = makeMatch(mode, `ground-pound-${mode}`);
      m.state.teamProgression.relicStacks['relic.ground_pound'] = 2;
      const t = m.state.tank;
      const enemy = spawnEnemy(m, 'enemy.scrapBug', t.x + 2, t.z);
      m.systems.enemySpatial.rebuild(m.state.enemies);
      const hp = enemy.hp;
      m.systems.progression.notifyLanded({ fallDistance: 6, impactSpeed: 10, x: t.x, y: t.y, z: t.z });
      expect(hp - enemy.hp).toBe(42.5);
    }
  });
});
