import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION } from '../src/shared/net/protocol';
import { NetClient } from '../src/client/net';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('NetClient connection lifecycle', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('window', {
      location: {
        protocol: 'http:',
        host: 'localhost:5050',
        search: '',
      },
    });
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconnects and delivers create after the server closes a departed crew socket', () => {
    const client = new NetClient();
    client.connect();

    const first = FakeWebSocket.instances[0];
    first.open();
    client.send({ t: 'leave' });
    expect(JSON.parse(first.sent[0])).toEqual({ protocol: PROTOCOL_VERSION, t: 'leave' });

    first.close();
    client.send({ t: 'create', displayName: 'Retry Driver' });

    expect(FakeWebSocket.instances).toHaveLength(2);
    const second = FakeWebSocket.instances[1];
    expect(second.sent).toEqual([]);

    second.open();
    expect(second.sent.map((message) => JSON.parse(message))).toEqual([
      { protocol: PROTOCOL_VERSION, t: 'create', displayName: 'Retry Driver' },
    ]);
  });

  it('does not create duplicate sockets while a connection is opening', () => {
    const client = new NetClient();
    client.send({ t: 'create' });
    client.send({ t: 'join', code: 'ABC123' });

    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0].open();
    expect(FakeWebSocket.instances[0].sent.map((message) => JSON.parse(message))).toEqual([
      { protocol: PROTOCOL_VERSION, t: 'create' },
      { protocol: PROTOCOL_VERSION, t: 'join', code: 'ABC123' },
    ]);
  });
});
