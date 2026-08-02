import type { GameplaySystem } from './gameplaySystem';
import type { SimulationContext } from './simulationContext';

interface ScheduledSystem {
  system: GameplaySystem;
  priority: number;
  order: number;
}

/**
 * Ordered system scheduler. Lower priority values run first; systems with the
 * same priority keep registration order. Duplicate system ids are rejected.
 */
export class SystemScheduler {
  private readonly systems: ScheduledSystem[] = [];
  private nextOrder = 0;

  add(system: GameplaySystem, priority = 0): this {
    if (this.systems.some((s) => s.system.id === system.id)) {
      throw new Error(`system id already registered: ${system.id}`);
    }
    this.systems.push({ system, priority, order: this.nextOrder++ });
    return this;
  }

  update(context: SimulationContext, dt: number): void {
    for (const entry of this.ordered()) entry.system.update(context, dt);
  }

  initialize(context: SimulationContext): void {
    for (const entry of this.ordered()) entry.system.initialize?.(context);
  }

  reset(context: SimulationContext): void {
    for (const entry of this.ordered()) entry.system.reset?.(context);
  }

  dispose(): void {
    for (const entry of this.systems) entry.system.dispose?.();
    this.systems.length = 0;
  }

  list(): readonly string[] {
    return Object.freeze(this.ordered().map((s) => s.system.id));
  }

  get size(): number {
    return this.systems.length;
  }

  private ordered(): readonly ScheduledSystem[] {
    return [...this.systems].sort((a, b) => a.priority - b.priority || a.order - b.order);
  }
}
