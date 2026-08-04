/**
 * Ramp/platform placement with approach, flight, and landing validation.
 *
 * Flight bounds come from the shared movement parameters (normal top speed,
 * dash, jump-assisted launch, cannon/charged-cannon recoil, Moon Yard gravity) so
 * every accepted ramp is landable by every supported movement profile.
 */
import { BASE_CONFIG } from '../config';
import type { Rng } from './prng';
import type { Heightfield } from './heightfield';
import type { RouteGraph } from './routes';
import { distToSegment } from './routes';
import type { ZoneRegion } from './zones';
import { findRegions } from './zones';

/** Shared movement bounds (mirrors BASE_CONFIG + Moon Yard gravity). */
export const MOVEMENT_BOUNDS = {
  forwardSpeed: BASE_CONFIG.tank.forwardSpeed,
  dashMaxHorizontalSpeed: BASE_CONFIG.tank.dashMaxHorizontalSpeed,
  jumpHeight: BASE_CONFIG.tank.jumpHeight,
  rampLaunchSpeed: BASE_CONFIG.tank.rampLaunchSpeed,
  gravityNormal: BASE_CONFIG.tank.gravity,
  gravityMoon: 6.5,
  cannonRecoilImpulse: BASE_CONFIG.tank.recoilImpulse,
  airLiftFactor: 1.8,
  airLiftClamp: 1.4,
} as const;

export interface GeneratedRamp {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  dirX: number;
  dirZ: number;
  rise: number;
  baseY: number;
  landingX: number;
  landingZ: number;
  flightRange: number;
}

export interface RampPlacementOptions {
  rng: Rng;
  hf: Heightfield;
  graph: RouteGraph;
  zones: ZoneRegion[];
  widthMeters: number;
  depthMeters: number;
  count: number;
  lengthRange: [number, number];
  widthRange: [number, number];
  riseRange: [number, number];
  minSpacing: number;
}

export function placeRamps(options: RampPlacementOptions): GeneratedRamp[] {
  const ramps: GeneratedRamp[] = [];
  const rampParks = findRegions(options.zones, 'rampPark');
  const candidates: Array<{ x: number; z: number; dirX: number; dirZ: number; slope: number }> = [];

  // Deterministic candidates: rising corridor segments + ramp-park edges.
  for (const c of options.graph.corridors) {
    const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
    const dirX = (c.bx - c.ax) / len;
    const dirZ = (c.bz - c.az) / len;
    const steps = Math.max(2, Math.floor(len / 12));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = c.ax + (c.bx - c.ax) * t;
      const z = c.az + (c.bz - c.az) * t;
      const slope = Math.abs(
        (options.hf.heightAt(x + dirX * 6, z + dirZ * 6) - options.hf.heightAt(x - dirX * 6, z - dirZ * 6)) / 12,
      );
      if (slope >= 0.08 && slope <= 0.32) {
        candidates.push({ x, z, dirX, dirZ, slope });
      }
    }
  }
  for (const park of rampParks) {
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + options.rng() * 0.4;
      const x = park.x + Math.cos(angle) * park.radius * 0.9;
      const z = park.z + Math.sin(angle) * park.radius * 0.9;
      candidates.push({ x, z, dirX: Math.sin(angle), dirZ: Math.cos(angle), slope: 0.15 });
    }
  }
  // Deterministic order: sort by id-stable key.
  candidates.sort(
    (a, b) =>
      a.x - b.x ||
      a.z - b.z ||
      a.dirX - b.dirX ||
      a.dirZ - b.dirZ ||
      a.slope - b.slope,
  );

  let id = 0;
  for (const c of candidates) {
    if (ramps.length >= options.count) break;
    if (ramps.some((r) => Math.hypot(r.x - c.x, r.z - c.z) < options.minSpacing)) continue;
    const w = options.widthRange[0] + (options.widthRange[1] - options.widthRange[0]) * options.rng();
    const d = options.lengthRange[0] + (options.lengthRange[1] - options.lengthRange[0]) * options.rng();
    const rise = options.riseRange[0] + (options.riseRange[1] - options.riseRange[0]) * options.rng();
    const baseY = options.hf.heightAt(c.x - c.dirX * d * 0.5, c.z - c.dirZ * d * 0.5);
    const ramp: GeneratedRamp = {
      id: `ramp.${id++}`,
      x: c.x,
      z: c.z,
      w,
      d,
      dirX: c.dirX,
      dirZ: c.dirZ,
      rise,
      baseY,
      landingX: 0,
      landingZ: 0,
      flightRange: 0,
    };
    const landing = validateRamp(ramp, options);
    if (!landing) continue;
    ramp.landingX = landing.x;
    ramp.landingZ = landing.z;
    ramp.flightRange = landing.range;
    ramps.push(ramp);
  }
  return ramps;
}

