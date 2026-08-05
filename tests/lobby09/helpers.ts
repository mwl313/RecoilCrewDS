import { RoomManager, type SocketLike } from '../../src/server/room';

export class FakeSocket implements SocketLike {
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
  all(t: string) {
    return this.sent.filter((m) => m.t === t);
  }
}

export function makeManager(now = 1_000_000) {
  const manager = new RoomManager({ now: () => current });
  let current = now;
  return {
    manager,
    advance(ms: number) {
      current += ms;
    },
    now() {
      return current;
    },
  };
}

export function stepSeconds(manager: RoomManager, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 30); i++) manager.tick(1 / 30);
}

export function createAndJoin(manager: RoomManager, aName = 'TurboToad07', bName = 'ScrapFox42') {
  const a = new FakeSocket();
  const b = new FakeSocket();
  manager.handle(a, { t: 'create', displayName: aName });
  const code = a.last('created')!.code as string;
  manager.handle(b, { t: 'join', code, displayName: bName });
  return { manager, a, b, code, room: manager.getClient(a)!.room! };
}

export function readyBoth(manager: RoomManager, a: FakeSocket, b: FakeSocket) {
  manager.handle(a, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
  manager.handle(b, { t: 'lobbyReadySet', ready: true, lobbyRevision: 999 });
}
