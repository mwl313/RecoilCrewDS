import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Collider } from '../../src/client/arenaView';
import { buildCameraCollisionIndex, mergeCliffProxies } from '../../src/client/cameraCollision';
import { rayAabbT } from '../../src/client/arenaView';

function box(minX: number, maxX: number, minZ: number, maxZ: number, type = 'obstacle', y = 2): Collider {
  return {
    box: new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, y, maxZ)),
    type,
  };
}

describe('camera spatial index', () => {
  it('queries only nearby candidates', () => {
    const colliders: Collider[] = [box(-1, 1, -1, 1)];
    for (let i = 0; i < 100; i++) {
      const x = (i % 10) * 40 - 180;
      const z = Math.floor(i / 10) * 40 - 180;
      colliders.push(box(x - 1, x + 1, z - 1, z + 1));
    }
    const index = buildCameraCollisionIndex(colliders);
    const near = index.query(new THREE.Vector3(0, 0, 0), 10);
    expect(near.length).toBeLessThan(20);
    expect(index.proxyCount).toBe(101);
  });

  it('camera collision parity: index candidates produce the same nearest hit as full scan', () => {
    const colliders: Collider[] = [
      box(-1, 1, -1, 1),
      box(50, 52, 50, 52),
      box(-60, -58, -60, -58),
      box(100, 102, 100, 102),
    ];
    const index = buildCameraCollisionIndex(colliders);
    const origin = new THREE.Vector3(0, 1, 6);
    const dir = new THREE.Vector3(0, -0.2, -1).normalize();
    const full = (list: readonly Collider[]): number => {
      let best = Infinity;
      for (const c of list) {
        const t = rayAabbT(origin, dir, c.expanded ?? c.box);
        if (t !== null && t > 0.05 && t < best) best = t;
      }
      return best;
    };
    const candidates = index.query(origin, 20);
    expect(full(candidates)).toBeCloseTo(full(colliders), 6);
  });

  it('pre-expanded boxes are baked at construction', () => {
    const index = buildCameraCollisionIndex([box(-1, 1, -1, 1)]);
    const candidates = index.query(new THREE.Vector3(0, 0, 0), 100);
    expect(candidates[0].expanded).toBeDefined();
    expect(candidates[0].expanded!.min.x).toBeLessThan(-1);
  });
});

describe('cliff proxy merge', () => {
  it('merges contiguous cliff segments into fewer proxies', () => {
    const cliffs: Collider[] = [];
    for (let i = 0; i < 20; i++) {
      // Slightly overlapping segments (0.1 m overlap) → one long proxy.
      cliffs.push(box(i * 3.9, i * 3.9 + 3.9, 0, 3, 'cliff', 8));
    }
    const merged = mergeCliffProxies(cliffs);
    expect(merged.length).toBeLessThan(cliffs.length);
    // The merged span covers the whole run.
    const span = merged[0].box;
    expect(span.min.x).toBeCloseTo(0);
    expect(span.max.x).toBeCloseTo(78);
  });

  it('keeps separated cliffs apart', () => {
    const cliffs: Collider[] = [
      box(0, 3, 0, 3, 'cliff', 8),
      box(100, 103, 0, 3, 'cliff', 8),
    ];
    const merged = mergeCliffProxies(cliffs);
    expect(merged.length).toBe(2);
  });
});
