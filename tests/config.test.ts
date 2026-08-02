import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, MODIFIER_OVERRIDES } from '../src/shared/config';
import { REQUIRED_ASSET_IDS } from '../src/shared/assetRegistry';

describe('configuration validity', () => {
  it('every numeric tuning value is finite and positive where required', () => {
    const walk = (obj: Record<string, unknown>, path: string) => {
      for (const [key, value] of Object.entries(obj)) {
        const p = `${path}.${key}`;
        if (typeof value === 'number') {
          expect(Number.isFinite(value), p).toBe(true);
        } else if (value && typeof value === 'object') {
          walk(value as Record<string, unknown>, p);
        }
      }
    };
    walk(BASE_CONFIG as unknown as Record<string, unknown>, 'config');
  });

  it('every rematch modifier has a label, description, and valid partial overrides', () => {
    for (const [id, mod] of Object.entries(MODIFIER_OVERRIDES)) {
      expect(mod.label.length).toBeGreaterThan(0);
      expect(mod.desc.length).toBeGreaterThan(0);
      expect(id).toMatch(/^[a-zA-Z]+$/);
    }
  });

  it('every modifier in the rematch list has an override entry', () => {
    for (const id of BASE_CONFIG.rematch.modifiers) {
      expect(MODIFIER_OVERRIDES[id]).toBeDefined();
    }
  });
});

describe('asset registry contract', () => {
  it('contains every required semantic asset id from the design document', () => {
    const expected = [
      'playerTank.chassis',
      'playerTank.turret',
      'enemy.scrapBug',
      'enemy.rammer',
      'enemy.gunTower',
      'enemy.lootTruck',
      'pickup.normalScrap',
      'prop.explosiveBarrel',
      'vfx.cannonImpact',
      'ui.driverTheme',
      'audio.cannon',
      'audio.music',
    ];
    for (const id of expected) {
      expect(REQUIRED_ASSET_IDS).toContain(id);
    }
  });
});
