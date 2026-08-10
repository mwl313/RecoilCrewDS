import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { PRESENTATION_ASSET_CATALOG } from '../../src/generated/presentationContent.generated';
import { RELIC_EFFECT_TYPES } from '../../src/shared/content/schemas/progression';

const RELIC_IDS = [
  'relic.magnet_core', 'relic.heat_sink', 'relic.covering_fire', 'relic.double_jump',
  'relic.vampire_rounds', 'relic.friendly_shield', 'relic.hearty_tank', 'relic.dash_refund',
  'relic.air_master', 'relic.he_payload', 'relic.roadkill', 'relic.aerial_master',
  'relic.ground_pound', 'relic.momentum_shield', 'relic.armor_shred', 'relic.bullet_time',
  'relic.twin_shell', 'relic.death_mark', 'relic.glass_cannon', 'relic.safe_haven',
  'relic.rapid_reload', 'relic.iron_will', 'relic.last_resort', 'relic.phase_dash',
  'relic.xp_surge', 'relic.phoenix_core', 'relic.unstoppable', 'relic.apex_predator',
] as const;

describe('progression content schemas (progression08)', () => {
  it('registers all 28 relics with rarity/role/stack policies', () => {
    for (const id of RELIC_IDS) {
      const relic = CLIENT_CONTENT_PACK.getRelic(id);
      expect(relic.rarity).toBeTruthy();
      expect(relic.role).toBeTruthy();
      expect(relic.stackPolicy).toBeTruthy();
      expect(relic.effects.length).toBeGreaterThan(0);
    }
    expect(CLIENT_CONTENT_PACK.ids('relics').length).toBe(28);
  });

  it('maps every relic to one unique, packaged HUD icon', () => {
    const relicIconIds = RELIC_IDS
      .map((id) => CLIENT_CONTENT_PACK.getRelic(id).iconId)
      .sort((a, b) => a.localeCompare(b));
    const catalogIcons = PRESENTATION_ASSET_CATALOG.project
      .filter((asset) => asset.kind === 'image' && asset.tags?.includes('relic'))
      .sort((a, b) => a.id.localeCompare(b.id));

    expect(new Set(relicIconIds).size).toBe(RELIC_IDS.length);
    expect(catalogIcons.map((asset) => asset.id)).toEqual(relicIconIds);
    for (const asset of catalogIcons) {
      expect(asset.file).toMatch(/^\/assets\/images\/relics\/[a-z0-9-]+\.png$/);
      expect(existsSync(resolve(process.cwd(), `public${asset.file}`)), asset.id).toBe(true);
    }
  });

  it('registers 18 upgrade categories (10 driver + 8 gunner)', () => {
    const categories = CLIENT_CONTENT_PACK.all('upgradeCategories');
    expect(categories.length).toBe(18);
    expect(categories.filter((c) => c.role === 'driver').length).toBe(10);
    expect(categories.filter((c) => c.role === 'gunner').length).toBe(8);
  });

  it('keeps only the intended relics unique', () => {
    for (const id of ['relic.phase_dash', 'relic.phoenix_core']) {
      const relic = CLIENT_CONTENT_PACK.getRelic(id);
      expect(relic.stackPolicy).toBe('unique');
    }
  });

  it('allows TWIN SHELL to stack without a maximum', () => {
    const relic = CLIENT_CONTENT_PACK.getRelic('relic.twin_shell');
    expect(relic.stackPolicy).toBe('addFlat');
    expect(relic.maximumStacks).toBeUndefined();
  });

  it('relic effect templates resolve to known handler types', () => {
    const templates = CLIENT_CONTENT_PACK.all('relicEffectTemplates');
    for (const template of templates) {
      expect(RELIC_EFFECT_TYPES).toContain(template.effectType);
    }
    for (const relicId of RELIC_IDS) {
      const relic = CLIENT_CONTENT_PACK.getRelic(relicId);
      for (const effect of relic.effects) {
        expect(CLIENT_CONTENT_PACK.has('relicEffectTemplates', effect.templateId)).toBe(true);
      }
    }
  });

  it('rarity tables sum to 1 and first-chest rule is Twin Shell 50 / Legendary 50', () => {
    const upgrade = CLIENT_CONTENT_PACK.getUpgradeRarityTable('rarity.upgrade.default');
    expect(Object.values(upgrade.rarities).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const treasure = CLIENT_CONTENT_PACK.getTreasureRarityTable('rarity.treasure.default');
    expect(Object.values(treasure.rarities).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const first = CLIENT_CONTENT_PACK.getFirstTreasureRule('firstExperience.treasure.first');
    expect(first.branches).toEqual([
      { kind: 'fixedRelic', relicId: 'relic.twin_shell', probability: 0.5 },
      { kind: 'rarity', rarity: 'legendary', probability: 0.5 },
    ]);
    expect(first.branches.reduce((total, branch) => total + branch.probability, 0)).toBeCloseTo(1);
  });

  it('first level-up rule is Epic + normal + 50% Legendary', () => {
    const rule = CLIENT_CONTENT_PACK.getUpgradeFirstExperience('firstExperience.levelUp.first');
    expect(rule.cardRules[0]).toMatchObject({ kind: 'fixed', rarity: 'epic' });
    expect(rule.cardRules[1]).toMatchObject({ kind: 'normal' });
    expect(rule.cardRules[2].kind).toBe('branch');
    if (rule.cardRules[2].kind === 'branch') {
      expect(rule.cardRules[2].branches.find((b) => b.rarity === 'legendary')?.probability).toBe(0.5);
    }
  });

  it('progression definition references resolve and both modes share it', () => {
    const def = CLIENT_CONTENT_PACK.getProgressionDefinition('progression.mainStage');
    expect(CLIENT_CONTENT_PACK.has('levelCurves', def.levelCurveId)).toBe(true);
    expect(CLIENT_CONTENT_PACK.has('relicPools', def.relicPoolId)).toBe(true);
    expect(def.enemyXpRewards.ambient).toBe(1);
    expect(def.enemyXpRewards.elite).toBe(40);
    expect(def.enemyXpRewards.boss).toBe(150);
  });
});
