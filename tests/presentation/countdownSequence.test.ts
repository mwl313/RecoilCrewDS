import { describe, expect, it } from 'vitest';
import { runCountdownSequence } from '../../src/client/presentation/countdownSequence';

describe('single-player countdown sequence', () => {
  it('plays the multiplayer 3–2–1–GO steps before resolving', async () => {
    const shown: number[] = [];
    const waits: number[] = [];

    await runCountdownSequence(
      (value) => shown.push(value),
      async (durationMs) => {
        waits.push(durationMs);
      },
    );

    expect(shown).toEqual([3, 2, 1, 0]);
    expect(waits).toEqual([1000, 1000, 1000, 250]);
  });
});
