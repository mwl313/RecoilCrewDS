import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DriverPredictor } from '../src/client/predictor';
import { BASE_CONFIG, buildMatchConfig } from '../src/shared/config';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { MatchRules } from '../src/shared/rules/matchRules';
import { Match } from '../src/shared/sim/match';
import { statModifier } from '../src/shared/stats/statModifier';
import { RoomManager, type SocketLike } from '../src/server/room';
import type { DriverInput, ModifierId } from '../src/shared/types';

const DT = 1 / 30;
const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

function driver(over: Partial<DriverInput> = {}): DriverInput {
  return { throttle: 0, steer: 0, dashPressed: false, jumpPressed: false, ...over };
}

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  send(msg: unknown) {
    this.sent.push(msg as Record<string, unknown>);
  }
  close() {}
  last(t: string) {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

function startCrew(manager: RoomManager) {
  const a = new FakeSocket();
  const b = new FakeSocket();
  manager.handle(a, { t: 'create' });
  const code = a.last('created')!.code as string;
  manager.handle(b, { t: 'join', code });
  manager.handle(a, { t: 'ready', ready: true });
  manager.handle(b, { t: 'ready', ready: true });
  for (let i = 0; i < 105; i++) manager.tick(1 / 30);
  return { a, b, room: manager.getClient(a)!.room! };
}

describe('authoritative edge consumption (MatchRuntime)', () => {
  it('applies a jump edge once per sequenced frame and never while held', () => {
    const m = new Match('jump-edge');
    const startZ = m.state.tank.z;
    // One frame with the jump edge.
    m.setDriverInput(driver({ throttle: 1, jumpPressed: true }));
    m.step(DT);
    const vyAfterJump = m.state.tank.vy;
    expect(vyAfterJump).toBeGreaterThan(3);
    // The same input object is held for more steps: no second jump.
    for (let i = 0; i < 30; i++) {
      m.step(DT);
      m.takeEvents();
    }
    // It must be airborne (no re-launch) or landed; never a fresh jump
    // velocity spike above the launch value in a later step.
    expect(m.state.tank.vy).toBeLessThanOrEqual(vyAfterJump);
    // Landing happens eventually, and the tank never jumped twice in a row.
    expect(m.state.tank.z).toBeGreaterThan(startZ);
  });

  it('applies a dash edge exactly once per sequenced frame', () => {
    const m = new Match('dash-edge');
    m.setDriverInput(driver({ dashPressed: true }));
    m.step(DT);
    expect(m.state.tank.dashCooldown).toBeCloseTo(BASE_CONFIG.tank.dashCooldown, 6);
    const speedAfterFirst = Math.hypot(m.state.tank.vx, m.state.tank.vz);
    // Held edge must not re-dash.
    for (let i = 0; i < 10; i++) {
      m.step(DT);
      m.takeEvents();
    }
    expect(Math.hypot(m.state.tank.vx, m.state.tank.vz)).toBeLessThanOrEqual(speedAfterFirst + 0.01);
  });

  it('emits exactly one jump and one dash event per accepted edge', () => {
    const m = new Match('jump-events');
    m.setDriverInput(driver({ jumpPressed: true, dashPressed: true }));
    m.step(DT);
    const events = m.takeEvents();
    expect(events.filter((e) => e.type === 'jump').length).toBe(1);
    expect(events.filter((e) => e.type === 'dash').length).toBe(1);
    // Held input produces no additional events.
    m.step(DT);
    expect(m.takeEvents().filter((e) => e.type === 'jump' || e.type === 'dash').length).toBe(0);
  });

  it('clearDriverInput clears pending edges with stale input', () => {
    const m = new Match('clear-edges');
    m.setDriverInput(driver({ jumpPressed: true, dashPressed: true }));
    m.clearDriverInput();
    m.step(DT);
    expect(m.state.tank.vy).toBe(0);
    expect(m.state.tank.dashCooldown).toBe(0);
    expect(m.takeEvents().filter((e) => e.type === 'jump' || e.type === 'dash').length).toBe(0);
  });

  it('a dead tank discards pending edges', () => {
    const m = new Match('dead-edges');
    m.state.tank.shieldedT = 0;
    m.damageTank(100, 'test');
    expect(m.state.tank.deadT).toBeGreaterThan(0);
    m.setDriverInput(driver({ jumpPressed: true, dashPressed: true }));
    m.step(DT);
    expect(m.state.tank.vy).toBe(0);
    expect(m.state.tank.dashCooldown).toBe(0);
  });
});

describe('server / predictor parity', () => {
  it('authority and local prediction converge under identical sequenced inputs', () => {
    const authority = new Match('parity-authority');
    const predictor = new DriverPredictor(BASE_CONFIG, 'none');
    predictor.resetFromAuthority(authority.state.tank);

    // A deterministic script with jump/dash edges, held throttle/steer, and
    // cooldown-limited dashes.
    const inputs: DriverInput[] = [];
    for (let i = 0; i < 120; i++) {
      const t = i * DT;
      inputs.push(
        driver({
          throttle: 0.8,
          steer: Math.sin(t / 0.9) * 0.5,
          jumpPressed: i === 3 || i === 75,
          dashPressed: i === 10 || i === 55,
        }),
      );
    }

    for (let i = 0; i < inputs.length; i++) {
      authority.setDriverInput({ ...inputs[i] });
      authority.step(DT);
      authority.takeEvents();
      predictor.pushInput(i + 1, { ...inputs[i] });
      predictor.sampleInput({ ...inputs[i] }, DT);
    }

    const a = authority.state.tank;
    const p = predictor.predicted;
    expect(p.x).toBeCloseTo(a.x, 8);
    expect(p.y).toBeCloseTo(a.y, 8);
    expect(p.z).toBeCloseTo(a.z, 8);
    expect(p.vx).toBeCloseTo(a.vx, 8);
    expect(p.vy).toBeCloseTo(a.vy, 8);
    expect(p.vz).toBeCloseTo(a.vz, 8);
    expect(p.yaw).toBeCloseTo(a.yaw, 8);
    expect(p.grounded).toBe(a.grounded);
    expect(p.dashCooldown).toBeCloseTo(a.dashCooldown, 8);
    expect(p.dashPresentationT).toBeCloseTo(a.dashPresentationT, 8);
  });

  it('reconciliation replay applies each queued edge exactly once', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none');
    const authority = new Match('replay-authority');
    predictor.resetFromAuthority(authority.state.tank);

    // seq 1: jump. seq 2: dash after the jump leaves the ground (air dash).
    predictor.pushInput(1, driver({ jumpPressed: true }));
    predictor.pushInput(2, driver({ dashPressed: true }));

    // Authority processed seq 1 only; replay seq 2 from authority.
    authority.setDriverInput(driver({ jumpPressed: true }));
    authority.step(DT);
    authority.takeEvents();

    predictor.reconcile(authority.state.tank, 1);
    // Replay applied only the dash edge: horizontal burst from the air dash.
    expect(Math.hypot(predictor.predicted.vx, predictor.predicted.vz)).toBeCloseTo(
      BASE_CONFIG.tank.dashImpulse * BASE_CONFIG.tank.dashAirMultiplier,
      5,
    );
    // The replayed jump did NOT re-apply (vy is only gravity-decayed).
    const launch = Math.sqrt(2 * BASE_CONFIG.tank.gravity * BASE_CONFIG.tank.jumpHeight);
    expect(predictor.predicted.vy).toBeLessThan(launch - BASE_CONFIG.tank.gravity * DT);
    expect(predictor.pendingCount).toBe(0);
  });

  it('replay does not double-apply a dash when both frames carried it', () => {
    const predictor = new DriverPredictor(BASE_CONFIG, 'none');
    const authority = new Match('replay-dash');
    predictor.resetFromAuthority(authority.state.tank);
    // seq 1: dash. seq 2: same frame edge already cleared by the client latch
    // (dashPressed false).
    predictor.pushInput(1, driver({ dashPressed: true }));
    predictor.pushInput(2, driver({}));
    authority.setDriverInput(driver({ dashPressed: true }));
    authority.step(DT);
    authority.takeEvents();
    predictor.reconcile(authority.state.tank, 1);
    // Only one dash worth of horizontal speed remains (minus grip decay),
    // never two.
    expect(Math.hypot(predictor.predicted.vx, predictor.predicted.vz)).toBeLessThan(
      BASE_CONFIG.tank.dashImpulse * 1.05,
    );
  });
});

