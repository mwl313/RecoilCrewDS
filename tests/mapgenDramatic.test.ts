import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { resolveMapBundle, resolveSlopeRules } from '../src/shared/mapgen/profiles';
import { buildArenaCandidate, generateArenaWithRetry } from '../src/shared/mapgen/retry';
import { validateArena } from '../src/shared/mapgen/validation';
import { validatePhase2 } from '../src/shared/mapgen/validation2';
import { terrainClassMetrics, TerrainFlag, terrainFlagsAt, isCliffWallAt } from '../src/shared/mapgen/terrainFlags';
import { computeArenaChecksum } from '../src/shared/mapgen/terrainFlags';
import { generateMapLabResult, deserializeArena } from '../tools/maplab/src/generatorAdapter';
import { buildCliffWallChunks } from '../src/client/map-debug/terrainMesh';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);

function bundleFor(mapId: string) {
  const bundle = resolveMapBundle(pack, mapId);
  return {
    bundle,
    fallbackBundle: bundle.map.fallbackMapId ? resolveMapBundle(pack, bundle.map.fallbackMapId) : bundle,
  };
}

function generate(mapId: string, roomCode = 'DRAMT01'): ReturnType<typeof generateArenaWithRetry> {
  const { bundle, fallbackBundle } = bundleFor(mapId);
  return generateArenaWithRetry({ roomCode, matchIndex: 0, mapId: bundle.map.id, bundle, fallbackBundle });
}

describe('terrain classes and flags', () => {
  it('classifies driveable/risky/blocked/cliff cells from slopeRules', () => {
    const arena = generate('map.cliffArena');
    const metrics = terrainClassMetrics(arena.terrainFlags);
    expect(metrics.total).toBe(arena.heightfield.samples.length);
    expect(metrics.driveable + metrics.risky + metrics.blocked).toBe(metrics.total);
    // Cliff walls are a subset of blocked cells.
    let walls = 0;
    for (let i = 0; i < arena.terrainFlags.length; i++) {
      if (arena.terrainFlags[i] & TerrainFlag.CliffWall) {
        walls++;
        expect(arena.terrainFlags[i] & TerrainFlag.Blocked).not.toBe(0);
      }
    }
    expect(walls).toBeGreaterThan(0);
    expect(metrics.cliffWall).toBe(walls);
  });

  it('protected masks cover corridors, spawns, gates, and recovery', () => {
    const arena = generate('map.arena400Primary');
    const hf = arena.heightfield;
    for (const s of arena.layout!.spawns) {
      expect(terrainFlagsAt(arena.terrainFlags, hf, s.x, s.z) & TerrainFlag.SpawnProtected).not.toBe(0);
    }
    for (const g of arena.layout!.gates) {
      expect(terrainFlagsAt(arena.terrainFlags, hf, g.x, g.z) & TerrainFlag.GateProtected).not.toBe(0);
    }
    for (const r of arena.layout!.recovery) {
      expect(terrainFlagsAt(arena.terrainFlags, hf, r.x, r.z) & TerrainFlag.RecoveryProtected).not.toBe(0);
    }
    for (const c of arena.layout!.corridors) {
      const midX = (c.ax + c.bx) / 2;
      const midZ = (c.az + c.bz) / 2;
      expect(terrainFlagsAt(arena.terrainFlags, hf, midX, midZ) & TerrainFlag.RouteProtected).not.toBe(0);
    }
  });

  it('optional steep/blocked terrain is accepted while required routes stay driveable', () => {
    const arena = generate('map.cliffArena');
    expect(arena.validation.ok).toBe(true);
    expect(arena.terrainMetrics.blockedRatio).toBeGreaterThan(0);
    expect(arena.terrainMetrics.cliffCount).toBeGreaterThan(0);
    const report = validatePhase2(arena);
    expect(report.ok).toBe(true);
    expect(report.metrics.maxRouteSlope).toBeLessThanOrEqual(arena.layout!.furnitureSet.maxRouteSlope * 1.15);
  });

  it('required routes never cross cliff walls', () => {
    const arena = generate('map.cliffArena');
    const hf = arena.heightfield;
    for (const c of arena.layout!.corridors) {
      const steps = Math.max(3, Math.ceil(Math.hypot(c.bx - c.ax, c.bz - c.az) / 6));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = c.ax + (c.bx - c.ax) * t;
        const z = c.az + (c.bz - c.az) * t;
        expect(isCliffWallAt(arena.terrainFlags, hf, x, z)).toBe(false);
      }
    }
  });

  it('spawn/recovery/ramp landings avoid cliff walls and cliff tops', () => {
    const arena = generate('map.cliffArena');
    const hf = arena.heightfield;
    for (const s of arena.layout!.spawns) {
      expect(isCliffWallAt(arena.terrainFlags, hf, s.x, s.z)).toBe(false);
      expect(terrainFlagsAt(arena.terrainFlags, hf, s.x, s.z) & TerrainFlag.CliffTop).toBe(0);
    }
    for (const r of arena.layout!.recovery) {
      expect(isCliffWallAt(arena.terrainFlags, hf, r.x, r.z)).toBe(false);
    }
    for (const ramp of arena.layout!.ramps) {
      expect(isCliffWallAt(arena.terrainFlags, hf, ramp.landingX, ramp.landingZ)).toBe(false);
    }
  });
});

