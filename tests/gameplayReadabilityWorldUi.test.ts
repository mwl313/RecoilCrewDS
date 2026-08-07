import { describe, expect, it } from 'vitest';
import {
  DamagePopupPool,
  enemyHealthFillRatio,
  isWorldUiProjectionVisible,
  shouldShowEnemyHealthBar,
} from '../src/client/worldUi/enemyWorldUiLayer';
import type { EnemyState } from '../src/shared/types';

const popup = (enemyId: number, source = 'mg', amount = 3) => ({
  enemyId,
  source,
  amount,
  x: 100,
  y: 100,
});

describe('enemy world UI popup pooling', () => {
  it('coalesces rapid MG hits for only the same enemy', () => {
    const pool = new DamagePopupPool();
    pool.add(popup(1), 100);
    pool.add(popup(1, 'mg', 4), 155);
    pool.add(popup(2, 'mg', 5), 158);
    expect(pool.items).toHaveLength(2);
    expect(pool.items[0].amount).toBe(7);
    expect(pool.items[1].amount).toBe(5);
  });

  it('keeps cannon hits separate and expires bounded particles', () => {
    const pool = new DamagePopupPool();
    pool.add(popup(1, 'cannon', 20), 0);
    pool.add(popup(1, 'cannon', 20), 10);
    pool.add(popup(1, 'mg', 2), 100);
    pool.add(popup(1, 'mg', 2), 170);
    expect(pool.items).toHaveLength(4);
    pool.expire(761);
    expect(pool.items).toHaveLength(2);
    expect(pool.items.map((item) => item.source)).toEqual(['cannon', 'mg']);
  });
});

describe('damaged-only enemy health bars', () => {
  const enemy = (partial: Partial<EnemyState>): EnemyState => ({
    id: 1, type: 'scrapBug', x: 0, y: 0, z: 0, yaw: 0,
    hp: 10, maxHp: 10, state: 'hunt', stateT: 0, aimYaw: 0,
    speed: 0, alive: true, telegraph: 0, flash: 0, spawnT: 0,
    ...partial,
  });

  it('hides full-health and dead enemies, and fills damaged bars exactly', () => {
    expect(shouldShowEnemyHealthBar(enemy({ hp: 10 }))).toBe(false);
    expect(shouldShowEnemyHealthBar(enemy({ hp: 0, alive: false }))).toBe(false);
    expect(shouldShowEnemyHealthBar(enemy({ hp: 4 }))).toBe(true);
    expect(enemyHealthFillRatio(enemy({ hp: 4 }))).toBe(.4);
    expect(enemyHealthFillRatio(enemy({ hp: 14 }))).toBe(1);
  });

  it('rejects behind-camera and offscreen projections', () => {
    expect(isWorldUiProjectionVisible(-5, 0, 0, .5)).toBe(true);
    expect(isWorldUiProjectionVisible(2, 0, 0, .5)).toBe(false);
    expect(isWorldUiProjectionVisible(-5, 1.1, 0, .5)).toBe(false);
    expect(isWorldUiProjectionVisible(-5, 0, -1.1, .5)).toBe(false);
  });
});
