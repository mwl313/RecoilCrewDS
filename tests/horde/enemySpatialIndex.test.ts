import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { createBuiltinBehaviorRegistry } from '../../src/shared/content/behaviorRegistry';
import { EnemySpatialIndex } from '../../src/shared/spatial/enemySpatialIndex';
import { Match } from '../../src/shared/sim/match';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

function enemy(id: number, x: number, z: number, alive = true) {
  return { id, x, z, alive } as never;
}

describe('EnemySpatialIndex (M5)', () => {
  it('queries only nearby enemies by circle, aabb, and ray', () => {
    const index = new EnemySpatialIndex(6);
    const a = enemy(1, 0, 0);
    const b = enemy(2, 5, 0);
    const c = enemy(3, 50, 50);
    index.rebuild([a, b, c]);

    const circle = index.queryCircle(0, 0, 8);
    expect(circle.map((e) => e.id).sort()).toEqual([1, 2]);

    const aabb = index.queryAabb(-2, -2, 7, 2);
    expect(aabb.map((e) => e.id).sort()).toEqual([1, 2]);

    const ray = index.queryRayCells(0, 0, 60, 60);
    expect(ray.map((e) => e.id)).toContain(3);
  });

  it('move and remove keep the index consistent', () => {
    const index = new EnemySpatialIndex(6);
    const a = enemy(1, 0, 0);
    const b = enemy(2, 100, 100);
    index.rebuild([a, b]);
    a.x = 100;
    a.z = 100;
    index.move(a, 0, 0);
    expect(index.queryCircle(100, 100, 8).map((e) => e.id).sort()).toEqual([1, 2]);
    index.remove(a);
    expect(index.queryCircle(100, 100, 8).map((e) => e.id)).toEqual([2]);
  });

  it('rebuild excludes dead enemies', () => {
    const index = new EnemySpatialIndex(6);
    const a = enemy(1, 0, 0);
    const dead = enemy(2, 1, 1, false);
    index.rebuild([a, dead]);
    expect(index.queryCircle(0, 0, 8).map((e) => e.id)).toEqual([1]);
  });

  it('query outputs are reusable scratch arrays', () => {
    const index = new EnemySpatialIndex(6);
    index.rebuild([enemy(1, 0, 0), enemy(2, 0, 3)]);
    const scratch: never[] = [];
    const first = index.queryCircle(0, 0, 4, scratch);
    expect(first).toBe(scratch);
    expect(first.length).toBe(2);
    const second = index.queryCircle(0, 0, 2, scratch);
    expect(second).toBe(scratch);
    expect(second.length).toBe(1);
  });

  it('O(n^2) separation is replaced by registered density steering', () => {
    const behaviors = createBuiltinBehaviorRegistry();
    expect(behaviors.has('movement.separation')).toBe(false);
    expect(behaviors.has('movement.densitySteering')).toBe(true);
    const def = pack.getEnemy('enemy.scrapBug');
    expect(def.behaviors.some((b) => b.id === 'movement.densitySteering')).toBe(true);
    expect(def.behaviors.some((b) => b.id === 'movement.separation')).toBe(false);
  });

  it('the enemy system rebuilds the spatial index every update', () => {
    const m = new Match('spatial-integration', 'none', pack);
    m.spawnEnemy('scrapBug', 5, 5);
    m.spawnEnemy('scrapBug', 6, 5);
    m.step(1 / 30);
    expect(m.runtime.systems.enemySpatial.cellCount).toBeGreaterThan(0);
    expect(m.runtime.systems.enemySpatial.queryCircle(5, 5, 4).length).toBe(2);
  });
});
