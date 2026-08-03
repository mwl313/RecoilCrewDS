import { hash32 } from './seed';

/** Deterministic 32-bit PRNG (mulberry32). Returns floats in [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Named substreams. Each layer forks from the seed by name, so changing a
 * later layer (furniture) can never change an earlier layer (terrain).
 */
export const SUBSTREAM_NAMES = ['terrain', 'routes', 'furniture', 'spawns'] as const;
export type SubstreamName = (typeof SUBSTREAM_NAMES)[number];

export function forkSeed(seed: number, name: string): number {
  return hash32('substream', name, seed);
}

/** All named substreams of a seed (used by generation entry points). */
export function forkSubstreams(seed: number): Record<SubstreamName, number> {
  const out = {} as Record<SubstreamName, number>;
  for (const name of SUBSTREAM_NAMES) out[name] = forkSeed(seed, name);
  return out;
}
