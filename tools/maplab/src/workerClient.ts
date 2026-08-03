import { generateMapLabResult, type MapLabGenerateRequest, type MapLabGenerateResult } from './generatorAdapter';

/**
 * Worker client with a documented main-thread fallback. Generation/validation
 * always run through the shared modules — the fallback only changes where
 * they execute. Stale results are dropped by the caller via requestId.
 */
export class MapLabGenerator {
  private worker: Worker | null;
  private fallback: boolean;
  private seq = 0;
  private readonly pending = new Map<number, (r: MapLabGenerateResult) => void>();
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingFallback: (() => void) | null = null;

  constructor() {
    let worker: Worker | null = null;
    let fallback = false;
    try {
      worker = new Worker(new URL('./worker/mapGeneration.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<MapLabGenerateResult>) => {
        const result = event.data as MapLabGenerateResult;
        const resolve = this.pending.get(result.requestId);
        if (resolve) {
          this.pending.delete(result.requestId);
          resolve(result);
        }
      };
      worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        this.fallback = true;
        for (const resolve of this.pending.values()) resolve({ requestId: -1, ok: false, error: 'worker error; fallback adapter active' });
        this.pending.clear();
      };
    } catch {
      worker = null;
      fallback = true;
    }
    this.worker = worker;
    this.fallback = fallback;
  }

  get usesWorker(): boolean {
    return !this.fallback && this.worker !== null;
  }

  generate(request: Omit<MapLabGenerateRequest, 'requestId'>): Promise<MapLabGenerateResult> {
    const requestId = ++this.seq;
    if (this.worker && !this.fallback) {
      return new Promise((resolve) => {
        this.pending.set(requestId, resolve);
        this.worker!.postMessage({ ...request, requestId });
      });
    }
    // Debounced main-thread fallback (same generator, no logic duplication).
    return new Promise((resolve) => {
      if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
      this.pendingFallback = () => resolve(generateMapLabResult({ ...request, requestId }));
      this.fallbackTimer = setTimeout(() => {
        this.pendingFallback?.();
        this.pendingFallback = null;
      }, 30);
    });
  }

  dispose(): void {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
