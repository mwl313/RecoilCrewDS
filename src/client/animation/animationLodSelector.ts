import type {
  AnimationLodPolicyDefinition,
  EnemyAnimationLodTier,
} from '../../shared/animation/animationProfileTypes';

export interface AnimationLodCandidate {
  enemyId: number;
  distance: number;
  populationClass?: string;
  /** Replicated presentation priority: 0 none, 1 elite, 2 boss. */
  priority?: 0 | 1 | 2;
  telegraphing: boolean;
  attacking: boolean;
  damagedRecently: boolean;
  currentTier: EnemyAnimationLodTier;
}

export type GraphicsQuality = 'high' | 'low';

/**
 * Hysteresis ladder for animation presentation tiers:
 *
 * hero   -> bosses/active elites (never displaced by common mixer budget)
 * near   -> enter < nearEnter, leave > nearLeave
 * mid    -> enter < midEnter, leave > midLeave
 * far    -> no mixer (rigid far variant)
 * aggregate -> far presentation without individual hierarchy
 *
 * Low graphics quality scales distance thresholds down so common enemies
 * swap to far/rigid presentation earlier — presentation only.
 */
export function selectAnimationLod(
  policy: AnimationLodPolicyDefinition,
  input: AnimationLodCandidate,
  quality: GraphicsQuality = 'high',
): EnemyAnimationLodTier {
  const scale = quality === 'low' ? 0.8 : 1;
  const nearEnter = policy.nearEnter * scale;
  const nearLeave = policy.nearLeave * scale;
  const midEnter = policy.midEnter * scale;
  const midLeave = policy.midLeave * scale;
  const d = input.distance;
  const current = input.currentTier;

  const isHero =
    input.priority === 2 ||
    input.priority === 1 ||
    input.populationClass === 'boss' ||
    input.populationClass === 'elite';
  if (policy.heroAlwaysNear && isHero) return 'hero';
  if (isHero) return 'hero';

  if (d < nearEnter) return 'near';
  if (current === 'hero' || current === 'near') {
    if (d <= nearLeave) return 'near';
    return d < midLeave ? 'mid' : 'far';
  }
  if (current === 'mid') {
    if (d <= midLeave) return 'mid';
    return 'far';
  }
  // far / aggregate
  return d < farLeaveScale(policy, quality) ? (d < nearEnter ? 'near' : 'mid') : 'far';
}

function farLeaveScale(policy: AnimationLodPolicyDefinition, quality: GraphicsQuality): number {
  return policy.farEnter * (quality === 'low' ? 0.8 : 1);
}

/**
 * Stable mixer budget allocation. Hero enemies always keep their mixer;
 * near/mid candidates compete for the profile's maximum mixer counts with a
 * stability bonus for the current allocation so mixers do not flicker.
 * Unallocated candidates are demoted to far presentation (no mixer).
 */
export class AnimationLodManager {
  private readonly nearAllocation = new Map<number, true>();
  private readonly midAllocation = new Map<number, true>();

  constructor(private readonly policy: AnimationLodPolicyDefinition) {}

  update(
    candidates: readonly AnimationLodCandidate[],
    quality: GraphicsQuality = 'high',
  ): Map<number, EnemyAnimationLodTier> {
    const out = new Map<number, EnemyAnimationLodTier>();
    const near: AnimationLodCandidate[] = [];
    const mid: AnimationLodCandidate[] = [];
    for (const c of candidates) {
      const tier = selectAnimationLod(this.policy, c, quality);
      if (tier === 'hero') {
        out.set(c.enemyId, 'hero');
      } else if (tier === 'near') {
        near.push(c);
      } else if (tier === 'mid') {
        mid.push(c);
      } else {
        out.set(c.enemyId, 'far');
      }
    }

    const weights = this.policy.priorityWeights;
    const score = (c: AnimationLodCandidate, allocated: boolean): number =>
      (c.telegraphing ? weights.telegraphing : 0) +
      (c.attacking ? weights.attacking : 0) +
      (c.damagedRecently ? weights.damagedRecently : 0) -
      c.distance * weights.distance +
      (allocated ? 100 : 0);

    near.sort((a, b) => score(b, this.nearAllocation.has(b.enemyId)) - score(a, this.nearAllocation.has(a.enemyId)));
    const nextNear = new Map<number, true>();
    const nearCount = Math.min(near.length, Math.max(0, this.policy.maximumNearMixers));
    for (let i = 0; i < nearCount; i++) {
      out.set(near[i].enemyId, 'near');
      nextNear.set(near[i].enemyId, true);
    }
    for (let i = nearCount; i < near.length; i++) {
      out.set(near[i].enemyId, 'far');
    }

    mid.sort((a, b) => score(b, this.midAllocation.has(b.enemyId)) - score(a, this.midAllocation.has(a.enemyId)));
    const nextMid = new Map<number, true>();
    const midCount = Math.min(mid.length, Math.max(0, this.policy.maximumMidMixers));
    for (let i = 0; i < midCount; i++) {
      out.set(mid[i].enemyId, 'mid');
      nextMid.set(mid[i].enemyId, true);
    }
    for (let i = midCount; i < mid.length; i++) {
      out.set(mid[i].enemyId, 'far');
    }

    this.nearAllocation.clear();
    this.midAllocation.clear();
    for (const id of nextNear.keys()) this.nearAllocation.set(id, true);
    for (const id of nextMid.keys()) this.midAllocation.set(id, true);
    return out;
  }

  reset(): void {
    this.nearAllocation.clear();
    this.midAllocation.clear();
  }
}

export function isMixerTier(tier: EnemyAnimationLodTier): boolean {
  return tier === 'hero' || tier === 'near' || tier === 'mid';
}
