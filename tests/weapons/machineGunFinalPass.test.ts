import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_CONFIG } from '../../src/shared/config';
import { ContentLoader } from '../../src/shared/content/contentLoader';
import type { UpgradeCategoryDefinition } from '../../src/shared/content/schemas/progression';
import { statModifier } from '../../src/shared/stats/statModifier';
import { StatResolver } from '../../src/shared/stats/statResolver';
import { isKnownStat } from '../../src/shared/stats/statIds';
import { Match } from '../../src/shared/sim/match';
import { computeWeaponMountWorldPose } from '../../src/shared/vehicle/tankRigGeometry';
import { DEFAULT_TANK_RIG } from '../../src/shared/vehicle/tankRigTypes';
import {
  machineGunShotInterval,
  resolveMachineGunRoundsPerSecond,
} from '../../src/shared/weapons/machineGunStats';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONTENT_ROOT = path.join(ROOT, 'content');
const pack = new ContentLoader().loadFromFilesystem(CONTENT_ROOT);
const DT = 1 / 30;

const EXPECTED_BANDS = {
  'upgrade.weapon.mgDamage': [[30, 40], [55, 70], [90, 110], [150, 180]],
  'upgrade.weapon.mgRange': [[25, 35], [45, 60], [75, 90], [120, 150]],
  'upgrade.weapon.mgRate': [[20, 25], [35, 45], [55, 70], [85, 100]],
} as const;

afterEach(() => vi.restoreAllMocks());

describe('final Machine Gun content contract', () => {
  it('uses the exact base balance and has no velocity/projectile stat', () => {
    const weapon = pack.getWeapon('weapon.machineGun');
    expect(weapon.behaviorId).toBe('weapon.hitscan');
    expect(weapon.cooldownSeconds).toBeCloseTo(1 / 11, 12);
    expect(weapon.statBlock).toMatchObject({
      'weapon.mgDamage': 3,
      'weapon.mgRate': 11,
      'weapon.mgRange': 45,
      'weapon.mgSpread': 0.012,
      'weapon.mgRecoilImpulse': 0.18,
    });
    expect(Object.keys(weapon.statBlock).some((id) => /mg.*(?:speed|velocity)|(?:speed|velocity).*mg/i.test(id))).toBe(false);
    expect(isKnownStat('weapon.mgSpeed')).toBe(false);
    expect(isKnownStat('weapon.mgBulletSpeed')).toBe(false);
    expect(BASE_CONFIG.weapons).not.toHaveProperty('mgSpeed');
    expect(BASE_CONFIG.tank.mgRecoilImpulse).toBe(0.18);
  });

  it('offers exactly Power, Range, and Fire Rate with the exact rarity bands', () => {
    const categories = pack.all<UpgradeCategoryDefinition>('upgradeCategories');
    const mg = categories.filter((category) => category.tags?.includes('mg'));
    expect(mg.map((category) => category.id).sort()).toEqual([
      'upgrade.weapon.mgDamage',
      'upgrade.weapon.mgRange',
      'upgrade.weapon.mgRate',
    ]);
    expect(mg.map((category) => category.label).sort()).toEqual([
      'MACHINE GUN FIRE RATE',
      'MACHINE GUN POWER',
      'MACHINE GUN RANGE',
    ]);
    expect(categories.some((category) => category.id === 'upgrade.weapon.mgSpread' || /precision/i.test(category.label))).toBe(false);
    for (const [categoryId, bands] of Object.entries(EXPECTED_BANDS)) {
      const category = pack.getUpgradeCategory(categoryId);
      const actual = (['common', 'rare', 'epic', 'legendary'] as const).map((rarity) => [
        category.rarityRanges[rarity].minPercent,
        category.rarityRanges[rarity].maxPercent,
      ]);
      expect(actual).toEqual(bands);
      expect(category.effects).toEqual([{
        statId: categoryId.replace('upgrade.', ''),
        operation: 'multiply',
      }]);
    }
  });

  it('does not add or modify the existing Cannon category set', () => {
    const cannonIds = pack.all<UpgradeCategoryDefinition>('upgradeCategories')
      .filter((category) => category.tags?.includes('cannon'))
      .map((category) => category.id)
      .sort();
    expect(cannonIds).toEqual([
      'upgrade.weapon.cannonCooldown',
      'upgrade.weapon.cannonDamage',
      'upgrade.weapon.cannonKnockback',
      'upgrade.weapon.cannonRadius',
      'upgrade.weapon.cannonRecoilImpulse',
    ]);
  });

  it('authors the final English and Korean localization keys', () => {
    const en = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'locales/en/upgrades.json'), 'utf8'));
    const ko = JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'locales/ko/upgrades.json'), 'utf8'));
    expect(en['upgrade.upgrade_weapon_mgDamage.name']).toBe('MACHINE GUN POWER');
    expect(en['upgrade.upgrade_weapon_mgRange.name']).toBe('MACHINE GUN RANGE');
    expect(en['upgrade.upgrade_weapon_mgRate.name']).toBe('MACHINE GUN FIRE RATE');
    expect(ko['upgrade.upgrade_weapon_mgDamage.name']).toBe('기관총 화력');
    expect(ko['upgrade.upgrade_weapon_mgRange.name']).toBe('기관총 사거리');
    expect(ko['upgrade.upgrade_weapon_mgRate.name']).toBe('기관총 연사력');
  });
});

