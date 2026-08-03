export interface GameplayEvent<T = unknown> {
  readonly type: string;
  readonly payload: T;
}

export type GameplayEventHandler<T = unknown> = (payload: T) => void;

/**
 * Typed, queue-based gameplay event bus. `emit` queues; `drain` delivers to
 * subscribers in order. The queue is bounded so runaway emission cannot grow
 * without limit; overflow drops the oldest event and is counted.
 */
export class GameplayEventBus {
  private readonly handlers = new Map<string, Set<GameplayEventHandler<unknown>>>();
  private readonly queue: GameplayEvent[] = [];
  private readonly maxQueued: number;
  private dropped = 0;

  constructor(maxQueued = 1024) {
    this.maxQueued = maxQueued;
  }

  subscribe<T>(type: string, handler: GameplayEventHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = handler as GameplayEventHandler<unknown>;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }

  emit<T>(type: string, payload: T): void {
    if (this.queue.length >= this.maxQueued) {
      this.queue.shift();
      this.dropped++;
    }
    this.queue.push({ type, payload });
  }

  drain(): readonly GameplayEvent[] {
    const out = this.queue.splice(0, this.queue.length);
    for (const event of out) {
      const handlers = this.handlers.get(event.type);
      if (handlers) {
        for (const handler of [...handlers]) handler(event.payload);
      }
    }
    return Object.freeze(out);
  }

  clear(): void {
    this.queue.length = 0;
    this.handlers.clear();
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get droppedCount(): number {
    return this.dropped;
  }
}
