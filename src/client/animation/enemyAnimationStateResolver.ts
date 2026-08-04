import type { EnemyAnimationRole } from '../../shared/animation/animationRoles';
import type { EnemyAnimationProfileDefinition } from '../../shared/animation/animationProfileTypes';
import type { EnemyActionCue } from '../../shared/animation/enemyActionCue';
import { actionCueElapsedFraction } from '../../shared/animation/enemyActionCue';

export interface EnemyAnimationPresentationState {
  alive: boolean;
  state: string;
  stateT: number;
  speed: number;
  telegraph: number;
  flash: number;
  airborne: boolean;
  cue?: EnemyActionCue | null;
  currentTick?: number;
}

export interface EnemyAnimationStateResolution {
  role: EnemyAnimationRole | null;
  reason: string;
}

const ATTACK_ROLES: ReadonlySet<string> = new Set([
  'attackPrimary',
  'attackSecondary',
  'attackSpecial',
  'castStart',
  'castLoop',
  'castRelease',
  'pounce',
  'webCast',
  'summon',
  'charge',
  'leap',
  'roar',
]);

/**
 * Semantic animation state selection. Resolution priority:
 *
 * death > authoritative action cue > knockback/airborne > stagger > hit >
 * explicit stateMap > telegraphing attack > run > walk > idle
 *
 * There is no family-specific code here: everything comes from the profile.
 */
export function resolveEnemyAnimationState(
  profile: EnemyAnimationProfileDefinition,
  state: EnemyAnimationPresentationState,
): EnemyAnimationStateResolution {
  if (!state.alive) return { role: 'death', reason: 'death' };

  if (state.cue) {
    const elapsed = actionCueElapsedFraction(state.cue, state.currentTick ?? 0);
    if (elapsed < 1) {
      const mapped = profile.stateMap?.[state.cue.actionId];
      if (mapped) return { role: mapped, reason: `action cue ${state.cue.actionId}` };
      return { role: 'attackPrimary', reason: `action cue ${state.cue.actionId} (default)` };
    }
  }

  if (state.airborne) return { role: 'knockback', reason: 'airborne impulse' };

  const lowered = state.state.toLowerCase();
  if (lowered.includes('stagger')) return { role: 'stagger', reason: `state ${state.state}` };

  if (state.flash > 0) return { role: 'hit', reason: 'hit flash' };

  const mapped = profile.stateMap?.[state.state];
  if (mapped) return { role: mapped, reason: `stateMap ${state.state}` };

  if (state.telegraph > 0) {
    const attack = profile.stateMap?.['telegraph'] ?? 'attackPrimary';
    return { role: attack, reason: 'telegraphing attack' };
  }

  const speed = Math.abs(state.speed);
  if (speed > profile.locomotion.walkSpeedMax) return { role: 'run', reason: 'run threshold' };
  if (speed > profile.locomotion.idleSpeedMax) return { role: 'walk', reason: 'walk threshold' };
  return { role: 'idle', reason: 'idle' };
}

export function isAttackRole(role: EnemyAnimationRole): boolean {
  return ATTACK_ROLES.has(role);
}
