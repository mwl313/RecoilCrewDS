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

  it('resolves outside penetration to exact separation', () => {
    // Box 2×2 centered at origin: edge at x = 1; circle center 1.5 penetrates 0.5.
    const res = resolveCircleBox(1.5, 0, 1, 0, 0, 2, 2);
    expect(res.hit).toBe(true);
    expect(res.x).toBeCloseTo(2);
    expect(res.z).toBeCloseTo(0);
    expect(res.penetration).toBeCloseTo(0.5);
    expect(res.normalX).toBeCloseTo(1);
    expect(res.normalZ).toBeCloseTo(0);
  });

  it('touching the box edge is a zero-penetration contact, not an overshoot', () => {
    const res = resolveCircleBox(2, 0, 1, 0, 0, 2, 2);
    expect(res.hit).toBe(true);
    expect(res.x).toBeCloseTo(2);
    expect(res.penetration).toBeCloseTo(0);
  });

  it('returns a valid outward normal when the center is inside the box', () => {
    const res = resolveCircleBox(0, 0, 1, 0, 0, 2, 2);
    expect(res.hit).toBe(true);
    expect(Math.abs(res.x)).toBeCloseTo(2);
    expect(Math.abs(res.z)).toBeCloseTo(0);
    expect(Math.hypot(res.normalX, res.normalZ)).toBeCloseTo(1);
    expect(res.penetration).toBeGreaterThan(0);
  });
});
