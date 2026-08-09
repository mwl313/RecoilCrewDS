import { describe, expect, it } from 'vitest';
import {
  buildRewardReelSymbols,
  REWARD_REEL_CELL_COUNT,
  REWARD_REEL_CELL_HEIGHT,
  REWARD_TICK_INTERVALS,
  UPGRADE_LOCK_TIMES,
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
    expect(new Set(first.map((symbol) => symbol.rarity))).toEqual(new Set(['neutral']));
    expect(new Set(relic.map((symbol) => symbol.rarity))).toEqual(new Set(['neutral']));
    expect(relic.some((symbol) => /COMMON|RARE|EPIC|LEGENDARY/.test(symbol.label))).toBe(false);
  });

  it('travels through multiple full cells and visibly decelerates before lock', () => {
    const early = rewardReelFrame(450, 0, 'upgrade');
    const middle = rewardReelFrame(1_150, 0, 'upgrade');
    const final = rewardReelFrame(UPGRADE_LOCK_TIMES[0], 0, 'upgrade');
    expect(Math.abs(final.translateY)).toBeGreaterThan(REWARD_REEL_CELL_HEIGHT * 14);
    expect(early.velocity).toBeGreaterThan(middle.velocity);
    expect(middle.velocity).toBeGreaterThan(final.velocity);
    expect(final.progress).toBe(1);
  });

  it('uses the approved changing casino cadence instead of a fixed interval', () => {
    expect(REWARD_TICK_INTERVALS).toHaveLength(17);
    expect(REWARD_TICK_INTERVALS[0]).toBe(36);
    expect(REWARD_TICK_INTERVALS.at(-1)).toBe(300);
    expect(new Set(REWARD_TICK_INTERVALS).size).toBe(REWARD_TICK_INTERVALS.length);
    for (let index = 1; index < REWARD_TICK_INTERVALS.length; index++) {
      expect(REWARD_TICK_INTERVALS[index]).toBeGreaterThan(REWARD_TICK_INTERVALS[index - 1]!);
    }
  });
});
