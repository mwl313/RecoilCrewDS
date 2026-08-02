import * as THREE from 'three';
import { FallbackAssetFactory } from './fallbackAssetFactory';
import { ModelProvider } from './modelProvider';
import type { AudioSpec, TankRig, UiTheme, VfxSpec } from './types';
import { AssetTransformResolver } from './assetTransformResolver';
import type { ManifestAssetEntry } from './assetManifestLoader';
import type { UiPresentation } from './presentationCatalog';

/**
 * Produces runtime instances from semantic ids. Models are cloned from cached
 * prototypes and transformed by manifest metadata; VFX/UI/audio specs come
 * from the presentation catalog with procedural fallbacks registered behind
 * them.
 */
export class AssetInstanceFactory {
  private readonly metadata = new Map<string, ManifestAssetEntry>();

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

  async preloadModels(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.models.getPrototype(id)));
  }

  /** Synchronous after preload; throws a clear error when not loaded. */
  instanceModel(id: string): THREE.Object3D {
    const proto = this.models.getPrototypeSync(id);
    if (!proto) {
      throw new Error(`model '${id}' is not loaded; await AssetService.load() first`);
    }
    const clone = proto.clone(true);
    const entry = this.metadata.get(id);
    this.transforms.apply(clone, id, entry?.transform, entry?.materials);
    return clone;
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

  buildTankRig(): TankRig {
    const chassis = this.instanceModel('playerTank.chassis');
    const turret = this.instanceModel('playerTank.turret');
    const barrel = this.instanceModel('playerTank.barrel');
    turret.position.set(0, 1.15, 0);
    chassis.add(turret);
    barrel.position.set(0, 0.62, 0);
    turret.add(barrel);
    return {
      chassis,
      turret,
      barrel,
      muzzleLocal: new THREE.Vector3(0, 0.75, 2.9),
      turretPivot: new THREE.Vector3(0, 1.15, 0),
    };
  }
}

export function getMuzzleWorld(rig: TankRig): THREE.Vector3 {
  return new THREE.Vector3().copy(rig.muzzleLocal).applyMatrix4(rig.barrel.matrixWorld);
}

/** Build a tank rig from preloaded semantic models (synchronous). */
export function buildTankRig(factory: AssetInstanceFactory): TankRig {
  return factory.buildTankRig();
}
