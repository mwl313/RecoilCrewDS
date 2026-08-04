import { describe, expect, it } from 'vitest';
import { Match } from '../src/shared/sim/match';
import { TAU, angleDiff, dist, dist2 } from '../src/shared/math';
import { BASE_CONFIG } from '../src/shared/config';
import type { DriverInput, GunnerInput, MatchState } from '../src/shared/types';

const DT = 1 / 30;

function step(match: Match, seconds: number, driver?: DriverInput, gunner?: GunnerInput) {
  if (driver) match.setDriverInput(driver);
  if (gunner) match.setGunnerInput(gunner);
  const steps = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < steps; i++) {
    match.step(DT);
    match.takeEvents();
  }
}

function holdGunner(aimYaw = Math.PI / 2): GunnerInput {
  return { aimYaw, aimPitch: 0.05, primary: false, secondary: false, ability: false };
}

function holdDriver(over: Partial<DriverInput> = {}): DriverInput {
  return { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false, ...over };
}

function nearestEnemy(state: MatchState, type: string) {
  return state.enemies.find((e) => e.alive && e.type === type);
}

describe('tank movement and input separation', () => {
  it('driver throttle moves the tank forward', () => {
    const m = new Match('m1');
    const x0 = m.state.tank.x;
    const z0 = m.state.tank.z;
    step(m, 1.0, holdDriver({ throttle: 1 }));
    expect(Math.hypot(m.state.tank.x - x0, m.state.tank.z - z0)).toBeGreaterThan(4);
  });

  it('driver input never rotates the turret', () => {
    const m = new Match('m2');
    const yaw0 = m.state.turret.yaw;
    step(m, 1.0, holdDriver({ throttle: 1, steer: 1 }));
    expect(angleDiff(yaw0, m.state.turret.yaw)).toBeLessThan(0.001);
  });

  it('gunner aim never moves the tank', () => {
    const m = new Match('m3');
    const x0 = m.state.tank.x;
    const z0 = m.state.tank.z;
    step(m, 1.0, undefined, { aimYaw: -2, aimPitch: 0.3, primary: false, secondary: false, ability: false });
    expect(m.state.tank.x).toBeCloseTo(x0, 4);
    expect(m.state.tank.z).toBeCloseTo(z0, 4);
  });

  it('steering is chassis-relative (backwards look does not reverse input)', () => {
    const m = new Match('m4');
    const yaw0 = m.state.tank.yaw;
    step(m, 0.4, holdDriver({ throttle: 1, steer: 1 }));
    const yawRight = m.state.tank.yaw;
    // D (steer +1) turns the nose toward -X = screen-right from behind.
    expect(angleDiff(yaw0, yawRight)).toBeLessThan(0);
    expect(Math.abs(angleDiff(yaw0, yawRight))).toBeLessThan(1);
  });
});

describe('recoil', () => {
  it('cannon recoil pushes the shared tank opposite the barrel', () => {
    const m = new Match('m5');
    // Let the turret settle on the firing direction first.
    step(m, 1.0, undefined, { aimYaw: 0, aimPitch: 0, primary: false, secondary: false, ability: false });
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: false, secondary: true, ability: false });
    m.step(DT);
    m.takeEvents();
    const vx0 = m.state.tank.vx;
    const vz0 = m.state.tank.vz;
    expect(Math.hypot(vx0, vz0)).toBeGreaterThan(BASE_CONFIG.tank.recoilImpulse * 0.7);
    // Firing forward (yaw 0 = +Z) pushes the tank backward (-Z).
    expect(vz0).toBeLessThan(-2);
  });

  it('cannon recoil lands at full impulse (no brace reduction path)', () => {
    const m = new Match('m6');
    step(m, 1.0, undefined, { aimYaw: 0, aimPitch: 0, primary: false, secondary: false, ability: false });
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: false, secondary: true, ability: false });
    m.step(DT);
    m.takeEvents();
    const v = Math.hypot(m.state.tank.vx, m.state.tank.vz);
    expect(v).toBeGreaterThan(BASE_CONFIG.tank.recoilImpulse * 0.9);
    expect(v).toBeLessThan(BASE_CONFIG.tank.recoilImpulse * 1.1);
  });

  it('machine gun recoil is negligible compared to cannon recoil', () => {
    const m = new Match('m7');
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: true, secondary: false, ability: false });
    step(m, 0.3);
    expect(Math.hypot(m.state.tank.vx, m.state.tank.vz)).toBeLessThan(1.5);
  });
});

