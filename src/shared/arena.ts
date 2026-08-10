import { clamp, pointInBox, resolveCircleBox, type CollisionContact } from './math';
import { ARENA_ACTOR_BOUNDARY_INSET } from './sim/arenaBounds';

export interface Obstacle {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  type: 'container' | 'barrier' | 'wall' | 'tires' | 'factory' | 'crusher' | 'towerBase' | 'scrapPile' | 'urbanBuilding' | 'urbanProp';
  /** Optional semantic model used by authored environments. */
  assetId?: string;
  yaw?: number;
  modelScale?: number;
  /** Allows the wall collider to stop ground actors but release actors on the roof. */
  roofDriveable?: boolean;
  /** Optional authored surface that changes how this obstacle is traversed. */
  driveableSurface?: 'bidirectionalVehicleRamp';
}

export interface BarrelProp {
  id: number;
  x: number;
  z: number;
}

export interface RampDef {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  dirX: number;
  dirZ: number;
  rise: number;
  baseY: number;
  /** Optional rendered asset for an authored ramp. */
  assetId?: string;
  /** Building associated with an authored roof ramp. */
  urbanRoofBuildingId?: string;
}

export const ARENA = {
  half: 40,
  obstacles: [] as Obstacle[],
  barrels: [] as BarrelProp[],
  ramps: [] as RampDef[],
  spawnPoints: [] as { x: number; z: number }[],
  bugSpawns: [] as { x: number; z: number }[],
  truckRoute: [] as { x: number; z: number }[],
  towerSpots: [] as { x: number; z: number }[],
};

function ob(id: string, x: number, z: number, w: number, d: number, h: number, type: Obstacle['type']) {
  ARENA.obstacles.push({ id, x, z, w, d, h, type });
}

// Outer walls (visible, with gate gaps kept open for visual interest only).
ob('wallN1', -26, -40, 28, 3, 4, 'wall');
ob('wallN2', 26, -40, 28, 3, 4, 'wall');
ob('wallS1', -26, 40, 28, 3, 4, 'wall');
ob('wallS2', 26, 40, 28, 3, 4, 'wall');
ob('wallW1', -40, -26, 3, 28, 4, 'wall');
ob('wallW2', -40, 26, 3, 28, 4, 'wall');
ob('wallE1', 40, -26, 3, 28, 4, 'wall');
ob('wallE2', 40, 26, 3, 28, 4, 'wall');

// Center bowl props: ring of containers keeps the middle open.
ob('bowlC1', -12, -10, 7, 3, 5, 'container');
ob('bowlC2', 12, -10, 7, 3, 5, 'container');
ob('bowlC3', -12, 10, 7, 3, 5, 'container');
ob('bowlC4', 12, 10, 7, 3, 5, 'container');
ob('bowlB1', 0, -17, 8, 2, 2.2, 'barrier');
ob('bowlB2', 0, 17, 8, 2, 2.2, 'barrier');

// North: launch ramp approach and factory structures.
ob('factoryN1', -22, -30, 10, 8, 7, 'factory');
ob('factoryN2', 22, -30, 10, 8, 7, 'factory');
ob('rampGuardL', -8, -26, 2, 10, 1.6, 'barrier');
ob('rampGuardR', 8, -26, 2, 10, 1.6, 'barrier');

// East: explosive depot.
ob('depotC1', 24, 4, 6, 4, 4, 'container');
ob('depotC2', 32, -2, 5, 4, 4, 'container');
ob('depotB1', 26, 16, 7, 2, 2.2, 'barrier');
ob('depotB2', 34, 14, 2, 7, 2.2, 'barrier');

// South: crusher lane.
ob('crusherL', -10, 30, 2, 12, 3.5, 'crusher');
ob('crusherR', 10, 30, 2, 12, 3.5, 'crusher');
ob('crusherGate', 0, 36.5, 10, 2.5, 3.2, 'crusher');

// West: scrap ring.
ob('tireStack1', -24, -8, 4, 4, 2.5, 'tires');
ob('tireStack2', -30, 4, 4, 4, 2.2, 'tires');
ob('scrapPile1', -22, 18, 6, 5, 3, 'scrapPile');
ob('scrapPile2', -34, -20, 5, 5, 3, 'scrapPile');
ob('ringB1', -18, -22, 2, 8, 1.8, 'barrier');
ob('ringB2', -18, 26, 2, 8, 1.8, 'barrier');

// Gun tower bases.
ob('towerBase1', -4, 4, 2.2, 2.2, 2.4, 'towerBase');
ob('towerBase2', 18, -22, 2.2, 2.2, 2.4, 'towerBase');

