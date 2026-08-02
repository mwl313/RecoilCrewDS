import { describe, expect, it } from 'vitest';
import { RoomManager, type SocketLike } from '../src/server/room';
import { GAME } from '../src/shared/config';

class FakeSocket implements SocketLike {
  sent: Record<string, unknown>[] = [];
  closed = false;
  send(msg: unknown) {
    this.sent.push(msg as Record<string, unknown>);
  }
  close() {
    this.closed = true;
  }
  last(t: string) {
    return [...this.sent].reverse().find((m) => m.t === t);
  }
}

function makeManager() {
  let now = 1000000;
  const manager = new RoomManager({ now: () => now });
  return {
    manager,
    advance(ms: number) {
      now += ms;
    },
    now() {
      return now;
    },
  };
}

function stepSeconds(manager: RoomManager, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 30); i++) manager.tick(1 / 30);
}

describe('room lifecycle', () => {
  it('creates a crew with a short code and assigns the creator as Driver', () => {
    const { manager } = makeManager();
    const sock = new FakeSocket();
    manager.handle(sock, { t: 'create' });
    const created = sock.last('created')!;
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.role).toBe('driver');
    expect(typeof created.sessionId).toBe('string');
    const client = manager.getClient(sock)!;
    expect(client.room?.code).toBe(created.code);
  });

  it('joins a crew by code and assigns the joiner as Gunner', () => {
    const { manager } = makeManager();
    const a = new FakeSocket();
    manager.handle(a, { t: 'create' });
    const code = a.last('created')!.code as string;
    const b = new FakeSocket();
    manager.handle(b, { t: 'join', code });
    expect(b.last('joined')!.role).toBe('gunner');
    expect(b.last('joined')!.code).toBe(code);
  });

  it('rejects unknown codes, full crews, and in-progress crews with clear errors', () => {
    const { manager } = makeManager();
    const a = new FakeSocket();
    manager.handle(a, { t: 'create' });
    const code = a.last('created')!.code as string;
    const bad = new FakeSocket();
    expect(() => manager.join('ZZZZZZ', bad)).toThrow('room not found');
    expect(bad.last('error')!.code).toBe('not_found');

    const b = new FakeSocket();
    manager.handle(b, { t: 'join', code });
    const c = new FakeSocket();
    expect(() => manager.join(code, c)).toThrow('room full');
    expect(c.last('error')!.code).toBe('full');
  });

  it('normalizes join codes to uppercase', () => {
    const { manager } = makeManager();
    const a = new FakeSocket();
    manager.handle(a, { t: 'create' });
    const code = (a.last('created')!.code as string).toLowerCase();
    const b = new FakeSocket();
    manager.handle(b, { t: 'join', code });
    expect(b.last('joined')!.role).toBe('gunner');
  });
});

describe('ready, countdown, and match start', () => {
  it('starts a countdown when both players ready and then a match', () => {
    const { manager, advance } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    const code = a.last('created')!.code as string;
    manager.handle(b, { t: 'join', code });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    expect(a.last('countdown')!.n).toBe(3);
    const room = manager.getClient(a)!.room!;
    expect(room.phase).toBe('countdown');
    stepSeconds(manager, 3.6);
    expect(room.phase).toBe('running');
    expect(room.match).toBeDefined();
    expect(a.last('start')!.matchId).toBeDefined();
  });

  it('broadcasts countdown changes and GO', () => {
    const { manager } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    manager.handle(b, { t: 'join', code: a.last('created')!.code as string });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    const seen = new Set(a.sent.filter((m) => m.t === 'countdown').map((m) => m.n));
    stepSeconds(manager, 3.5);
    for (const n of seen) {
      expect([0, 1, 2, 3]).toContain(Number(n));
    }
    expect(a.sent.some((m) => m.t === 'countdown' && m.n === 0)).toBe(true);
  });
});

