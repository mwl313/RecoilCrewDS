/**
 * Authoritative per-cell terrain classification.
 *
 * A cell may belong to several categories, so the state is a bit mask in a
 * deterministic Uint32Array aligned with the heightfield samples. The
 * classification is a pure function of the heightfield slope grid, the
 * profile slope rules, and the authoritative cliff masks, so server and
 * client derive identical flags.
 */
import { hash32 } from './seed';
import type { Heightfield } from './heightfield';
import type { SlopeRules } from './profiles';
import type { CliffEdgeSegment, CliffMasks } from './cliffs';

export enum TerrainFlag {
  Driveable = 1 << 0,
  Risky = 1 << 1,
  Blocked = 1 << 2,
  CliffTop = 1 << 3,
  CliffBottom = 1 << 4,
  CliffWall = 1 << 5,
  RouteProtected = 1 << 6,
  SpawnProtected = 1 << 7,
  LandingProtected = 1 << 8,
  GateProtected = 1 << 9,
  RecoveryProtected = 1 << 10,
  CliffAccess = 1 << 11,
}

export function terrainFlagsAt(flags: Uint32Array, hf: Heightfield, x: number, z: number): number {
  const gx = Math.max(0, Math.min(hf.samplesX - 1, Math.round(hf.localX(x) / hf.cellSize)));
  const gz = Math.max(0, Math.min(hf.samplesZ - 1, Math.round(hf.localZ(z) / hf.cellSize)));
  return flags[gz * hf.samplesX + gx] ?? 0;
}

export function isDriveableAt(flags: Uint32Array, hf: Heightfield, x: number, z: number): boolean {
  return (terrainFlagsAt(flags, hf, x, z) & TerrainFlag.Driveable) !== 0;
}

export function isCliffWallAt(flags: Uint32Array, hf: Heightfield, x: number, z: number): boolean {
  return (terrainFlagsAt(flags, hf, x, z) & TerrainFlag.CliffWall) !== 0;
}

export function isRequiredTraversalAt(flags: Uint32Array, hf: Heightfield, x: number, z: number): boolean {
  const f = terrainFlagsAt(flags, hf, x, z);
  return (
    (f &
      (TerrainFlag.RouteProtected |
        TerrainFlag.SpawnProtected |
        TerrainFlag.GateProtected |
        TerrainFlag.RecoveryProtected |
        TerrainFlag.LandingProtected |
        TerrainFlag.CliffAccess)) !==
    0
  );
}

export function classifyTerrainFlags(
  slopes: Float32Array,
  rules: SlopeRules,
  masks?: CliffMasks,
): Uint32Array {
  const flags = new Uint32Array(slopes.length);
  for (let i = 0; i < slopes.length; i++) {
    const slope = slopes[i];
    const wall = masks?.cliffWall?.[i] === 1;
    let f = 0;
    if (wall || slope >= rules.cliffMin) {
      f |= TerrainFlag.Blocked | TerrainFlag.CliffWall;
    } else if (slope >= rules.blockedMin) {
      f |= TerrainFlag.Blocked;
    } else if (slope >= rules.riskyMax) {
      f |= TerrainFlag.Risky;
    } else {
      f |= TerrainFlag.Driveable;
    }
    if (masks?.cliffTop?.[i] === 1) f |= TerrainFlag.CliffTop;
    if (masks?.cliffBottom?.[i] === 1) f |= TerrainFlag.CliffBottom;
    flags[i] = f;
  }
  return flags;
}

export interface TerrainClassMetrics {
  total: number;
  driveable: number;
  risky: number;
  blocked: number;
  cliffWall: number;
  cliffTop: number;
  cliffBottom: number;
  protectedRequired: number;
  driveableRatio: number;
  riskyRatio: number;
  blockedRatio: number;
}

