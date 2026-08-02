import type { SimulationContext } from './simulationContext';

/**
 * Minimal gameplay system contract (REFACTOR_01 §6). Systems are identified
 * by stable ids, updated with a shared simulation context, and may opt into
 * lifecycle hooks. Phase 1 only defines the contract; systems arrive in
 * later phases.
 */
export interface GameplaySystem {
  readonly id: string;
  initialize?(context: SimulationContext): void;
  update(context: SimulationContext, dt: number): void;
  reset?(context: SimulationContext): void;
  dispose?(): void;
}
