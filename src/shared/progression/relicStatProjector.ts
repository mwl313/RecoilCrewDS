import type {
  RelicDefinition,
  RelicEffectTemplateDefinition,
} from '../content/schemas/progression';
import type { MatchRules } from '../rules/matchRules';
import { statModifier } from '../stats/statModifier';
import type { TeamProgressionState } from './progressionTypes';
import { resolveRelicEffectParameters } from './relicEffectParameters';

export interface RelicDamageModifiers {
  incomingPercent: number;
  outgoingPercent: number;
  cannonSelfPercent: number;
  airbornePercent: number;
  eliteBossPercent: number;
  momentumPercent: number;
  ironWillPercent: number;
  lastResortPercent: number;
}

/**
 * Projects relic stacks into one effective stat layer:
 * - percent stacks aggregate additively per (relic, stat) into a single
 *   multiply modifier;
 * - flat stacks aggregate into a single add modifier;
 * - damage-relevant modifiers are summarized for the damage hooks.
 */
export class RelicStatProjector {
  private lastKey = '';

  constructor(
    private readonly rules: MatchRules,
    private readonly relicsById: ReadonlyMap<string, RelicDefinition>,
    private readonly templatesById: ReadonlyMap<string, RelicEffectTemplateDefinition>,
  ) {}

  /** Reproject only when stack counts changed. */
  reproject(state: TeamProgressionState): RelicDamageModifiers {
    const key = JSON.stringify(state.relicStacks);
    if (key === this.lastKey) return this.lastModifiers;
    this.lastKey = key;
    this.rules.removeModifiersBySourcePrefix('progression:relic:');

    const damage: RelicDamageModifiers = {
      incomingPercent: 0,
      outgoingPercent: 0,
      cannonSelfPercent: 0,
      airbornePercent: 0,
      eliteBossPercent: 0,
      momentumPercent: 0,
      ironWillPercent: 0,
      lastResortPercent: 0,
    };

    for (const [relicId, stacks] of Object.entries(state.relicStacks)) {
      if (stacks <= 0) continue;
      const relic = this.relicsById.get(relicId);
      if (!relic) continue;
      for (const effect of relic.effects) {
        const template = this.templatesById.get(effect.templateId);
        if (!template) continue;
        const params = resolveRelicEffectParameters(template, effect) as Record<string, number | string | undefined>;
        this.projectTemplate(relic, template.effectType, params, stacks, damage);
      }
    }
    this.lastModifiers = damage;
    return damage;
  }

  private lastModifiers: RelicDamageModifiers = {
    incomingPercent: 0,
    outgoingPercent: 0,
    cannonSelfPercent: 0,
    airbornePercent: 0,
    eliteBossPercent: 0,
    momentumPercent: 0,
    ironWillPercent: 0,
    lastResortPercent: 0,
  };

  private projectTemplate(
    relic: RelicDefinition,
    effectType: string,
    params: Record<string, number | string | undefined>,
    stacks: number,
    damage: RelicDamageModifiers,
  ): void {
    const num = (key: string): number => (typeof params[key] === 'number' ? (params[key] as number) : 0);
    const stat = (key: string): string => (typeof params[key] === 'string' ? (params[key] as string) : '');
    const source = `progression:relic:${relic.id}`;
    switch (effectType) {
      case 'statPercent':
      case 'dashDamagePercent':
      case 'dashCooldownPercent':
      case 'airControlPercent':
      case 'magnetMultiplier':
      case 'xpMultiplier': {
        const statId = effectType === 'dashDamagePercent'
          ? 'tank.dashContactDamage'
          : effectType === 'dashCooldownPercent'
            ? 'tank.dashCooldown'
            : effectType === 'airControlPercent'
              ? 'tank.airControl'
              : effectType === 'magnetMultiplier'
                ? 'progression.magnetRadius'
                : effectType === 'xpMultiplier'
                  ? 'progression.xpMultiplier'
                  : stat('statId');
        const percent = num('percentPerStack') * stacks;
        this.rules.addModifier(
          statModifier(`relic.${relic.id}.${statId}`, statId, 'multiply', 1 + percent / 100, {
            source,
            priority: 45,
            stacking: 'replace',
            tags: ['relicPercent', relic.id],
          }),
        );
        break;
      }
      case 'statFlat':
      case 'extraJumps':
      case 'airDashCharges': {
        const statId = effectType === 'extraJumps' ? 'tank.extraJumps' : effectType === 'airDashCharges' ? 'tank.airDashCharges' : stat('statId');
        const amount = num(effectType === 'extraJumps' || effectType === 'airDashCharges' ? 'countPerStack' : 'flatPerStack');
        // AIR MASTER grants one reusable airborne Dash capability. Its air
        // control stacks, but the capability charge itself does not.
        const flat = effectType === 'airDashCharges' ? amount : amount * stacks;
        this.rules.addModifier(
          statModifier(`relic.${relic.id}.${statId}`, statId, 'add', flat, {
            source,
            priority: 45,
            stacking: 'replace',
            tags: ['relicFlat', relic.id],
          }),
        );
        break;
      }
      case 'zeroDashCooldown': {
        this.rules.addModifier(
          statModifier(`relic.${relic.id}.dashCooldown`, 'tank.dashCooldown', 'multiply', 0, {
            source,
            priority: 45,
            stacking: 'replace',
            tags: ['relicPercent', relic.id],
          }),
        );
        break;
      }
      case 'cannonRadiusAndKnockbackPercent': {
        const radius = num('radiusPercentPerStack') * stacks;
        const knockback = num('knockbackPercentPerStack') * stacks;
        this.addPercent(relic.id, 'weapon.cannonRadius', radius, source);
        for (const statId of ['weapon.splashKnockbackMax', 'weapon.splashKnockbackMin', 'weapon.splashKnockbackVertical']) {
          this.addPercent(relic.id, statId, knockback, source);
        }
        break;
      }
      case 'incomingDamageReduction': {
        const percent = num('percentPerStack') * stacks;
        if (params.source === 'cannon') damage.cannonSelfPercent += percent;
        else damage.incomingPercent += percent;
        break;
      }
      case 'outgoingDamageMultiplier': {
        const percent = num('percentPerStack') * stacks;
        if (params.condition === 'airborne') damage.airbornePercent += percent;
        else if (params.condition === 'eliteBoss') damage.eliteBossPercent += percent;
        else damage.outgoingPercent += percent;
        break;
      }
      case 'conditionalIncomingReduction': {
        const percent = num('percentPerStack') * stacks;
        if (params.condition === 'momentum') damage.momentumPercent += percent;
        else if (params.condition === 'ironWill') damage.ironWillPercent += percent;
        break;
      }
      case 'conditionalOutgoingIncrease': {
        damage.lastResortPercent += num('percentPerStack') * stacks;
        break;
      }
      default:
        break;
    }
  }

  private addPercent(relicId: string, statId: string, percent: number, source: string): void {
    this.rules.addModifier(
      statModifier(`relic.${relicId}.${statId}`, statId, 'multiply', 1 + percent / 100, {
        source,
        priority: 45,
        stacking: 'replace',
        tags: ['relicPercent', relicId],
      }),
    );
  }

  reset(): void {
    this.lastKey = '';
    this.lastModifiers = {
      incomingPercent: 0,
      outgoingPercent: 0,
      cannonSelfPercent: 0,
      airbornePercent: 0,
      eliteBossPercent: 0,
      momentumPercent: 0,
      ironWillPercent: 0,
      lastResortPercent: 0,
    };
    this.rules.removeModifiersBySourcePrefix('progression:relic:');
  }
}