export function terrainClassMetrics(flags: Uint32Array): TerrainClassMetrics {
  let driveable = 0;
  let risky = 0;
  let blocked = 0;
  let cliffWall = 0;
  let cliffTop = 0;
  let cliffBottom = 0;
  let protectedRequired = 0;
  const total = flags.length;
  const requiredMask =
    TerrainFlag.RouteProtected |
    TerrainFlag.SpawnProtected |
    TerrainFlag.GateProtected |
    TerrainFlag.RecoveryProtected |
    TerrainFlag.LandingProtected |
    TerrainFlag.CliffAccess;
  for (let i = 0; i < total; i++) {
    const f = flags[i];
    if (f & TerrainFlag.Blocked) blocked++;
    else if (f & TerrainFlag.Risky) risky++;
    else driveable++;
    if (f & TerrainFlag.CliffWall) cliffWall++;
    if (f & TerrainFlag.CliffTop) cliffTop++;
    if (f & TerrainFlag.CliffBottom) cliffBottom++;
    if (f & requiredMask) protectedRequired++;
  }
  return {
    total,
    driveable,
    risky,
    blocked,
    cliffWall,
    cliffTop,
    cliffBottom,
    protectedRequired,
    driveableRatio: total === 0 ? 0 : driveable / total,
    riskyRatio: total === 0 ? 0 : risky / total,
    blockedRatio: total === 0 ? 0 : blocked / total,
  };
}

/** Mark a deterministic circle of samples with a protected flag. */
export function markProtectedCircle(
  flags: Uint32Array,
  hf: Heightfield,
  x: number,
  z: number,
  radius: number,
  flag: TerrainFlag,
): void {
  const rCells = Math.ceil(radius / hf.cellSize);
  const xi0 = Math.max(0, Math.floor(x / hf.cellSize) - rCells);
  const xi1 = Math.min(hf.samplesX - 1, Math.ceil(x / hf.cellSize) + rCells);
  const zi0 = Math.max(0, Math.floor(z / hf.cellSize) - rCells);
  const zi1 = Math.min(hf.samplesZ - 1, Math.ceil(z / hf.cellSize) + rCells);
  const r2 = radius * radius;
  for (let zi = zi0; zi <= zi1; zi++) {
    for (let xi = xi0; xi <= xi1; xi++) {
      const wx = xi * hf.cellSize;
      const wz = zi * hf.cellSize;
      if ((wx - x) * (wx - x) + (wz - z) * (wz - z) <= r2) {
        const idx = zi * hf.samplesX + xi;
        flags[idx] = (flags[idx] ?? 0) | flag;
      }
    }
  }
}

/** FNV-1a over a Uint32Array (deterministic, matches server/client). */
export function hashUint32Array(values: Uint32Array): number {
  let h = (0x811c9dc5 ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    h ^= v & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a over exact IEEE-754 LE float bytes. */
export function hashFloats(values: Float32Array | number[]): number {
  const arr = values instanceof Float32Array ? values : Float32Array.from(values);
  let h = (0x811c9dc5 ^ 0x51ed270b) >>> 0;
  const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  for (let i = 0; i < arr.length; i++) {
    const b = view.getUint32(i * 4, true);
    for (let shift = 0; shift < 32; shift += 8) {
      h ^= (b >>> shift) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Stable arena checksum: heightfield bytes + terrain flags + cliff edge
 * geometry. Everything that changes the simulated surface changes this
 * value, so the client checksum gate cannot silently diverge.
 */
export function computeArenaChecksum(input: {
  heightfield: Heightfield;
  terrainFlags?: Uint32Array;
  cliffEdges?: CliffEdgeSegment[];
}): number {
  const base = input.heightfield.checksum();
  const flagsHash = input.terrainFlags ? hashUint32Array(input.terrainFlags) : 0;
  const edgeFloats: number[] = [];
  for (const e of input.cliffEdges ?? []) {
    edgeFloats.push(e.ax, e.az, e.bx, e.bz, e.topY, e.bottomY, e.normalX, e.normalZ);
  }
  const edgesHash = edgeFloats.length === 0 ? 0 : hashFloats(edgeFloats);
  return hash32('arena-v2', base, flagsHash, edgesHash);
}
