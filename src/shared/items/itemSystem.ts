import type { ItemDefinition, StatusEffectDefinition } from '../content/schemas/item';
import type { SystemContext } from '../sim/systems/systemContext';
import { statModifier } from '../stats/statModifier';

/**
 * Authoritative item system. Applying an item adds its modifiers to the
 * match stat resolver (instant when no duration, timed otherwise), honoring
 * stacking rules. Modifiers are revocable and revision-aware.
 */
export class ItemSystem {
  constructor(private readonly ctx: SystemContext) {}

  apply(item: ItemDefinition): void {
    for (const modifier of item.modifiers ?? []) {
      this.ctx.rules.addModifier(
        statModifier(`item.${item.id}`, modifier.stat, modifier.operation, modifier.value, {
          source: `item:${item.id}`,
          priority: modifier.priority ?? 50,
          stacking: modifier.stacking ?? 'refresh',
          ...(modifier.durationSeconds !== undefined ? { durationSeconds: modifier.durationSeconds } : {}),
        }),
      );
    }
    this.ctx.eventBus.emit('item.applied', { itemId: item.id });
  }

  remove(item: ItemDefinition): void {
    this.ctx.rules.removeModifiersBySource(`item:${item.id}`);
  }
}

/** Status effects apply the same way; this is the timed/stacking owner. */
export class StatusEffectSystem {
  constructor(private readonly ctx: SystemContext) {}

  apply(effect: StatusEffectDefinition): void {
    for (const modifier of effect.modifiers ?? []) {
      this.ctx.rules.addModifier(
        statModifier(`status.${effect.id}`, modifier.stat, modifier.operation, modifier.value, {
          source: `status:${effect.id}`,
          priority: modifier.priority ?? 60,
          stacking: modifier.stacking ?? effect.stackable === false ? 'replace' : 'stack',
          ...(modifier.durationSeconds !== undefined
            ? { durationSeconds: modifier.durationSeconds }
            : effect.duration !== undefined
              ? { durationSeconds: effect.duration }
              : {}),
        }),
      );
    }
    this.ctx.eventBus.emit('effect.applied', { effectId: effect.id });
  }

  remove(effect: StatusEffectDefinition): void {
    this.ctx.rules.removeModifiersBySource(`status:${effect.id}`);
  }

  /** Expire timed modifiers (called each simulation step). */
  update(dt: number): void {
    this.ctx.rules.updateTimedModifiers(dt);
  }
}
