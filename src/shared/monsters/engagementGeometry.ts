import { DEFAULT_MELEE_MOVEMENT_PROFILE, type MeleeMovementProfile } from './movementProfiles';
import type { MeleeEngagementProfileData } from './meleeReservations';

/**
 * One resolved engagement-geometry helper (second-pass Phase 2).
 *
 *   effectiveMeleeDistance = enemyCollisionRadius + tankCollisionRadius + authoredAttackReach
 *
 * Body size and authored reach are separate terms; tier scale affects the
 * collision radius (through normalized dimensions) and never multiplies the
 * authored reach. Every melee consumer (reservation eligibility, reserved
 * target points, approach stop, attack gate, release, staging ring, and boss
 * melee patterns) reads the same resolved record.
 */
export interface ResolvedEngagementGeometry {
  enemyRadius: number;
  tankRadius: number;
  authoredAttackReach: number;
  /** Center-to-center distance where a melee hit is accepted. */
  effectiveAttackDistance: number;
  /** Ring radius used for reservation target positions. */
  reservationRadius: number;
  stagingInnerRadius: number;
  stagingOuterRadius: number;
  /** Distance beyond which a reservation is released. */
  releaseRadius: number;
  /** Approach stop boundary (fraction of the effective distance). */
  stopRadius: number;
}

export function resolveMonsterEngagementGeometry(opts: {
  enemyRadius: number;
  tankRadius: number;
  authoredAttackReach: number;
  movement?: MeleeMovementProfile;
  engagement?: Pick<MeleeEngagementProfileData, 'releaseDistanceMultiplier'>;
}): ResolvedEngagementGeometry {
  const movement = opts.movement ?? DEFAULT_MELEE_MOVEMENT_PROFILE;
  const effectiveAttackDistance =
    opts.enemyRadius + opts.tankRadius + opts.authoredAttackReach;
  // The staging band keeps the authored reach-relative distances (the
  // previously qualified un-reserved ring); everything that touches the
  // attack itself uses the effective distance above.
  const stagingInnerRadius = opts.authoredAttackReach * movement.stagingInnerMultiplier;
  const stagingOuterRadius = opts.authoredAttackReach * movement.stagingRadiusMultiplier;
  return {
    enemyRadius: opts.enemyRadius,
    tankRadius: opts.tankRadius,
    authoredAttackReach: opts.authoredAttackReach,
    effectiveAttackDistance,
    reservationRadius: effectiveAttackDistance,
    stagingInnerRadius,
    stagingOuterRadius,
    releaseRadius:
      effectiveAttackDistance * (opts.engagement?.releaseDistanceMultiplier ?? 1.35),
    stopRadius: effectiveAttackDistance * movement.attackStopTolerance,
  };
}

/**
 * Physical target point for a reservation angle. The codebase angle
 * convention is `angleToTank = atan2(tank.x - enemy.x, tank.z - enemy.z)`,
 * so the direction vector is `(sin(a), cos(a))`.
 */
export function reservationTarget(
  angle: number,
  tankX: number,
  tankZ: number,
  distance: number,
): { x: number; z: number } {
  return {
    x: tankX + Math.sin(angle) * distance,
    z: tankZ + Math.cos(angle) * distance,
  };
}
