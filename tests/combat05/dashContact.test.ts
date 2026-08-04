import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { BASE_CONFIG } from '../../src/shared/config';
import type { DriverInput } from '../../src/shared/types';

const DT = 1 / 30;

function driver(over: Partial<DriverInput> = {}): DriverInput {
  return { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false, ...over };
}

function placeTank(m: Match, x = 0, z = 0): void {
  m.state.tank.x = x;
  m.state.tank.z = z;
  m.state.tank.yaw = 0;
  m.state.tank.vx = 0;
  m.state.tank.vz = 0;
}

function adjacentBug(m: Match, x = 0, z = 1.5): ReturnType<Match['spawnEnemy']> {
  const bug = m.spawnEnemy('scrapBug', x, z)!;
  bug.hp = 100;
  bug.maxHp = 100;
  return bug;
}

describe('dash-only contact combat (Combat 05 M1)', () => {
  it('normal slow contact deals zero enemy damage', () => {
    const m = new Match('slow-contact');
    placeTank(m);
    const bug = adjacentBug(m);
    bug.hp = 3;
    for (let i = 0; i < 10; i++) {
      m.setDriverInput(driver());
      m.step(DT);
      m.takeEvents();
    }
    expect(bug.hp).toBe(3);
    expect(m.state.stats.dashKills).toBe(0);
  });

  it('normal high-speed contact deals zero enemy damage (no speed ram kill)', () => {
    const m = new Match('fast-contact');
    placeTank(m);
    const bug = adjacentBug(m);
    bug.hp = 100;
    m.state.tank.vx = 18;
    m.state.tank.vz = 14;
    for (let i = 0; i < 6; i++) {
      m.setDriverInput(driver({ throttle: 1 }));
      m.step(DT);
      m.takeEvents();
    }
    expect(bug.hp).toBe(100);
    expect(m.state.stats.dashKills).toBe(0);
  });

  it('airborne non-dash contact deals zero enemy damage', () => {
    const m = new Match('air-contact');
    placeTank(m);
    const bug = adjacentBug(m);
    bug.hp = 100;
    m.state.tank.grounded = false;
    m.state.tank.vy = -5;
    m.state.tank.vx = 10;
    m.step(DT);
    m.takeEvents();
    expect(bug.hp).toBe(100);
  });

  it('an accepted Dash damages and kills a Scrap Bug with source dash', () => {
    const m = new Match('dash-kill');
    placeTank(m);
    const bug = adjacentBug(m);
    bug.hp = 3;
    m.setDriverInput(driver({ dashPressed: true }));
    m.step(DT);
    const events = m.takeEvents();
    expect(m.state.tank.dashDamageT).toBeGreaterThan(0);
    expect(bug.hp).toBeLessThanOrEqual(0);
    expect(m.state.stats.dashKills).toBe(1);
    expect(events.some((e) => e.type === 'dashContact' && e.kind === 'kill')).toBe(true);
  });

  it('dash damage is a tunable value, not magic 999', () => {
    expect(BASE_CONFIG.tank.dashContactDamage).toBe(12);
    expect(BASE_CONFIG.tank.dashContactDamage).toBeLessThan(999);
    expect(BASE_CONFIG.tank.contactDamage).toBe(0);
  });

  it('the dash damage window expires and later contact deals no damage', () => {
    const m = new Match('window-expire');
    placeTank(m);
    const bug = adjacentBug(m);
    bug.hp = 100;
    m.setDriverInput(driver({ dashPressed: true }));
    m.step(DT);
    m.takeEvents();
    expect(bug.hp).toBe(88); // one dash hit applied
    // Advance past the window while the bug stays adjacent.
    bug.x = m.state.tank.x;
    bug.z = m.state.tank.z + 1.5;
    m.state.tank.vx = 0;
    m.state.tank.vz = 0;
    for (let i = 0; i < 10; i++) {
      m.setDriverInput(driver());
      m.step(DT);
      m.takeEvents();
    }
    expect(m.state.tank.dashDamageT).toBe(0);
    expect(bug.hp).toBe(88);
  });

  it('the presentation timer alone cannot grant damage', () => {
    const m = new Match('presentation-only');
    placeTank(m);
    const bug = adjacentBug(m);
    bug.hp = 100;
    m.state.tank.dashPresentationT = 5;
    m.state.tank.dashDamageT = 0;
    m.step(DT);
    m.takeEvents();
    expect(bug.hp).toBe(100);
  });

  it('per-target cooldown prevents repeated damage every substep', () => {
    const m = new Match('per-target');
    placeTank(m);
    const bug = adjacentBug(m);
    bug.hp = 100;
    let hits = 0;
    // Refresh the dash window every step; the cooldown (0.25 s) gates hits.
    for (let i = 0; i < 12; i++) {
      m.state.tank.dashDamageT = 0.2;
      m.setDriverInput(driver());
      m.step(DT);
      hits += m.takeEvents().filter((e) => e.type === 'dashContact').length;
    }
    // 12 steps = 0.4 s → hits at ~0.00 s and ~0.30 s.
    expect(hits).toBe(2);
    expect(bug.hp).toBe(76);
  });

  it('enemy contact damage to the tank remains unchanged', () => {
    const m = new Match('enemy-contact');
    placeTank(m);
    adjacentBug(m);
    m.state.tank.shieldedT = 0;
    const hp0 = m.state.tank.integrity;
    for (let i = 0; i < 5; i++) {
      m.setDriverInput(driver());
      m.step(DT);
      m.takeEvents();
    }
    expect(m.state.tank.integrity).toBeLessThan(hp0);
  });
});