describe('cliffs', () => {
  it('produces deterministic top/bottom masks, edges, and checksums', () => {
    const a = generate('map.cliffArena', 'DRAMC01');
    const b = generate('map.cliffArena', 'DRAMC01');
    expect(JSON.stringify(a.cliffEdges)).toBe(JSON.stringify(b.cliffEdges));
    expect(a.cliffEdges.length).toBeGreaterThan(0);
    expect(computeArenaChecksum(a)).toBe(computeArenaChecksum(b));
    expect(a.cliffEdges.every((e) => e.topY > e.bottomY)).toBe(true);
    const c = generate('map.cliffArena', 'DRAMC02');
    expect(JSON.stringify(c.cliffEdges)).not.toBe(JSON.stringify(a.cliffEdges));
  });

  it('cliff walls survive correction and smoothing (not flattened)', () => {
    const arena = generate('map.cliffArena');
    const hf = arena.heightfield;
    let tallWalls = 0;
    for (let zi = 0; zi < hf.samplesZ; zi++) {
      for (let xi = 0; xi < hf.samplesX; xi++) {
        const idx = hf.sampleIndex(xi, zi);
        if (!(arena.terrainFlags[idx] & TerrainFlag.CliffWall)) continue;
        const h = hf.getSample(xi, zi);
        const up = Math.max(
          xi > 0 ? h - hf.getSample(xi - 1, zi) : 0,
          xi + 1 < hf.samplesX ? h - hf.getSample(xi + 1, zi) : 0,
          zi > 0 ? h - hf.getSample(xi, zi - 1) : 0,
          zi + 1 < hf.samplesZ ? h - hf.getSample(xi, zi + 1) : 0,
        );
        if (up > 2) tallWalls++;
      }
    }
    expect(tallWalls).toBeGreaterThan(0);
  });

  it('access corridors exist, are driveable, and connect to driveable ground', () => {
    const arena = generate('map.cliffArena');
    expect(arena.accessCorridors.length).toBeGreaterThanOrEqual(1);
    const hf = arena.heightfield;
    for (const a of arena.accessCorridors) {
      const feature = arena.cliffFeatures.find((f) => f.id === a.featureId)!;
      const steps = Math.max(3, Math.ceil(Math.hypot(a.bx - a.ax, a.bz - a.az) / 6));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = a.ax + (a.bx - a.ax) * t;
        const z = a.az + (a.bz - a.az) * t;
        expect(isCliffWallAt(arena.terrainFlags, hf, x, z)).toBe(false);
      }
      expect(terrainFlagsAt(arena.terrainFlags, hf, a.bx, a.bz) & TerrainFlag.Driveable).not.toBe(0);
      void feature;
    }
  });

  it('a cliff feature that cannot form a wall is a fatal validation error', () => {
    const { bundle, fallbackBundle } = bundleFor('map.cliffArena');
    const broken = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    const cfg = broken.terrainProfile.features.cliffPlateau!;
    cfg.edgeWidth = { min: 40, max: 60 };
    cfg.height = { min: 2, max: 3 };
    const arena = buildArenaCandidate({
      baseSeed: 12345,
      candidateSeed: 67890,
      attempt: 0,
      mapId: bundle.map.id,
      bundle: broken,
      generatorVersion: 2,
      fallbackUsed: false,
    });
    const report = validateArena(arena, broken.validationProfile);
    expect(report.errors.some((e) => e.includes('no wall edge segments'))).toBe(true);
    void fallbackBundle;
  });

  it('fallback reports every failed attempt', () => {
    const { bundle, fallbackBundle } = bundleFor('map.arena400Primary');
    const impossible = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    impossible.validationProfile = { ...impossible.validationProfile, heightRange: { min: 100, max: 200 } };
    const arena = generateArenaWithRetry({
      roomCode: 'FBREP01',
      matchIndex: 0,
      mapId: bundle.map.id,
      bundle: impossible,
      fallbackBundle,
    });
    expect(arena.fallbackUsed).toBe(true);
    expect(arena.retryReport?.fallbackUsed).toBe(true);
    expect(arena.retryReport?.attempts.length).toBe(bundle.terrainProfile.retryLimit);
    expect(arena.retryReport!.attempts.every((a) => !a.ok)).toBe(true);
    expect(arena.retryReport!.attempts[0].errors.length).toBeGreaterThan(0);
  });
});

