import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AssetService, type GltfLoaderFactory } from '../src/client/assets';
import { EntityViewFactory } from '../src/client/app/entityViewFactory';
import { EntityViewRegistry } from '../src/client/app/entityViewRegistry';
import type { EnemyState } from '../src/shared/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeLoaderFactory(calls: Array<{ url: string; transform?: unknown }>): GltfLoaderFactory {
  return async () => ({
    load(url: string, onLoad: (gltf: { scene: THREE.Object3D }) => void, _p?: unknown, onError?: (e: unknown) => void) {
      const entry = calls.find((c) => c.url === url);
      if (!entry) {
        onError?.(new Error(`no fake glb for ${url}`));
        return;
      }
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
      onLoad({ scene });
    },
  });
}

describe('AssetService', () => {
  it('awaits the manifest before dependent construction (preloaded prototypes)', async () => {
    const calls: Array<{ url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        assets: [
          {
            id: 'enemy.scrapBug',
            category: 'model',
            file: '/assets/models/scrap-bug.glb',
            transform: { scale: 1.5, position: { y: 0.2 } },
            materials: [{ color: 0xff0000 }],
          },
        ],
      }),
    })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load({ gltfLoaderFactory: fakeLoaderFactory(calls) });
      expect(assets.manifestLoaded).toBe(true);
      // Prototypes are cached synchronously after load().
      expect(assets.models.getPrototypeSync('enemy.scrapBug')).toBeDefined();
      const instance = assets.model('enemy.scrapBug');
      expect(instance.scale.x).toBeCloseTo(1.5, 6);
      expect(instance.position.y).toBeCloseTo(0.2, 6);
      const material = (instance.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      expect(material.color.getHex()).toBe(0xff0000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to the registered procedural factory when the GLB fails or is absent', async () => {
    const calls: Array<{ url: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        assets: [{ id: 'enemy.rammer', category: 'model', file: '/assets/models/missing.glb' }],
      }),
    })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load({ gltfLoaderFactory: fakeLoaderFactory(calls) }); // fake has no entry -> error -> fallback
      const instance = assets.model('enemy.rammer');
      expect(instance).toBeInstanceOf(THREE.Object3D);
      expect(instance.children.length).toBeGreaterThan(0); // procedural fallback rig
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('routes VFX/audio/UI themes/icons/camera impulses through presentation definitions', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load();
      expect(assets.vfx('vfx.cannonMuzzle').color).toBe(0xffb347);
      expect(assets.audio('audio.cannonChargeRelease').kind).toBe('cannonChargeRelease');
      expect(assets.ui('ui.driverTheme').css['--role']).toBe('#35d7e8');
      expect(assets.icon('icon.scrap').color).toBe('#4ddb6e');
      expect(assets.cameraImpulse('cameraImpulse.wipeout').shake).toBe(1.0);
      expect(() => assets.icon('icon.bogus')).toThrow(/unknown icon/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('entity factory and registry', () => {
  it('selects factories by semantic id/category and throws for unknown ids', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load();
      const factory = new EntityViewFactory(assets);
      const scene = new THREE.Scene();
      const bug: EnemyState = {
        id: 1, type: 'scrapBug', x: 0, y: 0, z: 0, yaw: 0, hp: 3, maxHp: 3,
        state: 'hunt', stateT: 0, aimYaw: 0, speed: 0, alive: true, telegraph: 0,
        flash: 0, spawnT: 0, hitCd: 0,
      };
      const rig = factory.createEnemyRig(bug, scene);
      expect(rig.group).toBeDefined();
      expect(rig.materials.length).toBeGreaterThan(0);
      const registry = new EntityViewRegistry(scene, factory);
      expect(registry.upsertFodder(bug, 0)).toBe(true);
      registry.createEnemy({ ...bug, id: 2, type: 'rammer' });
      registry.createPickup({ id: 1, kind: 'normal', x: 0, y: 0, z: 0, life: 1, collected: false });
      registry.createShell({ id: 1, kind: 'cannon', team: 'player', x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0, life: 1 });
      expect(registry.enemyRigs.size).toBe(1);
      expect(registry.pickupRigs.size).toBe(1);
      expect(registry.shellRigs.size).toBe(1);
      expect(registry.fodder.activeCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('resets all views on rematch/single-player restart (no growth)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false })) as unknown as typeof fetch;
    try {
      const assets = await AssetService.load();
      const factory = new EntityViewFactory(assets);
      const scene = new THREE.Scene();
      const registry = new EntityViewRegistry(scene, factory);
      const bug: EnemyState = {
        id: 1, type: 'scrapBug', x: 0, y: 0, z: 0, yaw: 0, hp: 3, maxHp: 3,
        state: 'hunt', stateT: 0, aimYaw: 0, speed: 0, alive: true, telegraph: 0,
        flash: 0, spawnT: 0, hitCd: 0,
      };
      for (let round = 0; round < 3; round++) {
        for (let i = 0; i < 5; i++) {
          registry.createEnemy({ ...bug, id: round * 10 + i, type: 'rammer' });
          registry.upsertFodder({ ...bug, id: round * 10 + i + 100 }, 0);
          registry.createPickup({ id: round * 10 + i, kind: 'normal', x: 0, y: 0, z: 0, life: 1, collected: false });
          registry.createShell({ id: round * 10 + i, kind: 'cannon', team: 'player', x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0, life: 1 });
        }
        registry.reset();
        expect(registry.enemyRigs.size).toBe(0);
        expect(registry.fodder.activeCount).toBe(0);
        expect(registry.pickupRigs.size).toBe(0);
        expect(registry.shellRigs.size).toBe(0);
      }
      expect(scene.children.filter((c) => c.type === 'Group').length).toBeLessThanOrEqual(3); // truck/marker + none leaked
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('GameClient content independence', () => {
  it('contains no ordinary gameplay content branches', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/client/app/gameClient.ts'), 'utf8');
    for (const branch of ['scrapBug', 'gunTower', 'rammer', 'turretTurnRate']) {
      expect(src, branch).not.toContain(branch);
    }
  });

  it('the old monolith file is gone (split completed)', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/client/game.ts'))).toBe(false);
  });
});
