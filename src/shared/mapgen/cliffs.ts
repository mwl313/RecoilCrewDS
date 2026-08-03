/**
 * Dedicated cliff features: cliffPlateau and escarpment.
 *
 * Cliffs are deterministic stamps: a flat top (or a raised half-plane) with
 * a deliberately narrow transition band that becomes a wall. The wall/top/
 * bottom masks are authoritative (they drive classification, edge segments,
 * validation, and rendering), and optional access corridors are carved
 * before route generation so required routes may enter high ground.
 */
import type { Rng } from './prng';
import type { Heightfield } from './heightfield';
import type { MacroFeatureRecord, FeatureRange } from './features';
import { carveRoutes } from './routes';

export type CliffType = 'cliffPlateau' | 'escarpment';

export interface CliffFeatureConfig {
  count: number;
  minSeparation: number;
  radius?: FeatureRange;
  height?: FeatureRange;
  length?: FeatureRange;
  width?: FeatureRange;
  falloff: number;
  /** Width of the sharp transition band (m). Small = real wall. */
  edgeWidth?: FeatureRange;
  /** 0..1 deterministic edge irregularity. */
  edgeRoughness?: number;
  /** Number of carved driveable access corridors (0 = optional/blocked). */
  accessCount?: number;
  accessWidth?: number;
  accessMaxSlope?: number;
  safetyBuffer?: number;
  boundaryClearance?: number;
  spawnClearance?: number;
}

export interface CliffFeatureRecord extends MacroFeatureRecord {
  type: CliffType;
  edgeWidth: number;
  edgeRoughness: number;
  accessCount: number;
  accessWidth: number;
  accessMaxSlope: number;
  safetyBuffer: number;
  boundaryClearance: number;
  spawnClearance: number;
}

export interface CliffMasks {
  /** Cells inside the sharp transition band (authoritative walls). */
  cliffWall: Uint8Array;
  /** Cells on the raised top. */
  cliffTop: Uint8Array;
  /** Cells in the safety ring below the wall. */
  cliffBottom: Uint8Array;
}

export interface CliffEdgeSegment {
  id: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  topY: number;
  bottomY: number;
  normalX: number;
  normalZ: number;
  featureId: string;
}

export interface AccessCorridor {
  edgeId: string;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
  featureId: string;
}

export interface ResolvedCliffConfig {
  edgeWidth: number;
  edgeRoughness: number;
  accessCount: number;
  accessWidth: number;
  accessMaxSlope: number;
  safetyBuffer: number;
  boundaryClearance: number;
  spawnClearance: number;
}

export function resolveCliffConfig(
  cfg: CliffFeatureConfig | undefined,
  defaults: Partial<ResolvedCliffConfig> = {},
): ResolvedCliffConfig {
  const accessMaxSlope = cfg?.accessMaxSlope ?? 0.3;
  return {
    edgeWidth: rangeValue(cfg?.edgeWidth, 6),
    edgeRoughness: cfg?.edgeRoughness ?? 0.35,
    accessCount: cfg?.accessCount ?? 0,
    accessWidth: cfg?.accessWidth ?? 10,
    accessMaxSlope: Math.max(0.15, Math.min(0.6, accessMaxSlope)),
    safetyBuffer: cfg?.safetyBuffer ?? 8,
    boundaryClearance: cfg?.boundaryClearance ?? 30,
    spawnClearance: cfg?.spawnClearance ?? 40,
    ...defaults,
  };
}

function rangeValue(range: FeatureRange | undefined, fallback: number): number {
  return range ? (range.min + range.max) / 2 : fallback;
}

function sampleRange(rng: Rng, range: FeatureRange | undefined, fallback: number): number {
  if (!range) return fallback;
  return range.min + (range.max - range.min) * rng();
}

/**
 * Deterministic cliff placement (same rejection-sampling rules as macro
 * features; separation is enforced against every existing feature).
 */
