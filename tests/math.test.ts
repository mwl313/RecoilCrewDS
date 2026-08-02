import { describe, expect, it } from 'vitest';
import { angleDiff, angleLerp, clamp, resolveCircleBox, wrapAngle } from '../src/shared/math';

describe('math helpers', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('wraps angles into [-PI, PI]', () => {
    expect(wrapAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
  });

  it('computes shortest angular difference', () => {
    expect(angleDiff(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(angleDiff(Math.PI, -Math.PI)).toBeCloseTo(0);
  });

  it('lerps angles along the shortest path', () => {
    const from = 3.0;
    const to = -3.0;
    const mid = angleLerp(from, to, 0.5);
    expect(Math.abs(angleDiff(from, mid))).toBeCloseTo(Math.abs(angleDiff(from, to)) / 2, 5);
  });

  it('pushes circles out of axis-aligned boxes', () => {
    const res = resolveCircleBox(1, 0, 1, 0, 0, 2, 2);
    expect(res.hit).toBe(true);
    expect(res.x).toBeCloseTo(2);
  });
});
