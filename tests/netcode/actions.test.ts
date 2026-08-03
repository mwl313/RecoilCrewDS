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
  it('cannonPressed is accepted immediately and produces one recoil impulse tagged with the actionSeq', () => {
    const { manager, gunner } = startRunning();
    gunner.sent = [];
    manager.handle(gunner, { t: 'action', actionSeq: 1, action: 'cannonPressed' });
    const result = gunner.last('actionResult')!;
    expect(result.actionSeq).toBe(1);
    expect(result.accepted).toBe(true);
    for (let i = 0; i < 4; i++) manager.tick(1 / 30);
    const impulses = gunner.sent.filter((m) => m.t === 'tankImpulse');
    expect(impulses.length).toBeGreaterThanOrEqual(1);
    expect(impulses[0].sourceActionSeq).toBe(1);
    expect(typeof impulses[0].impulseSeq).toBe('number');
    expect(typeof impulses[0].opSeq).toBe('number');
    expect(typeof impulses[0].simulationTick).toBe('number');
  });

  it('rejects cannonPressed while the cannon is cooling down', () => {
    const { manager, gunner } = startRunning();
    manager.handle(gunner, { t: 'action', actionSeq: 1, action: 'cannonPressed' });
    for (let i = 0; i < 3; i++) manager.tick(1 / 30); // cooldown takes effect
    manager.handle(gunner, { t: 'action', actionSeq: 2, action: 'cannonPressed' });
    const result = gunner.last('actionResult')!;
    expect(result.actionSeq).toBe(2);
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

  it('abilityStart is rejected unless JACKPOT is ready', () => {
    const { manager, gunner } = startRunning();
    manager.handle(gunner, { t: 'action', actionSeq: 1, action: 'abilityStart' });
    expect(gunner.last('actionResult')!.accepted).toBe(false);
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
});

describe('tank impulse exact-once (match level)', () => {
  it('applies recoil deltas exactly once and increments impulseSeq', () => {
    const match = new Match('m', 'none');
    const vx0 = match.state.tank.vx;
    match.runtime.systems.recoil.apply(1, 0, 7, 0.1);
    expect(match.state.tank.vx - vx0).toBeCloseTo(7);
    const impulses = match.takeImpulseEvents();
    expect(impulses.length).toBe(1);
    expect(impulses[0].impulseSeq).toBe(1);
    expect(match.opState.lastImpulseSeq).toBe(1);
    expect(match.opState.ops.some((o) => o.k === 'i' && o.s === 1)).toBe(true);
  });
});