export interface LandingResult {
  x: number;
  z: number;
  range: number;
}

/**
 * Approach / alignment / flight corridor / landing / connectivity checks.
 * Returns the landing point when every requirement passes, else null.
 */
export function validateRamp(
  ramp: GeneratedRamp,
  options: Pick<RampPlacementOptions, 'hf' | 'graph' | 'widthMeters' | 'depthMeters'>,
): LandingResult | null {
  const { hf } = options;
  const dx = ramp.dirX;
  const dz = ramp.dirZ;
  const topX = ramp.x + dx * ramp.d * 0.5;
  const topZ = ramp.z + dz * ramp.d * 0.5;
  const topHeight = ramp.baseY + ramp.rise;

  // 1. Approach: flat area behind the base.
  const baseX = ramp.x - dx * ramp.d * 0.5;
  const baseZ = ramp.z - dz * ramp.d * 0.5;
  for (const side of [-1, 0, 1]) {
    const px = baseX - dx * 5 + -dz * side * 3;
    const pz = baseZ - dz * 5 + dx * side * 3;
    if (!inBounds(px, pz, options)) return null;
    if (hf.slopeAt(px, pz) > 0.2) return null;
    if (Math.abs(hf.heightAt(px, pz) - ramp.baseY) > 1.5) return null;
  }

  // 2. Takeoff alignment with the nearest corridor (<= 30°).
  let bestAngle = Infinity;
  for (const c of options.graph.corridors) {
    if (distToSegment(ramp.x, ramp.z, c.ax, c.az, c.bx, c.bz) > 30) continue;
    const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
    const cdx = (c.bx - c.ax) / len;
    const cdz = (c.bz - c.az) / len;
    const dot = Math.abs(dx * cdx + dz * cdz);
    bestAngle = Math.min(bestAngle, Math.acos(Math.max(-1, Math.min(1, dot))));
  }
  if (bestAngle > Math.PI / 6) return null;

  // 3. Supported flight bounds (normal through Moon Yard + jump + recoil).
  const jumpVelocity = Math.sqrt(2 * MOVEMENT_BOUNDS.gravityMoon * MOVEMENT_BOUNDS.jumpHeight);
  const maxAirLift =
    MOVEMENT_BOUNDS.airLiftFactor *
    Math.min(MOVEMENT_BOUNDS.airLiftClamp, MOVEMENT_BOUNDS.cannonRecoilImpulse / 7);
  const launchVy =
    MOVEMENT_BOUNDS.rampLaunchSpeed + jumpVelocity + maxAirLift;
  const flightTime = (2 * launchVy) / MOVEMENT_BOUNDS.gravityMoon;
  const farRange = MOVEMENT_BOUNDS.dashMaxHorizontalSpeed * flightTime;
  const nearRange =
    (MOVEMENT_BOUNDS.forwardSpeed * 2 * MOVEMENT_BOUNDS.rampLaunchSpeed) /
    MOVEMENT_BOUNDS.gravityNormal;
  const searchRange = Math.min(60, Math.max(30, farRange));

  // 4. Flight corridor: clear, moderate slope, in bounds.
  for (let d = 2; d <= searchRange; d += 2) {
    const px = topX + dx * d;
    const pz = topZ + dz * d;
    for (const side of [-1, 0, 1]) {
      const sx = px + -dz * side * 4;
      const sz = pz + dx * side * 4;
      if (!inBounds(sx, sz, options)) return null;
      if (hf.slopeAt(sx, sz) > 0.35) return null;
    }
  }

  // 5. Landing zone: flat patch within the supported range, connected.
  for (let d = Math.max(6, Math.floor(nearRange * 0.6)); d <= searchRange; d += 2) {
    const px = topX + dx * d;
    const pz = topZ + dz * d;
    if (!inBounds(px, pz, options)) continue;
    const h = hf.heightAt(px, pz);
    if (h < topHeight - 8 || h > topHeight + 3) continue;
    if (hf.slopeAt(px, pz) > 0.2) continue;
    let clear = true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lx = px + Math.cos(a) * 4;
      const lz = pz + Math.sin(a) * 4;
      if (!inBounds(lx, lz, options) || hf.slopeAt(lx, lz) > 0.25 || Math.abs(hf.heightAt(lx, lz) - h) > 1.5) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    let connected = false;
    for (const c of options.graph.corridors) {
      if (distToSegment(px, pz, c.ax, c.az, c.bx, c.bz) <= 25) {
        connected = true;
        break;
      }
    }
    if (!connected) continue;
    return { x: px, z: pz, range: d };
  }
  return null;
}

function inBounds(
  x: number,
  z: number,
  options: Pick<RampPlacementOptions, 'widthMeters' | 'depthMeters'>,
): boolean {
  const margin = 4;
  return x >= margin && x <= options.widthMeters - margin && z >= margin && z <= options.depthMeters - margin;
}
