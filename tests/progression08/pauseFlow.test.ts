import { describe, expect, it } from 'vitest';
import { makeMatch, spawnEnemy, step } from './helpers';

describe('authoritative pause flow (progression08)', () => {
  it('enemy movement and tank physics freeze during selection', () => {
    const m = makeMatch();
    const e = spawnEnemy(m, 'enemy.scrapBug', m.state.tank.x + 8, m.state.tank.z);
    m.systems.progression.addXp(20);
    const enemyX = e.x;
    const tankX = m.state.tank.x;
    step(m, 30);
    expect(e.x).toBe(enemyX);
    expect(m.state.tank.x).toBe(tankX);
    expect(m.state.time).toBe(0);
  });

  it('horde/stage timers are frozen because sim time does not advance', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    const stageTime = m.systems.stage.state.farmingTimeRemaining;
    step(m, 30);
    expect(m.systems.stage.state.farmingTimeRemaining).toBe(stageTime);
  });

  it('wall-clock selection timeout continues while gameplay is paused', () => {
    const m = makeMatch();
    m.systems.progression.addXp(20);
    const active = m.state.teamProgression.activeSelection!;
    step(m, 60);
    expect(m.state.time).toBe(0);
    expect(m.checkProgressionTimeout(active.expiresAtWallMs + 1)).toBe(true);
    expect(m.state.matchFlow).toBe('playing');
  });
});