describe('movement-rules synchronization', () => {
  it('jump/dash stats are movement-critical and replicate through the block', () => {
    const rules = MatchRules.fromContentPack(pack, 'none');
    const move0 = rules.movementRulesRevision;
    rules.addModifier(statModifier('test.jump', 'tank.jumpHeight', 'multiply', 1.4, { source: 'test' }));
    expect(rules.movementRulesRevision).toBe(move0 + 1);
    expect(rules.movementBlock().tank.jumpHeight).toBeCloseTo(BASE_CONFIG.tank.jumpHeight * 1.4, 6);
    rules.addModifier(statModifier('test.dash', 'tank.dashImpulse', 'add', 3, { source: 'test' }));
    expect(rules.movementRulesRevision).toBe(move0 + 2);
    expect(rules.movementBlock().tank.dashImpulse).toBeCloseTo(BASE_CONFIG.tank.dashImpulse + 3, 6);
    expect(rules.movementBlock().tank.dashCooldown).toBe(BASE_CONFIG.tank.dashCooldown);
    expect(rules.movementBlock().tank.dashAirMultiplier).toBe(BASE_CONFIG.tank.dashAirMultiplier);
    expect(rules.movementBlock().tank.dashMaxHorizontalSpeed).toBe(BASE_CONFIG.tank.dashMaxHorizontalSpeed);
  });

  it('two rooms can resolve different jump/dash values without contamination', () => {
    const manager = new RoomManager({ pack, content: { packId: 'demo', version: '1.0.0', hash: 'x'.repeat(64), modeId: 'mode.demoScoreAttack' } });
    const crewA = startCrew(manager);
    const crewB = startCrew(manager);
    const rulesA = crewA.room.match!.rules;
    const rulesB = crewB.room.match!.rules;
    const revB = rulesB.rulesRevision;
    const moveB = rulesB.movementRulesRevision;
    rulesA.addModifier(statModifier('roomA.jump', 'tank.jumpHeight', 'override', 4, { source: 'test' }));
    expect(rulesA.movementBlock().tank.jumpHeight).toBe(4);
    expect(rulesB.movementBlock().tank.jumpHeight).toBe(BASE_CONFIG.tank.jumpHeight);
    expect(rulesB.rulesRevision).toBe(revB);
    expect(rulesB.movementRulesRevision).toBe(moveB);
  });
});

