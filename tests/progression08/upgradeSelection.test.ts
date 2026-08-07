import { describe, expect, it } from 'vitest';
import { makeMatch, step } from './helpers';

describe('authoritative upgrade selection and pause (progression08)', () => {
  it('gameplay pauses during selection and resumes after single selection', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    expect(m.state.matchFlow).toBe('upgradeSelection');
    const timeAtPause = m.state.time;
    step(m, 30);
    expect(m.state.time).toBe(timeAtPause);
    const active = m.state.teamProgression.activeSelection!;
    m.submitProgressionSelection('single', active.offerId, 1);
    expect(m.state.matchFlow).toBe('playing');
    step(m, 5);
    expect(m.state.time).toBeGreaterThan(timeAtPause);
  });

  it('invalid role/index/offer are rejected; selection applies once', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    const active = m.state.teamProgression.activeSelection!;
    expect(m.submitProgressionSelection('driver', active.offerId, 9).accepted).toBe(false);
    expect(m.submitProgressionSelection('gunner', 'nope', 0).accepted).toBe(false);
    expect(m.submitProgressionSelection('single', active.offerId, 0).accepted).toBe(true);
    expect(m.submitProgressionSelection('single', active.offerId, 2).accepted).toBe(false);
  });

  it('ten-second wall-clock timeout auto-picks deterministically', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    const active = m.state.teamProgression.activeSelection!;
    expect(m.checkProgressionTimeout(active.expiresAtWallMs! + 10_000)).toBe(true);
    expect(m.state.teamProgression.activeSelection).toBeNull();
    expect(m.state.matchFlow).toBe('playing');
  });

  it('inputs do not leak across the pause', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    m.setDriverInput({ throttle: 1, steer: 0, dashPressed: false, jumpPressed: false });
    const vx = m.state.tank.vx;
    step(m, 5);
    expect(m.state.tank.vx).toBe(vx);
  });

  it('level cards create independent multiply modifiers', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    m.submitProgressionSelection('single', m.state.teamProgression.activeSelection!.offerId, 0);
    m.systems.progression.addXp(45);
    m.submitProgressionSelection('single', m.state.teamProgression.activeSelection!.offerId, 0);
    expect(m.rules.resolver.modifierCount()).toBeGreaterThanOrEqual(2);
  });
});
