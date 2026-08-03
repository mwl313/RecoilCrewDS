import { describe, expect, it } from 'vitest';
import {
  DEMO_SEED,
  canonicalizeState,
  loadGolden,
  runDemoFixture,
  verifyGolden,
  withSeededRandom,
  type DemoFixtureOutput,
} from './helpers/demoFixture';
import { GAME } from '../src/shared/config';
import { Match } from '../src/shared/sim/match';

describe('deterministic Demo regression harness', () => {
  it('reproduces the identical canonical output across runs with the same seed', () => {
    const a = runDemoFixture({ seed: DEMO_SEED });
    const b = runDemoFixture({ seed: DEMO_SEED });
    expect(a).toEqual(b);
    // A different seed must produce a different trace (proves the seed bites).
    const c = runDemoFixture({ seed: DEMO_SEED + 1 });
    expect(c.eventTrace).not.toEqual(a.eventTrace);
  });

  it('matches the stored golden fixture (golden-master protection)', () => {
    const output = runDemoFixture({ seed: DEMO_SEED });
    expect(verifyGolden(output)).toBe(true);
    const golden = loadGolden();
    expect(golden.schemaVersion).toBe(1);
    expect(golden.seed).toBe(DEMO_SEED);
    expect(golden.duration).toBe(GAME.roundDuration);
  });

  it('captures every required canonical checkpoint label', () => {
    const labels = runDemoFixture({ seed: DEMO_SEED }).checkpoints.map((c) => c.label);
    expect(labels).toEqual([
      'initial',
      't10',
      't30',
      'lootTruckWindow',
      'jackpotWindow',
      'completion',
      'rematchReset',
    ]);
  });

  it('checkpoint windows land at the canonical sim times', () => {
    const byLabel = new Map(runDemoFixture({ seed: DEMO_SEED }).checkpoints.map((c) => [c.label, c.simTime]));
    expect(byLabel.get('initial')).toBeCloseTo(0, 6);
    // Each window is captured on the first fixed step at/after the threshold.
    expect(byLabel.get('t10')).toBeGreaterThanOrEqual(10);
    expect(byLabel.get('t10')).toBeLessThan(10.1);
    expect(byLabel.get('t30')).toBeGreaterThanOrEqual(30);
    expect(byLabel.get('t30')).toBeLessThan(30.1);
    expect(byLabel.get('lootTruckWindow')).toBeGreaterThanOrEqual(44); // truck spawns at 42
    expect(byLabel.get('lootTruckWindow')).toBeLessThan(44.1);
    expect(byLabel.get('jackpotWindow')).toBeGreaterThanOrEqual(60); // inside 55-70 assist window
    expect(byLabel.get('jackpotWindow')).toBeLessThan(60.1);
    expect(byLabel.get('completion')).toBeGreaterThanOrEqual(GAME.roundDuration);
    expect(byLabel.get('completion')).toBeLessThan(GAME.roundDuration + 0.1);
  });

  it('rematch reset is a fresh zeroed match identical to the initial checkpoint', () => {
    const output = runDemoFixture({ seed: DEMO_SEED });
    const initial = output.checkpoints.find((c) => c.label === 'initial')!;
    const reset = output.checkpoints.find((c) => c.label === 'rematchReset')!;
    expect(reset.state).toEqual(initial.state);
    expect(reset.state.stats.score).toBe(0);
    expect(reset.state.stats.jackpotMeter).toBe(0);
    expect(reset.state.tank.integrity).toBe(100);
  });

  it('the fixture is deterministic outside the golden path too (parity checkpoints)', () => {
    const out = withSeededRandom(12345, () => {
      const m = new Match('parity-a', 'none');
      for (let i = 0; i < 30 * 30; i++) {
        m.step(1 / 30);
        m.takeEvents();
      }
      return canonicalizeState(m.state);
    });
    const out2 = withSeededRandom(12345, () => {
      const m = new Match('parity-b', 'none');
      for (let i = 0; i < 30 * 30; i++) {
        m.step(1 / 30);
        m.takeEvents();
      }
      return canonicalizeState(m.state);
    });
    expect(out).toEqual(out2);
  });

  it('exposes a compact but meaningful event trace with no wall-clock fields', () => {
    const output: DemoFixtureOutput = runDemoFixture({ seed: DEMO_SEED });
    expect(output.eventTrace.length).toBeGreaterThan(1000);
    for (const ev of output.eventTrace) {
      expect(ev).not.toHaveProperty('t');
      expect(ev).not.toHaveProperty('x');
      expect(ev).not.toHaveProperty('label');
    }
    expect(output.eventCounts.kill ?? 0).toBeGreaterThan(0);
    expect(output.eventCounts.jackpotFire ?? 0).toBeGreaterThanOrEqual(1);
    expect(output.eventCounts.truckSpawn ?? 0).toBe(1);
  });
});
