import { describe, expect, it } from 'vitest';
import { hordePresenceAmount } from '../../src/client/audio/procedural/hordePresenceAudio';
import {
  classifyLanding,
  resolveEnemyDeathRecipe,
  resolveEnemyFireRecipe,
  resolveLegacyEnemyCue,
  resolveSemanticEventRecipe,
} from '../../src/client/audio/procedural/enemyAudioResolver';
import { describeRecipe } from '../../src/client/audio/procedural/proceduralSoundRecipes';
import type { SimEvent } from '../../src/shared/types';

const event = (partial: Partial<SimEvent>): SimEvent => ({ type: 'enemyFire', t: 1, ...partial });

describe('procedural recipes and semantic resolution', () => {
  it('resolves distinct ranged threat tiers and death tiers', () => {
    expect(resolveEnemyFireRecipe('fodder')).toBe('enemyRangedFire');
    expect(resolveEnemyFireRecipe('specialist')).toBe('enemySpecialistFire');
    expect(resolveEnemyFireRecipe('elite')).toBe('enemyEliteFire');
    expect(resolveEnemyFireRecipe('boss')).toBe('bossFire');
    expect(resolveEnemyDeathRecipe('fodder')).toBe('enemyDeathFodder');
    expect(resolveEnemyDeathRecipe('elite')).toBe('enemyDeathElite');
    expect(resolveEnemyDeathRecipe('boss')).toBe('bossDeath');
  });

  it('maps modern impact, cannon, death, and landing semantics directly', () => {
    expect(resolveSemanticEventRecipe(event({ type: 'enemyProjectileImpact' }))).toBe('enemyProjectileImpact');
    expect(resolveSemanticEventRecipe(event({ type: 'playerCannonImpact' }))).toBe('cannonImpact');
    expect(resolveSemanticEventRecipe(event({ type: 'kill', tier: 'boss', sizeClass: 'large' }))).toBe('bossDeath');
    expect(resolveSemanticEventRecipe(event({ type: 'tankLanding', value: 4 }))).toBe('landingLight');
    expect(resolveSemanticEventRecipe(event({ type: 'tankLanding', value: 10 }))).toBe('landingHeavy');
    expect(classifyLanding(7.49)).toBe('landingLight');
    expect(classifyLanding(7.5)).toBe('landingHeavy');
  });

  it('keeps safe legacy mappings for Demo events', () => {
    expect(resolveLegacyEnemyCue(event({ type: 'towerFire', kind: 'tower' }))).toBe('enemySpecialistFire');
    expect(resolveLegacyEnemyCue(event({ type: 'rammerTelegraph', kind: 'tower' }))).toBe('enemyTelegraph');
    expect(resolveLegacyEnemyCue(event({ type: 'rammerTelegraph', kind: 'rammer' }))).toBe('rammerTelegraph');
  });

  it('preserves bus separation and charge scaling', () => {
    expect(describeRecipe('playerCannon', { chargeRatio: 1 }).bus).toBe('playerWeapon');
    expect(describeRecipe('enemyRangedFire').bus).toBe('enemyWeapon');
    expect(describeRecipe('cannonImpact').bus).toBe('impact');
    expect(describeRecipe('playerCannon', { chargeRatio: 1 }).duration)
      .toBeGreaterThan(describeRecipe('playerCannon', { chargeRatio: 0 }).duration);
  });

  it('uses one capped aggregate horde presence curve', () => {
    expect(hordePresenceAmount(5)).toBe(0);
    expect(hordePresenceAmount(12)).toBeGreaterThan(0);
    expect(hordePresenceAmount(30)).toBeGreaterThan(hordePresenceAmount(12));
    expect(hordePresenceAmount(80)).toBeLessThanOrEqual(1);
    expect(hordePresenceAmount(30, 90)).toBeLessThan(hordePresenceAmount(30, 20));
  });
});
