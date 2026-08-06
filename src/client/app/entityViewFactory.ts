import * as THREE from 'three';
import type { AssetService } from '../assets';
import type { EnemyState, PickupState, ShellState } from '../../shared/types';
import type { EnemyRig, PickupRig, ShellRig } from './entityViewRegistry';
import {
  EnemyAnimationController,
  animationPhaseSeed,
} from '../animation/enemyAnimationController';
import {
  resolveEnemyPresentation,
  type EnemyPresentationResolution,
} from '../animation/enemyPresentationResolver';
import { collectMaterials } from '../assets/loadedModelAsset';
import { disposeOwnedMaterials } from '../animation/animationCleanup';
import { animationTelemetry } from '../animation/animationTelemetry';
import type {
  EnemyAnimationLodTier,
  EnemyPresentationProfileDefinition,
} from '../../shared/animation/animationProfileTypes';
import type { AnimationShadowRules } from '../../shared/animation/animationProfileTypes';
import {
  ENEMY_DEFINITION_SIZE_TIER,
} from '../../generated/monsterDimensions.generated';
import {
  resolveMonsterDimensionsForDefId,
  type ResolvedMonsterDimensions,
} from '../../shared/monsters/monsterNormalization';
import { applyMonsterScaleAndOffset } from './monsterTransform';

/**
 * Builds entity views by semantic asset id/category. Model child names are a
 * presentation concern only (socket resolver), never gameplay.
 *
 * Animation07: enemy models resolve through validated presentation
 * profiles instead of a hardcoded type->model switch. Legacy enemies use
 * generated legacy profiles; new families use explicit profiles.
 */
export class EntityViewFactory {
  constructor(readonly assets: AssetService) {}

  createEnemyRig(e: EnemyState, scene: THREE.Scene): EnemyRig {
    const resolution = resolveEnemyPresentation(e);
    const profile = resolution.profile;
    const cloneMaterials = profile.materialPolicy?.cloneForHitFlash ?? true;
    const instance = this.assets.createModelInstance(profile.nearModelAssetId, { cloneMaterials });
    const model = instance.root;
    const group = new THREE.Group();
    group.add(model);
    // Test/telemetry diagnostics: exact identity on the rendered rig.
    group.userData.enemyId = e.id;
    group.userData.defId = e.defId ?? '';
    group.userData.presentationProfile = resolution.profileId;
    group.userData.type = e.type;
    const monsterDims =
      e.defId && ENEMY_DEFINITION_SIZE_TIER[e.defId]
        ? resolveMonsterDimensionsForDefId(e.defId)
        : undefined;
    if (monsterDims) {
      applyMonsterScaleAndOffset(model, profile.transform, monsterDims);
      group.userData.finalScale = monsterDims.finalScale;
      group.userData.groundOffset = monsterDims.groundOffset;
      group.userData.tier = monsterDims.tierScale;
    } else {
      applyProfileTransform(group, profile.transform);
    }
    scene.add(group);
    const materials = collectMaterials(model);
    applyShadowPolicy(model, resolution.shadowPolicy.tiers.hero);
    const socketName =
      profile.socketBindings?.head ?? this.assets.transforms.socketNameFor(profile.nearModelAssetId);
    let head: THREE.Object3D | undefined;
    if (socketName) {
      head = model.getObjectByName(socketName) ?? undefined;
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
    let animation: EnemyAnimationController | null = null;
    if (
      resolution.animationProfile &&
      (instance.skinned || instance.source.animations.length > 0)
    ) {
      animation = EnemyAnimationController.create(
        resolution.animationProfile,
        instance,
        animationPhaseSeed(e.id),
      );
      animationTelemetry.liveSkinnedRoots++;
    }
    return {
      group,
      model,
      dimensions: monsterDims,
      presentationProfileId: resolution.profileId,
      presentationResolution: resolution,
      animation,
      currentLod: 'hero',
      modelVariant: 'near',
      materials,
      telegraph,
      telegraphMat,
      head,
      deadT: 0,
      phaseSeed: animationPhaseSeed(e.id),
    };
  }

  /**
   * Swap a rig's model variant for its animation LOD tier (near skinned
   * model <-> far rigid model). Same root transform, no duplicate visible
   * model, animation controller suspended/disposed on demotion and
   * recreated on promotion.
   */
  applyPresentationTier(rig: EnemyRig, tier: EnemyAnimationLodTier): void {
    const resolution = rig.presentationResolution;
    const wantFar = tier === 'far' || tier === 'aggregate';
    if (wantFar && rig.modelVariant === 'far') {
      rig.currentLod = tier;
      return;
    }
    if (!wantFar && rig.modelVariant === 'near') {
      rig.currentLod = tier;
      return;
    }

    // Remove the old model (and its animation/materials) from the group.
    if (rig.animation) {
      rig.animation.dispose();
      rig.animation = null;
      animationTelemetry.liveSkinnedRoots = Math.max(0, animationTelemetry.liveSkinnedRoots - 1);
    }
    disposeOwnedMaterials(rig.model);
    rig.group.remove(rig.model);

    const profile = resolution.profile;
    const farId = profile.farModelAssetId;
    const assetId = wantFar && farId ? farId : profile.nearModelAssetId;
    const cloneMaterials = profile.materialPolicy?.cloneForHitFlash ?? true;
    const instance = this.assets.createModelInstance(assetId, { cloneMaterials });
    const model = instance.root;
    rig.model = model;
    rig.group.add(model);
    if (rig.dimensions) {
      applyMonsterScaleAndOffset(model, profile.transform, rig.dimensions);
    }
    rig.modelVariant = wantFar ? 'far' : 'near';
    rig.currentLod = tier;
    rig.materials = collectMaterials(model);
    applyShadowPolicy(model, resolution.shadowPolicy.tiers[tier] ?? resolution.shadowPolicy.tiers.hero);
    const socketName =
      profile.socketBindings?.head ?? this.assets.transforms.socketNameFor(assetId);
    rig.head = socketName ? (model.getObjectByName(socketName) ?? undefined) : undefined;

    if (!wantFar && resolution.animationProfile && (instance.skinned || instance.source.animations.length > 0)) {
      rig.animation = EnemyAnimationController.create(
        resolution.animationProfile,
        instance,
        rig.phaseSeed,
      );
      animationTelemetry.liveSkinnedRoots++;
    }
    if (wantFar) animationTelemetry.liveRigidFarRoots++;
    if (rig.modelVariant === 'near' && !wantFar) {
      // Promotion back to near: the far rigid root is gone already.
      animationTelemetry.liveRigidFarRoots = Math.max(0, animationTelemetry.liveRigidFarRoots - 1);
    }
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

}

export function applyProfileTransform(
  group: THREE.Object3D,
  transform: EnemyPresentationProfileDefinition['transform'],
): void {
  if (!transform) return;
  if (transform.scale !== undefined) {
    if (typeof transform.scale === 'number') group.scale.setScalar(transform.scale);
    else group.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
  }
  if (transform.position) group.position.set(transform.position[0], transform.position[1], transform.position[2]);
  if (transform.rotation) group.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
}

export { applyMonsterScaleAndOffset } from './monsterTransform';

export function applyShadowPolicy(model: THREE.Object3D, rules: AnimationShadowRules): void {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = rules.castShadow;
    mesh.receiveShadow = rules.receiveShadow;
  });
}
