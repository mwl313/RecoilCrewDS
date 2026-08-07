import * as THREE from 'three';
import type { RelicChestSpawnPolicyDefinition } from '../../shared/content/schemas/progression';
import type { TreasureChestState } from '../../shared/progression/progressionTypes';
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
  baseScale: THREE.Vector3;
  materials: MaterialBaseline[];
}

/** Pure presentation mirror for authoritative chest snapshots. */
export class RelicChestWorldRenderer {
  private readonly visuals = new Map<number, ChestVisual>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetService,
    private readonly policy: RelicChestSpawnPolicyDefinition,
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
    const visual: ChestVisual = {
      root,
      presentation: new RelicChestPresentation(root, { openDurationSeconds: this.policy.openAnimationSeconds }),
      baseScale: root.scale.clone(),
      materials,
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
    visual.root.position.set(chest.x, chest.y, chest.z);
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
    for (const baseline of visual.materials) baseline.material.dispose();
    this.visuals.delete(id);
  }
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function smootherstep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}
