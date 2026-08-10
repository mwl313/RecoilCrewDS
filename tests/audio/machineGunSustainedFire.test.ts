import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeRecipe } from '../../src/client/audio/procedural/proceduralSoundRecipes';
import {
  DEFAULT_CATEGORY_CAPS,
  ProceduralVoiceManager,
} from '../../src/client/audio/procedural/proceduralVoiceManager';

afterEach(() => {
  vi.useRealTimers();
});

describe('Machine Gun sustained-fire audio bounds', () => {
  for (const rate of [11, 24.75]) {
    it(`keeps fire and worst-case impact voices bounded for 60 seconds at ${rate}/s`, () => {
      vi.useFakeTimers();
      let now = 0;
      const manager = new ProceduralVoiceManager(28, DEFAULT_CATEGORY_CAPS, () => now);
      const fire = describeRecipe('playerMg');
      const impact = describeRecipe('playerMgImpact');
      const intervalMs = 1_000 / rate;
      const shots = Math.ceil(60 * rate);
      let maximumPlayerWeapon = 0;
      let maximumMinorImpact = 0;

      for (let i = 0; i < shots; i++) {
        expect(manager.request({ category: fire.category, priority: fire.priority, distance: 0, duration: fire.duration })).not.toBeNull();
        expect(manager.request({ category: impact.category, priority: impact.priority, distance: 0, duration: impact.duration })).not.toBeNull();
        const stats = manager.stats();
        maximumPlayerWeapon = Math.max(maximumPlayerWeapon, stats.counts.playerWeapon);
        maximumMinorImpact = Math.max(maximumMinorImpact, stats.counts.minorImpact);
        now += intervalMs / 1_000;
        vi.advanceTimersByTime(intervalMs);
      }

      expect(maximumPlayerWeapon).toBeLessThanOrEqual(DEFAULT_CATEGORY_CAPS.playerWeapon);
      expect(maximumMinorImpact).toBeLessThanOrEqual(DEFAULT_CATEGORY_CAPS.minorImpact);
      expect({ maximumPlayerWeapon, maximumMinorImpact }).toEqual(rate === 11
        ? { maximumPlayerWeapon: 2, maximumMinorImpact: 2 }
        : { maximumPlayerWeapon: 5, maximumMinorImpact: 4 });
      expect(manager.stats().dropped).toBe(0);
      manager.dispose();
    });
  }
});
