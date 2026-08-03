/**
 * Deterministic heightfield data for the seeded map generator.
 *
 * Layout: `samplesX x samplesZ` edge-inclusive Float32Array grid with
 * `cellSize` metre cells. A 400×400 m map at 4 m cells has 101×101 samples.
 * All queries are deterministic bilinear interpolation; coordinates outside
 * the grid clamp to the nearest edge sample (explicit border behavior).
 */
import { clamp } from '../math';

export interface HeightfieldOptions {
  widthMeters: number;
  depthMeters: number;
  cellSize: number;
}

export class Heightfield {
  readonly widthMeters: number;
  readonly depthMeters: number;
  readonly cellSize: number;
  readonly samplesX: number;
  readonly samplesZ: number;
  readonly samples: Float32Array;

  constructor(options: HeightfieldOptions, samples?: Float32Array) {
    this.widthMeters = options.widthMeters;
    this.depthMeters = options.depthMeters;
    this.cellSize = options.cellSize;
    this.samplesX = Math.round(options.widthMeters / options.cellSize) + 1;
    this.samplesZ = Math.round(options.depthMeters / options.cellSize) + 1;
    const expected = this.samplesX * this.samplesZ;
    if (samples !== undefined) {
      if (samples.length !== expected) {
        throw new Error(
          `heightfield sample count mismatch: expected ${expected}, got ${samples.length}`,
        );
      }
      this.samples = samples;
    } else {
      this.samples = new Float32Array(expected);
    }
  }

  sampleIndex(xi: number, zi: number): number {
    return zi * this.samplesX + xi;
  }

  getSample(xi: number, zi: number): number {
    return this.samples[this.sampleIndex(xi, zi)];
  }

  setSample(xi: number, zi: number, value: number): void {
    this.samples[this.sampleIndex(xi, zi)] = value;
  }

  /** Local grid coordinate (0..widthMeters) from a world coordinate. */
  localX(x: number): number {
    return clamp(x, 0, this.widthMeters);
  }

  localZ(z: number): number {
    return clamp(z, 0, this.depthMeters);
  }

  /**
   * Height at a world point via bilinear interpolation. Points outside the
   * grid are clamped to the nearest edge sample (bounded terrain).
   */
  heightAt(x: number, z: number): number {
    const gx = this.localX(x) / this.cellSize;
    const gz = this.localZ(z) / this.cellSize;
    const x0 = Math.min(this.samplesX - 2, Math.floor(gx));
    const z0 = Math.min(this.samplesZ - 2, Math.floor(gz));
    const fx = gx - x0;
    const fz = gz - z0;
    const h00 = this.getSample(x0, z0);
    const h10 = this.getSample(x0 + 1, z0);
    const h01 = this.getSample(x0, z0 + 1);
    const h11 = this.getSample(x0 + 1, z0 + 1);
    const top = h00 + (h10 - h00) * fx;
    const bottom = h01 + (h11 - h01) * fx;
    return top + (bottom - top) * fz;
  }

  /** Up vector from central differences (deterministic, border-safe). */
  normalAt(x: number, z: number): { nx: number; ny: number; nz: number } {
    const e = Math.max(this.cellSize * 0.5, 0.25);
    const hx1 = this.heightAt(x + e, z);
    const hx2 = this.heightAt(x - e, z);
    const hz1 = this.heightAt(x, z + e);
    const hz2 = this.heightAt(x, z - e);
    let nx = (hx1 - hx2) / (2 * e);
    let nz = (hz1 - hz2) / (2 * e);
    const mag = Math.hypot(nx, nz, 1);
    nx /= mag;
    nz /= mag;
    return { nx, ny: 1 / mag, nz };
  }

  /** Local terrain gradient magnitude (rise/run ratio) at a point. */
  slopeAt(x: number, z: number): number {
    const e = Math.max(this.cellSize * 0.5, 0.25);
    const hx1 = this.heightAt(x + e, z);
    const hx2 = this.heightAt(x - e, z);
    const hz1 = this.heightAt(x, z + e);
    const hz2 = this.heightAt(x, z - e);
    return Math.hypot((hx1 - hx2) / (2 * e), (hz1 - hz2) / (2 * e));
  }

  /** Maximum 4-neighbour gradient over the whole grid (rise/run ratio). */
  maxSlope(): number {
    let worst = 0;
    const cell = this.cellSize;
    for (let zi = 0; zi < this.samplesZ; zi++) {
      for (let xi = 0; xi < this.samplesX; xi++) {
        const h = this.getSample(xi, zi);
        if (xi + 1 < this.samplesX) {
          worst = Math.max(worst, Math.abs(h - this.getSample(xi + 1, zi)) / cell);
        }
        if (zi + 1 < this.samplesZ) {
          worst = Math.max(worst, Math.abs(h - this.getSample(xi, zi + 1)) / cell);
        }
      }
    }
    return worst;
  }

  /** Per-sample maximum gradient vs its up-to-4 neighbours. */
  slopeGrid(): Float32Array {
    const out = new Float32Array(this.samples.length);
    const cell = this.cellSize;
    for (let zi = 0; zi < this.samplesZ; zi++) {
      for (let xi = 0; xi < this.samplesX; xi++) {
        const h = this.getSample(xi, zi);
        let worst = 0;
        if (xi > 0) worst = Math.max(worst, Math.abs(h - this.getSample(xi - 1, zi)) / cell);
        if (xi + 1 < this.samplesX) worst = Math.max(worst, Math.abs(h - this.getSample(xi + 1, zi)) / cell);
        if (zi > 0) worst = Math.max(worst, Math.abs(h - this.getSample(xi, zi - 1)) / cell);
        if (zi + 1 < this.samplesZ) worst = Math.max(worst, Math.abs(h - this.getSample(xi, zi + 1)) / cell);
        out[this.sampleIndex(xi, zi)] = worst;
      }
    }
    return out;
  }

  /** Stable FNV-1a checksum over samples (IEEE-754 LE bytes) + dimensions. */
  checksum(): number {
    let h = (0x811c9dc5 ^ 0xa7a1f2b3) >>> 0;
    const view = new DataView(this.samples.buffer, this.samples.byteOffset, this.samples.byteLength);
    for (let i = 0; i < this.samples.length; i++) {
      const b = view.getUint32(i * 4, true);
      h = mixByte(h, b & 0xff);
      h = mixByte(h, (b >>> 8) & 0xff);
      h = mixByte(h, (b >>> 16) & 0xff);
      h = mixByte(h, (b >>> 24) & 0xff);
    }
    h = mixByte(h, this.samplesX & 0xff);
    h = mixByte(h, (this.samplesX >>> 8) & 0xff);
    h = mixByte(h, this.samplesZ & 0xff);
    h = mixByte(h, (this.samplesZ >>> 8) & 0xff);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  minHeight(): number {
    let min = Infinity;
    for (let i = 0; i < this.samples.length; i++) min = Math.min(min, this.samples[i]);
    return min;
  }

  maxHeight(): number {
    let max = -Infinity;
    for (let i = 0; i < this.samples.length; i++) max = Math.max(max, this.samples[i]);
    return max;
  }

  allFinite(): boolean {
    for (let i = 0; i < this.samples.length; i++) {
      if (!Number.isFinite(this.samples[i])) return false;
    }
    return true;
  }
}

function mixByte(h: number, byte: number): number {
  h ^= byte & 0xff;
  return Math.imul(h, 0x01000193) >>> 0;
}
