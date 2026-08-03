/**
 * Macro terrain features: basin, ridge, plateau, valley, hill.
 *
 * Features are broad smooth stamps (Gaussian / smoothstep profiles) — no
 * per-cell white noise, no sharp spikes. Placement is deterministic
 * rejection sampling from the terrain PRNG with a minimum separation rule.
 */
import type { Rng } from './prng';
import type { Heightfield } from './heightfield';

export type MacroFeatureType = 'basin' | 'ridge' | 'plateau' | 'valley' | 'hill' | 'cliffPlateau' | 'escarpment';

export interface FeatureRange {
  min: number;
  max: number;
}

export interface MacroFeatureConfig {
  count: number;
  minSeparation: number;
  radius?: FeatureRange;
  depth?: FeatureRange;
  height?: FeatureRange;
  length?: FeatureRange;
  width?: FeatureRange;
  falloff: number;
  /** Cliff features: sharp transition band width (m). */
  edgeWidth?: FeatureRange;
  /** Cliff features: 0..1 deterministic edge irregularity. */
  edgeRoughness?: number;
  /** Cliff features: number of carved driveable access corridors. */
  accessCount?: number;
  accessWidth?: number;
  accessMaxSlope?: number;
  safetyBuffer?: number;
  boundaryClearance?: number;
  spawnClearance?: number;
}

export interface MacroFeatureRecord {
  id: string;
  type: MacroFeatureType;
  x: number;
  z: number;
  yaw: number;
  radius: number;
  length: number;
  width: number;
  amplitude: number;
  falloff: number;
  minSeparation: number;
}

export type BaseFeatureType = 'basin' | 'ridge' | 'plateau' | 'valley' | 'hill';
export type CliffFeatureType = 'cliffPlateau' | 'escarpment';
export type MacroFeatureConfigs = Record<BaseFeatureType, MacroFeatureConfig> &
  Partial<Record<CliffFeatureType, MacroFeatureConfig>>;

export const FEATURE_ORDER: BaseFeatureType[] = ['basin', 'ridge', 'plateau', 'valley', 'hill'];

function sampleRange(rng: Rng, range: FeatureRange | undefined, fallback: number): number {
  if (!range) return fallback;
  return range.min + (range.max - range.min) * rng();
}

/**
 * Deterministically place macro features with minimum separation. Positions
 * are rejected until they clear every earlier feature (order is fixed, so
 * the output is stable). If the budget is exhausted the last candidate is
 * kept; the validator will reject spacing violations and trigger a retry.
 */
export function placeMacroFeatures(
  rng: Rng,
  configs: MacroFeatureConfigs,
  widthMeters: number,
  depthMeters: number,
  margin = 50,
): MacroFeatureRecord[] {
  const records: MacroFeatureRecord[] = [];
  let id = 0;
  for (const type of FEATURE_ORDER) {
    const cfg = configs[type];
    for (let n = 0; n < cfg.count; n++) {
      const directional = type === 'ridge' || type === 'valley';
      const radius = sampleRange(rng, cfg.radius, 20);
      const length = sampleRange(rng, cfg.length, 80);
      const width = sampleRange(rng, cfg.width, 20);
      const amplitude = sampleRange(
        rng,
        cfg.height ?? cfg.depth,
        type === 'basin' || type === 'valley' ? 3 : 2,
      );
      const minX = Math.min(margin, widthMeters * 0.25);
      const maxX = widthMeters - minX;
      const minZ = Math.min(margin, depthMeters * 0.25);
      const maxZ = depthMeters - minZ;

      let x = minX + (maxX - minX) * rng();
      let z = minZ + (maxZ - minZ) * rng();
      let yaw = rng() * Math.PI;
      let bestDistance = -1;
      let bestCandidate = { x, z, yaw };
      // Both features' separation rules apply: the stricter one wins.
      const required = records.reduce(
        (worst, other) => Math.max(worst, Math.max(cfg.minSeparation, other.minSeparation)),
        cfg.minSeparation,
      );

      const placementAttempts = 512;
      for (let attempt = 0; attempt < placementAttempts; attempt++) {
        const cx = minX + (maxX - minX) * rng();
        const cz = minZ + (maxZ - minZ) * rng();
        const cyaw = rng() * Math.PI;
        let minDist = Infinity;
        for (const other of records) {
          const d = Math.hypot(cx - other.x, cz - other.z);
          minDist = Math.min(minDist, d);
        }
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
        // Budget exhausted: keep the best-spaced candidate.
        x = bestCandidate.x;
        z = bestCandidate.z;
        yaw = bestCandidate.yaw;
      }
      records.push({
        id: `feature.${type}.${id++}`,
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
      });
    }
  }
  return records;
}

/** Add every feature stamp to the heightfield (deterministic, smooth). */
export function applyMacroFeatures(hf: Heightfield, features: MacroFeatureRecord[]): void {
  for (const feature of features) {
    applyFeature(hf, feature);
  }
}

export function applyFeature(hf: Heightfield, feature: MacroFeatureRecord): void {
  const cosYaw = Math.cos(feature.yaw);
  const sinYaw = Math.sin(feature.yaw);
  for (let zi = 0; zi < hf.samplesZ; zi++) {
    for (let xi = 0; xi < hf.samplesX; xi++) {
      const x = xi * hf.cellSize;
      const z = zi * hf.cellSize;
      const dx = x - feature.x;
      const dz = z - feature.z;
      const along = dx * cosYaw + dz * sinYaw;
      const perp = -dx * sinYaw + dz * cosYaw;
      const idx = hf.sampleIndex(xi, zi);
      switch (feature.type) {
        case 'basin':
          hf.samples[idx] += -feature.amplitude * gaussian(Math.hypot(dx, dz), feature.radius);
          break;
        case 'hill':
          hf.samples[idx] += feature.amplitude * gaussian(Math.hypot(dx, dz), feature.radius);
          break;
        case 'plateau':
          hf.samples[idx] += feature.amplitude * plateauProfile(Math.hypot(dx, dz), feature.radius, feature.falloff);
          break;
        case 'ridge':
          hf.samples[idx] += feature.amplitude * ridgeProfile(along, perp, feature.length, feature.width, feature.falloff);
          break;
        case 'valley':
          hf.samples[idx] += -feature.amplitude * ridgeProfile(along, perp, feature.length, feature.width, feature.falloff);
          break;
      }
    }
  }
}

function gaussian(d: number, radius: number): number {
  const t = d / radius;
  return Math.exp(-(t * t));
}

/** Smooth plateau: flat core, smoothstep falloff band, zero outside radius. */
function plateauProfile(d: number, radius: number, falloff: number): number {
  if (radius <= 0) return 0;
  const band = Math.max(0.05, radius * falloff);
  if (d <= radius - band) return 1;
  if (d >= radius) return 0;
  const t = (radius - d) / band;
  return smoothstep(t);
}

/** Elongated ridge/valley profile with rounded ends. */
function ridgeProfile(
  along: number,
  perp: number,
  length: number,
  width: number,
  falloff: number,
): number {
  if (length <= 0 || width <= 0) return 0;
  const cross = Math.exp(-((perp / (width * 0.5)) ** 2));
  const endBand = Math.max(0.05, length * falloff);
  const t = Math.abs(along);
  let end = 1;
  if (t >= length) end = 0;
  else if (t > length - endBand) end = smoothstep((length - t) / endBand);
  return cross * end;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
