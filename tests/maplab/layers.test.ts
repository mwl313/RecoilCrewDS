import * as THREE from 'three';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContentPackFromFilesystem } from '../../src/shared/content/contentLoader';
import { resolveMapBundle } from '../../src/shared/mapgen/profiles';
import { selectArenaSession } from '../../src/shared/mapgen/arenaSession';
import { deserializeArena, generateMapLabResult } from '../../tools/maplab/src/generatorAdapter';
import { MapLabLayerManager } from '../../src/client/map-debug/layerManager';
import { HeightHeatmapLayer } from '../../src/client/map-debug/layers/heightLayer';
import { RouteEdgesLayer } from '../../src/client/map-debug/layers/routeLayer';
import { ValidationErrorsLayer } from '../../src/client/map-debug/layers/validationLayer';
import type { MapLabRenderContext } from '../../src/client/map-debug/layerTypes';

const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const pack = loadContentPackFromFilesystem(CONTENT_ROOT);
const bundle = resolveMapBundle(pack, 'map.arena400Primary');
const fallbackBundle = resolveMapBundle(pack, 'map.fallbackLegacy');

describe('Map Lab shared layers', () => {
  it('create/toggle/rebuild/focus/dispose without leaks', () => {
    const session = selectArenaSession({ roomCode: 'LAYER1', matchIndex: 0, bundle, fallbackBundle, generatorVersion: 1 });
    const container = new THREE.Group();
    const manager = new MapLabLayerManager(container);
    const height = new HeightHeatmapLayer();
    const edges = new RouteEdgesLayer();
    const errors = new ValidationErrorsLayer();
    manager.register(height);
    manager.register(edges);
    manager.register(errors);
    const ctx: MapLabRenderContext = {
      arena: session.arena,
      world: session.world,
      toWorldX: (x) => x - session.arena.widthMeters / 2,
      toWorldZ: (z) => z - session.arena.depthMeters / 2,
    };
    manager.setContext(ctx);
    expect(height.group.children.length).toBeGreaterThan(0);
    expect(edges.group.children.length).toBeGreaterThan(0);
    // A valid arena has no error markers.
    expect(errors.group.children.length).toBe(0);
    const before = container.children.length;
    manager.setVisible('heightHeatmap', false);
    expect(height.group.visible).toBe(false);
    expect(container.children.length).toBe(before); // toggling never rebuilds
    manager.setContext(ctx); // rebuild
    expect(height.group.children.length).toBeGreaterThan(0);
    manager.dispose();
    expect(container.children.length).toBe(0);
    expect(height.group.children.length).toBe(0);
  });

  it('validation layer renders markers for a failing candidate', () => {
    const impossible = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    impossible.validationProfile = { ...impossible.validationProfile, heightRange: { min: 100, max: 200 } };
    const result = generateMapLabResult({
      requestId: 1,
      mode: 'exactCandidate',
      roomCode: 'LAYERBAD',
      matchIndex: 0,
      generatorVersion: 1,
      workingBundle: impossible,
      fallbackBundle,
    });
    expect(result.ok).toBe(false);
    const arena = deserializeArena(result.arena!.arena);
    const manager = new MapLabLayerManager(new THREE.Group());
    const errors = new ValidationErrorsLayer();
    manager.register(errors);
    manager.setContext({
      arena,
      world: selectArenaSession({ roomCode: 'LAYERBAD', matchIndex: 0, bundle, fallbackBundle, generatorVersion: 1 }).world,
      toWorldX: (x) => x - arena.widthMeters / 2,
      toWorldZ: (z) => z - arena.depthMeters / 2,
    });
    expect(errors.group.children.length).toBeGreaterThan(0);
  });

  it('layer toggles never trigger regeneration (adapter is untouched)', () => {
    // Rendering is fully decoupled from generation: setContext is the only
    // rebuild path, and generation runs through generateMapLabResult only.
    const session = selectArenaSession({ roomCode: 'LAYER2', matchIndex: 0, bundle, fallbackBundle, generatorVersion: 1 });
    const manager = new MapLabLayerManager(new THREE.Group());
    manager.register(new HeightHeatmapLayer());
    const ctx: MapLabRenderContext = {
      arena: session.arena,
      world: session.world,
      toWorldX: (x) => x - session.arena.widthMeters / 2,
      toWorldZ: (z) => z - session.arena.depthMeters / 2,
    };
    manager.setContext(ctx);
    const checksum = session.arena.heightfield.checksum();
    manager.setVisible('heightHeatmap', false);
    manager.setVisible('heightHeatmap', true);
    expect(session.arena.heightfield.checksum()).toBe(checksum);
  });
});