describe('Map Lab dramatic integration', () => {
  it('exact candidate keeps the invalid arena for rendering', () => {
    const { bundle, fallbackBundle } = bundleFor('map.cliffArena');
    const impossible = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    impossible.validationProfile = { ...impossible.validationProfile, heightRange: { min: 100, max: 200 } };
    const result = generateMapLabResult({
      requestId: 1,
      mode: 'exactCandidate',
      roomCode: 'EXACT01',
      matchIndex: 0,
      generatorVersion: 2,
      workingBundle: impossible,
      fallbackBundle,
      exactBaseSeed: 1,
      exactCandidateSeed: 2,
      exactAttempt: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.arena).toBeDefined();
    const arena = deserializeArena(result.arena!.arena);
    expect(arena.validation.ok).toBe(false);
    expect(arena.heightfield.samples.length).toBeGreaterThan(0);
  });

  it('rendering wall geometry matches authoritative edges (vertex count)', () => {
    const arena = generate('map.cliffArena');
    const geos = buildCliffWallChunks(arena.heightfield, arena.cliffEdges, -arena.widthMeters / 2, -arena.depthMeters / 2);
    const totalVerts = geos.reduce((s, g) => s + (g.attributes.position ? g.attributes.position.count : 0), 0);
    expect(totalVerts).toBe(arena.cliffEdges.length * 4);
  });
});

describe('slope rules defaults', () => {
  it('legacy profiles derive slope rules from maxSlope', () => {
    const { bundle } = bundleFor('map.fallbackLegacy');
    const rules = resolveSlopeRules(bundle.terrainProfile);
    expect(rules.driveableMax).toBe(bundle.terrainProfile.maxSlope);
    expect(rules.maxStepUp).toBeGreaterThan(0);
  });

  it('dramatic and cliff profiles use explicit purpose-split rules', () => {
    for (const id of ['map.dramaticHighlands', 'map.cliffArena']) {
      const { bundle } = bundleFor(id);
      expect(bundle.terrainProfile.slopeRules).toBeDefined();
      expect(bundle.terrainProfile.slopeRules!.driveableMax).toBeLessThan(bundle.terrainProfile.slopeRules!.blockedMin);
    }
  });
});

describe('bad-seed corpus (validation failure modes)', () => {
  it('rejects a required corridor that crosses a cliff wall', () => {
    const arena = generate('map.cliffArena', 'BADWALL1');
    const wall = arena.cliffEdges[0];
    const midX = (wall.ax + wall.bx) / 2;
    const midZ = (wall.az + wall.bz) / 2;
    arena.layout!.corridors.push({
      edgeId: 'route.badwall',
      ax: midX - 20,
      az: midZ,
      bx: midX + 20,
      bz: midZ,
      halfWidth: 8,
    });
    arena.layout!.graph.edges.push({ id: 'route.badwall', a: 'a', b: 'b', length: 40, slope: 0.1, halfWidth: 8, carved: true });
    const report = validatePhase2(arena);
    expect(report.errors.some((e) => e.includes('crosses a cliff wall'))).toBe(true);
  });

  it('rejects a cliff with configured access but a missing corridor', () => {
    const arena = generate('map.cliffArena', 'BADACC1');
    arena.accessCorridors = [];
    const report = validatePhase2(arena);
    expect(report.errors.some((e) => e.includes('configured access but no corridor exists'))).toBe(true);
  });

  it('rejects a spawn placed on a cliff wall', () => {
    const arena = generate('map.cliffArena', 'BADSPN1');
    const wall = arena.cliffEdges[0];
    arena.layout!.spawns[0].x = (wall.ax + wall.bx) / 2;
    arena.layout!.spawns[0].z = (wall.az + wall.bz) / 2;
    const report = validatePhase2(arena);
    expect(report.errors.some((e) => e.includes('sits on a cliff wall'))).toBe(true);
  });

  it('rejects a map with no recovery zones', () => {
    const arena = generate('map.cliffArena', 'BADREC1');
    arena.layout!.recovery = [];
    const report = validatePhase2(arena);
    expect(report.errors.some((e) => e.includes('recovery'))).toBe(true);
  });

  it('cliff arenas produce extreme drops with access success', () => {
    let maxDrop = 0;
    for (let i = 0; i < 6; i++) {
      const arena = generate('map.cliffArena', `DROP0${i}`);
      maxDrop = Math.max(maxDrop, arena.terrainMetrics.largestDrop);
      expect(arena.accessCorridors.length).toBeGreaterThan(0);
    }
    expect(maxDrop).toBeGreaterThan(8);
  });
});
