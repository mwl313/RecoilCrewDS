import { groundHeightAt as staticGroundHeightAt } from '../shared/arena';

/**
 * Client-only presentation ground indirection. The authoritative sim threads
 * its match-scoped world explicitly; cameras and the renderer (client-only)
 * read the active presentation ground through this setter.
 */
let activeGroundHeightAt: (x: number, z: number) => number = staticGroundHeightAt;

export function setClientGroundHeightAt(fn: (x: number, z: number) => number): void {
  activeGroundHeightAt = fn;
}

export function clientGroundHeightAt(x: number, z: number): number {
  return activeGroundHeightAt(x, z);
}
