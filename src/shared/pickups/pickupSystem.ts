import { clamp, dist } from '../math';
import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { PickupDefinition } from '../content/schemas/pickup';
import type { PickupState, ScrapKind } from '../types';

/**
 * Authoritative pickup system. Pickup life/magnet come from validated pickup
 * definitions; collection scoring/links come from the scoring rules. This
 * replaces the legacy pickup formulas in MatchRuntime.
 */
export class PickupSystem {
  lastKillAt = -99;
  lastKillKind: ScrapKind | null = null;

  constructor(private readonly ctx: SystemContext) {}

  defFor(kind: ScrapKind): PickupDefinition {
    const id = kind === 'normal' ? 'pickup.normalScrap' : 'pickup.heavyScrap';
    const def = this.ctx.rules.pickups.get(id);
    if (!def) throw new Error(`no pickup definition for kind '${kind}'`);
    return def;
  }

  noteKill(time: number, kind: ScrapKind | null): void {
    this.lastKillAt = time;
    this.lastKillKind = kind;
  }

  spawn(kind: ScrapKind, x: number, z: number): void {
    const s = this.ctx.state;
    const def = this.defFor(kind);
    if (s.pickups.filter((p) => !p.collected).length >= this.ctx.rules.config.arena.maxPickups) {
      const oldest = s.pickups.find((p) => !p.collected);
      if (oldest) oldest.collected = true;
    }
    s.pickups.push({
      id: s.nextPickupId++,
      kind,
      x,
      y: this.ctx.world.groundHeightAt(x, z) + 0.55,
      z,
      life: def.life * this.ctx.rules.matchConfig.pickupLife,
      collected: false,
    });
  }

  update(dt: number): void {
    const s = this.ctx.state;
    const t = s.tank;
    if (t.deadT > 0) return;
    const magnetMult = this.ctx.rules.matchConfig.pickupMagnet;
    for (const p of s.pickups) {
      if (p.collected) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.collected = true;
        continue;
      }
      const d = dist(p.x, p.z, t.x, t.z);
      const magnet = this.defFor(p.kind).magnetRadius * magnetMult;
      if (d < magnet) {
        const pull = 11 + (magnet - d) * 1.4;
        const nx = (t.x - p.x) / (d || 1);
        const nz = (t.z - p.z) / (d || 1);
        p.x += nx * pull * dt;
        p.z += nz * pull * dt;
        p.y += (t.y + 0.7 - p.y) * clamp(dt * 3, 0, 1);
      }
      if (d < 1.15) {
        p.collected = true;
        this.collect(p);
      }
    }
  }

  private collect(p: PickupState): void {
    const s = this.ctx.state;
    const sc = this.ctx.rules.config.scoring;
    const speed = Math.hypot(s.tank.vx, s.tank.vz);
    let score = 0;
    if (p.kind === 'normal') {
      score = sc.normalScrap;
    } else if (p.kind === 'heavy') {
      score = sc.heavyScrap;
    }
    this.ctx.score.addScore(score, 'SCRAP');
    s.stats.scrapCollected++;
    let extra = '';
    if (speed > this.ctx.rules.scoring.atSpeed.threshold) {
      this.ctx.score.addScore(this.ctx.rules.scoring.atSpeed.bonus, 'AT SPEED');
      extra = 'SPEED';
    }
    if (s.time - this.lastKillAt < this.ctx.rules.scoring.scrapLoopWindow) {
      this.ctx.score.addLink('scrapLoop');
      extra = extra ? 'LINK' : 'LINK';
    }
    this.ctx.combo.addContribution('driver', p.kind === 'heavy' ? 2 : 1);
    pushEvent(this.ctx, 'pickup', p.x, p.y, p.z, { kind: p.kind, value: score, label: extra });
    this.ctx.eventBus.emit('pickup.collected', { pickupId: p.id, kind: p.kind });
    this.ctx.eventBus.drain(); // deliver synchronously (objectives react in step order)
  }
}
