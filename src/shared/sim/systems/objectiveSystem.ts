import { pushEvent, type SystemContext } from './systemContext';
import type { EntityKilledEvent } from '../../damage/damageTypes';

export type ObjectiveEventType =
  | 'kill'
  | 'collection'
  | 'zoneEntered'
  | 'delivery'
  | 'protection'
  | 'timerElapsed';

export interface ObjectiveEvent {
  type: ObjectiveEventType;
  time: number;
  payload?: unknown;
}

/** ObjectiveSystem routes objective events (Combat 05: Jackpot pacing removed). */
export class ObjectiveSystem {
  /** Optional objective reaction hook (Demo registers none; tests use it). */
  onObjectiveEvent: ((event: ObjectiveEvent) => void) | null = null;

  constructor(private readonly ctx: SystemContext) {
    ctx.eventBus.subscribe('entity.killed', (payload) => {
      const event = payload as EntityKilledEvent;
      const enemy = this.ctx.state.enemies.find((candidate) => candidate.id === event.enemy.id);
      if (enemy?.ownership?.rewardSuppressed) return;
      this.route('kill');
    });
    ctx.eventBus.subscribe('pickup.collected', () => this.route('collection'));
  }

  private route(type: ObjectiveEventType): void {
    if (!this.onObjectiveEvent) return;
    this.onObjectiveEvent({ type, time: this.ctx.state.time });
  }

  update(): void {
  }
}
