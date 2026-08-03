import type { SystemContext } from '../sim/systems/systemContext';
import type { ShellState } from '../types';

export interface ProjectileBehavior {
  readonly id: string;
  /** Advance one shell by dt (motion + collision + explosion). */
  update(ctx: SystemContext, shell: ShellState, dt: number): void;
}

/** Registry of projectile behavior implementations (keyed by shell kind). */
export class ProjectileBehaviorRegistry {
  private readonly behaviors = new Map<string, ProjectileBehavior>();

  register(behavior: ProjectileBehavior): this {
    if (this.behaviors.has(behavior.id)) throw new Error(`projectile behavior already registered: ${behavior.id}`);
    this.behaviors.set(behavior.id, behavior);
    return this;
  }

  require(id: string): ProjectileBehavior {
    const behavior = this.behaviors.get(id);
    if (!behavior) throw new Error(`unknown projectile behavior: ${id}`);
    return behavior;
  }
}
