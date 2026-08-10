import * as THREE from 'three';
import type { RelicChestSpawnPolicyDefinition } from '../../shared/content/schemas/progression';
import type { TreasureChestLifecycle, TreasureChestState } from '../../shared/progression/progressionTypes';
import type { AssetService } from '../assets';
import { RELIC_CHEST_ASSET_ID, RelicChestPresentation } from './relicChestPresentation';

interface MaterialBaseline {
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

interface ChestVisual {
  root: THREE.Object3D;
  presentation: RelicChestPresentation;
  beacon: THREE.Group;
  baseScale: THREE.Vector3;
  materials: MaterialBaseline[];
  lifecycle: TreasureChestLifecycle;
}

/** Pure presentation mirror for authoritative chest snapshots. */
export class RelicChestWorldRenderer {
  private readonly visuals = new Map<number, ChestVisual>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetService,
    private readonly policy: RelicChestSpawnPolicyDefinition,
    private readonly onChestOpened?: (chest: TreasureChestState) => void,
  ) {}

  sync(chests: readonly TreasureChestState[], gameTime: number, wallNowMs: number, deltaSeconds: number): void {
    const live = new Set(chests.map((chest) => chest.id));
    for (const [id] of this.visuals) {
      if (!live.has(id)) this.remove(id);
    }
    for (const chest of chests) {
      const visual = this.visuals.get(chest.id) ?? this.create(chest);
      this.applyState(visual, chest, gameTime, wallNowMs, deltaSeconds);
    }
  }

  get size(): number {
    return this.visuals.size;
  }

  dispose(): void {
    for (const id of [...this.visuals.keys()]) this.remove(id);
  }

  private create(chest: TreasureChestState): ChestVisual {
    const instance = this.assets.createModelInstance(RELIC_CHEST_ASSET_ID, { cloneMaterials: true });
    const root = instance.root;
    root.name = `RelicChestWorld.${chest.id}`;
    root.position.set(chest.x, chest.y, chest.z);
    const materials: MaterialBaseline[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of source) {
        materials.push({
          material,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const presentation = new RelicChestPresentation(root, { openDurationSeconds: this.policy.openAnimationSeconds });
    const beacon = createChestBeacon();
    root.add(beacon);
    const visual: ChestVisual = {
      root,
      presentation,
      beacon,
      baseScale: root.scale.clone(),
      materials,
      lifecycle: chest.lifecycle,
    };
    this.scene.add(root);
    this.visuals.set(chest.id, visual);
    return visual;
  }

  private applyState(
    visual: ChestVisual,
    chest: TreasureChestState,
    gameTime: number,
    wallNowMs: number,
    deltaSeconds: number,
  ): void {
    if (visual.lifecycle === 'closed' && chest.lifecycle === 'opening') this.onChestOpened?.(chest);
    visual.lifecycle = chest.lifecycle;
    visual.root.position.set(chest.x, chest.y, chest.z);
    visual.beacon.visible = chest.lifecycle === 'spawning' || chest.lifecycle === 'closed';
    visual.beacon.rotation.y += Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0) * 1.8;
    let scale = 1;
    let opacity = 1;
    if (chest.lifecycle === 'spawning') {
      const progress = clamp01((gameTime - chest.spawnStartedAtGameTime) / this.policy.spawnAnimationSeconds);
      scale = THREE.MathUtils.lerp(0.001, 1, smootherstep(progress));
    } else if (chest.lifecycle === 'despawning') {
      const progress = clamp01(
        (gameTime - (chest.despawnStartedAtGameTime ?? gameTime)) / this.policy.despawnAnimationSeconds,
      );
      const eased = smootherstep(progress);
      scale = THREE.MathUtils.lerp(1, 0.001, eased);
      opacity = 1 - eased;
    }
    visual.root.scale.copy(visual.baseScale).multiplyScalar(scale);

    let openProgress = 0;
    if (chest.lifecycle === 'opening') {
      const start = chest.openingStartedAtWallMs ?? wallNowMs;
      const end = chest.fullyOpenAtWallMs ?? start + this.policy.openAnimationSeconds * 1000;
      openProgress = clamp01((wallNowMs - start) / Math.max(1, end - start));
    } else if (chest.lifecycle === 'revealing' || chest.lifecycle === 'open' || chest.lifecycle === 'despawning') {
      openProgress = 1;
    }
    visual.presentation.setOpenProgress(openProgress);
    visual.presentation.setEffectOpacity(opacity);
    visual.presentation.update(deltaSeconds);
    this.applyMaterialOpacity(visual.materials, opacity);
  }

  private applyMaterialOpacity(materials: readonly MaterialBaseline[], multiplier: number): void {
    for (const baseline of materials) {
      baseline.material.opacity = baseline.opacity * multiplier;
      baseline.material.transparent = multiplier < 0.999 ? true : baseline.transparent;
      baseline.material.depthWrite = multiplier < 0.999 ? false : baseline.depthWrite;
      baseline.material.needsUpdate = true;
    }
  }

  private remove(id: number): void {
    const visual = this.visuals.get(id);
    if (!visual) return;
    this.scene.remove(visual.root);
    visual.presentation.dispose();
    disposeObjectResources(visual.beacon);
    for (const baseline of visual.materials) baseline.material.dispose();
    this.visuals.delete(id);
  }
}

function createChestBeacon(): THREE.Group {
  const beacon = new THREE.Group();
  beacon.name = 'TreasureChestBeacon';
  // The catalog doubles the chest root. Keep the original authored beacon
  // dimensions while lifting it high enough to remain readable above cover.
  beacon.position.y = 1.55;
  beacon.scale.setScalar(0.5);

  const gold = new THREE.MeshStandardMaterial({
    color: 0xffc94a,
    emissive: 0xffa51f,
    emissiveIntensity: 2.2,
    roughness: 0.35,
    metalness: 0.2,
    depthTest: true,
  });
  const softGold = new THREE.MeshBasicMaterial({
    color: 0xffdc73,
    transparent: true,
    opacity: 0.78,
    depthTest: true,
    depthWrite: false,
  });
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), gold);
  diamond.name = 'TreasureChestBeaconDiamond';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 8, 24), softGold);
  ring.name = 'TreasureChestBeaconRing';
  ring.rotation.x = Math.PI / 2;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 6), softGold.clone());
  stem.name = 'TreasureChestBeaconStem';
  stem.position.y = -0.72;
  beacon.add(diamond, ring, stem);
  return beacon;
}

function disposeObjectResources(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function smootherstep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}
