import { ContentValidationError } from './errors';
import { deepFreeze } from './freeze';

export type BehaviorKind =
  | 'attack'
  | 'spawn'
  | 'scoring'
  | 'results'
  | 'mode'
  | 'objective'
  | 'item'
  | 'effect'
  | 'weapon'
  | 'projectile';

export interface BehaviorBinding {
  readonly id: string;
  readonly kind: BehaviorKind;
  readonly description?: string;
  /** Phase 1: implementations arrive with the systems that consume them. */
  readonly implementation?: (...args: unknown[]) => unknown;
}

/**
 * Registry of known behavior ids. Phase 1 validates content against it; the
 * actual behavior implementations are registered by later phases.
 */
export class BehaviorRegistry {
  private readonly bindings = new Map<string, BehaviorBinding>();

  register(binding: BehaviorBinding): this {
    if (this.bindings.has(binding.id)) {
      throw new ContentValidationError(`duplicate behavior id '${binding.id}'`);
    }
    this.bindings.set(binding.id, deepFreeze(binding));
    return this;
  }

  has(id: string): boolean {
    return this.bindings.has(id);
  }

  require(id: string, context?: string): BehaviorBinding {
    const binding = this.bindings.get(id);
    if (!binding) {
      throw new ContentValidationError(
        `unknown behavior '${id}'${context ? ` (referenced by ${context})` : ''}`,
        [context ? `${context}: unknown behavior '${id}'` : `unknown behavior '${id}'`],
      );
    }
    return binding;
  }

  ids(): readonly string[] {
    return Object.freeze([...this.bindings.keys()]);
  }
}

/** Behaviors referenced by the shipped Demo pack. */
export function createBuiltinBehaviorRegistry(): BehaviorRegistry {
  const registry = new BehaviorRegistry();
  const attack = (id: string, description?: string) => registry.register({ id, kind: 'attack', description });
  attack('behavior.hunt', 'Scrap Bug chase/circle');
  attack('behavior.separation', 'Enemy separation steering');
  attack('behavior.obstacleAvoid', 'Enemy obstacle avoidance');
  attack('behavior.telegraphedCharge', 'Rammer lock/telegraph/charge');
  attack('behavior.ram', 'Rammer collision/knockback');
  attack('behavior.recovery', 'Rammer recovery glide');
  attack('behavior.burstFire', 'Gun Tower burst fire');
  attack('behavior.trackTarget', 'Gun Tower aim tracking');
  attack('behavior.route', 'Loot Truck waypoint route');
  attack('behavior.escape', 'Loot Truck timed escape');
  registry.register({ id: 'behavior.spawnDirector.demo', kind: 'spawn', description: 'Demo spawn pacing/schedules' });
  registry.register({ id: 'behavior.scoring.demo', kind: 'scoring', description: 'Demo score/combo/JACKPOT rules' });
  registry.register({ id: 'behavior.results.demo', kind: 'results', description: 'Demo grade/title rules' });
  registry.register({ id: 'behavior.mode.demoScoreAttack', kind: 'mode', description: 'Demo Score Attack mode loop' });
  registry.register({ id: 'behavior.objective.scoreAttack', kind: 'objective', description: 'High-score timed objective' });
  registry.register({ id: 'weapon.hitscan', kind: 'weapon', description: 'Hitscan weapon behavior (machine gun)' });
  registry.register({ id: 'weapon.projectile', kind: 'weapon', description: 'Semi-auto projectile weapon (main cannon)' });
  registry.register({ id: 'weapon.chargeProjectile', kind: 'weapon', description: 'Charge-to-fire projectile weapon (JACKPOT)' });
  registry.register({ id: 'projectile.shell', kind: 'projectile', description: 'Shared ballistic shell behavior' });
  return registry;
}
