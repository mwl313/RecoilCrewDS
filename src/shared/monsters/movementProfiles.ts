/**
 * Reusable movement profiles for the generalized monster behaviors
 * (bug-fix phase 3). No per-monster AI — these are shared data values.
 */
export interface MeleeMovementProfile {
  /** CHASE→STAGE boundary as a multiple of the attack range. */
  stagingRadiusMultiplier: number;
  /** Inner staging ring distance as a multiple of the attack range. */
  stagingInnerMultiplier: number;
  tangentialSpeedMultiplier: number;
  radialCorrectionStrength: number;
  /** RESERVED_APPROACH→ATTACK_HOLD boundary as a multiple of attack range. */
  attackStopTolerance: number;
}

export const DEFAULT_MELEE_MOVEMENT_PROFILE: MeleeMovementProfile = {
  stagingRadiusMultiplier: 2.5,
  stagingInnerMultiplier: 0.85,
  tangentialSpeedMultiplier: 0.55,
  radialCorrectionStrength: 0.9,
  attackStopTolerance: 0.95,
};

export const RANGED_HOLD_PROFILE = {
  innerRatio: 0.8,
  outerRatio: 1.1,
} as const;
