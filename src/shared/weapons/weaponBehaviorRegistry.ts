import type { SystemContext } from '../sim/systems/systemContext';
import type { WeaponDefinition } from './weaponDefinition';
import type { WeaponRuntimeState } from './weaponRuntimeState';

export interface WeaponBehavior {
  readonly id: string;
  fire(ctx: SystemContext, weapon: WeaponDefinition, runtime: WeaponRuntimeState): void;
  /** Optional per-frame update (used by charge weapons). */
  update?(ctx: SystemContext, weapon: WeaponDefinition, runtime: WeaponRuntimeState, dt: number): void;
}

/** Registry of weapon behavior implementations (TypeScript, not JSON). */
export class WeaponBehaviorRegistry {
  private readonly behaviors = new Map<string, WeaponBehavior>();

  register(behavior: WeaponBehavior): this {
    if (this.behaviors.has(behavior.id)) throw new Error(`weapon behavior already registered: ${behavior.id}`);
    this.behaviors.set(behavior.id, behavior);
    return this;
  }

  require(id: string): WeaponBehavior {
    const behavior = this.behaviors.get(id);
    if (!behavior) throw new Error(`unknown weapon behavior: ${id}`);
    return behavior;
  }

  has(id: string): boolean {
    return this.behaviors.has(id);
  }
}
