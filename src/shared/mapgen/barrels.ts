/**
 * Barrel proximity graph: spacing, connected chains, and zone exclusions.
 * A chain is a connected component of barrels within `chainRadius` — the
 * gameplay barrel-chain radius is 6 m, so mapgen uses 8 m as a safe bound.
 */
import { SpatialHash } from './spatial';

export interface BarrelLike {
  id: string;
  x: number;
  z: number;
}

export interface BarrelComponent {
  id: string;
  members: string[];
}

export function barrelComponents(
  barrels: BarrelLike[],
  chainRadius: number,
): { components: BarrelComponent[]; maxSize: number } {
  const spatial = new SpatialHash({
    cellSize: chainRadius,
    minX: -10000,
    minZ: -10000,
    maxX: 10000,
    maxZ: 10000,
  });
  for (const b of barrels) spatial.insert(b.id, b.x, b.z);
  const visited = new Set<string>();
  const components: BarrelComponent[] = [];
  let maxSize = 0;
  for (const b of barrels) {
    if (visited.has(b.id)) continue;
    const members: string[] = [];
    const queue = [b.id];
    visited.add(b.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      members.push(id);
      const entry = spatial.get(id)!;
      for (const near of spatial.queryCircle(entry.x, entry.z, chainRadius)) {
        if (!visited.has(near)) {
          visited.add(near);
          queue.push(near);
        }
      }
    }
    members.sort();
    maxSize = Math.max(maxSize, members.length);
    components.push({ id: `chain.${components.length}`, members });
  }
  return { components, maxSize };
}

export interface BarrelLayoutOptions {
  barrels: BarrelLike[];
  minSpacing: number;
  chainRadius: number;
  maxChain: number;
  /** Regions where barrels are forbidden (spawns, landings, recovery, gates). */
  excluded: Array<{ id?: string; x: number; z: number; radius: number }>;
  corridorDistance: (x: number, z: number) => number;
  routeClearance: number;
}

export function validateBarrelLayout(options: BarrelLayoutOptions): string[] {
  const errors: string[] = [];
  const spatial = new SpatialHash({
    cellSize: options.minSpacing,
    minX: -10000,
    minZ: -10000,
    maxX: 10000,
    maxZ: 10000,
  });
  for (const b of options.barrels) spatial.insert(b.id, b.x, b.z);
  for (const b of options.barrels) {
    for (const near of spatial.queryCircle(b.x, b.z, options.minSpacing)) {
      if (near <= b.id) continue;
      errors.push(`barrel: ${b.id} and ${near} violate min spacing ${options.minSpacing}`);
    }
    for (const e of options.excluded) {
      if (Math.hypot(e.x - b.x, e.z - b.z) < e.radius) {
        errors.push(`barrel: ${b.id} inside excluded zone ${e.id ?? e.x.toFixed(0)},${e.z.toFixed(0)}`);
      }
    }
    if (options.corridorDistance(b.x, b.z) < options.routeClearance) {
      errors.push(`barrel: ${b.id} intrudes a required route corridor`);
    }
  }
  const { maxSize } = barrelComponents(options.barrels, options.chainRadius);
  if (maxSize > options.maxChain) {
    errors.push(`barrel: largest connected chain ${maxSize} exceeds ${options.maxChain}`);
  }
  return errors;
}
