import type {
  RelicDefinition,
  RelicEffectTemplateDefinition,
} from '../content/schemas/progression';

export type RelicEffectDefinition = RelicDefinition['effects'][number];

/** Canonical data authority: template defaults, then relic-specific overrides. */
export function resolveRelicEffectParameters(
  template: RelicEffectTemplateDefinition,
  effect: RelicEffectDefinition,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    ...(template.parameters ?? {}),
    ...(effect.parameters ?? {}),
  });
}
