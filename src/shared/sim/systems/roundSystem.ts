import type { MatchResults } from '../../types';
import type { SystemContext } from './systemContext';

/**
 * RoundSystem owns the clock, countdown, duration source, phase transition,
 * and completion -> results handoff. Duration comes from the mode's
 * objective definition (content or legacy bundle), never a hardcoded 90.
 */
export class RoundSystem {
  constructor(private readonly ctx: SystemContext) {}

  get durationSeconds(): number {
    return this.ctx.rules.duration;
  }

  /**
   * Advance one frame. Countdown frames return 0 (no systems run); running
   * frames return the time-scaled dt after advancing the clock.
   */
  advance(dtRaw: number): number {
    const s = this.ctx.state;
    if (s.phase === 'countdown') {
      s.countdown -= dtRaw;
      if (s.countdown <= 0) s.phase = 'running';
      return 0;
    }
    const dt = dtRaw * this.ctx.rules.timeScale;
    s.time += dt;
    return dt;
  }

  /** Returns the computed results the frame the round completes, else null. */
  checkCompletion(): MatchResults | null {
    const s = this.ctx.state;
    // Core Loop 06: when a horde stage is enforced, the stage owns match
    // completion (boss clear / tank game-over), not the demo round timer.
    if (this.ctx.horde && this.ctx.rules.hordeDirector?.enforceStage === true) return null;
    const objective = this.ctx.rules.objective;
    const truckDone = objective.completionOnTruckEscape === true && s.truck.escaped;
    if (s.time >= s.duration || truckDone) {
      s.phase = 'results';
      return this.ctx.results.compute();
    }
    return null;
  }
}
