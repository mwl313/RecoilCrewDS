/**
 * Deterministic seed pipeline for the seeded map generator.
 *
 * The same code runs in Node (server/authoritative) and the browser
 * (client/Single Player), so seeds and generated terrain are identical on both
 * sides. No Math.random() anywhere in this module.
 */

/** Bump when generation rules change; old maps become intentionally stale. */
export const ARENA_GENERATOR_VERSION = 2;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SEPARATOR = 0x9e3779b9;

/**
 * Stable unsigned 32-bit hash over string/number components. FNV-1a per
 * component with a separator mix and a final avalanche — the combination is
 * never a raw XOR.
 */
export function hash32(...parts: Array<string | number>): number {
  let h = (FNV_OFFSET ^ 0x5c5a8d2a) >>> 0;
  for (const part of parts) {
    if (typeof part === 'number') {
      const v = Math.trunc(part) >>> 0;
      h = mixByte(h, v & 0xff);
      h = mixByte(h, (v >>> 8) & 0xff);
      h = mixByte(h, (v >>> 16) & 0xff);
      h = mixByte(h, (v >>> 24) & 0xff);
    } else {
      for (let i = 0; i < part.length; i++) {
        const c = part.charCodeAt(i);
        h = mixByte(h, c & 0xff);
        h = mixByte(h, (c >>> 8) & 0xff);
      }
    }
    h ^= SEPARATOR;
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  // Final avalanche (Murmur3-style finalizer).
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function mixByte(h: number, byte: number): number {
  h ^= byte & 0xff;
  return Math.imul(h, FNV_PRIME) >>> 0;
}

export interface ArenaSeedComponents {
  roomCode: string;
  matchIndex: number;
  profileId: string;
  generatorVersion: number;
}

/** The map identity seed — independent of retry attempts. */
export function composeArenaBaseSeed(components: ArenaSeedComponents): number {
  return hash32(
    'arena-seed',
    components.roomCode,
    components.matchIndex,
    components.profileId,
    components.generatorVersion,
  );
}

/** Per-candidate seed; the retry attempt is part of the hash, never XORed. */
export function composeArenaCandidateSeed(baseSeed: number, attempt: number): number {
  return hash32('arena-attempt', baseSeed, attempt);
}