export function placeCliffFeatures(
  rng: Rng,
  configs: { cliffPlateau?: CliffFeatureConfig; escarpment?: CliffFeatureConfig },
  widthMeters: number,
  depthMeters: number,
  existing: MacroFeatureRecord[],
  margin = 40,
): CliffFeatureRecord[] {
  const records: CliffFeatureRecord[] = [];
  const order: Array<{ type: CliffType; cfg: CliffFeatureConfig }> = [];
  for (const type of ['cliffPlateau', 'escarpment'] as const) {
    const cfg = configs[type];
    if (cfg && cfg.count > 0) order.push({ type, cfg });
  }
  let id = 0;
  for (const { type, cfg } of order) {
    const resolved = resolveCliffConfig(cfg);
    const directional = type === 'escarpment';
    const radius = sampleRange(rng, cfg.radius, 28);
    const length = sampleRange(rng, cfg.length, 100);
    const width = sampleRange(rng, cfg.width, 24);
    const amplitude = sampleRange(rng, cfg.height, 8);
    const edgeWidth = sampleRange(rng, cfg.edgeWidth, resolved.edgeWidth);
    const minX = Math.min(resolved.boundaryClearance, widthMeters * 0.22);
    const maxX = widthMeters - minX;
    const minZ = Math.min(resolved.boundaryClearance, depthMeters * 0.22);
    const maxZ = depthMeters - minZ;
    let x = minX + (maxX - minX) * rng();
    let z = minZ + (maxZ - minZ) * rng();
    let yaw = rng() * Math.PI;
    let bestDistance = -1;
    let bestCandidate = { x, z, yaw };
    const all = [...existing, ...records];
    const required = all.reduce((worst, other) => Math.max(worst, cfg.minSeparation), cfg.minSeparation);
    for (let attempt = 0; attempt < 512; attempt++) {
      const cx = minX + (maxX - minX) * rng();
      const cz = minZ + (maxZ - minZ) * rng();
      const cyaw = rng() * Math.PI;
      let minDist = Infinity;
      for (const other of all) minDist = Math.min(minDist, Math.hypot(cx - other.x, cz - other.z));
      if (minDist >= required) {
        x = cx;
        z = cz;
        yaw = cyaw;
        bestDistance = minDist;
        break;
      }
      if (minDist > bestDistance) {
        bestDistance = minDist;
        bestCandidate = { x: cx, z: cz, yaw: cyaw };
      }
    }
    if (bestDistance < required) {
      x = bestCandidate.x;
      z = bestCandidate.z;
      yaw = bestCandidate.yaw;
    }
    if (type === 'escarpment') {
      // Lower side (+along) should face the map center so access corridors
      // connect to the central route network.
      const centerX = widthMeters / 2;
      const centerZ = depthMeters / 2;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const toCenterX = centerX - x;
      const toCenterZ = centerZ - z;
      if (cosYaw * toCenterX + sinYaw * toCenterZ < 0) yaw += Math.PI;
    }
    records.push({
      id: `cliff.${type}.${id++}`,
      type,
      x,
      z,
      yaw,
      radius,
      length,
      width,
      amplitude,
      falloff: cfg.falloff,
      minSeparation: cfg.minSeparation,
      edgeWidth: Math.max(2, edgeWidth),
      edgeRoughness: resolved.edgeRoughness,
      accessCount: resolved.accessCount,
      accessWidth: resolved.accessWidth,
      accessMaxSlope: resolved.accessMaxSlope,
      safetyBuffer: resolved.safetyBuffer,
      boundaryClearance: resolved.boundaryClearance,
      spawnClearance: resolved.spawnClearance,
    });
    void directional;
  }
  return records;
}

/** Contribution of one cliff feature at a local point (0..1). */
function cliffContribution(
  feature: CliffFeatureRecord,
  x: number,
  z: number,
): { value: number; insideTop: boolean; inBand: boolean; dist: number } {
  const cosYaw = Math.cos(feature.yaw);
  const sinYaw = Math.sin(feature.yaw);
  const dx = x - feature.x;
  const dz = z - feature.z;
  const along = dx * cosYaw + dz * sinYaw;
  const perp = -dx * sinYaw + dz * cosYaw;
  if (feature.type === 'escarpment') {
    const halfW = feature.width / 2;
    const halfL = feature.length / 2;
    const cross = Math.exp(-((perp / Math.max(1, halfW)) ** 2));
    const t = Math.abs(along);
    const endBand = Math.max(4, feature.length * 0.12);
    const end = t >= halfL ? 0 : t > halfL - endBand ? smoothstep((halfL - t) / endBand) : 1;
    const wall = feature.edgeWidth;
    let step = 1;
    let inBand = false;
    if (along >= 0) {
      step = along >= wall ? 0 : smoothstep((wall - along) / wall);
      inBand = along > 0 && along < wall;
    }
    const roughness = feature.edgeRoughness * 3;
    const wiggle = Math.sin(perp * 0.045 + feature.x * 0.02 + feature.z * 0.017);
    const edgeShift = Math.max(0, Math.min(wall, along + wiggle * roughness));
    if (along >= -roughness && along <= wall + roughness) inBand = true;
    const value = cross * end * (along < 0 ? 1 : 1 - edgeShift / Math.max(1, wall));
    return { value: Math.max(0, value), insideTop: along < 0 && cross > 0.5 && end > 0.5, inBand, dist: Math.abs(along) };
  }
  const d = Math.hypot(dx, dz);
  const r = feature.radius;
  const band = Math.max(2, feature.edgeWidth);
  const value = d <= r - band ? 1 : d >= r ? 0 : smoothstep((r - d) / band);
  return {
    value,
    insideTop: d <= r - band * 0.5,
    inBand: d > r - band * 1.5 && d < r + band * 0.5,
    dist: d,
  };
}