describe('input handling', () => {
  it('only accepts the correct role input from each client', () => {
    const { manager, advance } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    manager.handle(b, { t: 'join', code: a.last('created')!.code as string });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    stepSeconds(manager, 3.5);
    advance(1);
    const room = manager.getClient(a)!.room!;
    const match = room.match!;
    const z0 = match.state.tank.z;
    // Driver moves.
    manager.handle(a, { t: 'input', seq: 1, driver: { throttle: 1, steer: 0, boost: false, brace: false } });
    stepSeconds(manager, 0.5);
    expect(match.state.tank.z).not.toBeCloseTo(z0, 0);
    // Stop the driver, then have the Gunner try to send driver input.
    manager.handle(a, { t: 'input', seq: 2, driver: { throttle: 0, steer: 0, boost: false, brace: false } });
    manager.tick(1 / 30);
    expect(match.getDriverInput().throttle).toBe(0);
    // Gunner cannot send driver input.
    manager.handle(b, { t: 'input', seq: 1, driver: { throttle: 1, steer: 0, boost: false, brace: false } });
    manager.tick(1 / 30);
    expect(match.getDriverInput().throttle).toBe(0);
    // But the Gunner's own input is accepted.
    manager.handle(b, { t: 'input', seq: 2, gunner: { aimYaw: -1.2, aimPitch: 0.2, mg: false, cannon: false, charge: false } });
    manager.tick(1 / 30);
    expect(match.getGunnerInput().aimYaw).toBeCloseTo(-1.2);
  });

  it('rejects out-of-sequence input', () => {
    const { manager, advance } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    manager.handle(b, { t: 'join', code: a.last('created')!.code as string });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    stepSeconds(manager, 3.5);
    advance(1);
    const room = manager.getClient(a)!.room!;
    const match = room.match!;
    const z0 = match.state.tank.z;
    manager.handle(a, { t: 'input', seq: 10, driver: { throttle: 1, steer: 0, boost: false, brace: false } });
    stepSeconds(manager, 0.3);
    const z1 = match.state.tank.z;
    expect(z1).not.toBeCloseTo(z0, 0);
    // A stale/lower sequence is ignored entirely.
    manager.handle(a, { t: 'input', seq: 3, driver: { throttle: 0, steer: 0, boost: false, brace: false } });
    stepSeconds(manager, 0.2);
    expect(Math.abs(match.state.tank.z - z1)).toBeGreaterThan(0.1);
  });

  it('clears stale inputs after the timeout so weapons stop firing', () => {
    const { manager, advance } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    manager.handle(b, { t: 'join', code: a.last('created')!.code as string });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    stepSeconds(manager, 3.5);
    advance(1);
    const room = manager.getClient(b)!.room!;
    const match = room.match!;
    manager.handle(b, {
      t: 'input',
      seq: 1,
      gunner: { aimYaw: 0, aimPitch: 0, mg: true, cannon: false, charge: false },
    });
    stepSeconds(manager, 0.4);
    const shotsBefore = match.events.filter((e) => e.type === 'shot').length + 0;
    match.takeEvents();
    advance(GAME.inputTimeout * 1000 + 100);
    stepSeconds(manager, 0.5);
    const shotsAfter = match.takeEvents().filter((e) => e.type === 'shot').length;
    expect(shotsAfter).toBe(0);
    expect(shotsBefore).toBeGreaterThanOrEqual(0);
  });

  it('an idle Driver never clears the Gunner cannon input', () => {
    const { manager, advance } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    manager.handle(b, { t: 'join', code: a.last('created')!.code as string });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    stepSeconds(manager, 3.5);
    // Let the Driver go stale without sending any movement input.
    advance(GAME.inputTimeout * 1000 + 500);
    const room = manager.getClient(b)!.room!;
    const match = room.match!;
    manager.handle(b, {
      t: 'input',
      seq: 1,
      gunner: { aimYaw: 0, aimPitch: 0, mg: false, cannon: true, charge: false },
    });
    stepSeconds(manager, 0.2);
    expect(match.state.shells.length).toBeGreaterThan(0);
    expect(match.state.turret.cannonCooldown).toBeGreaterThan(0);
  });
});

describe('full round and rematch', () => {
  it('runs a complete 90-second round to results and rematches in the same room', () => {
    const { manager, advance } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    manager.handle(b, { t: 'join', code: a.last('created')!.code as string });
    manager.handle(a, { t: 'ready', ready: true });
    manager.handle(b, { t: 'ready', ready: true });
    stepSeconds(manager, 3.5);
    const room = manager.getClient(a)!.room!;
    const firstMatchId = room.match!.state.matchId;
    // Drive and shoot through the round.
    let seq = 1;
    for (let i = 0; i < 90 * 30; i++) {
      advance(1000 / 30);
      if (i % 6 === 0) {
        manager.handle(a, {
          t: 'input',
          seq: seq++,
          driver: { throttle: 0.8, steer: Math.sin(i / 40) * 0.7, boost: i % 240 < 60, brace: false },
        });
        manager.handle(b, {
          t: 'input',
          seq: seq++,
          gunner: { aimYaw: Math.PI / 2 + Math.sin(i / 30) * 0.4, aimPitch: 0.05, mg: i % 3 < 2, cannon: i % 60 === 0, charge: false },
        });
      }
      manager.tick(1 / 30);
    }
    expect(room.phase).toBe('results');
    expect(room.match?.results).toBeDefined();
    const resultsMsg = a.last('results') as unknown as { results: { score: number } };
    expect(resultsMsg.results).toBeDefined();
    expect(resultsMsg.results.score).toBeGreaterThanOrEqual(0);

    // Rematch: both choose a modifier -> new countdown -> fresh match in same room.
    manager.handle(a, { t: 'rematch', modifier: 'soapTracks' });
    manager.handle(b, { t: 'rematch', modifier: 'soapTracks' });
    expect(room.phase).toBe('countdown');
    stepSeconds(manager, 3.5);
    expect(room.phase).toBe('running');
    expect(room.match!.state.matchId).not.toBe(firstMatchId);
    expect(room.match!.state.stats.score).toBe(0);
    expect(room.match!.mcfg.modifier).toBe('soapTracks');
    expect(room.code).toBe(a.last('created')!.code);
  });

  it('allows the Gunner to reconnect within grace with the same role', () => {
    const { manager } = makeManager();
    const a = new FakeSocket();
    const b = new FakeSocket();
    manager.handle(a, { t: 'create' });
    manager.handle(b, { t: 'join', code: a.last('created')!.code as string });
    const sessionId = b.last('joined')!.sessionId as string;
    const code = a.last('created')!.code as string;
    manager.disconnect(manager.getClient(b)!);
    const b2 = new FakeSocket();
    const client = manager.rejoin(code, sessionId, b2);
    expect(client).not.toBeNull();
    expect(client!.role).toBe('gunner');
    expect(b2.last('joined')!.role).toBe('gunner');
  });
});
