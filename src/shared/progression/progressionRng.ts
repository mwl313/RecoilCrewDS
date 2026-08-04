/**
 * Deterministic progression RNG streams. Separate from spawn/map/combat
 * RNG; same seed + event order → same results. Clients never draw.
 */
export class ProgressionRng {
  private readonly streams = new Map<string, () => number>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  private readonly seed: number;

  stream(name: string): () => number {
    let fn = this.streams.get(name);
    if (fn) return fn;
    let a = (hashString(name) ^ this.seed) >>> 0;
    fn = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.streams.set(name, fn);
    return fn;
  }

  reset(): void {
    this.streams.clear();
  }
}

function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Roll an index from weighted entries; returns -1 when sum <= 0. */
export function rollWeighted(rand: () => number, weights: readonly number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return -1;
  let r = rand() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
