import { describe, expect, it } from 'vitest';
import { CLIENT_CONTENT_PACK } from '../../src/generated/contentPack.generated';
import { presentRelicDescription } from '../../src/shared/presentation/relicDescriptionPresentation';

const present = (relicId: string): string => presentRelicDescription(
  CLIENT_CONTENT_PACK.getRelic(relicId),
  (templateId) => CLIENT_CONTENT_PACK.getRelicEffectTemplate(templateId),
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