describe('Machine Gun resolution and authority', () => {
  function resolver(): StatResolver {
    return new StatResolver({
      'weapon.mgDamage': 3,
      'weapon.mgRange': 45,
      'weapon.mgRate': 11,
      'match.mgRate': 1,
    });
  }

  it('uses rounds-per-second multiplier semantics and final base-relative caps', () => {
    const rules = resolver();
    rules.addModifier(statModifier('rate-100', 'weapon.mgRate', 'multiply', 2, { stacking: 'stack' }));
    expect(resolveMachineGunRoundsPerSecond(rules)).toBe(22);
    expect(machineGunShotInterval(resolveMachineGunRoundsPerSecond(rules))).toBeCloseTo(1 / 22, 12);

    rules.addModifier(statModifier('mode', 'match.mgRate', 'multiply', 1.5));
    expect(resolveMachineGunRoundsPerSecond(rules)).toBe(24.75);
    rules.addModifier(statModifier('more-rate', 'weapon.mgRate', 'multiply', 2, { stacking: 'stack' }));
    expect(rules.resolve('weapon.mgRate')).toBe(24.75);
    expect(resolveMachineGunRoundsPerSecond(rules)).toBe(24.75);

    rules.addModifier(statModifier('damage-a', 'weapon.mgDamage', 'multiply', 2.8, { stacking: 'stack' }));
    rules.addModifier(statModifier('damage-b', 'weapon.mgDamage', 'multiply', 2.8, { stacking: 'stack' }));
    rules.addModifier(statModifier('range-a', 'weapon.mgRange', 'multiply', 2.5, { stacking: 'stack' }));
    rules.addModifier(statModifier('range-b', 'weapon.mgRange', 'multiply', 2.5, { stacking: 'stack' }));
    expect(rules.resolve('weapon.mgDamage')).toBe(15);
    expect(rules.resolve('weapon.mgRange')).toBe(135);
  });

  it('applies hitscan damage immediately and sends the actual tracer endpoint distance', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const match = new Match('mg-hitscan-final', 'none', pack);
    match.state.enemies.length = 0;
    const enemy = match.spawnEnemy('scrapBug', 12, 0)!;
    match.state.tank.x = 0;
    match.state.tank.z = 0;
    match.state.tank.yaw = Math.PI / 2;
    match.state.turret.yaw = 0;
    const mount = computeWeaponMountWorldPose(match.state.tank, { yaw: 0, pitch: 0 }, DEFAULT_TANK_RIG);
    const aimPitch = Math.atan2(0.6 - mount.muzzle.y, 12 - mount.muzzle.x);
    match.setGunnerInput({ aimYaw: 0, aimPitch, primary: true, secondary: false, ability: false });
    match.step(DT);
    const events = match.takeEvents();
    const shot = events.find((event) => event.type === 'shot' && event.kind === 'mg')!;
    const hit = events.find((event) => event.type === 'mgHit')!;

    expect(enemy.hp).toBe(0);
    expect(match.state.shells).toHaveLength(0);
    expect(hit.value).toBe(3);
    expect(shot.value).toBeCloseTo(Math.hypot(hit.x! - shot.x!, hit.y! - shot.y!, hit.z! - shot.z!), 6);
    expect(shot.value).toBeLessThan(45);
  });

  it('delivers the same resolved stats and cadence in single-player and multiplayer modes', () => {
    const multiplayer = new Match('mg-mp', 'none', pack, undefined, 'mode.mainStage');
    const singlePlayer = new Match('mg-sp', 'none', pack, undefined, 'mode.singlePlayerMainStage');
    for (const match of [multiplayer, singlePlayer]) {
      match.rules.addModifier(statModifier('test-rate', 'weapon.mgRate', 'multiply', 2, { stacking: 'stack' }));
      match.rules.addModifier(statModifier('test-power', 'weapon.mgDamage', 'multiply', 1.4, { stacking: 'stack' }));
    }
    expect(resolveMachineGunRoundsPerSecond(singlePlayer.rules.resolver))
      .toBe(resolveMachineGunRoundsPerSecond(multiplayer.rules.resolver));
    expect(singlePlayer.rules.resolver.resolve('weapon.mgDamage'))
      .toBe(multiplayer.rules.resolver.resolve('weapon.mgDamage'));
  });

  it('sustains the capped cadence without queuing more than one shot per simulation tick', () => {
    const match = new Match('mg-cadence', 'overclocked', pack);
    match.state.enemies.length = 0;
    match.state.tank.shieldedT = 999;
    match.rules.addModifier(statModifier('max-rate', 'weapon.mgRate', 'multiply', 10, { stacking: 'stack' }));
    match.setGunnerInput({ aimYaw: 0, aimPitch: 0, primary: true, secondary: false, ability: false });
    let shots = 0;
    const ticks = 120;
    for (let i = 0; i < ticks; i++) {
      match.step(DT);
      const tickShots = match.takeEvents().filter((event) => event.type === 'shot' && event.kind === 'mg').length;
      expect(tickShots).toBeLessThanOrEqual(1);
      shots += tickShots;
    }
    expect(resolveMachineGunRoundsPerSecond(match.rules.resolver)).toBe(24.75);
    expect(shots).toBeGreaterThanOrEqual(98);
    expect(shots).toBeLessThanOrEqual(100);
  });
});
