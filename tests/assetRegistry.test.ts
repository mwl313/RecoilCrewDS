import { describe, expect, it } from 'vitest';
import {
  AssetRegistry,
  allRequiredAssetsRegistered,
  assertValidAssetId,
  isValidAssetId,
} from '../src/shared/assetRegistry';

describe('asset registry fallback', () => {
  it('accepts only known semantic ids', () => {
    expect(isValidAssetId('playerTank.chassis')).toBe(true);
    expect(isValidAssetId('audio.cannon')).toBe(true);
    expect(isValidAssetId('bogus.id')).toBe(false);
    expect(() => assertValidAssetId('bogus.id')).toThrow();
  });

  it('registers a fallback factory for every required id', () => {
    const registry = new AssetRegistry<string>();
    for (const id of [
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
      'ui.driverTheme',
      'ui.gunnerTheme',
      'audio.engine',
      'audio.boost',
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
      'audio.brace',
      'audio.wipeout',
      'audio.jackpotCharge',
      'audio.jackpotRelease',
      'audio.ui',
      'audio.results',
      'audio.music',
    ]) {
      registry.register(id, () => `fallback:${id}`);
    }
    expect(allRequiredAssetsRegistered(registry)).toBe(true);
    expect(registry.resolve('audio.cannon')).toBe('fallback:audio.cannon');
    expect(registry.has('missing.id')).toBe(false);
  });
});
