import {
  ENEMY_ANIMATION_CONTENT,
} from '../../generated/enemyAnimationContent.generated';
import type {
  EnemyAnimationContentBundle,
  AnimationLodPolicyDefinition,
  AnimationShadowPolicyDefinition,
  EnemyAnimationProfileDefinition,
  EnemyPresentationProfileDefinition,
} from '../../shared/animation/animationProfileTypes';
import { animationTelemetry } from './animationTelemetry';

/** Registered procedural fallback when no profile resolves. */
const FALLBACK_PRESENTATION_PROFILE_ID = 'enemyPresentation.legacy.scrapBug';

export interface EnemyPresentationResolution {
  profileId: string;
  profile: EnemyPresentationProfileDefinition;
  animationProfile: EnemyAnimationProfileDefinition | null;
  lodPolicy: AnimationLodPolicyDefinition;
  shadowPolicy: AnimationShadowPolicyDefinition;
}

export interface EnemyPresentationSource {
  presentationProfileId?: string;
  type: string;
}

let warnedUnknownProfile = false;

/**
 * Content-driven presentation resolution:
 *
 * 1. explicit `presentationProfileId` on the enemy state/definition,
 * 2. legacy rigid profile derived from the enemy type,
 * 3. registered procedural fallback profile + one diagnostic warning.
 */
export function resolveEnemyPresentation(
  source: EnemyPresentationSource,
  bundle: EnemyAnimationContentBundle = ENEMY_ANIMATION_CONTENT,
): EnemyPresentationResolution {
  let profileId = source.presentationProfileId;
  let profile = profileId ? bundle.presentationProfiles[profileId] : undefined;
  if (!profile) {
    profileId = bundle.legacyTypePresentation[source.type];
    profile = profileId ? bundle.presentationProfiles[profileId] : undefined;
  }
  if (!profile) {
    profileId = FALLBACK_PRESENTATION_PROFILE_ID;
    profile = bundle.presentationProfiles[profileId];
    if (!warnedUnknownProfile) {
      warnedUnknownProfile = true;
      animationTelemetry.warnings++;
      console.warn(
        `[animation] no presentation profile for '${source.type}' (${source.presentationProfileId ?? 'no id'}); using procedural fallback`,
      );
    }
  }
  const animationProfile = profile.animationProfileId
    ? bundle.animationProfiles[profile.animationProfileId] ?? null
    : null;
  const lodPolicy = bundle.lodPolicies[profile.lodPolicyId];
  const shadowPolicy = bundle.shadowPolicies[profile.shadowPolicyId];
  if (!lodPolicy || !shadowPolicy) {
    throw new Error(`presentation profile '${profile.id}' references missing lod/shadow policy`);
  }
  return {
    profileId: profile.id,
    profile,
    animationProfile,
    lodPolicy,
    shadowPolicy,
  };
}

export function resetPresentationResolverWarnings(): void {
  warnedUnknownProfile = false;
}
