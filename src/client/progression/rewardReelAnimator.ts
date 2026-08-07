export interface RewardReelSymbol {
  glyph: string;
  label: string;
  rarity: RewardReelRarity;
}

export interface RewardReelFrame {
  translateY: number;
  progress: number;
  velocity: number;
  visibleCellIndex: number;
}

export type RewardReelRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const REWARD_REEL_CELL_HEIGHT = 112;
export const REWARD_REEL_CELL_COUNT = 18;
export const UPGRADE_LOCK_TIMES = [1_450, 1_750, 2_050] as const;
export const RELIC_LOCK_TIME = 2_550;
export const REWARD_TICK_INTERVALS = [36, 38, 41, 44, 48, 53, 59, 67, 77, 90, 106, 126, 150, 180, 215, 260, 300] as const;

const UPGRADE_SYMBOLS: readonly RewardReelSymbol[] = [
  { glyph: '◈', label: 'ENGINE', rarity: 'rare' },
  { glyph: '▣', label: 'ARMOR', rarity: 'common' },
  { glyph: '⌁', label: 'RECOIL', rarity: 'epic' },
  { glyph: '✦', label: 'CRITICAL', rarity: 'legendary' },
  { glyph: '⬢', label: 'DASH', rarity: 'rare' },
  { glyph: '▤', label: 'COOLDOWN', rarity: 'common' },
  { glyph: '⟡', label: 'RANGE', rarity: 'epic' },
] as const;

const RELIC_SYMBOLS: readonly RewardReelSymbol[] = [
  { glyph: '◇', label: 'COMMON', rarity: 'common' },
  { glyph: '◈', label: 'RARE', rarity: 'rare' },
  { glyph: '⬟', label: 'EPIC', rarity: 'epic' },
  { glyph: '✦', label: 'LEGENDARY', rarity: 'legendary' },
  { glyph: '⬢', label: 'RARE', rarity: 'rare' },
  { glyph: '◆', label: 'EPIC', rarity: 'epic' },
  { glyph: '▣', label: 'COMMON', rarity: 'common' },
  { glyph: '⟡', label: 'UNKNOWN', rarity: 'common' },
] as const;

export function buildRewardReelSymbols(identity: string, index: number, kind: 'upgrade' | 'relic'): RewardReelSymbol[] {
  const source = kind === 'upgrade' ? UPGRADE_SYMBOLS : RELIC_SYMBOLS;
  const offset = (hash(identity) + index * 3) % source.length;
  return Array.from({ length: REWARD_REEL_CELL_COUNT }, (_, cell) => source[(cell + offset) % source.length]!);
}

export function rewardReelFrame(elapsedMs: number, index: number, kind: 'upgrade' | 'relic'): RewardReelFrame {
  const startMs = kind === 'upgrade' ? 245 + index * 18 : 250;
  const lockMs = kind === 'upgrade' ? UPGRADE_LOCK_TIMES[index] ?? UPGRADE_LOCK_TIMES[2] : RELIC_LOCK_TIME;
  const progress = clamp01((elapsedMs - startMs) / Math.max(1, lockMs - startMs));
  // Cubic ease-out is the visual integral of a reel losing momentum: large
  // early travel, then progressively smaller movement before the hard stop.
  const travel = 1 - Math.pow(1 - progress, 3);
  const cells = kind === 'upgrade' ? 14.45 + index * 0.62 : 17.15;
  return {
    translateY: -travel * cells * REWARD_REEL_CELL_HEIGHT,
    progress,
    velocity: Math.pow(1 - progress, 2),
    visibleCellIndex: Math.min(REWARD_REEL_CELL_COUNT - 1, Math.round(travel * cells)),
  };
}

export function rewardTickTimes(kind: 'upgrade' | 'relic'): number[] {
  const start = kind === 'upgrade' ? 280 : 600;
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
