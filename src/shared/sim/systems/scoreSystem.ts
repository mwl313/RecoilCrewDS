import { pushEvent, type SystemContext } from './systemContext';

/** ScoreSystem owns score accumulation, links, and the wipeout penalty. */
export class ScoreSystem {
  constructor(private readonly ctx: SystemContext) {}

  addScore(value: number, label?: string): void {
    const s = this.ctx.state;
    const gained = Math.round(value * s.combo.multiplier);
    s.stats.score += gained;
    if (label) pushEvent(this.ctx, 'score', s.tank.x, s.tank.y + 2, s.tank.z, { value: gained, label });
  }

  applyWipeoutPenalty(): void {
    const s = this.ctx.state;
    s.stats.score = Math.floor(s.stats.score * (1 - this.ctx.rules.config.scoring.wipeoutPenalty));
    s.stats.jackpotMeter *= 0.5;
    this.ctx.jackpot.updateReady();
    this.ctx.combo.reset();
  }

  addLink(kind: 'scrapLoop' | 'ramFinish'): void {
    const sc = this.ctx.rules.config.scoring;
    let value = 0;
    let label = '';
    if (kind === 'scrapLoop') {
      value = sc.linkScrapLoop;
      label = 'CREW LINK: SCRAP LOOP';
    } else {
      value = sc.linkRamFinish;
      label = 'CREW LINK: RAM FINISH';
    }
    this.ctx.state.stats.links++;
    this.addScore(value, label);
    this.ctx.jackpot.addGain(this.ctx.rules.config.jackpot.linkGain);
    pushEvent(this.ctx, 'link', this.ctx.state.tank.x, this.ctx.state.tank.y + 2, this.ctx.state.tank.z, { label });
  }
}
