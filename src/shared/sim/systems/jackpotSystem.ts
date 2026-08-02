import { clamp } from '../../math';
import { pushEvent, type SystemContext } from './systemContext';

/** JackpotSystem owns the meter, gains (with multiplier), and ready flag. */
export class JackpotSystem {
  constructor(private readonly ctx: SystemContext) {}

  addGain(amount: number): void {
    const s = this.ctx.state;
    const mult = this.ctx.rules.matchConfig.jackpotGainMult;
    s.stats.jackpotMeter = clamp(s.stats.jackpotMeter + amount * mult, 0, 100);
    const ready = s.stats.jackpotMeter >= 100 && s.turret.jackpotCooldown <= 0;
    if (ready && !s.turret.jackpotReady) {
      pushEvent(this.ctx, 'assist', s.tank.x, s.tank.y + 2.2, s.tank.z, { label: 'JACKPOT READY' });
    }
    s.turret.jackpotReady = ready;
  }

  updateReady(): void {
    const s = this.ctx.state;
    s.turret.jackpotReady = s.stats.jackpotMeter >= 100 && s.turret.jackpotCooldown <= 0;
  }
}
