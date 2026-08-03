import type { SystemContext } from '../sim/systems/systemContext';
import type { ShellState } from '../types';
import { ProjectileBehaviorRegistry } from './projectileBehaviorRegistry';

/**
 * Built-in projectile behaviors. Demo shells share one ballistic behavior;
 * kind-specific handling stays in ProjectileSystem (as the legacy code did).
 */
export function createBuiltinProjectileBehaviors(): ProjectileBehaviorRegistry {
  const registry = new ProjectileBehaviorRegistry();
  registry.register({
    id: 'projectile.shell',
    update(_ctx: SystemContext, _shell: ShellState, _dt: number) {
      // Motion/collision/explosion is handled by ProjectileSystem.update so
      // the legacy per-frame order is preserved exactly.
    },
  });
  return registry;
}
