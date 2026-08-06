import { pushEvent, type SystemContext } from '../sim/systems/systemContext';
import type { XpShardState } from '../types';

/**
 * Authoritative XP shard pickups. Normal kills create shards; purge never
 * does. Magnet radius + proximity acceleration are content/stat-driven.
 */
export class XpShardSystem {
  constructor(private readonly ctx: SystemContext) {}

  spawn(value: number, x: number, z: number): void {
    if (!this.ctx.rules.progressionEnabled) return;
    const s = this.ctx.state;
    const def = this.ctx.rules.xpPickupContent;
    const life = def?.life ?? 30;
    s.xpShards.push({
      id: s.nextXpShardId++,
      value,
      x,
      y: this.ctx.world.groundHeightAt(x, z) + 0.6,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      collected: false,
    });
    void life;
  }

  update(dt: number): void {
    const s = this.ctx.state;
    const t = s.tank;
    if (t.deadT > 0 || !this.ctx.rules.progressionEnabled) {
      this.expire(dt);
      return;
    }
    const def = this.ctx.rules.xpPickupContent;
    if (!def) {
      this.expire(dt);
      return;
    }
    const magnet = this.ctx.rules.resolver.resolve('progression.magnetRadius');
    const { collectRadius, minimumPullSpeed, maximumPullSpeed, accelerationExponent } = def.magnet;
    for (const shard of s.xpShards) {
      if (shard.collected) continue;
      shard.age += dt;
      if (shard.age > def.life) {
        shard.collected = true;
        this.ctx.progression?.noteMissedShard(shard.value);
        continue;
      }
      const dx = t.x - shard.x;
      const dz = t.z - shard.z;
      const d = Math.hypot(dx, dz);
      if (d < collectRadius) {
        shard.collected = true;
        this.ctx.progression?.addXp(shard.value, shard.x, shard.y, shard.z);
        pushXpEvent(this.ctx, shard, shard.value);
        continue;
      }
      if (d < magnet) {
        const closeness = 1 - d / Math.max(0.001, magnet);
        const pull = minimumPullSpeed + (maximumPullSpeed - minimumPullSpeed) * Math.pow(closeness, accelerationExponent);
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        shard.vx = nx * pull;
        shard.vz = nz * pull;
        shard.x += shard.vx * dt;
        shard.z += shard.vz * dt;
        shard.y += (t.y + 0.7 - shard.y) * Math.min(1, dt * 3);
      }
    }
    // Collected and expired shards never accumulate in authoritative state.
    s.xpShards = s.xpShards.filter((shard) => !shard.collected);
  }

  private expire(dt: number): void {
    const s = this.ctx.state;
    for (const shard of s.xpShards) {
      if (shard.collected) continue;
      shard.age += dt;
      if (shard.age > (this.ctx.rules.xpPickupContent?.life ?? 30)) shard.collected = true;
    }
    s.xpShards = s.xpShards.filter((shard) => !shard.collected);
  }
}

export function pushXpEvent(ctx: SystemContext, shard: XpShardState, gained: number): void {
  pushEvent(ctx, 'pickup', shard.x, shard.y, shard.z, { kind: 'xp', value: gained });
}
