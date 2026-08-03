import type { GameplayEventBus } from './gameplayEventBus';
import type { EntityRegistry } from './entityRegistry';

/** Match-scoped context shared with every system (REFACTOR_01 §6). */
export interface SimulationContext {
  time: number;
  dt: number;
  eventBus: GameplayEventBus;
  entities: EntityRegistry;
}

export function createSimulationContext(
  eventBus: GameplayEventBus,
  entities: EntityRegistry,
  time = 0,
  dt = 0,
): SimulationContext {
  return { time, dt, eventBus, entities };
}
