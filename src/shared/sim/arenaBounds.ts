/** Exact world-space arena bounds shared by authority and presentation. */
export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Existing authoritative actor-center safety inset. Rendered boundary faces
 * align to this plane; changing it changes gameplay dimensions.
 */
export const ARENA_ACTOR_BOUNDARY_INSET = 0.5;

/** Resolve explicit rectangular bounds or the legacy centered square. */
export function resolveArenaBounds(
  ground: { half: number; bounds?: ArenaBounds },
): ArenaBounds {
  return (
    ground.bounds ?? {
      minX: -ground.half,
      maxX: ground.half,
      minZ: -ground.half,
      maxZ: ground.half,
    }
  );
}

export function pointInsideArenaBounds(
  x: number,
  z: number,
  bounds: ArenaBounds,
  inset = 0,
): boolean {
  return (
    x >= bounds.minX + inset &&
    x <= bounds.maxX - inset &&
    z >= bounds.minZ + inset &&
    z <= bounds.maxZ - inset
  );
}
