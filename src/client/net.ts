import { PROTOCOL_VERSION } from '../shared/net/protocol';
import { netcodeMetrics } from './netcode/netcodeMetrics';

export class NetClient {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private url: string;
  private closed = false;
  private readonly latencyMs: number;
  private readonly jitterMs: number;
  private readonly lossRate: number;

  onMessage: ((msg: Record<string, unknown>) => void) | null = null;
  onStatus: ((connected: boolean) => void) | null = null;

  constructor() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${proto}://${window.location.host}/ws`;
    const params = new URLSearchParams(window.location.search);
    this.latencyMs = Math.max(0, Number(params.get('latency') ?? 0) || 0);
    this.jitterMs = Math.max(0, Number(params.get('jitter') ?? 0) || 0);
    this.lossRate = Math.max(0, Math.min(0.9, Number(params.get('loss') ?? 0) || 0));
    this.onMessage = null;
  }

  connect() {
    if (this.closed) return;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;

    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.onStatus?.(true);
      for (const msg of this.queue) ws.send(msg);
      this.queue = [];
    };
    ws.onmessage = (e) => {
      const t0 = performance.now();
      netcodeMetrics.markSnapshotArrival(t0);
      netcodeMetrics.snapshotBytes = typeof e.data === 'string' ? e.data.length : 0;
      try {
        const parsed = JSON.parse(String(e.data)) as Record<string, unknown>;
        netcodeMetrics.parseMs = performance.now() - t0;
        if (this.latencyMs > 0 || this.jitterMs > 0) {
          const delay = this.latencyMs / 2 + (this.jitterMs > 0 ? (Math.random() - 0.5) * this.jitterMs : 0);
          setTimeout(() => this.onMessage?.(parsed), Math.max(0, delay));
        } else {
          this.onMessage?.(parsed);
        }
      } catch (err) {
        console.error('[net] message handling failed', err);
      }
    };
    ws.onclose = () => {
      // A replacement connection may already be opening while an older socket
      // finishes closing. Only the active socket owns connection status.
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus?.(false);
    };
    ws.onerror = () => {
      // close event follows
    };
  }

  send(msg: Record<string, unknown>) {
    const text = JSON.stringify({ protocol: PROTOCOL_VERSION, ...msg });
    if (this.lossRate > 0 && Math.random() < this.lossRate) return; // dev-only
    const sendNow = (): void => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.queue.push(text);
        // Leaving a crew intentionally closes the server-side socket. The next
        // multiplayer action must establish a fresh connection before its
        // queued request can be delivered.
        this.connect();
        return;
      }
      this.ws.send(text);
    };
    if (this.latencyMs > 0 || this.jitterMs > 0) {
      const delay = this.latencyMs / 2 + (this.jitterMs > 0 ? (Math.random() - 0.5) * this.jitterMs : 0);
      setTimeout(sendNow, Math.max(0, delay));
      return;
    }
    sendNow();
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  reopen() {
    this.closed = false;
    this.connect();
  }
}