describe('room sanitization of action edges', () => {
  it('accepts only explicit booleans for dashPressed/jumpPressed', () => {
    const manager = new RoomManager();
    const { a, room } = startCrew(manager);
    manager.handle(a, {
      t: 'input',
      seq: 1,
      driver: { throttle: 0, steer: 0, dashPressed: 1, jumpPressed: 'yes' as unknown as boolean },
    });
    manager.tick(1 / 30);
    expect(room.match!.getDriverInput().dashPressed).toBe(false);
    expect(room.match!.getDriverInput().jumpPressed).toBe(false);

    manager.handle(a, {
      t: 'input',
      seq: 2,
      driver: { throttle: 0, steer: 0, dashPressed: true, jumpPressed: true },
    });
    manager.tick(1 / 30);
    expect(room.match!.getDriverInput().dashPressed).toBe(true);
    expect(room.match!.getDriverInput().jumpPressed).toBe(true);
  });
});

describe('difficulty and content data', () => {
  it('schema rejects negative jumpHeight in content', async () => {
    const { tankSchema } = await import('../src/shared/content/schemas/tank');
    const bad = {
      id: 'tank.bad',
      forwardSpeed: 18,
      reverseSpeed: 8,
      accel: 14,
      reverseAccel: 10,
      steerLow: 1.5,
      steerHigh: 0.9,
      normalGrip: 2.1,
      airControl: 0.55,
      airGripMultiplier: 0.35,
      groundYawDamping: 3.2,
      airYawDamping: 2.2,
      hardHorizontalSpeedCap: 35,
      maxVisualAirPitch: 0.22,
      maxVisualAirRoll: 0.28,
      visualAirLevelRate: 4,
      landingGripSeconds: 0.12,
      landingGripMultiplier: 0.35,
      gravity: 13.5,
      jumpHeight: -1,
      rampLaunchSpeed: 6.5,
      dashImpulse: 13,
      dashCooldown: 0.8,
      dashAirMultiplier: 0.8,
      dashMaxHorizontalSpeed: 33,
      dashPresentationSeconds: 0.18,
      collisionRadius: 1.35,
      footprint: [{ offset: 0, radius: 1 }],
      maxSafeStep: 0.45,
      maxSubsteps: 8,
      reverseSteerMult: 0.7,
      maxIntegrity: 100,
      respawnTime: 3,
      shieldTime: 2,
      autoRightTime: 1.2,
      autoRightRoll: 1.15,
      fallDamageSpeed: 14,
      fallDamage: 10,
      recoilImpulse: 7.2,
      recoilSpin: 1.7,
      jackpotRecoilImpulse: 17,
      jackpotSpin: 4.5,
      mgRecoilImpulse: 0.07,
    };
    expect(tankSchema.safeParse(bad).success).toBe(false);
    expect(tankSchema.safeParse({ ...bad, jumpHeight: 2.2 }).success).toBe(true);
    expect(tankSchema.safeParse({ ...bad, jumpHeight: 2.2, dashCooldown: -0.5 }).success).toBe(false);
  });
});

describe('modifier path (legacy parity)', () => {
  it('legacy and content paths resolve identical jump/dash defaults for every modifier', () => {
    const modifiers: ModifierId[] = ['none', 'soapTracks', 'moonYard', 'doubleBarrel', 'volatileInventory', 'scrapMagnet', 'overclocked'];
    for (const modifier of modifiers) {
      const content = MatchRules.fromContentPack(pack, modifier);
      const legacy = MatchRules.fromLegacyConfig(modifier);
      expect(content.movementBlock().tank.jumpHeight, modifier).toBe(legacy.movementBlock().tank.jumpHeight);
      expect(content.movementBlock().tank.dashImpulse, modifier).toBe(legacy.movementBlock().tank.dashImpulse);
      expect(content.matchConfig, modifier).toEqual(legacy.matchConfig);
    }
  });
});
