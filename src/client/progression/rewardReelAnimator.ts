export interface RewardReelSymbol {
  glyph: string;
  label: string;
}

export interface RewardReelFrame {
  translateY: number;
  progress: number;
  velocity: number;
}

export const REWARD_REEL_CELL_HEIGHT = 112;
export const REWARD_REEL_CELL_COUNT = 10;
export const UPGRADE_LOCK_TIMES = [720, 850, 980] as const;
export const REWARD_TICK_INTERVALS = [32, 34, 37, 41, 46, 52, 60, 70, 82, 98, 118, 145] as const;

const UPGRADE_SYMBOLS: readonly RewardReelSymbol[] = [
  { glyph: '◈', label: 'ENGINE' },
  { glyph: '▣', label: 'ARMOR' },
  { glyph: '⌁', label: 'RECOIL' },
  { glyph: '✦', label: 'CRITICAL' },
  { glyph: '⬢', label: 'DASH' },
  { glyph: '▤', label: 'COOLDOWN' },
  { glyph: '⟡', label: 'RANGE' },
] as const;

const RELIC_SYMBOLS: readonly RewardReelSymbol[] = [
  { glyph: '◇', label: 'COMMON' },
  { glyph: '◈', label: 'RARE' },
  { glyph: '⬟', label: 'EPIC' },
  { glyph: '✦', label: 'LEGENDARY' },
  { glyph: '⬢', label: 'RARE' },
  { glyph: '◆', label: 'EPIC' },
  { glyph: '▣', label: 'COMMON' },
  { glyph: '⟡', label: 'UNKNOWN' },
] as const;

export function buildRewardReelSymbols(identity: string, index: number, kind: 'upgrade' | 'relic'): RewardReelSymbol[] {
  const source = kind === 'upgrade' ? UPGRADE_SYMBOLS : RELIC_SYMBOLS;
  const offset = (hash(identity) + index * 3) % source.length;
  return Array.from({ length: REWARD_REEL_CELL_COUNT }, (_, cell) => source[(cell + offset) % source.length]!);
}

export function rewardReelFrame(elapsedMs: number, index: number, kind: 'upgrade' | 'relic'): RewardReelFrame {
  const startMs = kind === 'upgrade' ? 245 + index * 18 : 330;
  const lockMs = kind === 'upgrade' ? UPGRADE_LOCK_TIMES[index] ?? UPGRADE_LOCK_TIMES[2] : 1_480;
  const progress = clamp01((elapsedMs - startMs) / Math.max(1, lockMs - startMs));
  // Cubic ease-out is the visual integral of a reel losing momentum: large
  // early travel, then progressively smaller movement before the hard stop.
  const travel = 1 - Math.pow(1 - progress, 3);
  const cells = kind === 'upgrade' ? 8.45 + index * 0.48 : 9.15;
  return {
    translateY: -travel * cells * REWARD_REEL_CELL_HEIGHT,
    progress,
    velocity: Math.pow(1 - progress, 2),
  };
}

export function rewardTickTimes(kind: 'upgrade' | 'relic'): number[] {
  const start = kind === 'upgrade' ? 285 : 650;
  let cursor = start;
  return REWARD_TICK_INTERVALS.map((interval) => {
    cursor += interval;
    return cursor;
  });
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
