import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { XpShardRenderer } from '../../src/client/pickups/xpShardRenderer';
import type { XpShardState } from '../../src/shared/types';

const DT = 1 / 30;

function shard(id: number, x = id): XpShardState {
  return { id, value: 1, x, y: 0.6, z: 0, vx: 0, vy: 0, vz: 0, age: 0, collected: false };
}

function matrices(renderer: XpShardRenderer, count: number): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Matrix4();
    renderer.mesh.getMatrixAt(i, m);
    out.push(m);
  }
  return out;
}

describe('XP shard instancing (second-pass)', () => {
  it('remove slot 0 while slot 1 remains: the remaining shard stays visible', () => {
    const scene = new THREE.Scene();
    const renderer = new XpShardRenderer(scene);
    renderer.update([shard(1), shard(2)], 0, DT);
    expect(renderer.mesh.count).toBe(2);
    const liveBefore = matrices(renderer, 2);
    renderer.update([shard(2)], 0.1, DT);
    // One live shard (id 2, originally packed at index 1) + one pop.
    expect(renderer.mesh.count).toBe(2);
    const live = matrices(renderer, 1)[0];
    expect(live.elements).not.toEqual(liveBefore[1].elements);
    // After the pop expires, exactly the surviving shard remains packed.
    for (let i = 0; i < 12; i++) renderer.update([shard(2)], 0.5 + i * DT, DT);
    expect(renderer.mesh.count).toBe(1);
    const final = matrices(renderer, 1)[0];
    expect(final.elements.some((v) => Math.abs(v) > 1e-9)).toBe(true);
    renderer.dispose();
  });

  it('removing a middle shard from 10 live shards keeps all 9 visible', () => {
    const scene = new THREE.Scene();
    const renderer = new XpShardRenderer(scene);
    const all = Array.from({ length: 10 }, (_, i) => shard(i + 1, i * 2));
    renderer.update(all, 0, DT);
    expect(renderer.mesh.count).toBe(10);
    const remaining = [...all.slice(0, 4), ...all.slice(5)];
    renderer.update(remaining, 0.1, DT);
    expect(renderer.mesh.count).toBe(10); // 9 live + 1 pop
    const liveMatrices = matrices(renderer, 9);
    expect(liveMatrices.map((m) => m.elements.join(',')).length).toBe(9);
    for (const m of liveMatrices) {
      expect(m.elements.some((v) => Math.abs(v) > 1e-9)).toBe(true);
    }
    renderer.dispose();
  });

  it('simultaneous removal of several nonadjacent shards shows distinct live+pops', () => {
    const scene = new THREE.Scene();
    const renderer = new XpShardRenderer(scene);
    const all = Array.from({ length: 8 }, (_, i) => shard(i + 1, i * 3));
    renderer.update(all, 0, DT);
    const remaining = [all[1], all[3], all[6], all[7]];
    renderer.update(remaining, 0.1, DT);
    expect(renderer.mesh.count).toBe(8); // 4 live + 4 pops
    const popMatrices = matrices(renderer, 8).slice(4);
    const keys = new Set(popMatrices.map((m) => m.elements.join(',')));
    expect(keys.size).toBe(4); // every pop uses a distinct visible matrix
    renderer.dispose();
  });

  it('multiple pops in one frame use distinct visible instances', () => {
    const scene = new THREE.Scene();
    const renderer = new XpShardRenderer(scene);
    const all = Array.from({ length: 6 }, (_, i) => shard(i + 1, i * 4));
    renderer.update(all, 0, DT);
    renderer.update([], 0.1, DT); // all six removed in the same frame
    expect(renderer.mesh.count).toBe(6);
    const keys = new Set(matrices(renderer, 6).map((m) => m.elements.join(',')));
    expect(keys.size).toBe(6);
    renderer.dispose();
  });

  it('renders every shard at 129, 256, and the full 512 capacity individually', () => {
    for (const n of [129, 256, 512]) {
      const scene = new THREE.Scene();
      const renderer = new XpShardRenderer(scene);
      renderer.update(Array.from({ length: n }, (_, i) => shard(i + 1, i * 0.5)), 0, DT);
      expect(renderer.mesh.count).toBe(n);
      expect(renderer.liveCount).toBe(n);
      expect(renderer.overflow).toBe(0);
      expect(renderer.overflowIndicator.visible).toBe(false);
      renderer.dispose();
    }
  });

  it('renders a visible overflow indicator beyond capacity with diagnostics', () => {
    const scene = new THREE.Scene();
    const renderer = new XpShardRenderer(scene);
    const n = renderer.capacity + 7;
    renderer.update(Array.from({ length: n }, (_, i) => shard(i + 1, i * 0.25)), 0, DT);
    expect(renderer.mesh.count).toBe(renderer.capacity);
    expect(renderer.liveCount).toBe(n);
    expect(renderer.overflow).toBe(7);
    expect(renderer.overflowIndicator.visible).toBe(true);
    expect(renderer.telemetry.overflowEvents).toBeGreaterThanOrEqual(1);
    renderer.dispose();
  });

  it('reset and rematch clear all slots, pops, and the overflow indicator', () => {
    const scene = new THREE.Scene();
    const renderer = new XpShardRenderer(scene);
    renderer.update(Array.from({ length: 20 }, (_, i) => shard(i + 1)), 0, DT);
    renderer.update([], 0.1, DT); // all pop
    expect(renderer.mesh.count).toBe(20);
    renderer.reset();
    expect(renderer.mesh.count).toBe(0);
    expect(renderer.overflowIndicator.visible).toBe(false);
    // A fresh match renders again from a clean state.
    renderer.update([shard(100, 5), shard(200, 9)], 2, DT);
    expect(renderer.mesh.count).toBe(2);
    renderer.dispose();
    expect(scene.children.some((c) => c === renderer.mesh)).toBe(false);
  });
});
