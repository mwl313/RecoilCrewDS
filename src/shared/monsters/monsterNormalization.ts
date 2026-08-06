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
import type { EnemyPresentationProfileDefinition } from '../animation/animationProfileTypes';

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
  projectileSocket: [number, number, number];
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
  source: {
    width: number;
    height: number;
    depth: number;
    groundOffset: number;
    projectileSocket?: [number, number, number];
    groundSocket?: [number, number, number];
  },
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
  optionalVariantScale = 1,
): ResolvedMonsterDimensions {
  const base = normalizedEnemyDimensions(source, sizeClass, tier, optionalVariantScale);
  const tierScale = TIER_SCALES[tier];
  const normalizationScale = TARGET_HEIGHTS[sizeClass] / Math.max(0.01, source.height);
  const finalScale = normalizationScale * tierScale * optionalVariantScale;
  const projectile = source.projectileSocket ?? [0, source.height * 0.7, 0];
  const ground = source.groundSocket ?? [0, 0, 0];
  const projectileSocket: [number, number, number] = [
    (projectile[0] - ground[0]) * finalScale,
    (projectile[1] - ground[1]) * finalScale,
    (projectile[2] - ground[2]) * finalScale,
  ];
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
    finalScale,
    finalWidth: base.normalizedWidth,
    finalHeight: base.normalizedHeight,
    finalDepth: base.normalizedDepth,
    projectileSocket,
    projectileSocketY: projectileSocket[1],
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

/** Authored projectile socket offset, normalized with the gameplay body. */
export function resolveProjectileSocketOffset(
  enemyId: string,
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
): [number, number, number] {
  return resolveMonsterDimensions(enemyId, sizeClass, tier).projectileSocket;
}

/** Compatibility accessor for consumers that need only authored socket Y. */
export function resolveProjectileSocketY(
  enemyId: string,
  sizeClass: 'small' | 'medium' | 'large',
  tier: 'fodder' | 'specialist' | 'elite' | 'boss',
): number {
  return resolveProjectileSocketOffset(enemyId, sizeClass, tier)[1];
}

/**
 * Scan-free local root correction for markerless/static presentations.
 * Uses the generated neutral AABB and the complete authored pose.
 */
export function resolveGeneratedGroundOffset(
  dims: ResolvedMonsterDimensions,
  transform: EnemyPresentationProfileDefinition['transform'] | undefined,
): number {
  const scale = transform?.scale;
  const sx = (typeof scale === 'number' ? scale : (scale?.[0] ?? 1)) * dims.finalScale;
  const sy = (typeof scale === 'number' ? scale : (scale?.[1] ?? 1)) * dims.finalScale;
  const sz = (typeof scale === 'number' ? scale : (scale?.[2] ?? 1)) * dims.finalScale;
  const rotation = transform?.rotation ?? [0, 0, 0];
  const position = transform?.position ?? [0, 0, 0];
  let minimumY = Number.POSITIVE_INFINITY;
  for (const x of [-dims.sourceWidth / 2, dims.sourceWidth / 2]) {
    for (const y of [-dims.sourceGroundOffset, dims.sourceHeight - dims.sourceGroundOffset]) {
      for (const z of [-dims.sourceDepth / 2, dims.sourceDepth / 2]) {
        const rotated = rotateXyz(x * sx, y * sy, z * sz, rotation);
        minimumY = Math.min(minimumY, rotated[1] + position[1] * dims.finalScale);
      }
    }
  }
  return Number.isFinite(minimumY) ? -minimumY : 0;
}

function rotateXyz(
  x: number,
  y: number,
  z: number,
  rotation: readonly [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = rotation;
  const cx = Math.cos(rx); const sx = Math.sin(rx);
  const cy = Math.cos(ry); const sy = Math.sin(ry);
  const cz = Math.cos(rz); const sz = Math.sin(rz);
  const y1 = y * cx - z * sx; const z1 = y * sx + z * cx;
  const x2 = x * cy + z1 * sy; const z2 = -x * sy + z1 * cy;
  return [x2 * cz - y1 * sz, x2 * sz + y1 * cz, z2];
}
