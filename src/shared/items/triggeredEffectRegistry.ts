import type { ItemDefinition, StatusEffectDefinition } from '../content/schemas/item';
import type { MatchRules } from '../rules/matchRules';

export type EffectDefinition = ItemDefinition | StatusEffectDefinition;

export interface TriggeredEffectContext {
  rules: MatchRules;
  source: string;
}

/**
 * Registry of effect triggers (onPickup/onKill/onHit/onTimer/onUse).
 * Item/status systems fire triggers; registered handlers apply definitions.
 */
export class TriggeredEffectRegistry {
  private readonly triggers = new Map<string, Set<(def: EffectDefinition, ctx: TriggeredEffectContext) => void>>();

  register(trigger: string, handler: (def: EffectDefinition, ctx: TriggeredEffectContext) => void): this {
    let set = this.triggers.get(trigger);
    if (!set) {
      set = new Set();
      this.triggers.set(trigger, set);
    }
    set.add(handler);
    return this;
  }

  fire(trigger: string, def: EffectDefinition, ctx: TriggeredEffectContext): void {
    const handlers = this.triggers.get(trigger);
    if (!handlers) return;
    for (const handler of [...handlers]) handler(def, ctx);
  }

  listTriggers(): readonly string[] {
    return Object.freeze([...this.triggers.keys()]);
  }
}