// Ramps: north launch ramp rising toward the east (recoil-assisted jumps).
ARENA.ramps.push(
  { id: 'launch', x: 0, z: -29, w: 12, d: 12, dirX: 0, dirZ: 1, rise: 3.0, baseY: 0 },
  { id: 'westJump', x: -32, z: 14, w: 9, d: 7, dirX: 1, dirZ: 0, rise: 1.8, baseY: 0 },
  { id: 'eastJump', x: 30, z: -26, w: 7, d: 9, dirX: -1, dirZ: 0, rise: 1.8, baseY: 0 },
);

// Barrels: explosive depot cluster + scattered interactive props.
const barrelPositions: [number, number][] = [
  [28, 8], [30, 10], [26, 12], [32, 6], [29, 14],
  [-4, -8], [6, 12], [-14, 22], [14, 26], [2, -24],
  [24, -6], [-26, -12], [16, -32], [-6, 32], [36, -20],
];
barrelPositions.forEach(([x, z], i) => ARENA.barrels.push({ id: i, x, z }));

// Spawn points.
ARENA.spawnPoints = [
  { x: -6, z: 10 },
  { x: 6, z: -10 },
  { x: 0, z: -4 },
];
ARENA.towerSpots = [
  { x: -4, z: 4 },
  { x: 18, z: -22 },
];

// Bug entry gates.
ARENA.bugSpawns = [
  { x: -30, z: -30 }, { x: 30, z: -30 }, { x: 30, z: 30 }, { x: -30, z: 30 },
  { x: 0, z: -37 }, { x: 37, z: 0 }, { x: 0, z: 37 }, { x: -37, z: 0 },
];

// Truck route: outer loop clockwise.
ARENA.truckRoute = [
  { x: -32, z: -30 }, { x: 32, z: -30 }, { x: 32, z: 30 }, { x: -32, z: 30 },
];

export function obstacleAt(x: number, z: number): Obstacle | undefined {
  for (const o of ARENA.obstacles) {
    if (pointInBox(x, z, o.x, o.z, o.w, o.d)) return o;
  }
  return undefined;
}

/**
 * Resolve a circle against every exact obstacle rectangle, returning the
 * final separated position plus all contacts (normal + penetration).
 */
export function resolveCircleContacts(x: number, z: number, r: number): { x: number; z: number; contacts: CollisionContact[] } {
  let outX = x;
  let outZ = z;
  const contacts: CollisionContact[] = [];
  for (const o of ARENA.obstacles) {
    const res = resolveCircleBox(outX, outZ, r, o.x, o.z, o.w, o.d, o.id);
    if (res.hit) {
      outX = res.x;
      outZ = res.z;
      contacts.push(res);
    }
  }
  const half = ARENA.half - ARENA_ACTOR_BOUNDARY_INSET;
  outX = clamp(outX, -half, half);
  outZ = clamp(outZ, -half, half);
  return { x: outX, z: outZ, contacts };
}

export function resolveCircle(x: number, z: number, r: number): { x: number; z: number; hit: boolean } {
  const res = resolveCircleContacts(x, z, r);
  return { x: res.x, z: res.z, hit: res.contacts.length > 0 };
}

export function rampAt(x: number, z: number): RampDef | undefined {
  for (const r of ARENA.ramps) {
    if (pointInBox(x, z, r.x, r.z, r.w, r.d)) return r;
  }
  return undefined;
}

/** Ground height at a point, including ramps and the sunken center bowl. */
export function groundHeightAt(x: number, z: number): number {
  const ramp = rampAt(x, z);
  if (ramp) {
    const localX = (x - ramp.x) / (ramp.w / 2);
    const localZ = (z - ramp.z) / (ramp.d / 2);
    const along = Math.abs(ramp.dirX) > Math.abs(ramp.dirZ) ? localX : localZ;
    const t = (along + 1) / 2;
    return ramp.baseY + ramp.rise * t;
  }
  const centerDist = Math.hypot(x, z);
  if (centerDist < 7) {
    return -0.45 * (1 - centerDist / 7);
  }
  return 0;
}

export function groundNormalAt(x: number, z: number): { nx: number; ny: number; nz: number } {
  const e = 0.25;
  const hx1 = groundHeightAt(x + e, z);
  const hx2 = groundHeightAt(x - e, z);
  const hz1 = groundHeightAt(x, z + e);
  const hz2 = groundHeightAt(x, z - e);
  let nx = (hx1 - hx2) / (2 * e);
  let nz = (hz1 - hz2) / (2 * e);
  const mag = Math.hypot(nx, nz, 1);
  nx /= mag;
  nz /= mag;
  return { nx, ny: 1 / mag, nz };
}

export function pitchFromNormal(n: { nx: number; ny: number; nz: number }, yaw: number): number {
  // Forward vector of tank.
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // Downhill component along forward direction.
  const slope = -(fx * n.nx + fz * n.nz) / n.ny;
  return Math.atan(slope);
}

export function nearestSpawn(x: number, z: number): { x: number; z: number } {
  let best = ARENA.spawnPoints[0];
  let bestD = Infinity;
  for (const s of ARENA.spawnPoints) {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
