import { describe, expect, it } from 'vitest';
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

function startRunningManager(): { manager: RoomManager; driver: FakeSocket; gunner: FakeSocket } {
  let now = 1000000;
  const manager = new RoomManager({ now: () => now });
  const driver = new FakeSocket();
  manager.handle(driver, { t: 'create' });
  const code = driver.last('created')!.code as string;
  const gunner = new FakeSocket();
  manager.handle(gunner, { t: 'join', code });
  manager.handle(driver, { t: 'ready', ready: true });
  manager.handle(gunner, { t: 'ready', ready: true });
  // Countdown 3.4 s → ~102 ticks.
  for (let i = 0; i < 110; i++) manager.tick(1 / 30);
  return { manager, driver, gunner };
}

describe('snapshot cadence and simulation tick', () => {
  it('emits true 20 Hz snapshots with interval subtraction', () => {
    const { manager, driver } = startRunningManager();
    driver.sent = driver.sent.filter((m) => m.t !== 'snapshot');
    for (let i = 0; i < 60; i++) manager.tick(1 / 30); // 2 simulated seconds
    const snaps = driver.sent.filter((m) => m.t === 'snapshot');
    // 2 snapshots per 3 ticks → 40 per 60 ticks = true 20 Hz.
    expect(snaps.length).toBeGreaterThanOrEqual(39);
    expect(snaps.length).toBeLessThanOrEqual(41);
  });

  it('serverTick is the real simulation tick, not the snapshot sequence', () => {
    const { manager, driver } = startRunningManager();
    driver.sent = driver.sent.filter((m) => m.t !== 'snapshot');
    for (let i = 0; i < 90; i++) manager.tick(1 / 30);
    const snaps = driver.sent.filter((m) => m.t === 'snapshot');
    expect(snaps.length).toBeGreaterThan(0);
    const last = snaps[snaps.length - 1];
    expect(Number(last.serverTick)).toBeGreaterThan(Number(last.seq));
    expect(Number(last.serverTick)).toBeGreaterThan(90);
  });

  it('snapshots carry impulse/op acknowledgements', () => {
    const { driver } = startRunningManager();
    const snap = driver.last('snapshot')!;
    expect(typeof snap.lastImpulseSeq).toBe('number');
    expect(Array.isArray(snap.opLog)).toBe(true);
    expect(typeof snap.lastProcessedDriverInputSeq).toBe('number');
    expect(typeof snap.lastProcessedGunnerInputSeq).toBe('number');
  });
});
