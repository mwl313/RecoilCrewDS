import { describe, expect, it } from 'vitest';
import { Match } from '../../src/shared/sim/match';
import { RoomManager, type SocketLike } from '../../src/server/room';

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  send(msg: unknown) {
    this.sent.push(msg as Record<string, unknown>);
  }
  sendText(text: string) {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }
  close() {}
  last(t: string) {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

function startRunning(): { manager: RoomManager; driver: FakeSocket; gunner: FakeSocket } {
  let now = 1000000;
  const manager = new RoomManager({ now: () => now });
  const driver = new FakeSocket();
  manager.handle(driver, { t: 'create' });
  const code = driver.last('created')!.code as string;
  const gunner = new FakeSocket();
  manager.handle(gunner, { t: 'join', code });
  manager.handle(driver, { t: 'ready', ready: true });
  manager.handle(gunner, { t: 'ready', ready: true });
  for (let i = 0; i < 110; i++) manager.tick(1 / 30);
  return { manager, driver, gunner };
}

describe('gunner discrete actions', () => {
  it('secondaryPressed + secondaryReleased produce one recoil impulse tagged with the release seq', () => {
    const { manager, gunner } = startRunning();
    gunner.sent = [];
    manager.handle(gunner, { t: 'action', actionSeq: 1, action: 'secondaryPressed', aimYaw: 0, aimPitch: 0.05 });
    expect(gunner.last('actionResult')!.accepted).toBe(true);
    manager.tick(1 / 30);
    manager.handle(gunner, { t: 'action', actionSeq: 2, action: 'secondaryReleased', aimYaw: 0, aimPitch: 0.05 });
    expect(gunner.last('actionResult')!.accepted).toBe(true);
    for (let i = 0; i < 4; i++) manager.tick(1 / 30);
    const impulses = gunner.sent.filter((m) => m.t === 'tankImpulse');
    expect(impulses.length).toBeGreaterThanOrEqual(1);
    expect(impulses[0].sourceActionSeq).toBe(2);
    expect(typeof impulses[0].impulseSeq).toBe('number');
    expect(typeof impulses[0].opSeq).toBe('number');
    expect(typeof impulses[0].simulationTick).toBe('number');
  });

  it('rejects secondaryPressed while the cannon is cooling down', () => {
    const { manager, gunner } = startRunning();
    manager.handle(gunner, { t: 'action', actionSeq: 1, action: 'secondaryPressed' });
    manager.tick(1 / 30);
    manager.handle(gunner, { t: 'action', actionSeq: 2, action: 'secondaryReleased' });
    for (let i = 0; i < 3; i++) manager.tick(1 / 30); // cooldown takes effect
    manager.handle(gunner, { t: 'action', actionSeq: 3, action: 'secondaryPressed' });
    const result = gunner.last('actionResult')!;
    expect(result.actionSeq).toBe(3);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('cooldown');
  });

  it('drops out-of-order/stale action sequences and unknown actions', () => {
    const { manager, gunner } = startRunning();
    gunner.sent = [];
    manager.handle(gunner, { t: 'action', actionSeq: 5, action: 'mgStart' });
    expect(gunner.last('actionResult')!.actionSeq).toBe(5);
    gunner.sent = [];
    manager.handle(gunner, { t: 'action', actionSeq: 5, action: 'mgStop' }); // stale
    expect(gunner.last('actionResult')).toBeUndefined();
    manager.handle(gunner, { t: 'action', actionSeq: 6, action: 'nonsense' });
    const result = gunner.last('actionResult')!;
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('unknown_action');
  });

  it('secondaryReleased is rejected without a valid held press', () => {
    const { manager, gunner } = startRunning();
    manager.handle(gunner, { t: 'action', actionSeq: 1, action: 'secondaryReleased' });
    expect(gunner.last('actionResult')!.accepted).toBe(false);
    expect(gunner.last('actionResult')!.reason).toBe('not_held');
  });

  it('relays sanitized accepted Driver input with normalized jump/dash edges', () => {
    const { manager, driver, gunner } = startRunning();
    gunner.sent = [];
    manager.handle(driver, { t: 'input', seq: 1, driver: { throttle: 1, steer: 0, dashPressed: true, jumpPressed: true } });
    manager.handle(driver, { t: 'input', seq: 2, driver: { throttle: 1, steer: 0, dashPressed: true, jumpPressed: true } });
    const relays = gunner.sent.filter((m) => m.t === 'driverInputRelay');
    expect(relays.length).toBe(2);
    expect(relays[0].seq).toBe(1);
    expect((relays[0].driver as { dashPressed: boolean }).dashPressed).toBe(true);
    expect((relays[0].driver as { jumpPressed: boolean }).jumpPressed).toBe(true);
    // Held edges must not repeat in the relay (server edge latch semantics).
    expect((relays[1].driver as { dashPressed: boolean }).dashPressed).toBe(false);
    expect((relays[1].driver as { jumpPressed: boolean }).jumpPressed).toBe(false);
  });

  it('publishes sequence baselines and accepts the first post-reconnect input and action', () => {
    const { manager, driver, gunner } = startRunning();
    const code = driver.last('created')!.code as string;
    const sessionId = gunner.last('joined')!.sessionId as string;
    manager.handle(gunner, {
      t: 'input',
      seq: 40,
      gunner: { aimYaw: 0.4, aimPitch: 0.05, primary: false, secondary: false },
    });
    manager.handle(gunner, { t: 'action', actionSeq: 70, action: 'secondaryPressed' });
    manager.tick(1 / 30);
    expect(manager.getClient(gunner)!.room!.match!.state.turret.cannonHeld).toBe(true);

    manager.disconnect(manager.getClient(gunner)!);
    const room = manager.getClient(driver)!.room!;
    expect(room.match!.getGunnerInput().secondary).toBe(false);
    expect(room.match!.state.turret.cannonHeld).toBe(false);

    const replacement = new FakeSocket();
    manager.rejoin(code, sessionId, replacement);
    expect(replacement.last('joined')!.sequenceBaseline).toEqual({ inputSeq: 40, actionSeq: 70 });

    manager.handle(replacement, {
      t: 'input',
      seq: 41,
      gunner: { aimYaw: -0.7, aimPitch: 0.1, primary: false, secondary: false },
    });
    expect(room.match!.getGunnerInput().aimYaw).toBeCloseTo(-0.7);
    manager.handle(replacement, { t: 'action', actionSeq: 71, action: 'secondaryPressed' });
    expect(replacement.last('actionResult')!.accepted).toBe(true);
  });

  it('clears Driver movement and relays a neutral frame immediately on disconnect', () => {
    const { manager, driver, gunner } = startRunning();
    manager.handle(driver, {
      t: 'input',
      seq: 25,
      driver: { throttle: 1, steer: 0.5, dashPressed: true, jumpPressed: false },
    });
    expect(manager.getClient(driver)!.room!.match!.getDriverInput().throttle).toBe(1);
    gunner.sent = [];

    manager.disconnect(manager.getClient(driver)!);

    const room = manager.getClient(gunner)!.room!;
    expect(room.match!.getDriverInput()).toEqual({ throttle: 0, steer: 0, dashPressed: false, jumpPressed: false });
    expect(gunner.last('driverInputRelay')!.seq).toBe(25);
    expect(gunner.last('driverInputRelay')!.driver).toEqual({ throttle: 0, steer: 0, dashPressed: false, jumpPressed: false });
  });
});

describe('tank impulse exact-once (match level)', () => {
  it('applies recoil deltas exactly once and increments impulseSeq', () => {
    const match = new Match('m', 'none');
    const vx0 = match.state.tank.vx;
    match.runtime.systems.recoil.apply({
      sourceId: 'weapon.mainCannon',
      kind: 'cannon',
      direction: { x: 1, y: 0, z: 0 },
      magnitude: 7,
      yawImpulse: 0.1,
      rollImpulse: 0,
      verticalScale: 1,
      launchThreshold: 0.25,
    });
    expect(match.state.tank.vx - vx0).toBeCloseTo(7);
    const impulses = match.takeImpulseEvents();
    expect(impulses.length).toBe(1);
    expect(impulses[0].impulseSeq).toBe(1);
    expect(match.opState.lastImpulseSeq).toBe(1);
    expect(match.opState.ops.some((o) => o.k === 'i' && o.s === 1)).toBe(true);
  });
});
