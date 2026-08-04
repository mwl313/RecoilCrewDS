import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { EnemyState, PickupState, ShellState } from '../../shared/types';
import type { EnemyRig, PickupRig, ShellRig } from './entityViewRegistry';

/**
 * Builds entity views by semantic asset id/category. Model child names are a
 * presentation concern only (socket resolver), never gameplay.
 */
export class EntityViewFactory {
  constructor(readonly assets: AssetService) {}

  createEnemyRig(e: EnemyState, scene: THREE.Scene): EnemyRig {
    const id = this.enemyModelId(e.type);
    const model = this.assets.model(id).clone(true);
    const group = new THREE.Group();
    group.add(model);
    if (e.type === 'lootTruck') group.scale.setScalar(1.15);
    scene.add(group);
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.isMeshStandardMaterial) materials.push(mat);
      }
    });
    let head: THREE.Object3D | undefined;
    if (e.type === 'gunTower') {
      // Presentation socket resolution (registered by semantic id).
      const socketName = (this.assets.transforms as { socketNameFor(id: string): string | null }).socketNameFor('enemy.gunTower');
      head = socketName ? (model.getObjectByName(socketName) ?? undefined) : undefined;
    }
    const telegraph = new THREE.Group();
    let telegraphMat!: THREE.MeshBasicMaterial;
    if (e.type === 'rammer') {
      telegraphMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.4, depthWrite: false });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.5, 20), telegraphMat);
      cone.rotation.x = Math.PI / 2;
      cone.position.y = 0.06;
      telegraph.add(cone);
      telegraph.visible = false;
    } else if (e.type === 'gunTower') {
      telegraphMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 28), telegraphMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      telegraph.add(ring);
      telegraph.visible = false;
    }
    scene.add(telegraph);
    return { group, model, head, materials, telegraph, telegraphMat, deadT: 0 };
  }

  createPickupRig(kind: string, scene: THREE.Scene): PickupRig {
    const id = kind === 'heavy' ? 'pickup.heavyScrap' : 'pickup.normalScrap';
    const model = this.assets.model(id).clone(true);
    const group = new THREE.Group();
    group.add(model);
    scene.add(group);
    return { group, model };
  }

  createShellRig(sh: ShellState, scene: THREE.Scene): ShellRig {
    const group = new THREE.Group();
    const charged = (sh.chargeRatio ?? 0) > 0;
    const ratio = Math.max(0, Math.min(1, sh.chargeRatio ?? 0));
    const mat = new THREE.SpriteMaterial({
      color: charged ? 0xfff2b0 : 0xffb45e,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(mat);
    glow.scale.setScalar(0.7 + (sh.visualScale ?? (1 + ratio)) * 0.5);
    group.add(glow);
    if (charged) {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff7d0 })));
    } else if (sh.kind === 'tower') {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a4a })));
    } else {
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf8a })));
    }
    scene.add(group);
    return { group, glow, kind: sh.kind };
  }

  makeMarker(color: number, size: number, scene: THREE.Scene): THREE.Group {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(size, size * 2.4, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    cone.rotation.x = Math.PI;
    cone.position.y = size * 2;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, size * 2, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
    );
    pole.position.y = size;
    g.add(cone, pole);
    scene.add(g);
    return g;
  }

  private enemyModelId(type: string): string {
    switch (type) {
      case 'scrapBug':
        return 'enemy.scrapBug';
      case 'rammer':
        return 'enemy.rammer';
      case 'gunTower':
        return 'enemy.gunTower';
      case 'lootTruck':
        return 'enemy.lootTruck';
      default:
        throw new Error(`no presentation model for enemy type '${type}'`);
    }
  }
}