export function applyCliffFeatures(hf: Heightfield, features: CliffFeatureRecord[]): void {
  for (const feature of features) {
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const x = xi * hf.cellSize;
        const z = zi * hf.cellSize;
        const c = cliffContribution(feature, x, z);
        const idx = hf.sampleIndex(xi, zi);
        hf.samples[idx] += feature.amplitude * c.value;
      }
    }
  }
}

/**
 * Deterministic masks from the placed cliffs: top = inside the raised core,
 * wall = the sharp band, bottom = the safety ring below the wall.
 */
export function computeCliffMasks(
  hf: Heightfield,
  features: CliffFeatureRecord[],
  cliffMin: number,
): CliffMasks {
  const wall = new Uint8Array(hf.samples.length);
  const top = new Uint8Array(hf.samples.length);
  const bottom = new Uint8Array(hf.samples.length);
  const cell = hf.cellSize;
  for (const feature of features) {
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const x = xi * cell;
        const z = zi * cell;
        const c = cliffContribution(feature, x, z);
        const idx = hf.sampleIndex(xi, zi);
        if (c.insideTop) top[idx] = 1;
        if (c.inBand) {
          // The band is a wall only if it is genuinely steep.
          const h = hf.samples[idx];
          const dx0 = Math.max(0, Math.abs(h - hf.getSample(Math.max(0, xi - 1), zi)) / cell);
          const dx1 = Math.abs(h - hf.getSample(Math.min(hf.samplesX - 1, xi + 1), zi)) / cell;
          const dz0 = Math.max(0, Math.abs(h - hf.getSample(xi, Math.max(0, zi - 1))) / cell);
          const dz1 = Math.abs(h - hf.getSample(xi, Math.min(hf.samplesZ - 1, zi + 1))) / cell;
          const worst = Math.max(dx0, dx1, dz0, dz1);
          if (worst >= cliffMin * 0.75) wall[idx] = 1;
        }
        if (c.inBand && !c.insideTop) {
          const d = feature.type === 'escarpment' ? c.dist : c.dist - feature.radius;
          if (d <= feature.safetyBuffer && d > 0) bottom[idx] = 1;
        }
      }
    }
  }
  return { cliffWall: wall, cliffTop: top, cliffBottom: bottom };
}

/**
 * Extract deterministic cliff-edge segments. For every wall cell adjacent to
 * a top cell, a segment runs from the top neighbor center to the wall cell
 * center; top/bottom heights are the authoritative sample heights. Output is
 * sorted for a stable order.
 */
export function extractCliffEdges(
  hf: Heightfield,
  features: CliffFeatureRecord[],
  masks: CliffMasks,
): CliffEdgeSegment[] {
  const segments: CliffEdgeSegment[] = [];
  for (const feature of features) {
    let n = 0;
    for (let zi = 1; zi < hf.samplesZ - 1; zi++) {
      for (let xi = 1; xi < hf.samplesX - 1; xi++) {
        const idx = hf.sampleIndex(xi, zi);
        if (masks.cliffWall[idx] !== 1) continue;
        const w = hf.getSample(xi, zi);
        // Find the steepest upward neighbor that is a top cell.
        const neighbors: Array<[number, number, number]> = [
          [xi - 1, zi, hf.getSample(xi - 1, zi)],
          [xi + 1, zi, hf.getSample(xi + 1, zi)],
          [xi, zi - 1, hf.getSample(xi, zi - 1)],
          [xi, zi + 1, hf.getSample(xi, zi + 1)],
        ];
        let best: [number, number, number] | null = null;
        let bestDelta = 0;
        for (const nb of neighbors) {
          const delta = nb[2] - w;
          if (delta > bestDelta && masks.cliffTop[hf.sampleIndex(nb[0], nb[1])] === 1) {
            bestDelta = delta;
            best = nb;
          }
        }
        if (!best) continue;
        const ox = xi + (xi - best[0]);
        const oz = zi + (zi - best[1]);
        if (ox < 0 || ox >= hf.samplesX || oz < 0 || oz >= hf.samplesZ) continue;
        const lowerY = hf.getSample(ox, oz);
        const topY = best[2];
        if (topY - lowerY < 0.75) continue;
        const ax = best[0] * hf.cellSize;
        const az = best[1] * hf.cellSize;
        const bx = xi * hf.cellSize;
        const bz = zi * hf.cellSize;
        const len = Math.hypot(bx - ax, bz - az) || 1;
        segments.push({
          id: `${feature.id}.edge.${n++}`,
          ax,
          az,
          bx,
          bz,
          topY,
          bottomY: lowerY,
          normalX: (bx - ax) / len,
          normalZ: (bz - az) / len,
          featureId: feature.id,
        });
      }
    }
  }
  segments.sort((a, b) =>
    a.featureId < b.featureId
      ? -1
      : a.featureId > b.featureId
        ? 1
        : a.az !== b.az
          ? a.az - b.az
          : a.ax !== b.ax
            ? a.ax - b.ax
            : a.bx - b.bx || a.bz - b.bz,
  );
  return segments;
}

