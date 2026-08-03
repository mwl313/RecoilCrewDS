/**
 * Shared ground-step traversal guard.
 *
 * `queryTerrainTransition` reads the authoritative heightfield + terrain
 * flags; `canTraverseGroundStep` applies the profile's maxStepUp rule. One
 * implementation is used by the server, the Driver predictor, Practice,
 * replay, dash, recoil, and ground enemies, so a cliff can never be climbed
 * by snapping upward while falling down a cliff stays perfectly legal.
 */
import type { Heightfield } from './heightfield';
import { isCliffWallAt } from './terrainFlags';

export interface TerrainTransition {
  fromHeight: number;
  toHeight: number;
  /** toHeight - fromHeight (positive = uphill). */
  delta: number;
  crossesCliffWall: boolean;
  maxStepUp: number;
}

export interface ActorStepProfile {
  maxStepUp?: number;
}

export function queryTerrainTransition(
  hf: Heightfield,
  flags: Uint32Array,
  maxStepUp: number,
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): TerrainTransition {
  const fromHeight = hf.heightAt(fromX, fromZ);
  const toHeight = hf.heightAt(toX, toZ);
  return {
    fromHeight,
    toHeight,
    delta: toHeight - fromHeight,
    crossesCliffWall: isCliffWallAt(flags, hf, toX, toZ),
    maxStepUp,
  };
}

/**
 * May a grounded actor move from the "from" point to the "to" point?
 * Upward cliff-wall crossings and upward steps above the actor's maxStepUp
 * are blocked; downward movement (falling) is always allowed.
 */
export function canTraverseGroundStep(
  transition: TerrainTransition,
  actorProfile?: ActorStepProfile,
): boolean {
  const maxStep = actorProfile?.maxStepUp ?? transition.maxStepUp;
  if (transition.delta <= 0) return true; // downhill / level: allowed
  if (transition.crossesCliffWall && transition.delta > 0.05) return false;
  if (transition.delta > maxStep) return false;
  return true;
}
