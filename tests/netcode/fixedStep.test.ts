import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from '../../src/server/fixedStep';

describe('fixed-step accumulator', () => {
  it('steps exactly at the sim rate with bounded catch-up', () => {
    const acc = new FixedStepAccumulator(30, 5);
    // 1 second at 60 Hz input → exactly 30 steps.
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += acc.accumulate(1000 / 60).steps;
    expect(steps).toBe(30);
    expect(acc.droppedTimeMs).toBe(0);
  });

  it('drops time instead of unbounded catch-up after a stall', () => {
    const acc = new FixedStepAccumulator(30, 5);
    const result = acc.accumulate(500); // 15 ticks of stall in one frame
    expect(result.steps).toBe(5); // bounded
    expect(result.droppedMs).toBeGreaterThan(0);
    expect(acc.droppedTimeMs).toBeGreaterThan(0);
    // Subsequent normal frames still step at exactly 30 Hz.
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += acc.accumulate(1000 / 60).steps;
    expect(steps).toBe(30);
  });

  it('exposes drift as pending accumulator time', () => {
    const acc = new FixedStepAccumulator(30, 5);
    const drift = acc.accumulate(10).driftMs;
    expect(drift).toBeCloseTo(10);
  });
});
