import type { TankHurtCapsule } from '../combat/tankHurtVolume';
import type { ArenaWorld } from '../sim/arenaWorld';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const EPSILON = 1e-9;

/** Exact first TOI for a moving point against an expanded vertical capsule. */
export function segmentVerticalCapsuleFirstToi(
  start: Point3,
  end: Point3,
  capsule: TankHurtCapsule,
  padding = 0,
): number | undefined {
  const radius = capsule.radius + Math.max(0, padding);
  if (pointInsideVerticalCapsule(start, capsule, radius)) return 0;
  const candidates: number[] = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const ox = start.x - capsule.center.x;
  const oz = start.z - capsule.center.z;
  const a = dx * dx + dz * dz;
  if (a > EPSILON) {
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const y = start.y + dy * t;
        if (t >= 0 && t <= 1 && y >= capsule.segmentStartY && y <= capsule.segmentEndY) {
          candidates.push(t);
        }
      }
    }
  }
  for (const capY of [capsule.segmentStartY, capsule.segmentEndY]) {
    const toi = segmentSphereFirstToi(start, end, {
      x: capsule.center.x,
      y: capY,
      z: capsule.center.z,
    }, radius);
    if (toi !== undefined) candidates.push(toi);
  }
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

/** Earliest terrain or obstacle collision along an enemy projectile segment. */
export function firstWorldProjectileImpactToi(
  world: ArenaWorld,
  start: Point3,
  end: Point3,
  radius: number,
): number | undefined {
  let earliest: number | undefined;
  for (const obstacle of world.obstacles) {
    const baseY = world.groundHeightAt(obstacle.x, obstacle.z);
    const toi = segmentAabbFirstToi(start, end, {
      minX: obstacle.x - obstacle.w * 0.5 - radius,
      maxX: obstacle.x + obstacle.w * 0.5 + radius,
      minY: baseY - radius,
      maxY: baseY + obstacle.h + radius,
      minZ: obstacle.z - obstacle.d * 0.5 - radius,
      maxZ: obstacle.z + obstacle.d * 0.5 + radius,
    });
    if (toi !== undefined && (earliest === undefined || toi < earliest)) earliest = toi;
  }
  // Preserve the historical terrain center clearance while sweeping it; the
  // authored hit radius remains responsible for obstacle and tank expansion.
  const terrainToi = firstTerrainImpactToi(world, start, end, 0.05);
  if (terrainToi !== undefined && (earliest === undefined || terrainToi < earliest)) {
    earliest = terrainToi;
  }
  return earliest;
}

export function pointOnSegment(start: Point3, end: Point3, t: number): Point3 {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

function pointInsideVerticalCapsule(point: Point3, capsule: TankHurtCapsule, radius: number): boolean {
  const nearestY = Math.max(capsule.segmentStartY, Math.min(capsule.segmentEndY, point.y));
  const dx = point.x - capsule.center.x;
  const dy = point.y - nearestY;
  const dz = point.z - capsule.center.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

function segmentSphereFirstToi(start: Point3, end: Point3, center: Point3, radius: number): number | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const ox = start.x - center.x;
  const oy = start.y - center.y;
  const oz = start.z - center.z;
  const a = dx * dx + dy * dy + dz * dz;
  if (a <= EPSILON) return undefined;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return undefined;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  if (first >= 0 && first <= 1) return first;
  const second = (-b + root) / (2 * a);
  return second >= 0 && second <= 1 ? second : undefined;
}

function segmentAabbFirstToi(
  start: Point3,
  end: Point3,
  box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
): number | undefined {
  let entry = 0;
  let exit = 1;
  for (const [origin, delta, min, max] of [
    [start.x, end.x - start.x, box.minX, box.maxX],
    [start.y, end.y - start.y, box.minY, box.maxY],
    [start.z, end.z - start.z, box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(delta) <= EPSILON) {
      if (origin < min || origin > max) return undefined;
      continue;
    }
    const t1 = (min - origin) / delta;
    const t2 = (max - origin) / delta;
    entry = Math.max(entry, Math.min(t1, t2));
    exit = Math.min(exit, Math.max(t1, t2));
    if (entry > exit) return undefined;
  }
  return entry >= 0 && entry <= 1 ? entry : undefined;
}

function firstTerrainImpactToi(
  world: ArenaWorld,
  start: Point3,
  end: Point3,
  clearance: number,
): number | undefined {
  const signedClearance = (t: number): number => {
    const point = pointOnSegment(start, end, t);
    return point.y - world.groundHeightAt(point.x, point.z) - clearance;
  };
  if (signedClearance(0) <= 0) return 0;
  const distance = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
  const steps = Math.max(1, Math.min(256, Math.ceil(distance / 0.25)));
  let previousT = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (signedClearance(t) <= 0) {
      let low = previousT;
      let high = t;
      for (let iteration = 0; iteration < 12; iteration++) {
        const mid = (low + high) * 0.5;
        if (signedClearance(mid) <= 0) high = mid;
        else low = mid;
      }
      return high;
    }
    previousT = t;
  }
  return undefined;
}
