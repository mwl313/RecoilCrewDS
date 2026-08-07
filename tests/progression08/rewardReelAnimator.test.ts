import { describe, expect, it } from 'vitest';
import {
  buildRewardReelSymbols,
  REWARD_REEL_CELL_COUNT,
  REWARD_REEL_CELL_HEIGHT,
  REWARD_TICK_INTERVALS,
  rewardReelFrame,
} from '../../src/client/progression/rewardReelAnimator';

describe('reward reel presentation animator', () => {
  it('builds deterministic multi-cell upgrade and relic tracks', () => {
    const first = buildRewardReelSymbols('offer-42', 1, 'upgrade');
    const repeated = buildRewardReelSymbols('offer-42', 1, 'upgrade');
    const relic = buildRewardReelSymbols('relic:7', 0, 'relic');
    expect(first).toEqual(repeated);
    expect(first).toHaveLength(REWARD_REEL_CELL_COUNT);
    expect(relic).toHaveLength(REWARD_REEL_CELL_COUNT);
    expect(new Set(relic.map((symbol) => symbol.label)).size).toBeGreaterThan(3);
  });

  it('travels through multiple full cells and visibly decelerates before lock', () => {
    const early = rewardReelFrame(350, 0, 'upgrade');
    const middle = rewardReelFrame(560, 0, 'upgrade');
    const final = rewardReelFrame(720, 0, 'upgrade');
    expect(Math.abs(final.translateY)).toBeGreaterThan(REWARD_REEL_CELL_HEIGHT * 8);
    expect(early.velocity).toBeGreaterThan(middle.velocity);
    expect(middle.velocity).toBeGreaterThan(final.velocity);
    expect(final.progress).toBe(1);
  });

  it('uses the approved changing casino cadence instead of a fixed interval', () => {
    expect(REWARD_TICK_INTERVALS).toHaveLength(12);
    expect(REWARD_TICK_INTERVALS[0]).toBe(32);
    expect(REWARD_TICK_INTERVALS.at(-1)).toBe(145);
    expect(new Set(REWARD_TICK_INTERVALS).size).toBe(REWARD_TICK_INTERVALS.length);
  });
});
