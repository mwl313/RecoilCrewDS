import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../src/shared/content/contentLoader';
import { resolveMapBundle } from '../src/shared/mapgen/profiles';
import { generateArenaWithRetry } from '../src/shared/mapgen/retry';
import { validatePhase2 } from '../src/shared/mapgen/validation2';
import { barrelComponents, validateBarrelLayout } from '../src/shared/mapgen/barrels';
import { validateRamp } from '../src/shared/mapgen/ramps';
import { SpatialHash } from '../src/shared/mapgen/spatial';
import { distToSegment } from '../src/shared/mapgen/routes';
import type { GeneratedArena } from '../src/shared/mapgen/generator';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const PRIMARY = resolveMapBundle(pack, 'map.arena400Primary');
const FALLBACK = resolveMapBundle(pack, 'map.fallbackLegacy');

function generateRoom(roomCode: string, matchIndex = 0): GeneratedArena {
  return generateArenaWithRetry({
    roomCode,
    matchIndex,
    mapId: PRIMARY.map.id,
    bundle: PRIMARY,
    fallbackBundle: FALLBACK,
  });
}

describe('route graph', () => {
  it('is deterministic and fully connected', () => {
    const a = generateRoom('GRAPH01');
    const b = generateRoom('GRAPH01');
    const layoutA = a.layout!;
    const layoutB = b.layout!;
    expect(layoutA.graph.nodes.map((n) => n.id)).toEqual(layoutB.graph.nodes.map((n) => n.id));
    expect(layoutA.graph.edges.map((e) => `${e.a}--${e.b}`).sort()).toEqual(
      layoutB.graph.edges.map((e) => `${e.a}--${e.b}`).sort(),
    );
    const adjacency = new Map<string, string[]>();
    for (const e of layoutA.graph.edges) {
      const list = adjacency.get(e.a) ?? [];
      list.push(e.b);
      adjacency.set(e.a, list);
      const listB = adjacency.get(e.b) ?? [];
      listB.push(e.a);
      adjacency.set(e.b, listB);
    }
    const seen = new Set<string>([layoutA.graph.centerNodeId]);
    const queue = [layoutA.graph.centerNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(layoutA.graph.nodes.length);
  });

  it('has at least two loops and a bounded dead-end ratio', () => {
    for (const room of ['LOOP01', 'LOOP02', 'LOOP03']) {
      const arena = generateRoom(room);
      expect(arena.layout!.graph.loops).toBeGreaterThanOrEqual(2);
      const report = validatePhase2(arena);
      expect(report.metrics.deadEndRatio).toBeLessThanOrEqual(0.35);
      expect(report.metrics.loops).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps corridors at least as wide as the route minimum', () => {
    const arena = generateRoom('WIDTH01');
    for (const c of arena.layout!.graph.corridors) {
      expect(c.halfWidth).toBeGreaterThanOrEqual(PRIMARY.furnitureSet.routeMinHalfWidth);
    }
    expect(validatePhase2(arena).metrics.minCorridorHalfWidth).toBeGreaterThanOrEqual(12);
  });

  it('carves required corridors to drivable slopes', () => {
    const arena = generateRoom('CARVE01');
    const report = validatePhase2(arena);
    expect(report.metrics.maxRouteSlope).toBeLessThanOrEqual(PRIMARY.furnitureSet.maxRouteSlope * 1.15);
  });
});

describe('semantic zones', () => {
  it('labels cells and exposes gameplay region tags', () => {
    const arena = generateRoom('ZONE01');
    const layout = arena.layout!;
    const grid = layout.zones.grid;
    expect(grid.cellsX).toBe(16);
    expect(grid.cellsZ).toBe(16);
    const tags = new Set(layout.zones.regions.map((r) => r.tag));
    expect(tags.has('spawnSafe')).toBe(true);
    expect(tags.has('enemyGate')).toBe(true);
    expect(tags.has('recovery')).toBe(true);
    // Transit cells exist along corridors.
    let transit = 0;
    for (const c of layout.graph.corridors) {
      if (grid.tagAt(c.ax, c.az) === 'transit') transit++;
    }
    expect(transit).toBeGreaterThan(0);
  });
});

describe('spawns and gates', () => {
  it('generates 3-4 safe central spawns', () => {
    const arena = generateRoom('SPAWN01');
    const spawns = arena.layout!.spawns;
    expect(spawns.length).toBeGreaterThanOrEqual(3);
    expect(spawns.length).toBeLessThanOrEqual(4);
    for (const s of spawns) {
      expect(arena.heightfield.slopeAt(s.x, s.z)).toBeLessThanOrEqual(0.2);
      let exits = 0;
      for (const c of arena.layout!.graph.corridors) {
        if (distToSegment(s.x, s.z, c.ax, c.az, c.bx, c.bz) <= 25) exits++;
      }
      expect(exits).toBeGreaterThanOrEqual(2);
    }
  });

  it('generates 6-8 separated gates with routes to the center', () => {
    const arena = generateRoom('GATE01');
    const gates = arena.layout!.gates;
    expect(gates.length).toBeGreaterThanOrEqual(6);
    expect(gates.length).toBeLessThanOrEqual(8);
    for (let i = 0; i < gates.length; i++) {
      for (let j = i + 1; j < gates.length; j++) {
        expect(Math.hypot(gates[i].x - gates[j].x, gates[i].z - gates[j].z)).toBeGreaterThanOrEqual(60);
      }
    }
    expect(validatePhase2(arena).ok).toBe(true);
  });

  it('keeps spawns away from gates (AI-friendly openness)', () => {
    const arena = generateRoom('SPAGATE01');
    for (const s of arena.layout!.spawns) {
      for (const g of arena.layout!.gates) {
        expect(Math.hypot(g.x - s.x, g.z - s.z)).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

describe('spatial hash', () => {
  it('queries only nearby entries deterministically', () => {
    const hash = new SpatialHash({ cellSize: 8, minX: 0, minZ: 0, maxX: 400, maxZ: 400 });
    hash.insert('a', 10, 10);
    hash.insert('b', 14, 10);
    hash.insert('c', 100, 100);
    expect(hash.queryCircle(10, 10, 6)).toEqual(['a', 'b']);
    expect(hash.queryCircle(10, 10, 1)).toEqual(['a']);
    expect(hash.queryCircle(10, 10, 200)).toEqual(['a', 'b', 'c']);
    expect(hash.queryRect(0, 0, 20, 20)).toEqual(['a', 'b']);
    expect(hash.nearestDistance(10, 10, 200)).toBe(0);
    expect(hash.entries().map((e) => e.id)).toEqual(['a', 'b', 'c']);
    const again = new SpatialHash({ cellSize: 8, minX: 0, minZ: 0, maxX: 400, maxZ: 400 });
    again.insert('a', 10, 10);
    again.insert('b', 14, 10);
    again.insert('c', 100, 100);
    expect(again.queryCircle(10, 10, 6)).toEqual(hash.queryCircle(10, 10, 6));
  });
});

describe('furniture placement', () => {
  it('respects spacing and never intrudes required corridors', () => {
    const arena = generateRoom('FURN01');
    const objects = arena.layout!.objects;
    expect(objects.length).toBeGreaterThan(20);
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const a = objects[i];
        const b = objects[j];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        expect(d).toBeGreaterThanOrEqual(Math.min(a.radius, b.radius) + 0.5);
      }
      if (objects[i].collider) {
        let best = Infinity;
        for (const c of arena.layout!.graph.corridors) {
          best = Math.min(best, distToSegment(objects[i].x, objects[i].z, c.ax, c.az, c.bx, c.bz) - c.halfWidth);
        }
        expect(best).toBeGreaterThanOrEqual(PRIMARY.furnitureSet.routeClearance - 1);
      }
    }
    expect(validatePhase2(arena).ok).toBe(true);
  });

  it('keeps barrel chains below the maximum size', () => {
    const arena = generateRoom('BARREL01');
    const barrels = arena.layout!.objects
      .filter((o) => o.kind === 'barrel')
      .map((o) => ({ id: o.id, x: o.x, z: o.z }));
    const { maxSize } = barrelComponents(barrels, PRIMARY.furnitureSet.barrel.chainRadius);
    expect(maxSize).toBeLessThanOrEqual(PRIMARY.densityProfile.budgets.maxBarrelChain);
    expect(validatePhase2(arena).metrics.maxBarrelChain).toBeLessThanOrEqual(3);
  });
});

describe('barrel component graph', () => {
  it('groups connected barrels and reports the largest chain', () => {
    const barrels = [
      { id: 'b1', x: 0, z: 0 },
      { id: 'b2', x: 6, z: 0 },
      { id: 'b3', x: 12, z: 0 },
      { id: 'b4', x: 50, z: 50 },
      { id: 'b5', x: 56, z: 50 },
    ];
    const { components, maxSize } = barrelComponents(barrels, 8);
    expect(components.length).toBe(2);
    expect(maxSize).toBe(3);
  });

  it('validator rejects chains above the limit and corridor intrusion', () => {
    const errors = validateBarrelLayout({
      barrels: [
        { id: 'b1', x: 0, z: 0 },
        { id: 'b2', x: 6, z: 0 },
        { id: 'b3', x: 12, z: 0 },
      ],
      minSpacing: 10,
      chainRadius: 8,
      maxChain: 2,
      excluded: [],
      corridorDistance: () => 0,
      routeClearance: 14,
    });
    expect(errors.some((e) => e.includes('largest connected chain'))).toBe(true);
    expect(errors.some((e) => e.includes('intrudes a required route corridor'))).toBe(true);
  });
});

describe('ramps', () => {
  it('accepts route-aligned ramps with safe landings and rejects broken ones', () => {
    const arena = generateRoom('RAMP01');
    const layout = arena.layout!;
    expect(layout.ramps.length).toBeGreaterThanOrEqual(1);
    for (const ramp of layout.ramps) {
      const landing = validateRamp(ramp, {
        hf: arena.heightfield,
        graph: layout.graph,
        widthMeters: arena.widthMeters,
        depthMeters: arena.depthMeters,
      });
      expect(landing).not.toBeNull();
    }
    // A ramp rotated 90° relative to the route must be rejected.
    const d = { dirX: layout.ramps[0].dirX, dirZ: layout.ramps[0].dirZ };
    const broken = {
      ...layout.ramps[0],
      dirX: -d.dirZ,
      dirZ: d.dirX,
    };
    const landing = validateRamp(broken, {
      hf: arena.heightfield,
      graph: layout.graph,
      widthMeters: arena.widthMeters,
      depthMeters: arena.depthMeters,
    });
    expect(landing).toBeNull();
  });
});

describe('recovery zones', () => {
  it('provides multiple flat connected recovery areas', () => {
    const arena = generateRoom('RECOV01');
    expect(arena.layout!.recovery.length).toBeGreaterThanOrEqual(2);
    for (const r of arena.layout!.recovery) {
      expect(arena.heightfield.slopeAt(r.x, r.z)).toBeLessThanOrEqual(0.15);
      const connected = arena.layout!.graph.corridors.some(
        (c) => distToSegment(r.x, r.z, c.ax, c.az, c.bx, c.bz) <= 40,
      );
      expect(connected).toBe(true);
    }
  });
});

describe('layout determinism and variation', () => {
  it('same seed produces identical gates, spawns, ramps, and objects', () => {
    const a = generateRoom('DETERM2');
    const b = generateRoom('DETERM2');
    expect(a.layout!.gates).toEqual(b.layout!.gates);
    expect(a.layout!.spawns).toEqual(b.layout!.spawns);
    expect(a.layout!.ramps).toEqual(b.layout!.ramps);
    expect(a.layout!.objects.map((o) => `${o.id}@${o.x.toFixed(3)},${o.z.toFixed(3)}`)).toEqual(
      b.layout!.objects.map((o) => `${o.id}@${o.x.toFixed(3)},${o.z.toFixed(3)}`),
    );
  });

  it('different seeds produce different layouts', () => {
    const a = generateRoom('VARIA01');
    const b = generateRoom('VARIA02');
    const key = (arena: GeneratedArena) =>
      arena.layout!.gates.map((g) => `${g.x.toFixed(1)},${g.z.toFixed(1)}`).join('|') +
      arena.layout!.objects.length;
    expect(key(b)).not.toBe(key(a));
  });

  it('full Phase 2 validation passes for a spread of rooms', () => {
    for (const room of ['P2A01', 'P2A02', 'P2A03', 'P2A04', 'P2A05']) {
      const arena = generateRoom(room);
      expect(arena.fallbackUsed, room).toBe(false);
      const report = validatePhase2(arena);
      expect(report.ok, `${room}: ${report.errors.slice(0, 3).join(' | ')}`).toBe(true);
      expect(arena.validation.ok, room).toBe(true);
    }
  });
});
