export class NetClient {
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private url: string;
  private closed = false;

  onMessage: ((msg: Record<string, unknown>) => void) | null = null;
  onStatus: ((connected: boolean) => void) | null = null;

  constructor() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = `${proto}://${window.location.host}/ws`;
  }

  connect() {
    if (this.closed) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.onStatus?.(true);
      for (const msg of this.queue) this.ws!.send(msg);
      this.queue = [];
    };
    this.ws.onmessage = (e) => {
      try {
        this.onMessage?.(JSON.parse(String(e.data)));
      } catch (err) {
        console.error('[net] message handling failed', err);
      }
    };
    this.ws.onclose = () => {
      this.onStatus?.(false);
    };
    this.ws.onerror = () => {
      // close event follows
    };
  }

  send(msg: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(JSON.stringify(msg));
      return;
    }
    this.ws.send(JSON.stringify(msg));
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
