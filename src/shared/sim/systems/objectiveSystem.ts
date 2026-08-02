import { pushEvent, type SystemContext } from './systemContext';

/**
 * ObjectiveSystem owns the Demo assistance pacing (content-driven floors)
 * and the JACKPOT ready flag. This is Demo-mode behavior selected by the
 * mode's objective definition, not generic Match logic.
 */
export class ObjectiveSystem {
  constructor(private readonly ctx: SystemContext) {}

  update(): void {
    const s = this.ctx.state;
    const assist = this.ctx.rules.scoring.assist;
    const windows = objectiveWindows(this.ctx);
    if (s.stats.anyContribution && s.stats.kills + s.stats.scrapCollected >= assist.requireContributions) {
      for (const window of windows) {
        if (s.time >= window.at && s.time < window.until && s.stats.jackpotMeter < window.floor) {
          s.stats.jackpotMeter = window.floor;
          pushEvent(this.ctx, 'assist', s.tank.x, s.tank.y, s.tank.z, { label: window.label });
        }
      }
    }
    this.ctx.jackpot.updateReady();
  }
}

export interface ObjectiveAssistWindow {
  at: number;
  until: number;
  floor: number;
  label: 'JACKPOT ASSIST' | 'JACKPOT READY';
}

/** Assistance timing is encoded by the floor field names (55/66/70). */
export function objectiveWindows(ctx: SystemContext): readonly ObjectiveAssistWindow[] {
  const assist = ctx.rules.scoring.assist;
  return [
    { at: 55, until: 66, floor: assist.floor55, label: 'JACKPOT ASSIST' },
    // The legacy pacing had no upper bound on the 66 s floor: it re-fires
    // after 70 s too (ASSIST then READY) until the meter catches up.
    { at: 66, until: Number.POSITIVE_INFINITY, floor: assist.floor66, label: 'JACKPOT ASSIST' },
    { at: 70, until: Number.POSITIVE_INFINITY, floor: assist.floor70, label: 'JACKPOT READY' },
  ];
}
