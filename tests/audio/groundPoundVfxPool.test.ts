// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { VfxSystem } from '../../src/client/vfx';

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillRect: () => undefined,
    fillStyle: '',
  }) as never);
});

describe('Ground Pound VFX pool', () => {
  it('stores the exact authoritative outer radius and returns rings to the pool', () => {
    const scene = new THREE.Scene();
    const vfx = new VfxSystem(scene);
    vfx.spawnGroundRing(1, 2, 3, 0xffaa55, 11.83, 0.6);
    expect(vfx.poolDiagnostics()).toMatchObject({
      activeRings: 1,
      pooledRings: 12,
      activeRingEndRadii: [11.83],
      activeRingCurrentRadii: [0.2],
    });
    vfx.update(0.48);
    expect(vfx.poolDiagnostics().activeRingCurrentRadii[0]).toBeCloseTo(11.83, 1);
    vfx.update(0.13);
    expect(vfx.poolDiagnostics()).toMatchObject({ activeRings: 0, pooledRings: 12 });
  });
});
