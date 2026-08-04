import type { LevelCurveDefinition } from '../content/schemas/progression';

export interface LevelCurveResult {
  level: number;
  currentXp: number;
  xpForNextLevel: number;
  pendingLevelUps: number;
}

/**
 * Data-driven level progression. One collection can cross several
 * thresholds; each crossing increments pendingLevelUps.
 */
export function applyXp(
  curve: LevelCurveDefinition,
  level: number,
  currentXp: number,
  amount: number,
): LevelCurveResult {
  let lvl = Math.max(1, level);
  let xp = currentXp + amount;
  let pending = 0;
  let thresholdIndex = Math.max(0, lvl - 1);
  let guard = 0;
  while (thresholdIndex < curve.thresholds.length && xp >= curve.thresholds[thresholdIndex] && guard++ < 100) {
    xp -= curve.thresholds[thresholdIndex];
    lvl++;
    pending++;
    thresholdIndex++;
    if (curve.maximumLevel && lvl >= curve.maximumLevel) {
      xp = 0;
      break;
    }
  }
  if (curve.overflowRule === 'cap' && thresholdIndex >= curve.thresholds.length) {
    xp = 0;
  }
  return {
    level: lvl,
    currentXp: xp,
    xpForNextLevel: nextThreshold(curve, lvl),
    pendingLevelUps: pending,
  };
}

export function nextThreshold(curve: LevelCurveDefinition, level: number): number {
  const index = Math.max(0, level - 1);
  if (index < curve.thresholds.length) return curve.thresholds[index];
  if (curve.overflowRule === 'repeatLastDelta' && curve.thresholds.length >= 2) {
    const last = curve.thresholds[curve.thresholds.length - 1];
    const prev = curve.thresholds[curve.thresholds.length - 2];
    return Math.max(1, last + (last - prev));
  }
  return curve.thresholds[curve.thresholds.length - 1] ?? 1;
}
