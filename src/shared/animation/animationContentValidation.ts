import {
  assertNoFallbackCycles,
  ENEMY_ANIMATION_ROLES,
  isAnimationRole,
  walkFallbackChain,
  type EnemyAnimationRole,
} from './animationRoles';
import type {
  AnimationLodPolicyDefinition,
  AnimationShadowPolicyDefinition,
  EnemyAnimationContentBundle,
  EnemyAnimationProfileDefinition,
  EnemyPresentationProfileDefinition,
} from './animationProfileTypes';

export interface AnimationContentSource {
  presentationProfiles: readonly EnemyPresentationProfileDefinition[];
  animationProfiles: readonly EnemyAnimationProfileDefinition[];
  lodPolicies: readonly AnimationLodPolicyDefinition[];
  shadowPolicies: readonly AnimationShadowPolicyDefinition[];
}

export interface AssetIdResolver {
  (id: string): boolean;
}

/** Collect every validation issue instead of stopping at the first. */
export function validateAnimationContent(
  source: AnimationContentSource,
  resolveAssetId: AssetIdResolver,
  enemyJson: readonly Record<string, unknown>[] = [],
): string[] {
  const issues: string[] = [];
  const presentationIds = new Set<string>();
  const animationIds = new Set<string>();
  const lodIds = new Set<string>();
  const shadowIds = new Set<string>();

  for (const p of source.presentationProfiles) {
    if (presentationIds.has(p.id)) issues.push(`duplicate presentation profile '${p.id}'`);
    presentationIds.add(p.id);
    if (!resolveAssetId(p.nearModelAssetId)) {
      issues.push(`presentation ${p.id}: unknown nearModelAssetId '${p.nearModelAssetId}'`);
    }
    if (p.farModelAssetId && !resolveAssetId(p.farModelAssetId)) {
      issues.push(`presentation ${p.id}: unknown farModelAssetId '${p.farModelAssetId}'`);
    }
    if (p.aggregateModelAssetId && !resolveAssetId(p.aggregateModelAssetId)) {
      issues.push(`presentation ${p.id}: unknown aggregateModelAssetId '${p.aggregateModelAssetId}'`);
    }
  }

  for (const a of source.animationProfiles) {
    if (animationIds.has(a.id)) issues.push(`duplicate animation profile '${a.id}'`);
    animationIds.add(a.id);
    try {
      assertNoFallbackCycles(a.fallbacks, `animation ${a.id}`);
    } catch (err) {
      issues.push((err as Error).message);
    }
    if (a.stateMap) {
      for (const [key, role] of Object.entries(a.stateMap)) {
        if (!isAnimationRole(role)) issues.push(`animation ${a.id}: stateMap['${key}'] invalid role '${role}'`);
      }
    }
  }

  for (const l of source.lodPolicies) {
    if (lodIds.has(l.id)) issues.push(`duplicate lod policy '${l.id}'`);
    lodIds.add(l.id);
  }
  for (const s of source.shadowPolicies) {
    if (shadowIds.has(s.id)) issues.push(`duplicate shadow policy '${s.id}'`);
    shadowIds.add(s.id);
  }

  for (const p of source.presentationProfiles) {
    if (p.animationProfileId && !animationIds.has(p.animationProfileId)) {
      issues.push(`presentation ${p.id}: unknown animationProfileId '${p.animationProfileId}'`);
    }
    if (!lodIds.has(p.lodPolicyId)) {
      issues.push(`presentation ${p.id}: unknown lodPolicyId '${p.lodPolicyId}'`);
    }
    if (!shadowIds.has(p.shadowPolicyId)) {
      issues.push(`presentation ${p.id}: unknown shadowPolicyId '${p.shadowPolicyId}'`);
    }
  }

  for (const raw of enemyJson) {
    const id = typeof raw.id === 'string' ? raw.id : '(unknown)';
    const profileId = raw.presentationProfileId;
    if (typeof profileId === 'string' && !presentationIds.has(profileId)) {
      issues.push(`enemy ${id}: unknown presentationProfileId '${profileId}'`);
    }
  }

  return issues;
}

/**
 * Resolve a semantic role to a usable role through the profile clip map and
 * fallback chain. Returns null when no role in the chain has a clip name.
 */
export function resolveRoleWithFallback(
  profile: EnemyAnimationProfileDefinition,
  role: EnemyAnimationRole,
  hasClip: (clipName: string) => boolean,
): EnemyAnimationRole | null {
  return walkFallbackChain(role, profile.fallbacks, (candidate) => {
    const clipName = profile.clips[candidate];
    return typeof clipName === 'string' && hasClip(clipName);
  });
}

/** Role lookup helper used by tests and diagnostics. */
export function profileRoleIds(profile: EnemyAnimationProfileDefinition): EnemyAnimationRole[] {
  return ENEMY_ANIMATION_ROLES.filter((role) => typeof profile.clips[role] === 'string');
}

export function buildAnimationContentBundle(source: AnimationContentSource): EnemyAnimationContentBundle {
  const presentation = Object.fromEntries(source.presentationProfiles.map((p) => [p.id, p]));
  const animation = Object.fromEntries(source.animationProfiles.map((a) => [a.id, a]));
  const lod = Object.fromEntries(source.lodPolicies.map((l) => [l.id, l]));
  const shadow = Object.fromEntries(source.shadowPolicies.map((s) => [s.id, s]));
  return {
    format: 1,
    sourceHash: '',
    presentationProfiles: presentation,
    animationProfiles: animation,
    lodPolicies: lod,
    shadowPolicies: shadow,
    presentationProfileOrder: source.presentationProfiles.map((p) => p.id),
    legacyTypePresentation: {},
  };
}
