/**
 * Model-size normalization (Monster System M4).
 *
 * Raw GLB dimensions never define gameplay size. Every model is normalized
 * to a target base height by size class, then tier scale is applied:
 *
 *   normalizationScale = targetHeight / sourceNeutralPoseHeight
 *   finalScale        = normalizationScale × tierScale × optionalVariantScale
 *
 * Tier scale propagates to render, collision, spawn clearance, engagement
 * reservation width, stopping distance, sockets, shadow, and debug bounds.
 * The full per-model normalized cache (from the monster pack catalog) is a
 * generated-content follow-up; this module is the single math authority.
 */
export const TARGET_HEIGHTS: Record<'small' | 'medium' | 'large', number> = {
  small: 1.02,
  medium: 1.53,
  large: 1.7,
};

export const TIER_SCALES: Record<'fodder' | 'specialist' | 'elite' | 'boss', number> = {
  fodder: 1,
  specialist: 1,
  elite: 3,
  boss: 5,
};

import {
  ENEMY_DEFINITION_SIZE_TIER,
  MONSTER_DIMENSIONS,
} from '../../generated/monsterDimensions.generated';

export interface NormalizedEnemyDimensions {
  targetHeight: number;
  normalizedWidth: number;
  normalizedHeight: number;
  normalizedDepth: number;
  collisionRadius: number;
  collisionHeight: number;
  groundOffset: number;
  spawnClearanceRadius: number;
  engagementRadius: number;
  shadowRadius: number;
}

/** One authoritative resolved record per monster definition/family. */
export interface ResolvedMonsterDimensions extends NormalizedEnemyDimensions {
  enemyId: string;
  familySlug: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceDepth: number;
  sourceGroundOffset: number;
  targetBaseHeight: number;
  normalizationScale: number;
  tierScale: number;
  variantScale: number;
  finalScale: number;
  finalWidth: number;
  finalHeight: number;
  finalDepth: number;
  projectileSocketY: number;
}

export function normalizedEnemyDimensions(
  sourceBounds: { width: number; height: number; depth: number; groundOffset: number },
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
  optionalVariantScale = 1,
): NormalizedEnemyDimensions {
  const targetHeight = TARGET_HEIGHTS[sizeClass];
  const sourceHeight = Math.max(0.01, sourceBounds.height);
  const normalizationScale = targetHeight / sourceHeight;
  const finalScale = normalizationScale * TIER_SCALES[tier] * optionalVariantScale;
  const normalizedWidth = sourceBounds.width * finalScale;
  const normalizedHeight = sourceBounds.height * finalScale;
  const normalizedDepth = sourceBounds.depth * finalScale;
  const collisionRadius = 0.45 * Math.max(normalizedWidth, normalizedDepth);
  const collisionHeight = 0.9 * normalizedHeight;
  return {
    targetHeight,
    normalizedWidth,
    normalizedHeight,
    normalizedDepth,
    collisionRadius,
    collisionHeight,
    groundOffset: sourceBounds.groundOffset * finalScale,
    spawnClearanceRadius: collisionRadius * 1.25,
    engagementRadius: collisionRadius * 2,
    shadowRadius: Math.max(collisionRadius * 1.5, normalizedHeight * 0.35),
  };
}

export function resolvedMonsterDimensions(
  enemyId: string,
  familySlug: string,
  source: { width: number; height: number; depth: number; groundOffset: number },
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
  optionalVariantScale = 1,
): ResolvedMonsterDimensions {
  const base = normalizedEnemyDimensions(source, sizeClass, tier, optionalVariantScale);
  const tierScale = TIER_SCALES[tier];
  const normalizationScale = TARGET_HEIGHTS[sizeClass] / Math.max(0.01, source.height);
  return {
    ...base,
    enemyId,
    familySlug,
    sourceWidth: source.width,
    sourceHeight: source.height,
    sourceDepth: source.depth,
    sourceGroundOffset: source.groundOffset,
    targetBaseHeight: TARGET_HEIGHTS[sizeClass],
    normalizationScale,
    tierScale,
    variantScale: optionalVariantScale,
    finalScale: normalizationScale * tierScale * optionalVariantScale,
    finalWidth: base.normalizedWidth,
    finalHeight: base.normalizedHeight,
    finalDepth: base.normalizedDepth,
    projectileSocketY: base.normalizedHeight * 0.7,
  };
}

export function slugFromEnemyId(enemyId: string): string {
  return enemyId
    .replace('enemy.quaternius.', '')
    .replace(/\.(boss|elite)$/, '');
}

const dimensionCache = new Map<string, ResolvedMonsterDimensions>();

/**
 * Resolve normalized gameplay dimensions from the generated source cache.
 * Never scans GLB bounds at runtime; results are cached per enemy id.
 */
export function resolveMonsterDimensions(
  enemyId: string,
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
  optionalVariantScale = 1,
): ResolvedMonsterDimensions {
  const key = `${enemyId}|${sizeClass}|${tier}`;
  const cached = dimensionCache.get(key);
  if (cached) return cached;
  const source = MONSTER_DIMENSIONS[slugFromEnemyId(enemyId)];
  if (!source) throw new Error(`no source dimensions for '${enemyId}'`);
  const dims = resolvedMonsterDimensions(
    enemyId,
    slugFromEnemyId(enemyId),
    source,
    sizeClass,
    tier,
    optionalVariantScale,
  );
  dimensionCache.set(key, dims);
  return dims;
}

/** Resolve by exact definition id using generated size/tier metadata. */
export function resolveMonsterDimensionsForDefId(
  defId: string,
): ResolvedMonsterDimensions {
  const meta = ENEMY_DEFINITION_SIZE_TIER[defId];
  if (!meta) throw new Error(`no size/tier metadata for '${defId}'`);
  return resolveMonsterDimensions(defId, meta.sizeClass, meta.tier, meta.optionalVariantScale);
}

/** Provisional normalized projectile socket height (centralized tuning point). */
export function resolveProjectileSocketY(
  enemyId: string,
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
): number {
  return resolveMonsterDimensions(enemyId, sizeClass, tier).normalizedHeight * 0.7;
}
