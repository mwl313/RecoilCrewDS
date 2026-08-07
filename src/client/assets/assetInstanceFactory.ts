import * as THREE from 'three';
import { buildModelInstance, type LoadedModelInstance } from '../animation/animatedModelInstanceFactory';
import { FallbackAssetFactory } from './fallbackAssetFactory';
import { ModelProvider } from './modelProvider';
import type { LoadedModelAsset } from './loadedModelAsset';
import type { AudioSpec, TankRig, UiTheme, VfxSpec } from './types';
import { AssetTransformResolver } from './assetTransformResolver';
import type { ManifestAssetEntry } from './assetManifestLoader';
import type { UiPresentation } from './presentationCatalog';
import type { ProjectAssetDefinition } from '../../shared/presentation/schemas';
import type { TankRigDefinition } from '../../shared/content/schemas/tank';
import { DEFAULT_TANK_RIG } from '../../shared/vehicle/tankRigTypes';

/**
 * Produces runtime instances from semantic ids. Models are cloned from cached
 * prototypes and transformed by manifest metadata; VFX/UI/audio specs come
 * from the presentation catalog with procedural fallbacks registered behind
 * them.
 */
export class AssetInstanceFactory {
  private readonly metadata = new Map<string, ManifestAssetEntry>();
  private readonly projectDefs = new Map<string, ProjectAssetDefinition>();

  constructor(
    private readonly models: ModelProvider,
    private readonly fallbacks: FallbackAssetFactory,
    private readonly transforms: AssetTransformResolver,
    private readonly vfxCatalog: (id: string) => VfxSpec,
    private readonly uiCatalog: (id: string) => UiPresentation,
    private readonly audioCatalog: (id: string) => AudioSpec,
  ) {}

  registerMetadata(entry: ManifestAssetEntry): void {
    this.metadata.set(entry.id, entry);
  }

  registerProject(def: ProjectAssetDefinition): void {
    this.projectDefs.set(def.id, def);
    if (def.fallbackAssetId) this.models.registerFallback(def.id, def.fallbackAssetId);
  }

