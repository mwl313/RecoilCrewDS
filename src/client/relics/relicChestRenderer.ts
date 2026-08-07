import * as THREE from 'three';
import type { TreasureChestState } from '../../shared/progression/progressionTypes';
import type { AssetService } from '../assets';
import {
  RELIC_CHEST_ASSET_ID,
  RELIC_CHEST_OPEN_DURATION_SECONDS,
  RelicChestPresentation,
} from './relicChestPresentation';
import { PRESENTATION_ASSET_CATALOG } from '../../generated/presentationContent.generated';
import { TREASURE_CHEST_STATE_GROUND_OFFSET } from '../../shared/progression/treasureChestGeometry';

export const RELIC_CHEST_OPEN_LIFETIME_SECONDS = 2;
export const RELIC_CHEST_DESPAWN_DURATION_SECONDS = 0.45;

interface MaterialBaseline {
  material: THREE.Material;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

export interface RelicChestRig {
  root: THREE.Object3D;
  presentation: RelicChestPresentation;
  beacon: THREE.Group;
  opened: boolean;
  openedElapsed: number;
  baseScale: THREE.Vector3;
  materials: MaterialBaseline[];
  despawned: boolean;
}

/**
 * Mirrors authoritative treasure-chest state into the gameplay scene.
 * The explicit radius-only collider metadata is copied onto each instance
 * so interaction/debug consumers never infer a tall box from the open lid
 * or reveal rays.
 */
export class RelicChestRenderer {
  readonly rigs = new Map<number, RelicChestRig>();
  private readonly collisionRadius: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: AssetService,
  ) {
    const definition = PRESENTATION_ASSET_CATALOG.project.find((entry) => entry.id === RELIC_CHEST_ASSET_ID);
    this.collisionRadius = definition?.collider?.radius ?? 1;
  }

  update(chests: readonly TreasureChestState[], dt: number): void {
    const seen = new Set<number>();
    for (const chest of chests) {
      seen.add(chest.id);
      let rig = this.rigs.get(chest.id);
      if (!rig) rig = this.create(chest);
      if (rig.despawned) continue;

      rig.root.position.set(
        chest.x,
        chest.y - TREASURE_CHEST_STATE_GROUND_OFFSET,
        chest.z,
      );
      if (chest.opened && !rig.opened) {
        rig.opened = true;
        rig.openedElapsed = 0;
        rig.presentation.open();
      }
      rig.beacon.visible = !chest.opened;
      rig.beacon.rotation.y += dt * 1.8;
      rig.presentation.update(dt);
      if (rig.opened) {
        rig.openedElapsed += Math.max(0, dt);
        this.applyDespawn(rig);
      }
    }

    for (const id of [...this.rigs.keys()]) {
      if (!seen.has(id)) this.remove(id);
    }
  }

  reset(): void {
    for (const id of [...this.rigs.keys()]) this.remove(id);
  }

  dispose(): void {
    this.reset();
  }

  private create(chest: TreasureChestState): RelicChestRig {
    const root = this.assets.createModelInstance(RELIC_CHEST_ASSET_ID, { cloneMaterials: true }).root;
    root.name = `TreasureChest.${chest.id}`;
    root.userData.treasureChestId = chest.id;
    root.userData.collider = {
      shape: 'sphere',
      radius: this.collisionRadius,
    };
    const materials: MaterialBaseline[] = [];
    const materialSet = new Set<THREE.Material>();
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of meshMaterials) {
        if (materialSet.has(material)) continue;
        materialSet.add(material);
        materials.push({
          material,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
      }
    });

    const presentation = new RelicChestPresentation(root);
    if (chest.opened) presentation.setOpenProgress(1);
    const beacon = createChestBeacon();
    beacon.visible = !chest.opened;
    root.add(beacon);
    const rig: RelicChestRig = {
      root,
      presentation,
      beacon,
      opened: chest.opened,
      openedElapsed: chest.opened ? RELIC_CHEST_OPEN_DURATION_SECONDS : 0,
      baseScale: root.scale.clone(),
      materials,
      despawned: false,
    };
    this.rigs.set(chest.id, rig);
    this.scene.add(root);
    return rig;
  }

  private remove(id: number): void {
    const rig = this.rigs.get(id);
    if (!rig) return;
    if (!rig.despawned) this.disposeVisual(rig);
    this.rigs.delete(id);
  }

  private applyDespawn(rig: RelicChestRig): void {
    const despawnStartsAt = RELIC_CHEST_OPEN_DURATION_SECONDS + RELIC_CHEST_OPEN_LIFETIME_SECONDS;
    const progress = clamp01(
      (rig.openedElapsed - despawnStartsAt) / RELIC_CHEST_DESPAWN_DURATION_SECONDS,
    );
    const eased = smootherstep(progress);
    const opacity = 1 - eased;
    rig.root.scale.copy(rig.baseScale).multiplyScalar(THREE.MathUtils.lerp(1, 0.001, eased));
    rig.presentation.setEffectOpacity(opacity);
    this.applyMaterialOpacity(rig.materials, opacity);
    if (progress >= 1) this.disposeVisual(rig);
  }

  private applyMaterialOpacity(materials: readonly MaterialBaseline[], multiplier: number): void {
    for (const baseline of materials) {
      baseline.material.opacity = baseline.opacity * multiplier;
      baseline.material.transparent = multiplier < 0.999 ? true : baseline.transparent;
      baseline.material.depthWrite = multiplier < 0.999 ? false : baseline.depthWrite;
      baseline.material.needsUpdate = true;
    }
  }

  private disposeVisual(rig: RelicChestRig): void {
    rig.presentation.dispose();
    rig.beacon.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    for (const baseline of rig.materials) baseline.material.dispose();
    rig.root.visible = false;
    this.scene.remove(rig.root);
    rig.despawned = true;
  }
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function smootherstep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function createChestBeacon(): THREE.Group {
  const beacon = new THREE.Group();
  beacon.name = 'TreasureChestBeacon';
  // The catalog doubles the asset root; inverse-scale the beacon so its
  // world size stays authored while its position rises clearly above cover.
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
