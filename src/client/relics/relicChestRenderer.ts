import * as THREE from 'three';
import type { TreasureChestState } from '../../shared/progression/progressionTypes';
import type { AssetService } from '../assets';
import {
  RELIC_CHEST_ASSET_ID,
  RelicChestPresentation,
} from './relicChestPresentation';
import { PRESENTATION_ASSET_CATALOG } from '../../generated/presentationContent.generated';
import { TREASURE_CHEST_STATE_GROUND_OFFSET } from '../../shared/progression/treasureChestGeometry';

export interface RelicChestRig {
  root: THREE.Object3D;
  presentation: RelicChestPresentation;
  beacon: THREE.Group;
  opened: boolean;
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

      rig.root.position.set(
        chest.x,
        chest.y - TREASURE_CHEST_STATE_GROUND_OFFSET,
        chest.z,
      );
      if (chest.opened && !rig.opened) {
        rig.opened = true;
        rig.presentation.open();
      }
      rig.beacon.visible = !chest.opened;
      rig.beacon.rotation.y += dt * 1.8;
      rig.presentation.update(dt);
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
    const root = this.assets.createModelInstance(RELIC_CHEST_ASSET_ID).root;
    root.name = `TreasureChest.${chest.id}`;
    root.userData.treasureChestId = chest.id;
    root.userData.collider = {
      shape: 'sphere',
      radius: this.collisionRadius,
    };
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    const presentation = new RelicChestPresentation(root);
    if (chest.opened) presentation.setOpenProgress(1);
    const beacon = createChestBeacon();
    beacon.visible = !chest.opened;
    root.add(beacon);
    const rig: RelicChestRig = { root, presentation, beacon, opened: chest.opened };
    this.rigs.set(chest.id, rig);
    this.scene.add(root);
    return rig;
  }

  private remove(id: number): void {
    const rig = this.rigs.get(id);
    if (!rig) return;
    rig.presentation.dispose();
    rig.beacon.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    this.scene.remove(rig.root);
    this.rigs.delete(id);
  }
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
