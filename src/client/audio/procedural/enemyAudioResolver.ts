import type { SimEvent } from '../../../shared/types';
import type { EnemyAudioSizeClass, EnemyAudioTier, ProceduralSoundRecipe } from './proceduralSoundTypes';

export interface ResolvedEnemyAudioProfile {
  tier: EnemyAudioTier;
  sizeClass: EnemyAudioSizeClass;
  profileId: string;
}

export function resolveEnemyAudioProfile(event: Pick<SimEvent, 'tier' | 'sizeClass' | 'presentationProfileId' | 'kind'>): ResolvedEnemyAudioProfile {
  if (event.tier && event.sizeClass) {
    return {
      tier: event.tier,
      sizeClass: event.sizeClass,
      profileId: event.presentationProfileId ?? `enemyAudio.${event.tier}`,
    };
  }
  if (event.kind === 'boss') return { tier: 'boss', sizeClass: 'large', profileId: 'enemyAudio.bossLegacy' };
  if (event.kind === 'gunTower' || event.kind === 'tower' || event.kind === 'rammer') {
    return { tier: 'specialist', sizeClass: 'medium', profileId: 'enemyAudio.legacyHeavy' };
  }
  if (event.kind === 'lootTruck') return { tier: 'elite', sizeClass: 'large', profileId: 'enemyAudio.legacyElite' };
  return { tier: 'fodder', sizeClass: 'small', profileId: 'enemyAudio.default' };
}

export function resolveEnemyFireRecipe(tier: EnemyAudioTier): ProceduralSoundRecipe {
  if (tier === 'boss') return 'bossFire';
  if (tier === 'elite') return 'enemyEliteFire';
  if (tier === 'specialist') return 'enemySpecialistFire';
  return 'enemyRangedFire';
}

export function resolveEnemyDeathRecipe(tier: EnemyAudioTier): ProceduralSoundRecipe {
  if (tier === 'boss') return 'bossDeath';
  if (tier === 'elite') return 'enemyDeathElite';
  if (tier === 'specialist') return 'enemyDeathSpecialist';
  return 'enemyDeathFodder';
}

export function resolveLegacyEnemyCue(event: Pick<SimEvent, 'type' | 'kind' | 'tier' | 'sizeClass' | 'presentationProfileId'>): ProceduralSoundRecipe | null {
  const profile = resolveEnemyAudioProfile(event);
  if (event.type === 'towerFire') return resolveEnemyFireRecipe(profile.tier);
  if (event.type === 'rammerTelegraph') {
    return event.kind === 'tower' || event.kind === 'enemy' ? 'enemyTelegraph' : 'rammerTelegraph';
  }
  return null;
}

export function classifyLanding(downwardSpeed: number): 'landingLight' | 'landingHeavy' {
  return Math.max(0, downwardSpeed) >= 7.5 ? 'landingHeavy' : 'landingLight';
}

/** Pure semantic routing seam used by tests/debug tooling and legacy fixtures. */
export function resolveSemanticEventRecipe(event: SimEvent): ProceduralSoundRecipe | null {
  const profile = resolveEnemyAudioProfile(event);
  switch (event.type) {
    case 'enemyTelegraph': return 'enemyTelegraph';
    case 'enemyFire': return resolveEnemyFireRecipe(profile.tier);
    case 'bossTelegraph': return 'bossTelegraph';
    case 'bossFire': return 'bossFire';
    case 'enemyProjectileImpact': return 'enemyProjectileImpact';
    case 'enemyMeleeImpact': return 'enemyMeleeImpact';
    case 'playerCannonImpact': return 'cannonImpact';
    case 'barrelExplode': return 'barrelExplosion';
    case 'chainExplode': return 'barrelChainExplosion';
    case 'kill': return resolveEnemyDeathRecipe(profile.tier);
    case 'tankLanding': return classifyLanding(event.value ?? 0);
    case 'towerFire':
    case 'rammerTelegraph':
      return resolveLegacyEnemyCue(event);
    default:
      return null;
  }
}
