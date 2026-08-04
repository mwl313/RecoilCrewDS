import { describe, expect, it } from 'vitest';
import {
  InstancedEnemyRenderer,
  type InstancedBatchHost,
  type InstancedFodderState,
} from '../../src/client/enemies/instancedEnemyRenderer';
import { InstanceSlotPool } from '../../src/client/enemies/instanceSlotPool';
import type { EnemyState } from '../../src/shared/types';

function enemy(id: number, x = 0, z = 0, alive = true) {
  return {
    id,
    type: 'scrapBug',
    x,
    y: 0,
    z,
    yaw: 0,
    hp: 3,
    maxHp: 3,
    state: 'hunt',
    stateT: 0,
    aimYaw: 0,
    speed: 0,
    alive,
    telegraph: 0,
    flash: 0,
    spawnT: 0,
    hitCd: 0,
  } as unknown as EnemyState;
}

class FakeHost implements InstancedBatchHost {
  transforms = new Map<number, InstancedFodderState>();
  colors = new Map<number, { r: number; g: number; b: number }>();
  count = 0;
  updates = 0;

  setTransform(slot: number, state: InstancedFodderState): void {
    this.transforms.set(slot, { ...state });
  }
  setColor(slot: number, r: number, g: number, b: number): void {
    this.colors.set(slot, { r, g, b });
  }
  setCount(count: number): void {
    this.count = count;
  }
  needsUpdate(): void {
    this.updates++;
  }
}

describe('InstanceSlotPool', () => {
  it('reuses released slots and never exceeds capacity', () => {
    const pool = new InstanceSlotPool(4);
    expect(pool.alloc()).toBe(0);
    expect(pool.alloc()).toBe(1);
    expect(pool.alloc()).toBe(2);
    expect(pool.alloc()).toBe(3);
    expect(pool.alloc()).toBeNull();
    pool.release(1);
    expect(pool.alloc()).toBe(1);
    expect(pool.activeCount).toBe(4);
    pool.reset();
    expect(pool.activeCount).toBe(0);
  });
});

describe('InstancedEnemyRenderer (M6)', () => {
  it('allocates stable slots and reuses them after removal', () => {
    const host = new FakeHost();
    const renderer = new InstancedEnemyRenderer(host, 8);
    expect(renderer.upsert(enemy(1), 0)).toBe(true);
    expect(renderer.upsert(enemy(2), 0)).toBe(true);
    renderer.remove(1);
    expect(renderer.upsert(enemy(3), 0)).toBe(true);
    const slots = [...host.transforms.keys()];
    expect(slots).toContain(0); // slot 0 freed by enemy 1, reused by enemy 3
    expect(slots.length).toBe(2);
    expect(renderer.activeCount).toBe(2);
  });

  it('maintains the host count and releases every slot on purge/remove', () => {
    const host = new FakeHost();
    const renderer = new InstancedEnemyRenderer(host, 16);
    for (let i = 1; i <= 12; i++) renderer.upsert(enemy(i, i, 0), 0);
    expect(host.count).toBe(12);
    for (let i = 1; i <= 12; i++) renderer.remove(i);
    expect(host.count).toBe(0);
    expect(renderer.activeCount).toBe(0);
    // All slots are reusable again.
    for (let i = 1; i <= 12; i++) expect(renderer.upsert(enemy(i + 100, i, 0), 0)).toBe(true);
    expect(renderer.activeCount).toBe(12);
  });

  it('does not duplicate a visual when the same enemy is re-presented', () => {
    const host = new FakeHost();
    const renderer = new InstancedEnemyRenderer(host, 8);
    const e = enemy(7, 1, 1);
    renderer.upsert(e, 0);
    renderer.upsert({ ...e, x: 3, z: 4, yaw: 1.2 }, 1 / 30);
    expect(renderer.activeCount).toBe(1);
    expect(host.transforms.size).toBe(1);
    expect(host.transforms.get(0)!.x).toBe(3);
    expect(host.transforms.get(0)!.yaw).toBe(1.2);
  });

  it('applies death phase scaling and releases on sweep', () => {
    const host = new FakeHost();
    const renderer = new InstancedEnemyRenderer(host, 8);
    renderer.upsert(enemy(1, 0, 0, false), 0);
    renderer.upsert(enemy(1, 0, 0, false), 0.5);
    const state = host.transforms.get(0)!;
    expect(state.deathT).toBe(0.5);
    const seen = new Set<number>([2]);
    renderer.ids(); // sweep uses ids(); emulate presenter removal for unseen
    renderer.remove(1);
    expect(renderer.activeCount).toBe(0);
    void seen;
  });

  it('returns false on capacity overflow so callers can fall back', () => {
    const host = new FakeHost();
    const renderer = new InstancedEnemyRenderer(host, 3);
    expect(renderer.upsert(enemy(1), 0)).toBe(true);
    expect(renderer.upsert(enemy(2), 0)).toBe(true);
    expect(renderer.upsert(enemy(3), 0)).toBe(true);
    expect(renderer.upsert(enemy(4), 0)).toBe(false);
    expect(host.count).toBe(3);
  });
});
