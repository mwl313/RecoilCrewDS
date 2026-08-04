import * as THREE from 'three';
import type { EnemyAnimationRole } from '../../shared/animation/animationRoles';
import { resolveRoleWithFallback } from '../../shared/animation/animationContentValidation';
import type { EnemyAnimationProfileDefinition } from '../../shared/animation/animationProfileTypes';
import { animationTelemetry } from './animationTelemetry';

export interface ResolvedAnimationClip {
  role: EnemyAnimationRole;
  clipName: string;
  clip: THREE.AnimationClip;
}

export interface AnimationClipResolver {
  resolve(
    profile: EnemyAnimationProfileDefinition,
    role: EnemyAnimationRole,
    animations: readonly THREE.AnimationClip[],
  ): ResolvedAnimationClip | null;
  resolvedNames(profile: EnemyAnimationProfileDefinition): string[];
}

const warnedOnce = new Set<string>();

/**
 * Resolves a semantic role → profile clip name → GLB AnimationClip using
 * the profile fallback chain. Missing optional clips warn once and fall
 * back; a profile with no usable clips leaves the model in a static pose.
 */
export function createAnimationClipResolver(): AnimationClipResolver {
  const byName = (animations: readonly THREE.AnimationClip[]) => {
    const map = new Map<string, THREE.AnimationClip>();
    for (const clip of animations) map.set(clip.name, clip);
    return map;
  };

  return {
    resolve(profile, role, animations) {
      const clips = byName(animations);
      const resolvedRole = resolveRoleWithFallback(profile, role, (name) => clips.has(name));
      if (!resolvedRole) return null;
      const clipName = profile.clips[resolvedRole]!;
      const clip = clips.get(clipName);
      if (!clip) return null;
      const key = `${profile.id}:${clipName}`;
      if (!warnedOnce.has(key)) {
        warnedOnce.add(key);
        animationTelemetry.warnings++;
        console.warn(`[animation] profile ${profile.id} resolves role '${role}' via fallback '${resolvedRole}' -> clip '${clipName}'`);
      }
      return { role: resolvedRole, clipName, clip };
    },
    resolvedNames(profile) {
      const out: string[] = [];
      for (const [role, name] of Object.entries(profile.clips) as Array<[EnemyAnimationRole, string]>) {
        if (name) out.push(`${role} -> ${name}`);
      }
      return out;
    },
  };
}

export function resetClipResolverWarnings(): void {
  warnedOnce.clear();
}
