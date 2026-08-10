import { describe, expect, it } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { EN_CATALOG, KO_CATALOG } from '../../src/client/localization/catalogs';
import { RuntimeLocalizationService } from '../../src/client/localization/localizationService';
import { presentRelicDescription } from '../../src/shared/presentation/relicDescriptionPresentation';

const present = (relicId: string): string => presentRelicDescription(
  CLIENT_CONTENT_PACK.getRelic(relicId),
  (templateId) => CLIENT_CONTENT_PACK.getRelicEffectTemplate(templateId),
);

const korean = new RuntimeLocalizationService('ko', { en: EN_CATALOG, ko: KO_CATALOG }, null);
const presentKorean = (relicId: string): string => presentRelicDescription(
  CLIENT_CONTENT_PACK.getRelic(relicId),
  (templateId) => CLIENT_CONTENT_PACK.getRelicEffectTemplate(templateId),
  (key, params, fallback) => korean.t(key, params, fallback),
);

describe('relic integrity description presentation', () => {
  it('scales structured max-integrity and repair amounts exactly once', () => {
    expect(present('relic.hearty_tank')).toBe('Max integrity +200.');
    expect(present('relic.safe_haven')).toBe('Wave clear restores 150 integrity.');
    expect(present('relic.vampire_rounds')).toBe('Cannon kills restore 50 integrity.');
    expect(present('relic.hearty_tank')).not.toContain('2,000');
  });

  it('preserves percentage copy and unrelated authored descriptions', () => {
    expect(present('relic.phoenix_core')).toContain('50% integrity');
    expect(present('relic.iron_will')).toBe(
      CLIENT_CONTENT_PACK.getRelic('relic.iron_will').description,
    );
  });

  it('localizes structured integrity descriptions after scaling their authored values', () => {
    expect(presentKorean('relic.hearty_tank')).toBe(
      '최대 내구도가 200 증가합니다.\n늘어난 내구도는 즉시 수리됩니다.',
    );
    expect(presentKorean('relic.safe_haven')).toBe('웨이브를 클리어하면 내구도를 150 수리합니다.');
    expect(presentKorean('relic.vampire_rounds')).toBe('주포로 적을 처치하면 내구도를 50 수리합니다.');
  });

  it('routes the generic heal presenter through a relic-specific localization key', () => {
    const relic = {
      ...CLIENT_CONTENT_PACK.getRelic('relic.safe_haven'),
      id: 'relic.test_heal',
      effects: [{ templateId: 'relicEffect.heal', parameters: { amount: 7 } }],
    };
    const localized = presentRelicDescription(
      relic,
      (templateId) => CLIENT_CONTENT_PACK.getRelicEffectTemplate(templateId),
      (key, params) => `${key}:${params.amount}`,
    );
    expect(localized).toBe('relic.relic_test_heal.description:70');
  });

  it('derives Ground Pound copy values from its effect and exposes the localization key seam', () => {
    expect(present('relic.ground_pound')).toBe(
      'Land after falling at least 1.5 m to create a shockwave.\n' +
      'Greater falls deal more damage and increase the radius, up to 12 m.\n' +
      'Each stack adds 100 base damage.',
    );
    const relic = CLIENT_CONTENT_PACK.getRelic('relic.ground_pound');
    const localized = presentRelicDescription(
      relic,
      (templateId) => CLIENT_CONTENT_PACK.getRelicEffectTemplate(templateId),
      (key, params) => `${key}:${params.minimumFallDistance}:${params.maximumRadius}:${params.baseDamagePerStack}`,
    );
    expect(localized).toBe('relic.relic_ground_pound.description:1.5:12:100');
  });
});
