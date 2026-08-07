import { describe, expect, it } from 'vitest';
import {
  distanceGain,
  distanceLowpassHz,
  seededVariation,
  spatialize,
  stableEventSeed,
} from '../../src/client/audio/procedural/proceduralSoundMath';

describe('procedural sound math', () => {
  it('keeps seeded micro-variation deterministic and tightly bounded', () => {
    const first = seededVariation(42);
    expect(seededVariation(42)).toEqual(first);
    expect(seededVariation(43)).not.toEqual(first);
    expect(first.pitch).toBeGreaterThanOrEqual(0.96);
    expect(first.pitch).toBeLessThanOrEqual(1.04);
    expect(first.gain).toBeGreaterThanOrEqual(0.97);
    expect(first.gain).toBeLessThanOrEqual(1.03);
    expect(first.filter).toBeGreaterThanOrEqual(0.94);
    expect(first.filter).toBeLessThanOrEqual(1.06);
    expect(stableEventSeed(7, 3, 1.25)).toBe(stableEventSeed(7, 3, 1.25));
  });

  it('pans world sources relative to camera yaw', () => {
    const listener = { x: 0, y: 0, z: 0, yaw: 0 };
    expect(spatialize(listener, { x: -10, y: 0, z: 0 }).pan).toBeLessThan(-0.9);
    expect(spatialize(listener, { x: 10, y: 0, z: 0 }).pan).toBeGreaterThan(0.9);
    expect(Math.abs(spatialize(listener, { x: 0, y: 0, z: 10 }).pan)).toBeLessThan(0.001);
  });

  it('attenuates and darkens with distance, then culls low-priority detail', () => {
    expect(distanceGain(10)).toBeGreaterThan(distanceGain(50));
    expect(distanceGain(50)).toBeGreaterThan(distanceGain(90));
    expect(distanceLowpassHz(10)).toBeGreaterThan(distanceLowpassHz(50));
    expect(distanceLowpassHz(50)).toBeGreaterThan(distanceLowpassHz(95));
    expect(spatialize({ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: 130 }, 100, 40).culled).toBe(true);
    expect(spatialize({ x: 0, y: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: 130 }, 100, 92).culled).toBe(false);
  });
});
