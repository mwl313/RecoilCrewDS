import { describe, expect, it } from 'vitest';
import { makeMatch, step } from './helpers';

describe('authoritative relic reveal flow (progression08 hardening)', () => {
  it('opening a chest enters relicSelection with a predetermined result', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-enter');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 1000);
    expect(result).not.toBeNull();
    expect(m.state.matchFlow).toBe('relicSelection');
    const active = m.state.teamProgression.activeSelection;
    expect(active?.kind).toBe('relic');
    expect(active?.relicResult?.relicId).toBe(result!.relicId);
    expect(active?.relicResult?.rarity).toBe(result!.rarity);
    expect(active?.relicResult?.acquisitionSequence).toBe(1);
    expect(active?.revealDeadlineWallMs).toBe(1000 + 10_000);
    expect(active?.resolved).toBe(false);
    expect(m.state.teamProgression.relicAcquisitionSequence).toBe(1);
  });

  it('gameplay is paused during the reveal', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-pause');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    m.openProgressionChest(chest.id, 0);
    const tankX = m.state.tank.x;
    step(m, 60);
    expect(m.state.time).toBe(0);
    expect(m.state.tank.x).toBe(tankX);
  });

  it('result is predetermined and stable across identical seeds', () => {
    const a = makeMatch('mode.singlePlayerScoreAttack', 'reveal-seed');
    const b = makeMatch('mode.singlePlayerScoreAttack', 'reveal-seed');
    const ca = a.systems.progression.spawnChest('map', 1, 1);
    const cb = b.systems.progression.spawnChest('map', 1, 1);
    const ra = a.openProgressionChest(ca.id, 0);
    const rb = b.openProgressionChest(cb.id, 0);
    expect(ra?.relicId).toBe(rb?.relicId);
    expect(a.state.teamProgression.activeSelection?.relicResult).toEqual(
      b.state.teamProgression.activeSelection?.relicResult,
    );
  });

  it('skip is idempotent and applies the relic exactly once', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-skip');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 1000)!;
    const skip = m.skipProgressionRelic(result.acquisitionSequence, 2000);
    expect(skip.accepted).toBe(true);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);

    const again = m.skipProgressionRelic(result.acquisitionSequence, 3000);
    expect(again.accepted).toBe(false);
    expect(['no_active_reveal', 'already_resolved']).toContain(again.reason);
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);
    expect(m.state.matchFlow).toBe('playing');
  });

  it('skip cannot alter the predetermined result', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-fixed');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 0)!;
    const before = { ...m.state.teamProgression.activeSelection!.relicResult! };
    m.skipProgressionRelic(result.acquisitionSequence, 1);
    expect(before).toEqual({
      relicId: result.relicId,
      rarity: result.rarity,
      duplicateConverted: result.duplicateConverted,
      replacementXp: result.replacementXp,
      stackCountAfter: result.stackCountAfter,
      acquisitionSequence: result.acquisitionSequence,
    });
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(result.stackCountAfter);
  });

  it('server timeout completes the reveal and resumes play', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-timeout');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 1000)!;
    const deadline = m.state.teamProgression.activeSelection!.expiresAtWallMs;
    expect(m.checkProgressionTimeout(deadline - 1)).toBe(false);
    expect(m.state.matchFlow).toBe('relicSelection');
    expect(m.checkProgressionTimeout(deadline + 1)).toBe(true);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);
  });

  it('reconnect snapshot restores the active reveal and timeout still works', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-reconnect');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 5000)!;
    const snapshot = JSON.parse(JSON.stringify(m.state));
    expect(snapshot.matchFlow).toBe('relicSelection');
    expect(snapshot.teamProgression.activeSelection.kind).toBe('relic');
    expect(snapshot.teamProgression.activeSelection.relicResult.acquisitionSequence).toBe(1);
    expect(snapshot.teamProgression.activeSelection.expiresAtWallMs).toBeGreaterThan(5000);
    expect(snapshot.teamProgression.relicAcquisitionSequence).toBe(1);
    // The live authority still resolves by wall-clock timeout after restore.
    const deadline = m.state.teamProgression.activeSelection!.expiresAtWallMs;
    expect(m.checkProgressionTimeout(deadline + 1)).toBe(true);
    expect(m.state.matchFlow).toBe('playing');
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);
  });

  it('a queued level-up begins after the relic reveal resolves', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-then-level');
    m.state.teamProgression.pendingLevelUps = 1;
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 0)!;
    expect(m.state.matchFlow).toBe('relicSelection');
    expect(m.state.teamProgression.activeSelection?.kind).toBe('relic');
    m.skipProgressionRelic(result.acquisitionSequence, 1);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    expect(m.state.teamProgression.pendingLevelUps).toBe(1);
    expect(m.state.teamProgression.activeSelection?.kind).toBe('upgrade');
  });

  it('terminal state prevents a reveal from deadlocking', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-terminal');
    const chest = m.systems.progression.spawnChest('map', 3, 3);
    const result = m.openProgressionChest(chest.id, 0)!;
    const deadline = m.state.teamProgression.activeSelection!.expiresAtWallMs;
    m.state.matchFlow = 'clear';
    m.state.phase = 'results';
    expect(m.checkProgressionTimeout(deadline + 1)).toBe(false);
    expect(m.state.matchFlow).toBe('clear');
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.state.teamProgression.relicStacks[result.relicId]).toBe(1);
  });

  it('chests cannot be opened while another progression flow is active', () => {
    const m = makeMatch('mode.singlePlayerScoreAttack', 'reveal-serialized');
    const c1 = m.systems.progression.spawnChest('map', 3, 3);
    m.openProgressionChest(c1.id, 0);
    const c2 = m.systems.progression.spawnChest('map', 4, 4);
    expect(m.openProgressionChest(c2.id, 1)).toBeNull();
    expect(m.state.teamProgression.treasureChestsOpened).toBe(1);
    expect(c2.opened).toBe(false);
  });
});
