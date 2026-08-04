import { describe, expect, it } from 'vitest';
import { makeMatch } from './helpers';

describe('Single Player / Multiplayer parity (progression08)', () => {
  it('both modes reference the same progression content definition', () => {
    const single = makeMatch('mode.singlePlayerScoreAttack');
    const multiplayer = makeMatch('mode.truckHunter');
    expect(single.rules.progressionContent?.id).toBe('progression.mainStage');
    expect(multiplayer.rules.progressionContent?.id).toBe('progression.mainStage');
    expect(single.rules.relicPoolIds).toEqual(multiplayer.rules.relicPoolIds);
    expect(single.rules.upgradeRarityTableContent).toEqual(multiplayer.rules.upgradeRarityTableContent);
  });

  it('only the execution policy differs', () => {
    const single = makeMatch('mode.singlePlayerScoreAttack');
    const multiplayer = makeMatch('mode.truckHunter');
    expect(single.rules.singlePlayerProgressionPolicy?.levelUpSelection).toBe('unified');
    expect(multiplayer.rules.multiplayerProgressionPolicy?.levelUpSelection).toBe('roleSeparated');
    expect(single.rules.singlePlayerProgressionPolicy?.xpMultiplier).toBeGreaterThanOrEqual(1);
  });

  it('legacy Demo mode keeps progression disabled', () => {
    const demo = makeMatch('mode.demoScoreAttack');
    expect(demo.rules.progressionEnabled).toBe(false);
    expect(demo.systems.progression.isEnabled).toBe(false);
  });
});