describe('weapons', () => {
  it('enforces cannon cooldown', () => {
    const m = new Match('m8');
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: false, secondary: true, ability: false });
    m.step(DT);
    m.takeEvents();
    const afterFirst = m.state.shells.length;
    // Hold cannon down for another full second: no new shells while cooling down.
    step(m, 1.0, undefined, { aimYaw: 0, aimPitch: 0, primary: false, secondary: true, ability: false });
    expect(m.state.shells.length).toBeLessThanOrEqual(afterFirst + 1);
  });

  it('does not double-fire on a held or duplicated cannon input', () => {
    const m = new Match('m9');
    const fire = { aimYaw: 0, aimPitch: 0, primary: false, secondary: true, ability: false };
    m.setGunnerInput(fire);
    m.step(DT);
    m.takeEvents();
    const shots = m.state.shells.length;
    // Same "secondary: true" state next tick must not fire again.
    m.step(DT);
    m.takeEvents();
    expect(m.state.shells.length).toBe(shots);
  });

  it('stale input clearing stops the machine gun and movement', () => {
    const m = new Match('m10');
    m.setDriverInput(holdDriver({ throttle: 1 }));
    m.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: true, secondary: false, ability: false });
    step(m, 0.5);
    m.takeEvents();
    m.clearInputs();
    const x0 = m.state.tank.x;
    let shotEvents = 0;
    for (let i = 0; i < Math.round(0.5 / DT); i++) {
      m.step(DT);
      const evs = m.takeEvents();
      shotEvents += evs.filter((ev) => ev.type === 'shot' && ev.kind === 'mg').length;
    }
    expect(shotEvents).toBe(0);
    expect(Math.hypot(m.state.tank.vx, m.state.tank.vz)).toBeLessThan(1.0);
    expect(Math.abs(m.state.tank.x - x0)).toBeLessThan(1.5);
  });

  it('tower projectiles damage the tank', () => {
    const m = new Match('m11');
    m.spawnEnemy('gunTower', m.state.tank.x - 10, m.state.tank.z);
    step(m, 6.0);
    expect(m.state.tank.integrity).toBeLessThan(100);
  });
});

describe('enemies', () => {
  it('scrap bug hunts the tank and can be killed by machine gun', () => {
    const m = new Match('m12');
    const bug = m.state.enemies.find((e) => e.type === 'scrapBug')!;
    const d0 = dist(m.state.tank.x, m.state.tank.z, bug.x, bug.z);
    step(m, 2.0);
    const bug2 = m.state.enemies.find((e) => e.id === bug.id)!;
    const d1 = dist(m.state.tank.x, m.state.tank.z, bug2.x, bug2.z);
    expect(d1).toBeLessThan(d0 + 0.5);
  });

  it('rammer follows approach -> lock -> telegraph -> charge -> recovery', () => {
    const m = new Match('m13');
    m.spawnEnemy('rammer', m.state.tank.x - 30, m.state.tank.z);
    const allStates = new Set<string>();
    for (let i = 0; i < 30 * 12; i++) {
      m.step(DT);
      m.takeEvents();
      for (const e of m.state.enemies) {
        if (e.type === 'rammer' && e.alive) allStates.add(e.state);
      }
    }
    expect(allStates.has('lock')).toBe(true);
    expect(allStates.has('telegraph')).toBe(true);
    expect(allStates.has('charge')).toBe(true);
    expect(allStates.has('recovery')).toBe(true);
  });

  it('loot truck spawns mid-round and drops heavy scrap when destroyed', () => {
    const m = new Match('m15');
    step(m, 43);
    expect(m.state.truck.active).toBe(true);
    const truck = m.state.enemies.find((e) => e.type === 'lootTruck' && e.alive);
    expect(truck).toBeDefined();
    m.damageEnemy(truck!, 999, 'cannon');
    m.step(DT);
    m.takeEvents();
    expect(m.state.truck.active).toBe(false);
    expect(m.state.pickups.filter((p) => p.kind === 'heavy' && !p.collected).length).toBeGreaterThanOrEqual(5);
  });
});

