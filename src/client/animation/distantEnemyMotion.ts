import * as THREE from 'three';
import type { EnemyAnimationRole } from '../../shared/animation/animationRoles';
import type { EnemyAnimationProfileDefinition } from '../../shared/animation/animationProfileTypes';
import type { EnemyAnimationContinuity } from './enemyAnimationController';
import {
  isAttackRole,
  resolveEnemyAnimationState,
  type EnemyAnimationPresentationState,
} from './enemyAnimationStateResolver';

export interface DistantEnemyPose {
  phase: number;
  role: EnemyAnimationRole | null;
  yOffset: number;
  pitch: number;
  roll: number;
  scale: number;
  airborne: boolean;
  dead: boolean;
}

/**
 * Mixer-free far-tier motion. The source far model stays rigid, but it never
 * becomes a frozen bind pose: locomotion, attack, airborne and death all have
 * a cheap deterministic presentation evaluated on every render frame.
 */
export class DistantEnemyMotion {
  private phase: number;
  private role: EnemyAnimationRole | null = null;
  private deathT = 0;
  private dead = false;

  constructor(
    phaseSeed: number,
    continuity?: EnemyAnimationContinuity | null,
  ) {
    this.phase = continuity?.normalizedTime ?? THREE.MathUtils.euclideanModulo(phaseSeed, 1);
    this.role = continuity?.role ?? null;
    this.dead = continuity?.dead ?? false;
    this.deathT = this.dead ? this.phase * 1.2 : 0;
  }

  update(
    profile: EnemyAnimationProfileDefinition | null | undefined,
    state: EnemyAnimationPresentationState,
    dt: number,
  ): DistantEnemyPose {
    const safeDt = THREE.MathUtils.clamp(dt, 0, 0.1);
    this.role = profile
      ? resolveEnemyAnimationState(profile, state).role
      : fallbackRole(state);
    if (!state.alive) this.dead = true;

    if (this.dead) {
      this.deathT = Math.min(1.2, this.deathT + safeDt);
      this.phase = this.deathT / 1.2;
    } else if (isLocomotionRole(this.role)) {
      const cadence = THREE.MathUtils.clamp(Math.abs(state.speed) * 0.22, 0.65, 2.4);
      this.phase = THREE.MathUtils.euclideanModulo(this.phase + safeDt * cadence, 1);
    } else if (isAttackRole(this.role ?? 'idle')) {
      this.phase = THREE.MathUtils.euclideanModulo(this.phase + safeDt * 1.8, 1);
    }

    const wave = Math.sin(this.phase * Math.PI * 2);
    const airborne = state.airborne && !this.dead;
    const attacking = this.role ? isAttackRole(this.role) : false;
    const deathRatio = this.dead ? THREE.MathUtils.clamp(this.deathT / 1.2, 0, 1) : 0;
    return {
      phase: this.phase,
      role: this.role,
      yOffset: this.dead
        ? -0.55 * deathRatio
        : airborne
          ? 0
          : isLocomotionRole(this.role)
            ? Math.max(0, wave) * 0.07
            : attacking
              ? Math.max(0, wave) * 0.04
              : 0,
      pitch: this.dead
        ? deathRatio * 0.78
        : airborne
          ? -0.1
          : attacking
            ? -0.13 * Math.max(0, wave)
            : 0,
      roll: this.dead ? deathRatio * 0.42 : isLocomotionRole(this.role) ? wave * 0.045 : 0,
      scale: this.dead ? Math.max(0.08, 1 - deathRatio * 0.7) : attacking ? 1 + Math.max(0, wave) * 0.035 : 1,
      airborne,
      dead: this.dead,
    };
  }

  captureContinuity(): EnemyAnimationContinuity {
    return {
      role: this.role,
      normalizedTime: this.phase,
      dead: this.dead,
      lastCueSequence: 0,
    };
  }
}

export function applyDistantEnemyPose(root: THREE.Object3D, pose: DistantEnemyPose): void {
  root.position.set(0, pose.yOffset, 0);
  root.rotation.set(pose.pitch, 0, pose.roll);
  root.scale.setScalar(pose.scale);
}

function isLocomotionRole(role: EnemyAnimationRole | null): boolean {
  return role === 'walk' || role === 'run' || role === 'hoverMove' || role === 'fastHover';
}

function fallbackRole(state: EnemyAnimationPresentationState): EnemyAnimationRole {
  if (!state.alive) return 'death';
  if (state.airborne) return 'knockback';
  if (state.telegraph > 0 || state.cue) return 'attackPrimary';
  return Math.abs(state.speed) > 0.1 ? 'walk' : 'idle';
}
