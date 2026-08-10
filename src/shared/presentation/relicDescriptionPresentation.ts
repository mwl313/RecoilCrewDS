import type {
  RelicDefinition,
  RelicEffectTemplateDefinition,
} from '../content/schemas/progression';
import { resolveRelicEffectParameters } from '../progression/relicEffectParameters';
import { formatCombatDisplayValue } from './combatDisplayUnits';

export type RelicEffectTemplateLookup = (
  templateId: string,
) => RelicEffectTemplateDefinition | undefined;

export type RelicCopyLocalizer = (
  key: string,
  params: Readonly<Record<string, string | number>>,
  authoredFallback: string,
) => string;

/**
 * Present only structured absolute integrity effects in combat display units.
 * Unrelated or compound relic copy remains authored content; no human text is
 * parsed or number-replaced.
 */
export function presentRelicDescription(
  relic: RelicDefinition,
  templateFor: RelicEffectTemplateLookup,
  _localize?: RelicCopyLocalizer,
): string {
  if (relic.effects.length !== 1) return relic.description;
  const effect = relic.effects[0];
  const template = templateFor(effect.templateId);
  if (!template) return relic.description;
  const params = resolveRelicEffectParameters(template, effect) as Record<string, unknown>;
  const amount = (key: string): number | null => typeof params[key] === 'number' ? params[key] as number : null;

  if (
    template.effectType === 'statFlat' &&
    params['statId'] === 'tank.maxIntegrity'
  ) {
    const value = amount('flatPerStack');
    return value === null ? relic.description : `Max integrity +${formatCombatDisplayValue(value)}.`;
  }
  if (template.effectType === 'cannonKillHeal') {
    const value = amount('amountPerStack');
    return value === null ? relic.description : `Cannon kills restore ${formatCombatDisplayValue(value)} integrity.`;
  }
  if (template.effectType === 'waveClearHeal') {
    const value = amount('amountPerStack');
    return value === null ? relic.description : `Wave clear restores ${formatCombatDisplayValue(value)} integrity.`;
  }
  if (template.effectType === 'heal') {
    const value = amount('amount');
    return value === null ? relic.description : `Restore ${formatCombatDisplayValue(value)} integrity.`;
  }

  return relic.description;
}
