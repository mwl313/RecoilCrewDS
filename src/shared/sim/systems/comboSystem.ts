import type { Role } from '../../types';
import { pushEvent, type SystemContext } from './systemContext';

/** ComboSystem owns contribution timestamps, points, levels, and decay. */
export class ComboSystem {
  constructor(private readonly ctx: SystemContext) {}

  addContribution(role: Role, points: number): void {
    const s = this.ctx.state;
    s.stats.anyContribution = true;
    const c = s.combo;
    if (role === 'driver') c.lastDriverT = s.time;
    else c.lastGunnerT = s.time;
    c.lastAnyT = s.time;
    c.points += points;
    this.recalc();
  }

  addDriverContribution(points: number, label: string): void {
    this.addContribution('driver', points);
    if (label) {
      pushEvent(this.ctx, 'score', this.ctx.state.tank.x, this.ctx.state.tank.y + 2, this.ctx.state.tank.z, {
        value: 0,
        label,
      });
    }
  }

  step(dt: number): void {
    const s = this.ctx.state;
    const c = s.combo;
    if (s.time - c.lastAnyT > this.ctx.rules.scoring.combo.decayTime && c.multiplier > 1) {
      c.points = 0;
      c.multiplier = 1;
      pushEvent(this.ctx, 'comboChange', 0, 0, 0, { value: 1 });
    }
    void dt;
  }

  recalc(): void {
    const s = this.ctx.state;
    const c = s.combo;
    const sc = this.ctx.rules.scoring.combo;
    const bothRecent =
      s.time - c.lastDriverT < sc.bothWindow && s.time - c.lastGunnerT < sc.bothWindow;
    let level = 1 + Math.floor(c.points / sc.pointsPerLevel);
    if (level > 2 && !bothRecent) level = 2;
    level = Math.min(level, sc.max);
    if (level !== c.multiplier) {
      c.multiplier = level;
      c.best = Math.max(c.best, level);
      pushEvent(this.ctx, 'comboChange', 0, 0, 0, { value: level });
    }
  }

  reset(): void {
    const c = this.ctx.state.combo;
    c.points = 0;
    c.multiplier = 1;
  }
}