/**
 * Carve optional driveable access corridors from the base up to each cliff
 * top. Runs before route generation so routes may legally reach high
 * ground. Corridors are marked CliffAccess by the caller.
 */
export function carveCliffAccessCorridors(
  hf: Heightfield,
  features: CliffFeatureRecord[],
  widthMeters = 400,
  depthMeters = 400,
): AccessCorridor[] {
  const corridors: AccessCorridor[] = [];
  const centerX = widthMeters / 2;
  const centerZ = depthMeters / 2;
  for (const feature of features) {
    if (feature.accessCount <= 0) continue;
    const cosYaw = Math.cos(feature.yaw);
    const sinYaw = Math.sin(feature.yaw);
    const perpX = -sinYaw;
    const perpZ = cosYaw;
    let topX: number;
    let topZ: number;
    let dirX: number;
    let dirZ: number;
    if (feature.type === 'escarpment') {
      // Start just inside the step on the upper side, run down the step to
      // the lower side (+along, which faces the map center).
      const edgeOffset = Math.max(4, feature.edgeWidth + 2);
      const perpOffset = feature.width * 0.15;
      topX = feature.x + cosYaw * -edgeOffset + perpX * perpOffset;
      topZ = feature.z + sinYaw * -edgeOffset + perpZ * perpOffset;
      dirX = cosYaw;
      dirZ = sinYaw;
    } else {
      // Cliff plateau: ramp from just inside the rim straight toward the
      // map center so the base lands near the central route network.
      const rim = Math.max(8, feature.radius - feature.edgeWidth - 2);
      const toCenterX = centerX - feature.x;
      const toCenterZ = centerZ - feature.z;
      const d = Math.hypot(toCenterX, toCenterZ) || 1;
      dirX = toCenterX / d;
      dirZ = toCenterZ / d;
      topX = feature.x + dirX * rim + perpX * (feature.radius * 0.18);
      topZ = feature.z + dirZ * rim + perpZ * (feature.radius * 0.18);
    }
    const len = 55;
    const bx = topX + dirX * len;
    const bz = topZ + dirZ * len;
    corridors.push({
      edgeId: `access.${feature.id}`,
      ax: topX,
      az: topZ,
      bx,
      bz,
      halfWidth: feature.accessWidth / 2,
      featureId: feature.id,
    });
  }
  if (corridors.length > 0) {
    carveRoutes(
      hf,
      corridors.map((c) => ({ edgeId: c.edgeId, ax: c.ax, az: c.az, bx: c.bx, bz: c.bz, halfWidth: c.halfWidth })),
      Math.max(...features.filter((f) => f.accessCount > 0).map((f) => f.accessMaxSlope)),
    );
  }
  return corridors;
}

export function cliffEdgeMetrics(edges: CliffEdgeSegment[]): {
  edgeLength: number;
  largestDrop: number;
  count: number;
} {
  let edgeLength = 0;
  let largestDrop = 0;
  for (const e of edges) {
    edgeLength += Math.hypot(e.bx - e.ax, e.bz - e.az);
    largestDrop = Math.max(largestDrop, e.topY - e.bottomY);
  }
  return { edgeLength, largestDrop, count: edges.length };
}

export function isNearCliffEdge(
  masks: CliffMasks,
  hf: Heightfield,
  x: number,
  z: number,
  buffer: number,
): boolean {
  const rCells = Math.ceil(buffer / hf.cellSize);
  const xi0 = Math.max(0, Math.floor(x / hf.cellSize) - rCells);
  const xi1 = Math.min(hf.samplesX - 1, Math.ceil(x / hf.cellSize) + rCells);
  const zi0 = Math.max(0, Math.floor(z / hf.cellSize) - rCells);
  const zi1 = Math.min(hf.samplesZ - 1, Math.ceil(z / hf.cellSize) + rCells);
  for (let zi = zi0; zi <= zi1; zi++) {
    for (let xi = xi0; xi <= xi1; xi++) {
      if (masks.cliffWall[hf.sampleIndex(xi, zi)] === 1) return true;
    }
  }
  return false;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
