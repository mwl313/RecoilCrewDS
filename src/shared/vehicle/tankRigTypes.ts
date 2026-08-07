import type { TankRigDefinition } from '../content/schemas/tank';

/** Full vertical cannon articulation shared by local and networked aiming. */
export const VERTICAL_AIM_MIN_PITCH = -Math.PI / 2;
export const VERTICAL_AIM_MAX_PITCH = Math.PI / 2;

/**
 * Built-in fallback tank rig. Mirrors content/tanks/default.json exactly
 * (parity is tested); used by the legacy/client-safe rule path and by the
 * asset factory before a replicated rig block arrives.
 */
export const DEFAULT_TANK_RIG: TankRigDefinition = {
  chassisAssetId: 'playerTank.chassis',
  turretAssetId: 'playerTank.turret',
  barrelAssetId: 'playerTank.barrel',
  turretPivot: [0, 1.146526, 0],
  barrelPivot: [0, 0.160565, 0.533964],
  muzzleLocal: [0, 0, 1.298692],
  aimPivotLocal: [0, 1.146526, 0],
  cameraAnchorLocal: [0, 1.35, 0],
  forwardAxis: [0, 0, 1],
};
