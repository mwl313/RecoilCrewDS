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
  | 'projectile'
  | 'movement'
  | 'defense'
  | 'trait';

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
  registry.register({ id: 'behavior.scoring.demo', kind: 'scoring', description: 'Demo score/combo rules' });
  registry.register({ id: 'behavior.results.demo', kind: 'results', description: 'Demo grade/title rules' });
  registry.register({ id: 'behavior.mode.demoScoreAttack', kind: 'mode', description: 'Demo Score Attack mode loop' });
  registry.register({ id: 'behavior.objective.scoreAttack', kind: 'objective', description: 'High-score timed objective' });
  registry.register({ id: 'weapon.hitscan', kind: 'weapon', description: 'Hitscan weapon behavior (machine gun)' });
  registry.register({ id: 'weapon.projectile', kind: 'weapon', description: 'Semi-auto projectile weapon (main cannon)' });
  registry.register({ id: 'projectile.shell', kind: 'projectile', description: 'Shared ballistic shell behavior' });
  registry.register({ id: 'movement.seekTank', kind: 'movement', description: 'Seek the tank with optional speed wobble' });
  registry.register({ id: 'movement.flowSeek', kind: 'movement', description: 'Shared flow-field seek for horde fodder (M7)' });
  registry.register({ id: 'movement.followRoute', kind: 'movement', description: 'Follow a waypoint route (Loot Truck)' });
  registry.register({ id: 'movement.circleTarget', kind: 'movement', description: 'Circle the tank while closing' });
  registry.register({ id: 'movement.densitySteering', kind: 'movement', description: 'Spatial-index density steering (M5)' });
  registry.register({ id: 'movement.obstacleAvoid', kind: 'movement', description: 'Turn away from obstacles ahead' });
  registry.register({ id: 'movement.integrate', kind: 'movement', description: 'Integrate movement + ground + collision' });
  registry.register({ id: 'attack.telegraphedCharge', kind: 'attack', description: 'Rammer lock/telegraph/charge/recovery state machine' });
  registry.register({ id: 'attack.projectileBurst', kind: 'attack', description: 'Gun Tower tracking burst fire' });
  registry.register({ id: 'attack.contactRam', kind: 'attack', description: 'Contact ram/damage when touching the tank' });
  registry.register({ id: 'defense.armoredFront', kind: 'defense', description: 'Reduce incoming damage from a facing' });
  registry.register({ id: 'trait.nonAttackingObjective', kind: 'trait', description: 'Marker: objective enemy that does not attack' });
  registry.register({ id: 'trait.vulnerableRear', kind: 'trait', description: 'Extra damage taken from the rear' });
  return registry;
}
