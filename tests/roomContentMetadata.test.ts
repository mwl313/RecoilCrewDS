import { describe, expect, it } from 'vitest';
import { RoomManager, type ContentMetadata, type SocketLike } from '../src/server/room';

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

const CONTENT_META: ContentMetadata = {
  packId: 'demo',
  version: '1.0.0',
  hash: 'a'.repeat(64),
  modeId: 'mode.demoScoreAttack',
};

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

describe('content pack metadata on the server', () => {
  it('attaches pack id/version/hash/mode to rooms and the start message', () => {
    const manager = new RoomManager({ content: CONTENT_META });
    const { a, room } = startCrew(manager);
    expect(room.content).toEqual(CONTENT_META);
    const start = a.last('start') as { content?: ContentMetadata };
    expect(start.content).toEqual(CONTENT_META);
  });

  it('omits content metadata entirely when not configured (backwards compatible)', () => {
    const manager = new RoomManager();
    const { a, room } = startCrew(manager);
    expect(room.content).toBeNull();
    const start = a.last('start') as Record<string, unknown>;
    expect('content' in start).toBe(false);
  });

  it('never accepts client-authored gameplay definitions', () => {
    const manager = new RoomManager({ content: CONTENT_META });
    const { a, b, room } = startCrew(manager);
    const match = room.match!;
    const scoreBefore = match.state.stats.score;
    const tankZBefore = match.state.tank.z;

    // Unknown message types (define/register/load) are ignored entirely.
    manager.handle(a, {
      t: 'define',
      category: 'enemies',
      definition: { id: 'enemy.hacked', hp: 1, speed: 999 },
    });
    manager.handle(a, {
      t: 'register',
      behavior: 'behavior.hacked',
      implementation: 'client-code',
    });
    // Even a valid input message cannot smuggle definitions.
    manager.handle(a, {
      t: 'input',
      seq: 1,
      driver: { throttle: 1, steer: 0, boost: false, brace: false },
      definitions: [{ id: 'weapon.hacked', damage: 9999 }],
      content: { packId: 'hacked', version: '9.9.9', hash: 'deadbeef', modeId: 'mode.hacked' },
    });
    manager.tick(1 / 30);
    manager.tick(1 / 30);

    expect(a.last('error')).toBeUndefined();
    expect(room.content).toEqual(CONTENT_META);
    expect(match.state.stats.score).toBe(scoreBefore);
    // The driver input itself is applied (that is the real wire contract).
    expect(match.state.tank.z).not.toBeCloseTo(tankZBefore, 4);
    expect(match.state.enemies.some((e) => (e.type as string) === 'hacked')).toBe(false);
    void b;
  });
});