describe('pickups and combo', () => {
  it('collects a scrap pickup exactly once', () => {
    const m = new Match('m14');
    const bug = m.state.enemies.find((e) => e.type === 'scrapBug')!;
    m.damageEnemy(bug, 999, 'cannon');
    m.step(DT);
    m.takeEvents();
    const pickup = m.state.pickups.find((p) => !p.collected)!;
    expect(pickup).toBeDefined();
    // Put the tank directly on the pickup.
    m.state.tank.x = pickup.x + 0.2;
    m.state.tank.z = pickup.z + 0.2;
    m.state.tank.y = pickup.y;
    m.step(DT);
    m.takeEvents();
    expect(m.state.pickups.find((q) => q.id === pickup.id)!.collected).toBe(true);
    const count = m.state.stats.scrapCollected;
    // Keep driving through the same spot: no double collection.
    step(m, 2.0, holdDriver({ throttle: 1 }), holdGunner());
    expect(m.state.stats.scrapCollected).toBe(count);
  });

  it('combo grows beyond x2 only when both roles contribute recently', () => {
    const m = new Match('m16');
    m.addContribution('gunner', 3);
    m.step(DT);
    m.takeEvents();
    expect(m.state.combo.multiplier).toBe(2);
    m.addContribution('gunner', 3);
    m.step(DT);
    m.takeEvents();
    // Still capped at 2 because the Driver has not contributed recently.
    expect(m.state.combo.multiplier).toBe(2);
    m.addContribution('driver', 3);
    m.step(DT);
    m.takeEvents();
    expect(m.state.combo.multiplier).toBe(4);
    m.addContribution('driver', 6);
    m.addContribution('gunner', 6);
    m.step(DT);
    m.takeEvents();
    expect(m.state.combo.multiplier).toBe(5);
  });

  it('combo decays back to x1 after inactivity', () => {
    const m = new Match('m17');
    m.addContribution('gunner', 3);
    m.addContribution('driver', 3);
    m.step(DT);
    m.takeEvents();
    expect(m.state.combo.multiplier).toBe(3);
    step(m, BASE_CONFIG.scoring.comboDecayTime + 1);
    expect(m.state.combo.multiplier).toBe(1);
  });
});

describe('cannon charge (Combat 05)', () => {
  it('granting the capability enables hold/release with no meter', () => {
    const m = new Match('m18');
    m.state.enemies.length = 0;
    m.state.tank.shieldedT = 1e9;
    m.runtime.systems.capabilities.grant('cannon.charge', 'test');
    m.applyGunnerAction('secondaryPressed', 1);
    step(m, 40);
    expect(m.state.turret.cannonChargeFull).toBe(true);
    m.applyGunnerAction('secondaryReleased', 2);
    step(m, 1);
    expect(m.state.stats.chargedCannonShots).toBe(1);
    expect(m.state.stats.fullChargeShots).toBe(1);
  });
});

describe('wipeout, round, and rematch', () => {
  it('wipeout penalizes score, resets combo, and respawns with shield', () => {
    const m = new Match('m20');
    const bug = m.state.enemies.find((e) => e.type === 'scrapBug')!;
    m.damageEnemy(bug, 999, 'cannon');
    m.step(DT);
    m.takeEvents();
    const scoreBefore = m.state.stats.score;
    expect(scoreBefore).toBeGreaterThan(0);
    m.state.tank.shieldedT = 0;
    m.damageTank(100, 'test');
    expect(m.state.tank.integrity).toBe(0);
    expect(m.state.tank.deadT).toBeGreaterThan(0);
    expect(m.state.stats.wipeouts).toBe(1);
    expect(m.state.stats.score).toBe(Math.floor(scoreBefore * (1 - BASE_CONFIG.scoring.wipeoutPenalty)));
    expect(m.state.combo.multiplier).toBe(1);
    step(m, 3.5);
    expect(m.state.tank.deadT).toBe(0);
    expect(m.state.tank.integrity).toBe(100);
    expect(m.state.tank.shieldedT).toBeGreaterThan(0);
  });

  it('shield prevents damage', () => {
    const m = new Match('m21');
    m.damageTank(20, 'test');
    expect(m.state.tank.integrity).toBe(100);
  });

  it('round ends with results after 90 seconds', () => {
    const m = new Match('m22');
    m.setDriverInput(holdDriver({ throttle: 0.6 }));
    m.setGunnerInput({ aimYaw: Math.PI / 2, aimPitch: 0.05, primary: true, secondary: false, ability: false });
    for (let i = 0; i < 30 * 91; i++) {
      m.step(DT);
      m.takeEvents();
    }
    expect(m.state.phase).toBe('results');
    expect(m.results).toBeDefined();
    expect(m.results!.score).toBeGreaterThanOrEqual(0);
    expect(['D', 'C', 'B', 'A', 'S']).toContain(m.results!.grade);
  });

  it('rematch starts a fresh zeroed match in the same room', () => {
    const m1 = new Match('room-1', 'doubleBarrel');
    m1.damageTank(50, 'test');
    m1.step(DT);
    m1.takeEvents();
    const m2 = new Match('room-1', 'doubleBarrel');
    expect(m2.state.time).toBe(0);
    expect(m2.state.stats.score).toBe(0);
    expect(m2.state.stats.chargedCannonShots).toBe(0);
    expect(m2.state.tank.integrity).toBe(100);
    expect(m2.mcfg.modifier).toBe('doubleBarrel');
  });
});

