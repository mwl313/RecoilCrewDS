import { z } from 'zod';
import { commonDefinition, nonNegativeNumber, positiveInt, positiveNumber } from './common';

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

/**
 * Shared weapon-mount geometry. The server simulation, client rig
 * construction, local VFX, and the trajectory crosshair all read this one
 * block; numeric offsets are authoritative and asset node names are only
 * optional client binding aids.
 */
export const tankRigSchema = z
  .object({
    chassisAssetId: z.string(),
    turretAssetId: z.string(),
    barrelAssetId: z.string(),
    turretPivot: vec3,
    barrelPivot: vec3,
    muzzleLocal: vec3,
    aimPivotLocal: vec3,
    cameraAnchorLocal: vec3.optional(),
    /** Local forward axis of the chassis/barrel (default +Z). */
    forwardAxis: vec3.optional(),
    socketBindings: z
      .object({
        turretPivotNode: z.string().optional(),
        barrelPivotNode: z.string().optional(),
        muzzleNode: z.string().optional(),
        cameraAnchorNode: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TankRigDefinition = z.infer<typeof tankRigSchema>;

export const tankSchema = z.object({
  ...commonDefinition,
  id: z.string().regex(/^tank\./, 'tank id must start with tank.'),
  forwardSpeed: positiveNumber,
  reverseSpeed: positiveNumber,
  accel: positiveNumber,
  reverseAccel: positiveNumber,
  steerLow: nonNegativeNumber,
  steerHigh: nonNegativeNumber,
  normalGrip: positiveNumber,
  airControl: nonNegativeNumber,
  /** Aerial grip multiplier applied to match grip while airborne. */
  airGripMultiplier: nonNegativeNumber,
  /** Yaw-velocity damping rate while grounded (1/s). */
  groundYawDamping: positiveNumber,
  /** Yaw-velocity damping rate while airborne (1/s). */
  airYawDamping: positiveNumber,
  /** Absolute horizontal speed safety cap shared by dash/recoil/MG. */
  hardHorizontalSpeedCap: positiveNumber,
  /** Maximum visual pitch while airborne (radians, presentation only). */
  maxVisualAirPitch: nonNegativeNumber,
  /** Maximum visual roll while airborne (radians, presentation only). */
  maxVisualAirRoll: nonNegativeNumber,
  /** Blend rate toward airborne visual pitch/roll (1/s). */
  visualAirLevelRate: positiveNumber,
  /** Landing momentum grace window (seconds). */
  landingGripSeconds: nonNegativeNumber,
  /** Grip multiplier during the landing grace window. */
  landingGripMultiplier: nonNegativeNumber,
  gravity: positiveNumber,
  jumpHeight: nonNegativeNumber,
  rampLaunchSpeed: nonNegativeNumber,
  dashImpulse: nonNegativeNumber,
  dashCooldown: nonNegativeNumber,
  dashAirMultiplier: nonNegativeNumber,
  dashMaxHorizontalSpeed: positiveNumber,
  dashPresentationSeconds: nonNegativeNumber,
  collisionRadius: positiveNumber,
  footprint: z
    .array(
      z.object({
        offset: z.number().finite(),
        radius: positiveNumber,
      }),
    )
    .min(1),
  maxSafeStep: positiveNumber,
  maxSubsteps: positiveInt,
  reverseSteerMult: nonNegativeNumber,
  maxIntegrity: positiveNumber,
  respawnTime: nonNegativeNumber,
  shieldTime: nonNegativeNumber,
  autoRightTime: nonNegativeNumber,
  autoRightRoll: nonNegativeNumber,
  fallDamageSpeed: nonNegativeNumber,
  fallDamage: nonNegativeNumber,
  recoilImpulse: nonNegativeNumber,
  recoilSpin: nonNegativeNumber,
  jackpotRecoilImpulse: nonNegativeNumber,
  jackpotSpin: nonNegativeNumber,
  mgRecoilImpulse: nonNegativeNumber,
  rig: tankRigSchema,
});

export type TankDefinition = z.infer<typeof tankSchema>;
