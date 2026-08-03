import type { SystemContext } from '../sim/systems/systemContext';
import type { EnemyDefinition } from '../content/schemas/enemy';
import type { EnemyRuntimeState } from './enemyRuntimeState';
import type { EnemyState } from '../types';

export interface EnemyBehavior {
  readonly id: string;
  update(ctx: SystemContext, enemy: EnemyState, runtime: EnemyRuntimeState, dt: number): void;
}

/** Registry of registered behavior primitives (TypeScript, not JSON). */
export class EnemyBehaviorRegistry {
  private readonly behaviors = new Map<string, EnemyBehavior>();

  register(behavior: EnemyBehavior): this {
    if (this.behaviors.has(behavior.id)) throw new Error(`enemy behavior already registered: ${behavior.id}`);
    this.behaviors.set(behavior.id, behavior);
    return this;
  }

  require(id: string): EnemyBehavior {
    const behavior = this.behaviors.get(id);
    if (!behavior) throw new Error(`unknown enemy behavior: ${id}`);
    return behavior;
  }

  has(id: string): boolean {
    return this.behaviors.has(id);
  }
}

/** Resolve a behavior parameter: behavior parameters > enemy def field > fallback. */
export function behaviorParam(
  enemy: EnemyDefinition,
  behaviorId: string,
  key: string,
  fallback: number,
): number {
  const entry = enemy.behaviors.find((b) => b.id === behaviorId);
  const value = entry?.parameters?.[key];
  if (typeof value === 'number') return value;
  const defValue = (enemy as unknown as Record<string, unknown>)[key];
  if (typeof defValue === 'number') return defValue;
  return fallback;
}
