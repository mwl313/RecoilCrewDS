import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { HistoryStore } from '../../tools/maplab/src/history/historyStore';
import { deepCloneBundle, getPath, setPath } from '../../tools/maplab/src/mapLabState';
import {
  buildParameterRegistry,
  applyTerrainDrama,
  writeParameter,
} from '../../tools/maplab/src/parameters/parameterRegistry';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const bundle = resolveMapBundle(pack, 'map.arena400Primary');
const fallbackBundle = resolveMapBundle(pack, 'map.fallbackLegacy');

describe('Map Lab parameters', () => {
  it('descriptor paths read and write the working bundle', () => {
    const working = deepCloneBundle(bundle);
    expect(getPath(working, 'terrainProfile.features.hill.height.min')).toBe(1.2);
    setPath(working as unknown as Record<string, unknown>, 'terrainProfile.features.hill.height.min', 2.5);
    expect(getPath(working, 'terrainProfile.features.hill.height.min')).toBe(2.5);
  });

  it('registry covers map/terrain/routes/objects/validation + per-entry descriptors', () => {
    const descriptors = buildParameterRegistry(bundle);
    const paths = descriptors.map((d) => d.path);
    expect(paths).toContain('map.widthMeters');
    expect(paths).toContain('terrainProfile.features.basin.count');
    expect(paths).toContain('furnitureSet.routeClearance');
    expect(paths).toContain('furnitureSet.objectPlacement.enabled');
    expect(paths).toContain('validationProfile.maxSlope');
    expect(paths).toContain('furnitureSet.entries.0.enabled');
    expect(paths).toContain('furnitureSet.entries.0.obstacleType');
  });

  it('terrain drama macro scales heights and depths', () => {
    const working = deepCloneBundle(bundle);
    writeParameter(working, { path: 'x', label: 'Drama', group: 'basic', type: 'range', requiresRegeneration: true, macro: 'terrainDrama' }, 1.5);
    expect(working.terrainProfile.features.hill.height!.min).toBeCloseTo(1.2 * 1.5, 1);
    expect(working.terrainProfile.features.basin.depth!.max).toBeCloseTo(4.5 * 1.5, 1);
  });

  it('history supports undo/redo/reset', () => {
    const history = new HistoryStore(bundle);
    const v1 = deepCloneBundle(bundle);
    setPath(v1 as unknown as Record<string, unknown>, 'map.widthMeters', 500);
    history.push(v1);
    const v2 = deepCloneBundle(v1);
    setPath(v2 as unknown as Record<string, unknown>, 'map.widthMeters', 600);
    history.push(v2);
    const undone = history.undo(v2)!;
    expect(getPath(undone, 'map.widthMeters')).toBe(500);
    const redone = history.redo(undone)!;
    expect(getPath(redone, 'map.widthMeters')).toBe(600);
    history.reset(bundle);
    expect(history.canUndo()).toBe(false);
  });

  it('master object toggle keeps terrain/routes/spawns/gates and drops objects', () => {
    const working = deepCloneBundle(bundle);
    working.furnitureSet.objectPlacement.enabled = false;
    const session = selectArenaSession({ roomCode: 'TOGGLE1', matchIndex: 0, bundle: working, fallbackBundle, generatorVersion: 1 });
    const layout = session.arena.layout!;
    expect(layout.objects.length).toBe(0);
    expect(layout.gates.length).toBeGreaterThanOrEqual(6);
    expect(layout.spawns.length).toBeGreaterThanOrEqual(3);
    expect(layout.recovery.length).toBeGreaterThanOrEqual(2);
    expect(layout.graph.edges.length).toBeGreaterThan(10);
  });

  it('barrel/entry toggles drop only the matching objects and preserve counts', () => {
    const working = deepCloneBundle(bundle);
    working.furnitureSet.barrel.enabled = false;
    const session = selectArenaSession({ roomCode: 'TOGGLE2', matchIndex: 0, bundle: working, fallbackBundle, generatorVersion: 1 });
    const layout = session.arena.layout!;
    expect(layout.objects.filter((o) => o.kind === 'barrel').length).toBe(0);
    expect(layout.objects.filter((o) => o.kind === 'largeObstacle').length).toBeGreaterThan(0);
    const metric = layout.placementMetrics.find((m) => m.kind === 'barrel');
    expect(metric?.requested).toBe(16);
    expect(metric?.placed).toBe(0);
    expect(metric?.rejected).toBe(0);
  });

  it('crates survive generation -> props -> layout (no disappearing objects)', () => {
    const session = selectArenaSession({ roomCode: 'CRATES1', matchIndex: 0, bundle, fallbackBundle, generatorVersion: 1 });
    const crates = session.arena.layout!.objects.filter((o) => o.kind === 'crate');
    if (crates.length > 0) {
      const worldCrates = session.world.obstacles.filter((o) => o.id.startsWith('crate.'));
      expect(worldCrates.length).toBe(crates.length);
    }
  });
});