  async preloadModels(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.models.getPrototype(id)));
  }

  /** Synchronous after preload; throws a clear error when not loaded. */
  instanceModel(id: string): THREE.Object3D {
    return this.createModelInstance(id).root;
  }

  /** Synchronous immutable asset (prototype scene + clips + skinned flag). */
  instanceModelAsset(id: string): LoadedModelAsset {
    const resolved = this.resolvePrototype(id);
    if (!resolved) {
      throw new Error(`model '${id}' is not loaded; await AssetService.load() first`);
    }
    return resolved.asset;
  }

  /**
   * Create a safe per-instance clone. Skinned models use SkeletonUtils;
   * rigid models use plain clone. Material cloning is optional and required
   * for per-instance hit flash.
   */
  createModelInstance(id: string, options?: { cloneMaterials?: boolean }): LoadedModelInstance {
    const resolved = this.resolvePrototype(id);
    if (!resolved) {
      throw new Error(`model '${id}' is not loaded; await AssetService.load() first`);
    }
    const { asset, transform, materials } = resolved;
    const cloneMaterials = options?.cloneMaterials === true || materials !== undefined;
    const instance = buildModelInstance(asset, { cloneMaterials });
    this.transforms.apply(instance.root, id, transform, materials);
    return instance;
  }

  private resolvePrototype(id: string): {
    asset: LoadedModelAsset;
    transform?: ManifestAssetEntry['transform'];
    materials?: ManifestAssetEntry['materials'];
  } | undefined {
    const project = this.projectDefs.get(id);
    const entry = this.metadata.get(id);
    let asset = this.models.getModelAssetSync(id);
    let transform = entry?.transform ?? toManifestTransform(project?.defaultTransform);
    let materials = entry?.materials ?? toManifestMaterials(project?.materialOverrides);
    // Catalog-driven placeholder policy: a project model without a file (or
    // whose file is not preloaded) resolves to its registered fallback
    // prototype, with the project's own transform/material metadata applied.
    if (!asset && project?.fallbackAssetId) {
      asset = this.models.getModelAssetSync(project.fallbackAssetId);
    }
    if (!asset) return undefined;
    if (!project) {
      transform = entry?.transform;
      materials = entry?.materials;
    }
    return { asset, transform, materials };
  }

  vfxSpec(id: string): VfxSpec {
    return this.vfxCatalog(id);
  }

  uiTheme(id: string): UiTheme {
    const theme = this.uiCatalog(id);
    return {
      ...theme,
      css:
        theme.id === 'ui.gunnerTheme'
          ? { '--role': theme.primary, '--role-soft': theme.accent }
          : { '--role': theme.primary, '--role-soft': theme.accent },
    };
  }

  audioSpec(id: string): AudioSpec {
    return this.audioCatalog(id);
  }

  buildTankRig(rig: TankRigDefinition = DEFAULT_TANK_RIG): TankRig {
    const chassis = this.instanceModel(rig.chassisAssetId);
    const turret = this.instanceModel(rig.turretAssetId);
    const barrel = this.instanceModel(rig.barrelAssetId);
    turret.position.set(rig.turretPivot[0], rig.turretPivot[1], rig.turretPivot[2]);
    chassis.add(turret);
    barrel.position.set(rig.barrelPivot[0], rig.barrelPivot[1], rig.barrelPivot[2]);
    turret.add(barrel);
    return {
      chassis,
      turret,
      barrel,
      rigDefinition: rig,
      muzzleLocal: new THREE.Vector3(rig.muzzleLocal[0], rig.muzzleLocal[1], rig.muzzleLocal[2]),
      turretPivot: new THREE.Vector3(rig.turretPivot[0], rig.turretPivot[1], rig.turretPivot[2]),
      barrelPivot: new THREE.Vector3(rig.barrelPivot[0], rig.barrelPivot[1], rig.barrelPivot[2]),
      aimPivotLocal: new THREE.Vector3(rig.aimPivotLocal[0], rig.aimPivotLocal[1], rig.aimPivotLocal[2]),
      cameraAnchorLocal: rig.cameraAnchorLocal
        ? new THREE.Vector3(rig.cameraAnchorLocal[0], rig.cameraAnchorLocal[1], rig.cameraAnchorLocal[2])
        : null,
      forwardAxis: rig.forwardAxis
        ? new THREE.Vector3(rig.forwardAxis[0], rig.forwardAxis[1], rig.forwardAxis[2])
        : null,
    };
  }
}

function toManifestTransform(
  t: ProjectAssetDefinition['defaultTransform'],
): ManifestAssetEntry['transform'] | undefined {
  if (!t) return undefined;
  return {
    ...(t.position ? { position: { x: t.position[0], y: t.position[1], z: t.position[2] } } : {}),
    ...(t.rotation ? { rotation: { x: t.rotation[0], y: t.rotation[1], z: t.rotation[2] } } : {}),
    ...(t.scale ? { scale: { x: t.scale[0], y: t.scale[1], z: t.scale[2] } } : {}),
  };
}

function toManifestMaterials(materials: ProjectAssetDefinition['materialOverrides']): ManifestAssetEntry['materials'] | undefined {
  if (!materials) return undefined;
  const entry: NonNullable<ManifestAssetEntry['materials']>[number] = {};
  if (typeof materials.color === 'number') entry.color = materials.color;
  if (typeof materials.emissive === 'number') entry.emissive = materials.emissive;
  if (typeof materials.emissiveIntensity === 'number') entry.emissiveIntensity = materials.emissiveIntensity;
  if (typeof materials.roughness === 'number') entry.roughness = materials.roughness;
  if (typeof materials.metalness === 'number') entry.metalness = materials.metalness;
  return [entry];
}

export function getMuzzleWorld(rig: TankRig): THREE.Vector3 {
  return new THREE.Vector3().copy(rig.muzzleLocal).applyMatrix4(rig.barrel.matrixWorld);
}

/** Build a tank rig from preloaded semantic models (synchronous). */
export function buildTankRig(factory: AssetInstanceFactory, rig?: TankRigDefinition): TankRig {
  return factory.buildTankRig(rig);
}
