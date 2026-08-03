/**
 * Recovery zones: flat, clear, connected, in-bounds areas away from gates
 * and barrels. Used later for out-of-bounds / stuck / flip handling.
 */
import type { Rng } from './prng';
import type { Heightfield } from './heightfield';
import type { RouteGraph } from './routes';
import { distToSegment } from './routes';
import type { HordeGate } from './spawns';
import type { ZoneRegion } from './zones';

export function findRecoveryZones(options: {
  rng: Rng;
  hf: Heightfield;
  graph: RouteGraph;
  gates: HordeGate[];
  widthMeters: number;
  depthMeters: number;
  count: number;
}): ZoneRegion[] {
  const zones: ZoneRegion[] = [];
  const candidates: Array<{ x: number; z: number }> = [];
  for (let zi = 1; zi < 9; zi++) {
    for (let xi = 1; xi < 9; xi++) {
      candidates.push({
        x: (xi + options.rng() * 0.8) * (options.widthMeters / 10),
        z: (zi + options.rng() * 0.8) * (options.depthMeters / 10),
      });
    }
  }
  candidates.sort((a, b) => a.x - b.x || a.z - b.z);
  for (const c of candidates) {
    if (zones.length >= options.count) break;
    if (zones.some((z) => Math.hypot(z.x - c.x, z.z - c.z) < 80)) continue;
    if (!recoveryCandidateValid(c.x, c.z, options)) continue;
    zones.push({ id: `recovery.${zones.length}`, tag: 'recovery', x: c.x, z: c.z, radius: 10 });
  }
  return zones;
}

function recoveryCandidateValid(
  x: number,
  z: number,
  options: { hf: Heightfield; graph: RouteGraph; gates: HordeGate[]; widthMeters: number; depthMeters: number },
): boolean {
  const margin = 25;
  if (x < margin || x > options.widthMeters - margin || z < margin || z > options.depthMeters - margin) return false;
  if (options.hf.slopeAt(x, z) > 0.12) return false;
  const h = options.hf.heightAt(x, z);
  if (h < -3 || h > 6) return false;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(a) * 10;
    const pz = z + Math.sin(a) * 10;
    if (options.hf.slopeAt(px, pz) > 0.18) return false;
    if (Math.abs(options.hf.heightAt(px, pz) - h) > 1.5) return false;
  }
  if (options.gates.some((g) => Math.hypot(g.x - x, g.z - z) < 40)) return false;
  let connected = false;
  for (const c of options.graph.corridors) {
    if (distToSegment(x, z, c.ax, c.az, c.bx, c.bz) <= 35) {
      connected = true;
      break;
    }
  }
  return connected;
}
