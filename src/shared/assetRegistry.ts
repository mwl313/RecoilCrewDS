export type AssetCategory = 'model' | 'ui' | 'vfx' | 'audio';

export interface AssetEntry {
  id: string;
  category: AssetCategory;
  /** Optional static file path under public/assets when a replacement exists. */
  file: string | null;
}

export const REQUIRED_ASSET_IDS = [
  'playerTank.chassis',
  'playerTank.turret',
  'playerTank.barrel',
  'enemy.scrapBug',
  'enemy.rammer',
  'enemy.gunTower',
  'enemy.lootTruck',
  'pickup.normalScrap',
  'pickup.heavyScrap',
  'pickup.jackpotScrap',
  'prop.explosiveBarrel',
  'prop.barrier',
  'prop.tire',
  'prop.container',
  'arena.ramp',
  'arena.factory',
  'vfx.machineGunMuzzle',
  'vfx.cannonMuzzle',
  'vfx.cannonImpact',
  'vfx.enemyDeath',
  'vfx.scrapPickup',
  'vfx.jackpot',
  'vfx.dashBurst',
  'vfx.jumpDust',
  'ui.driverTheme',
  'ui.gunnerTheme',
  'audio.engine',
  'audio.dash',
  'audio.jump',
  'audio.drift',
  'audio.collision',
  'audio.machineGun',
  'audio.cannon',
  'audio.enemyHit',
  'audio.enemyDeath',
  'audio.scrapPickup',
  'audio.rammerTelegraph',
  'audio.towerFire',
  'audio.truckSiren',
  'audio.wipeout',
  'audio.jackpotCharge',
  'audio.jackpotRelease',
  'audio.ui',
  'audio.results',
  'audio.music',
] as const;

export type RequiredAssetId = (typeof REQUIRED_ASSET_IDS)[number];

const ID_SET = new Set<string>(REQUIRED_ASSET_IDS);

export function isValidAssetId(id: string): boolean {
  return ID_SET.has(id);
}

export function assertValidAssetId(id: string): void {
  if (!ID_SET.has(id)) {
    throw new Error(`Unknown semantic asset id: ${id}`);
  }
}

/**
 * Semantic asset registry. Gameplay code asks for assets by ID; a factory
 * (usually a generated low-poly fallback) is registered for every required
 * ID. External replacements can be loaded before registration and swapped in
 * without touching gameplay code.
 */
export class AssetRegistry<T> {
  private factories = new Map<string, () => T>();
  private files = new Map<string, string>();

  register(id: string, factory: () => T): this {
    assertValidAssetId(id);
    this.factories.set(id, factory);
    return this;
  }

  registerFile(id: string, file: string): this {
    assertValidAssetId(id);
    this.files.set(id, file);
    return this;
  }

  getFile(id: string): string | null {
    return this.files.get(id) ?? null;
  }

  resolve(id: string): T {
    assertValidAssetId(id);
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`No fallback registered for asset id: ${id}`);
    }
    return factory();
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  ids(): string[] {
    return [...this.factories.keys()];
  }
}

/** Verify every required semantic ID has a registered fallback. */
export function allRequiredAssetsRegistered<T>(registry: AssetRegistry<T>): boolean {
  return REQUIRED_ASSET_IDS.every((id) => registry.has(id));
}
